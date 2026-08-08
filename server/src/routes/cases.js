import { Router } from 'express';
import { get, all, run, hydrate } from '../db.js';
import { h, bad, str, int, oneOf, bool, notFound, forbidden, stringArray } from '../lib/http.js';
import { requireStaff, requireCounselor, canAccessStudent } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { addEvent, closeBlockers } from '../services/cases.js';
import { LEVELS } from '../engine/triage.js';
import { slaStatus, nowSql, toSqlDate } from '../engine/sla.js';
import { getTemplate, allItemsById } from '../content/templates.js';

export const casesRouter = Router();

const OPEN_STATUSES = ['new', 'acknowledged', 'in_progress', 'referred', 'monitoring'];

/** เงื่อนไข SQL จำกัดสิทธิ์ตามบทบาท */
function scopeClause(user) {
  if (user.role === 'teacher') {
    return {
      sql: ` AND (c.student_id IN (SELECT s.id FROM students s JOIN classrooms cl ON cl.id = s.classroom_id
                                    WHERE cl.advisor_user_id = ?)
                  OR c.owner_user_id = ?)`,
      params: [user.id, user.id],
    };
  }
  return { sql: '', params: [] };
}

function loadCase(req, id) {
  const row = get('SELECT * FROM cases WHERE id = ?', [id]);
  if (!row) throw notFound('ไม่พบเคสนี้');
  if (req.user.role === 'teacher') {
    const ok = (row.student_id && canAccessStudent(req.user, row.student_id)) || row.owner_user_id === req.user.id;
    if (!ok) throw forbidden('เคสนี้อยู่นอกความรับผิดชอบของคุณ');
  }
  return row;
}

function decorate(row) {
  return {
    ...row,
    levelInfo: LEVELS[row.level],
    acknowledgeSla: slaStatus(row.acknowledge_due_at, row.acknowledged_at),
    contactSla: slaStatus(row.contact_due_at, row.first_contact_at),
    isOpen: OPEN_STATUSES.includes(row.status),
  };
}

// ─────────────────────────── คิวเคส ───────────────────────────

casesRouter.get('/', requireStaff, h((req, res) => {
  const status = req.query.status ?? 'open';
  const level = req.query.level ? Number(req.query.level) : null;
  const scope = scopeClause(req.user);

  let where = ' WHERE 1=1';
  const params = [];

  if (status === 'open') {
    where += ` AND c.status IN (${OPEN_STATUSES.map(() => '?').join(',')})`;
    params.push(...OPEN_STATUSES);
  } else if (status !== 'all') {
    where += ' AND c.status = ?';
    params.push(status);
  }
  if (level) { where += ' AND c.level = ?'; params.push(level); }

  const rows = all(
    `SELECT c.*, s.display_name AS student_name, s.student_code, cl.name AS classroom,
            u.display_name AS owner_name
       FROM cases c
       LEFT JOIN students s   ON s.id = c.student_id
       LEFT JOIN classrooms cl ON cl.id = s.classroom_id
       LEFT JOIN users u      ON u.id = c.owner_user_id
       ${where}${scope.sql}
      ORDER BY c.level DESC,
               CASE c.status WHEN 'new' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
               c.contact_due_at ASC
      LIMIT 300`,
    [...params, ...scope.params],
  );

  audit(req, 'cases.list', { detail: { status, level, count: rows.length } });
  res.json({ cases: rows.map(decorate) });
}));

/** ตัวเลขสรุปสำหรับแถบด้านบนของหน้าคิว */
casesRouter.get('/summary', requireStaff, h((req, res) => {
  const scope = scopeClause(req.user);
  const rows = all(
    `SELECT c.level, c.status, c.contact_due_at, c.first_contact_at
       FROM cases c WHERE c.status IN (${OPEN_STATUSES.map(() => '?').join(',')})${scope.sql}`,
    [...OPEN_STATUSES, ...scope.params],
  );
  const summary = { total: rows.length, l4: 0, l3: 0, l2: 0, overdue: 0, unacknowledged: 0 };
  for (const r of rows) {
    if (r.level === 4) summary.l4 += 1;
    else if (r.level === 3) summary.l3 += 1;
    else summary.l2 += 1;
    if (slaStatus(r.contact_due_at, r.first_contact_at) === 'overdue') summary.overdue += 1;
    if (r.status === 'new') summary.unacknowledged += 1;
  }
  res.json({ summary });
}));

