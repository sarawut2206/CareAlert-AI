import { Router } from 'express';
import { all, get, run, tx, getSetting, setSetting } from '../db.js';
import { h, str, int, oneOf, bad, notFound, bool } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword, referenceCode } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';

export const adminRouter = Router();
const requireAdmin = requireAuth('admin');

// ─────────────────────────── ผู้ใช้ ───────────────────────────

adminRouter.get('/users', requireAdmin, h((req, res) => {
  const rows = all(
    `SELECT id, role, username, display_name, active, last_login_at, must_change_password
       FROM users WHERE role != 'student' ORDER BY role, display_name`,
  );
  res.json({ users: rows });
}));

adminRouter.post('/users', requireAdmin, h((req, res) => {
  const role = oneOf(req.body?.role, 'บทบาท', ['teacher', 'counselor', 'admin', 'director']);
  const username = str(req.body?.username, 'ชื่อผู้ใช้', { min: 3, max: 64 }).toLowerCase();
  const displayName = str(req.body?.displayName, 'ชื่อที่แสดง', { min: 2, max: 120 });

  if (get('SELECT id FROM users WHERE username = ?', [username])) throw bad('ชื่อผู้ใช้นี้ถูกใช้แล้ว');

  const tempPassword = referenceCode(10);
  const ins = run(
    `INSERT INTO users (role, username, password_hash, display_name, must_change_password)
     VALUES (?,?,?,?,1)`,
    [role, username, hashPassword(tempPassword), displayName],
  );
  audit(req, 'admin.user.create', { entity: 'user', entityId: ins.lastInsertRowid, detail: { role, username } });
  res.json({ ok: true, id: Number(ins.lastInsertRowid), tempPassword });
}));