// ─────────────────────────── รายละเอียดเคส ───────────────────────────

casesRouter.get('/:id', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  const row = loadCase(req, id);

  const student = row.student_id
    ? get(
        `SELECT s.id, s.student_code, s.display_name, s.birth_year, s.guardian_name, s.guardian_phone,
                s.notes, cl.name AS classroom, u.display_name AS advisor
           FROM students s
           LEFT JOIN classrooms cl ON cl.id = s.classroom_id
           LEFT JOIN users u ON u.id = cl.advisor_user_id
          WHERE s.id = ?`,
        [row.student_id],
      )
    : null;

  const assessments = all(
    `SELECT a.* FROM assessments a
       JOIN case_links l ON l.assessment_id = a.id
      WHERE l.case_id = ? ORDER BY a.created_at DESC`,
    [id],
  ).map(hydrate);

  // ข้อความต้นฉบับที่นักเรียนเขียน — ต้องให้มนุษย์อ่านเอง ไม่ใช่อ่านแต่สรุปของระบบ
  const sources = assessments.map((a) => {
    if (a.source_type === 'checkin') {
      const c = get('SELECT * FROM checkins WHERE id = ?', [a.source_id]);
      if (!c) return null;
      const template = getTemplate(c.template_id);
      return {
        kind: 'checkin', id: c.id, at: c.submitted_at, templateId: c.template_id,
        templateTitle: template?.title ?? c.template_id,
        answers: JSON.parse(c.answers_json || '{}'),
      };
    }
    const r = get('SELECT * FROM reports WHERE id = ?', [a.source_id]);
    if (!r) return null;
    return {
      kind: r.kind, id: r.id, at: r.submitted_at, anonymous: !!r.anonymous,
      subjectHint: r.subject_hint, body: r.body,
      categories: JSON.parse(r.categories_json || '[]'),
      answers: JSON.parse(r.answers_json || '{}'),
    };
  }).filter(Boolean);

  const events = all(
    `SELECT e.*, u.display_name AS actor_name FROM case_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.case_id = ? ORDER BY e.created_at ASC`,
    [id],
  ).map(hydrate);

  const trend = row.student_id
    ? all(
        `SELECT created_at, level, concern_index, data_sufficiency FROM assessments
          WHERE student_id = ? ORDER BY created_at ASC LIMIT 40`,
        [row.student_id],
      )
    : [];

  audit(req, 'case.view', { entity: 'case', entityId: id });

  res.json({
    case: decorate(row),
    student,
    assessments,
    sources,
    events,
    trend,
    closeBlockers: closeBlockers(row),
    // นิยามของทุกข้อคำถาม เพื่อให้หน้าจอแสดงคำถาม/ตัวเลือกเป็นภาษาคน ไม่ใช่รหัสข้อ
    itemDefs: Object.fromEntries(
      [...allItemsById().entries()].map(([id, item]) => [
        id,
        { text: item.text, type: item.type, critical: !!item.critical, options: item.options ?? null },
      ]),
    ),
  });
}));

// ─────────────────────────── การดำเนินการ (Intervene) ───────────────────────────

casesRouter.post('/:id/acknowledge', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  const row = loadCase(req, id);
  if (row.acknowledged_at) throw bad('เคสนี้ถูกรับเรื่องไปแล้ว');

  run(
    `UPDATE cases SET status = CASE WHEN status = 'new' THEN 'acknowledged' ELSE status END,
                      acknowledged_at = datetime('now'),
                      owner_user_id = COALESCE(owner_user_id, ?)
       WHERE id = ?`,
    [req.user.id, id],
  );
  addEvent(id, 'acknowledged', req.user.id, 'รับเรื่องแล้ว');
  audit(req, 'case.acknowledge', { entity: 'case', entityId: id });
  res.json({ ok: true });
}));

casesRouter.post('/:id/contact', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  const row = loadCase(req, id);

  const note = str(req.body?.note, 'บันทึกการพูดคุย', { min: 5, max: 4000 });
  const safetyConfirmed = bool(req.body?.safetyConfirmed);
  const protectionNeeded = bool(req.body?.protectionNeeded);

  run(
    `UPDATE cases SET first_contact_at = COALESCE(first_contact_at, datetime('now')),
                      status = CASE WHEN status IN ('new','acknowledged') THEN 'in_progress' ELSE status END,
                      acknowledged_at = COALESCE(acknowledged_at, datetime('now')),
                      owner_user_id = COALESCE(owner_user_id, ?),
                      safety_confirmed = ?,
                      protection_needed = ?
       WHERE id = ?`,
    [req.user.id, safetyConfirmed ? 1 : 0, protectionNeeded ? 1 : 0, id],
  );
  addEvent(id, 'contacted', req.user.id, note, { safetyConfirmed, protectionNeeded });
  audit(req, 'case.contact', { entity: 'case', entityId: id });
  res.json({ ok: true, closeBlockers: closeBlockers(get('SELECT * FROM cases WHERE id = ?', [id])) });
}));

casesRouter.post('/:id/action', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  loadCase(req, id);
  const note = str(req.body?.note, 'รายละเอียดการดำเนินการ', { min: 3, max: 4000 });
  const kind = str(req.body?.kind, 'ประเภท', { required: false, max: 60 });

  addEvent(id, 'action', req.user.id, note, { kind });
  run(`UPDATE cases SET status = CASE WHEN status IN ('new','acknowledged') THEN 'in_progress' ELSE status END WHERE id = ?`, [id]);
  audit(req, 'case.action', { entity: 'case', entityId: id });
  res.json({ ok: true });
}));

casesRouter.post('/:id/referral', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  const row = loadCase(req, id);
  const to = str(req.body?.to, 'ปลายทางการส่งต่อ', { max: 200 });
  const note = str(req.body?.note, 'เหตุผล', { required: false, max: 2000 });

  const existing = JSON.parse(row.referral_json || '[]');
  existing.push({ to, note, at: nowSql(), by: req.user.display_name });

  run(`UPDATE cases SET referral_json = ?, status = 'referred' WHERE id = ?`, [JSON.stringify(existing), id]);
  addEvent(id, 'referral', req.user.id, `ส่งต่อไปยัง ${to}`, { to, note });
  audit(req, 'case.referral', { entity: 'case', entityId: id, detail: { to } });
  res.json({ ok: true });
}));

casesRouter.post('/:id/guardian', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  loadCase(req, id);
  const informed = bool(req.body?.informed);
  const note = str(req.body?.note, 'บันทึก', { min: 3, max: 2000 });

  run('UPDATE cases SET guardian_informed = ? WHERE id = ?', [informed ? 1 : 0, id]);
  addEvent(id, 'action', req.user.id, informed ? `แจ้งผู้ปกครองแล้ว: ${note}` : `ยังไม่แจ้งผู้ปกครอง: ${note}`, { informed });
  audit(req, 'case.guardian', { entity: 'case', entityId: id, detail: { informed } });
  res.json({ ok: true });
}));

/** เปลี่ยนระดับด้วยมือ — การ "ลดระดับ" ต้องเป็นครูแนะแนวขึ้นไป และต้องมีเหตุผลเสมอ */
casesRouter.post('/:id/level', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  const row = loadCase(req, id);
  const level = int(req.body?.level, 'ระดับ', { min: 2, max: 4 });
  const reason = str(req.body?.reason, 'เหตุผล', { min: 10, max: 2000 });

  if (level < row.level && !['counselor', 'admin'].includes(req.user.role)) {
    throw forbidden('การลดระดับต้องดำเนินการโดยครูแนะแนวหรือผู้ดูแลระบบ');
  }

  run('UPDATE cases SET level = ?, peak_level = MAX(peak_level, ?) WHERE id = ?', [level, level, id]);
  addEvent(id, level > row.level ? 'escalate' : 'note', req.user.id,
    `เปลี่ยนระดับจาก ${row.level} เป็น ${level}: ${reason}`, { from: row.level, to: level, manual: true });
  audit(req, 'case.level', { entity: 'case', entityId: id, detail: { from: row.level, to: level } });
  res.json({ ok: true });
}));