adminRouter.post('/users/:id/reset-password', requireAdmin, h((req, res) => {
  const id = int(req.params.id, 'รหัสผู้ใช้');
  const user = get('SELECT id, username FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('ไม่พบผู้ใช้');

  const tempPassword = referenceCode(10);
  run('UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?',
    [hashPassword(tempPassword), id]);
  audit(req, 'admin.user.resetPassword', { entity: 'user', entityId: id });
  res.json({ ok: true, tempPassword });
}));

adminRouter.post('/users/:id/active', requireAdmin, h((req, res) => {
  const id = int(req.params.id, 'รหัสผู้ใช้');
  const active = bool(req.body?.active);
  if (id === req.user.id && !active) throw bad('ปิดบัญชีของตัวเองไม่ได้');
  run('UPDATE users SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  audit(req, 'admin.user.active', { entity: 'user', entityId: id, detail: { active } });
  res.json({ ok: true });
}));

// ─────────────────────────── ห้องเรียน ───────────────────────────

adminRouter.post('/classrooms', requireAdmin, h((req, res) => {
  const name = str(req.body?.name, 'ชื่อห้อง', { min: 1, max: 40 });
  const level = str(req.body?.level, 'ระดับชั้น', { min: 1, max: 20 });
  const advisorUserId = req.body?.advisorUserId ? Number(req.body.advisorUserId) : null;

  if (get('SELECT id FROM classrooms WHERE name = ?', [name])) throw bad('มีห้องนี้อยู่แล้ว');
  const ins = run('INSERT INTO classrooms (name, level, advisor_user_id) VALUES (?,?,?)', [name, level, advisorUserId]);
  audit(req, 'admin.classroom.create', { entity: 'classroom', entityId: ins.lastInsertRowid });
  res.json({ ok: true, id: Number(ins.lastInsertRowid) });
}));

adminRouter.put('/classrooms/:id', requireAdmin, h((req, res) => {
  const id = int(req.params.id, 'รหัสห้อง');
  const advisorUserId = req.body?.advisorUserId ? Number(req.body.advisorUserId) : null;
  run('UPDATE classrooms SET advisor_user_id = ? WHERE id = ?', [advisorUserId, id]);
  audit(req, 'admin.classroom.update', { entity: 'classroom', entityId: id });
  res.json({ ok: true });
}));

// ─────────────────────────── นักเรียน (นำเข้าเป็นชุด) ───────────────────────────

/**
 * นำเข้านักเรียนจากข้อความ CSV: รหัสประจำตัว,ชื่อ,ห้อง[,ปีเกิด]
 * ระบบสร้างบัญชีให้อัตโนมัติ โดยรหัสผ่านเริ่มต้นคือ PIN 6 หลักที่สุ่มให้
 */
adminRouter.post('/students/import', requireAdmin, h((req, res) => {
  const csv = str(req.body?.csv, 'ข้อมูลนักเรียน', { min: 3, max: 500_000 });
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);

  const created = [];
  const errors = [];

  tx(() => {
    for (const [i, line] of lines.entries()) {
      const cols = line.split(',').map((c) => c.trim());
      const [code, name, classroomName, birthYear] = cols;

      if (!code || !name) { errors.push({ line: i + 1, message: 'ต้องมีอย่างน้อย รหัสประจำตัว และ ชื่อ' }); continue; }
      if (/^(รหัส|code|student)/i.test(code)) continue; // ข้ามบรรทัดหัวตาราง
      if (get('SELECT id FROM students WHERE student_code = ?', [code])) {
        errors.push({ line: i + 1, message: `มีรหัส ${code} อยู่แล้ว` }); continue;
      }

      let classroomId = null;
      if (classroomName) {
        const cl = get('SELECT id FROM classrooms WHERE name = ?', [classroomName]);
        if (cl) classroomId = cl.id;
        else {
          const level = classroomName.split('/')[0];
          classroomId = Number(run('INSERT INTO classrooms (name, level) VALUES (?,?)', [classroomName, level]).lastInsertRowid);
        }
      }

      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const userIns = run(
        `INSERT INTO users (role, username, password_hash, display_name, must_change_password)
         VALUES ('student', ?, ?, ?, 0)`,
        [code.toLowerCase(), hashPassword(pin), name],
      );
      run(
        'INSERT INTO students (user_id, student_code, display_name, classroom_id, birth_year) VALUES (?,?,?,?,?)',
        [Number(userIns.lastInsertRowid), code, name, classroomId, birthYear ? Number(birthYear) : null],
      );
      created.push({ code, name, classroom: classroomName ?? null, pin });
    }
  });

  audit(req, 'admin.students.import', { detail: { created: created.length, errors: errors.length } });
  res.json({ ok: true, created, errors });
}));

// ─────────────────────────── ตั้งค่า ───────────────────────────

adminRouter.get('/settings', requireAdmin, h((_req, res) => {
  res.json({
    school: getSetting('school', { name: '', contacts: [] }),
    notify: getSetting('notify.webhookUrl', null),
    consent: getSetting('consent', null),
    retention: config.retention,
    llmEnabled: config.llm.enabled,
  });
}));

adminRouter.put('/settings', requireAdmin, h((req, res) => {
  if (req.body?.school !== undefined) setSetting('school', req.body.school);
  if (req.body?.notifyWebhookUrl !== undefined) setSetting('notify.webhookUrl', req.body.notifyWebhookUrl || null);
  if (req.body?.consent !== undefined) setSetting('consent', req.body.consent);
  audit(req, 'admin.settings.update');
  res.json({ ok: true });
}));

// ─────────────────────────── ร่องรอยการใช้งาน ───────────────────────────

adminRouter.get('/audit', requireAdmin, h((req, res) => {
  const limit = int(req.query.limit, 'จำนวน', { min: 10, max: 500, required: false }) ?? 100;
  const action = str(req.query.action, 'การกระทำ', { required: false, max: 60 });

  const rows = action
    ? all(`SELECT a.*, u.display_name AS actor_name FROM audit_log a
             LEFT JOIN users u ON u.id = a.actor_user_id
            WHERE a.action LIKE ? ORDER BY a.id DESC LIMIT ?`, [`${action}%`, limit])
    : all(`SELECT a.*, u.display_name AS actor_name FROM audit_log a
             LEFT JOIN users u ON u.id = a.actor_user_id
            ORDER BY a.id DESC LIMIT ?`, [limit]);
  res.json({ entries: rows });
}));

/**
 * ลบข้อมูลที่พ้นระยะเก็บรักษาตามนโยบาย (PDPA)
 * ทำด้วยมือโดยผู้ดูแล เพื่อให้มีคนรับผิดชอบการตัดสินใจเสมอ
 */
adminRouter.post('/retention/purge', requireAdmin, h((req, res) => {
  const dryRun = req.body?.dryRun !== false;
  const r = config.retention;

  const targets = [
    { name: 'checkins', sql: `FROM checkins WHERE submitted_at < datetime('now', '-${r.checkinDays} days')` },
    { name: 'closedCases', sql: `FROM cases WHERE status = 'closed' AND closed_at < datetime('now', '-${r.closedCaseDays} days')` },
    { name: 'auditLog', sql: `FROM audit_log WHERE created_at < datetime('now', '-${r.auditDays} days')` },
  ];

  const report = {};
  for (const t of targets) {
    report[t.name] = get(`SELECT COUNT(*) AS n ${t.sql}`)?.n ?? 0;
  }

  if (!dryRun) {
    tx(() => { for (const t of targets) run(`DELETE ${t.sql}`); });
    audit(req, 'admin.retention.purge', { detail: report });
  }

  res.json({ ok: true, dryRun, report, policy: r });
}));