casesRouter.post('/:id/assign', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  loadCase(req, id);
  const userId = int(req.body?.userId, 'ผู้รับผิดชอบ');
  const target = get(`SELECT id, display_name FROM users WHERE id = ? AND active = 1 AND role != 'student'`, [userId]);
  if (!target) throw bad('ไม่พบผู้ใช้ที่เลือก');

  run('UPDATE cases SET owner_user_id = ? WHERE id = ?', [userId, id]);
  addEvent(id, 'note', req.user.id, `มอบหมายให้ ${target.display_name}`, { ownerUserId: userId });
  audit(req, 'case.assign', { entity: 'case', entityId: id, detail: { to: userId } });
  res.json({ ok: true });
}));

// ─────────────────────────── ติดตาม (Follow-up) ───────────────────────────

casesRouter.post('/:id/followup', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  loadCase(req, id);
  const note = str(req.body?.note, 'ผลการติดตาม', { min: 3, max: 4000 });
  const status = oneOf(req.body?.studentStatus, 'สถานะนักเรียน',
    ['better', 'same', 'worse', 'unknown'], { required: false }) ?? 'unknown';
  const days = int(req.body?.nextInDays, 'นัดติดตามครั้งถัดไป (วัน)', { min: 0, max: 180, required: false });

  const next = days ? toSqlDate(new Date(Date.now() + days * 86400000)) : null;
  run(
    `UPDATE cases SET next_followup_at = ?,
                      status = CASE WHEN status IN ('new','acknowledged','in_progress') THEN 'monitoring' ELSE status END
       WHERE id = ?`,
    [next, id],
  );
  addEvent(id, 'followup', req.user.id, note, { studentStatus: status, nextFollowUpAt: next });
  audit(req, 'case.followup', { entity: 'case', entityId: id });
  res.json({ ok: true, nextFollowUpAt: next });
}));

// ─────────────────────────── ปิดเคส ───────────────────────────

casesRouter.post('/:id/close', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  const row = loadCase(req, id);
  if (row.status === 'closed') throw bad('เคสนี้ปิดไปแล้ว');

  const reason = str(req.body?.reason, 'เหตุผลในการปิดเคส', { min: 10, max: 2000 });
  const override = bool(req.body?.override);

  const blockers = closeBlockers(row);
  if (blockers.length && !override) {
    throw bad(`ยังปิดเคสไม่ได้: ${blockers.join(' / ')}`);
  }
  if (blockers.length && override && !['counselor', 'admin'].includes(req.user.role)) {
    throw forbidden('การปิดเคสทั้งที่ยังมีข้อค้าง ต้องดำเนินการโดยครูแนะแนวหรือผู้ดูแลระบบ');
  }
  if (row.peak_level >= 4 && !['counselor', 'admin'].includes(req.user.role)) {
    throw forbidden('เคสที่เคยเป็นระดับ 4 ต้องปิดโดยครูแนะแนวหรือผู้ดูแลระบบ');
  }

  run(
    `UPDATE cases SET status = 'closed', closed_at = datetime('now'), close_reason = ? WHERE id = ?`,
    [reason, id],
  );
  addEvent(id, 'closed', req.user.id, reason, { override, blockers });
  audit(req, 'case.close', { entity: 'case', entityId: id, detail: { override, blockers } });
  res.json({ ok: true });
}));

casesRouter.post('/:id/reopen', requireCounselor, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  loadCase(req, id);
  const reason = str(req.body?.reason, 'เหตุผล', { min: 5, max: 2000 });

  run(`UPDATE cases SET status = 'in_progress', closed_at = NULL, close_reason = NULL WHERE id = ?`, [id]);
  addEvent(id, 'reopened', req.user.id, reason);
  audit(req, 'case.reopen', { entity: 'case', entityId: id });
  res.json({ ok: true });
}));

casesRouter.post('/:id/note', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสเคส');
  loadCase(req, id);
  const note = str(req.body?.note, 'บันทึก', { min: 2, max: 4000 });
  addEvent(id, 'note', req.user.id, note);
  audit(req, 'case.note', { entity: 'case', entityId: id });
  res.json({ ok: true });
}));
