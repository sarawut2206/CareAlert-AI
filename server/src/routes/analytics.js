import { Router } from 'express';
import { all, get } from '../db.js';
import { h, int } from '../lib/http.js';
import { requireStaff, requireCounselor, requireAuth } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { slaStatus, parseSql } from '../engine/sla.js';

export const analyticsRouter = Router();

/**
 * กติกาความเป็นส่วนตัวของหน้าสรุปผล:
 *  - แสดงเฉพาะข้อมูลรวม ไม่มีชื่อนักเรียน
 *  - เซลล์ที่มีจำนวนน้อยกว่า MIN_CELL จะถูกกลบ เพราะเดาตัวบุคคลได้ง่าย
 *  - ห้ามใช้หน้านี้จัดอันดับห้องเรียนหรือครู
 */
const MIN_CELL = 5;

const mask = (n) => (n > 0 && n < MIN_CELL ? null : n);

analyticsRouter.get('/overview', requireStaff, h((req, res) => {
  const days = int(req.query.days, 'ช่วงเวลา', { min: 7, max: 365, required: false }) ?? 30;
  const since = `-${days} days`;

  const byLevel = all(
    `SELECT level, COUNT(*) AS n FROM assessments
      WHERE created_at >= datetime('now', ?) GROUP BY level ORDER BY level`,
    [since],
  );

  const byOrigin = all(
    `SELECT origin, COUNT(*) AS n FROM cases
      WHERE opened_at >= datetime('now', ?) GROUP BY origin`,
    [since],
  );

  const caseRows = all(
    `SELECT level, status, acknowledge_due_at, acknowledged_at, contact_due_at, first_contact_at,
            opened_at, closed_at
       FROM cases WHERE opened_at >= datetime('now', ?)`,
    [since],
  );

  const sla = { total: caseRows.length, ackMet: 0, ackLate: 0, contactMet: 0, contactLate: 0, stillOpen: 0 };
  let closeHours = [];
  for (const c of caseRows) {
    const a = slaStatus(c.acknowledge_due_at, c.acknowledged_at);
    const k = slaStatus(c.contact_due_at, c.first_contact_at);
    if (a === 'met') sla.ackMet += 1;
    if (a === 'late' || a === 'overdue') sla.ackLate += 1;
    if (k === 'met') sla.contactMet += 1;
    if (k === 'late' || k === 'overdue') sla.contactLate += 1;
    if (c.status !== 'closed') sla.stillOpen += 1;
    if (c.closed_at) {
      closeHours.push((new Date(`${c.closed_at.replace(' ', 'T')}Z`) - new Date(`${c.opened_at.replace(' ', 'T')}Z`)) / 3600000);
    }
  }
  const medianCloseHours = closeHours.length
    ? Math.round(closeHours.sort((x, y) => x - y)[Math.floor(closeHours.length / 2)])
    : null;

  const participation = get(
    `SELECT (SELECT COUNT(DISTINCT student_id) FROM checkins WHERE submitted_at >= datetime('now', ?)) AS active,
            (SELECT COUNT(*) FROM students WHERE active = 1) AS total`,
    [since],
  );

  const sufficiency = all(
    `SELECT data_sufficiency, COUNT(*) AS n FROM assessments
      WHERE created_at >= datetime('now', ?) GROUP BY data_sufficiency`,
    [since],
  );

  // หมวดปัญหาที่พบบ่อย (จากธงของกลไก ไม่ใช่จากข้อความดิบ)
  const flagRows = all(
    `SELECT flags_json FROM assessments WHERE created_at >= datetime('now', ?) AND level >= 2`,
    [since],
  );
  const tagCount = {};
  for (const r of flagRows) {
    try {
      const f = JSON.parse(r.flags_json);
      for (const t of f.contextTags ?? []) tagCount[t] = (tagCount[t] ?? 0) + 1;
      for (const c of f.lexicon ?? []) tagCount[`lexicon:${c}`] = (tagCount[`lexicon:${c}`] ?? 0) + 1;
    } catch { /* ข้ามแถวที่อ่านไม่ได้ */ }
  }
  const topTags = Object.entries(tagCount)
    .map(([tag, n]) => ({ tag, n: mask(n) }))
    .filter((t) => t.n !== null)
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);

  const lifeskills = get(
    `SELECT COUNT(*) AS started, SUM(completed) AS completed FROM lifeskill_progress
      WHERE updated_at >= datetime('now', ?)`,
    [since],
  );

  audit(req, 'analytics.overview', { detail: { days } });

  res.json({
    days,
    byLevel: byLevel.map((r) => ({ level: r.level, n: r.n })),
    byOrigin: byOrigin.map((r) => ({ origin: r.origin, n: mask(r.n) })),
    sla: { ...sla, medianCloseHours },
    participation: {
      active: participation?.active ?? 0,
      total: participation?.total ?? 0,
      rate: participation?.total ? Math.round((participation.active / participation.total) * 100) : 0,
    },
    sufficiency,
    topTags,
    lifeskills: { started: lifeskills?.started ?? 0, completed: lifeskills?.completed ?? 0 },
    note:
      'ตัวเลขเหล่านี้ใช้เพื่อปรับปรุงระบบดูแลของโรงเรียน ไม่ใช่เพื่อประเมินครูหรือจัดอันดับห้องเรียน ' +
      `กลุ่มที่มีจำนวนน้อยกว่า ${MIN_CELL} ถูกกลบไว้เพื่อป้องกันการระบุตัวนักเรียน`,
  });
}));

/**
 * แดชบอร์ดผู้บริหาร — ภาพรวมทั้งโรงเรียนแบบ "ไม่มีชื่อนักเรียน"
 *
 * หลักการ: ผู้บริหารต้องตอบได้ว่า "ระบบดูแลของโรงเรียนทำงานทันเวลาหรือไม่"
 * ไม่ใช่ "เด็กคนไหนมีปัญหาอะไร" — อย่างหลังเป็นหน้าที่ของครูแนะแนวและทีมดูแล
 * บทบาท director จึงเข้าถึงได้เฉพาะ endpoint นี้ (เข้าคิวเคส/ข้อมูลรายคนไม่ได้)
 */
analyticsRouter.get('/executive', requireAuth('director', 'counselor', 'admin'), h((req, res) => {
  const days = int(req.query.days, 'ช่วงเวลา', { min: 7, max: 365, required: false }) ?? 90;
  const since = `-${days} days`;

  // ── ตัวเลขหลัก ─────────────────────────────────────────────
  const totalStudents = get('SELECT COUNT(*) AS n FROM students WHERE active = 1')?.n ?? 0;
  const activeStudents = get(
    `SELECT COUNT(DISTINCT student_id) AS n FROM checkins WHERE submitted_at >= datetime('now', ?)`,
    [since],
  )?.n ?? 0;

  const openRows = all(
    `SELECT level, status, contact_due_at, first_contact_at FROM cases WHERE status != 'closed'`,
  );
  const kpi = {
    students: totalStudents,
    activeStudents,
    participationRate: totalStudents ? Math.round((activeStudents / totalStudents) * 100) : 0,
    openL4: openRows.filter((c) => c.level === 4).length,
    openL3: openRows.filter((c) => c.level === 3).length,
    openL2: openRows.filter((c) => c.level === 2).length,
    overdue: openRows.filter((c) => slaStatus(c.contact_due_at, c.first_contact_at) === 'overdue').length,
    unacknowledged: openRows.filter((c) => c.status === 'new').length,
  };

  // ── การตอบสนอง (SLA) ของเคสในช่วงเวลา ─────────────────────
  const periodCases = all(
    `SELECT level, status, opened_at, acknowledged_at, first_contact_at, closed_at,
            acknowledge_due_at, contact_due_at
       FROM cases WHERE opened_at >= datetime('now', ?)`,
    [since],
  );
  let ackMet = 0; let contactMet = 0;
  const contactHours = []; const closeHours = [];
  for (const c of periodCases) {
    if (slaStatus(c.acknowledge_due_at, c.acknowledged_at) === 'met') ackMet += 1;
    if (slaStatus(c.contact_due_at, c.first_contact_at) === 'met') contactMet += 1;
    if (c.first_contact_at) contactHours.push((parseSql(c.first_contact_at) - parseSql(c.opened_at)) / 3600000);
    if (c.closed_at) closeHours.push((parseSql(c.closed_at) - parseSql(c.opened_at)) / 3600000);
  }
  const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return Math.round(s[Math.floor(s.length / 2)] * 10) / 10;
  };
  const sla = {
    total: periodCases.length,
    ackRate: periodCases.length ? Math.round((ackMet / periodCases.length) * 100) : null,
    contactRate: periodCases.length ? Math.round((contactMet / periodCases.length) * 100) : null,
    medianContactHours: median(contactHours),
    medianCloseHours: median(closeHours),
  };

  // ── ช่องทางการไหลของเคส (funnel) ──────────────────────────
  const funnel = {
    opened: periodCases.length,
    acknowledged: periodCases.filter((c) => c.acknowledged_at).length,
    contacted: periodCases.filter((c) => c.first_contact_at).length,
    referred: periodCases.filter((c) => c.status === 'referred').length,
    closed: periodCases.filter((c) => c.status === 'closed').length,
  };

  // ── แนวโน้มรายสัปดาห์ ─────────────────────────────────────
  const weeklyAssess = all(
    `SELECT strftime('%Y-%W', created_at) AS week,
            COUNT(*) AS assessments,
            SUM(CASE WHEN level >= 3 THEN 1 ELSE 0 END) AS priority
       FROM assessments WHERE created_at >= datetime('now', ?)
      GROUP BY week ORDER BY week`,
    [since],
  );
  const weeklyCases = Object.fromEntries(
    all(
      `SELECT strftime('%Y-%W', opened_at) AS week, COUNT(*) AS n
         FROM cases WHERE opened_at >= datetime('now', ?) GROUP BY week`,
      [since],
    ).map((r) => [r.week, r.n]),
  );
  const weekly = weeklyAssess.map((r) => ({
    week: r.week, assessments: r.assessments, priority: r.priority, cases: weeklyCases[r.week] ?? 0,
  }));

  // ── การมีส่วนร่วมแยกตามระดับชั้น (ไม่แยกรายห้อง — กันการจัดอันดับครู) ──
  const byGradeLevel = all(
    `SELECT cl.level AS grade,
            COUNT(DISTINCT s.id) AS students,
            COUNT(DISTINCT CASE WHEN c.submitted_at >= datetime('now', ?) THEN c.student_id END) AS active
       FROM classrooms cl
       JOIN students s ON s.classroom_id = cl.id AND s.active = 1
       LEFT JOIN checkins c ON c.student_id = s.id
      GROUP BY cl.level ORDER BY cl.level`,
    [since],
  ).map((r) =>
    r.students < MIN_CELL
      ? { grade: r.grade, students: r.students, active: null, rate: null }
      : { grade: r.grade, students: r.students, active: r.active, rate: Math.round((r.active / r.students) * 100) },
  );

  // ── หมวดปัญหาที่พบบ่อย (รวมและกลบกลุ่มเล็ก) ────────────────
  const flagRows = all(
    `SELECT flags_json FROM assessments WHERE created_at >= datetime('now', ?) AND level >= 2`,
    [since],
  );
  const tagCount = {};
  for (const r of flagRows) {
    try {
      const f = JSON.parse(r.flags_json);
      for (const t of f.contextTags ?? []) tagCount[t] = (tagCount[t] ?? 0) + 1;
      for (const c of f.lexicon ?? []) tagCount[`lexicon:${c}`] = (tagCount[`lexicon:${c}`] ?? 0) + 1;
    } catch { /* ข้ามแถวที่อ่านไม่ได้ */ }
  }
  const topCategories = Object.entries(tagCount)
    .map(([tag, n]) => ({ tag, n: mask(n) }))
    .filter((t) => t.n !== null)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  const origins = all(
    `SELECT origin, COUNT(*) AS n FROM cases WHERE opened_at >= datetime('now', ?) GROUP BY origin`,
    [since],
  ).map((r) => ({ origin: r.origin, n: mask(r.n) }));

  const lifeskills = get(
    `SELECT COUNT(*) AS started, COALESCE(SUM(completed), 0) AS completed
       FROM lifeskill_progress WHERE updated_at >= datetime('now', ?)`,
    [since],
  );

  audit(req, 'analytics.executive', { detail: { days } });

  res.json({
    days, kpi, sla, funnel, weekly, byGradeLevel, topCategories, origins,
    lifeskills: { started: lifeskills?.started ?? 0, completed: lifeskills?.completed ?? 0 },
    governance: [
      'แดชบอร์ดนี้แสดงเฉพาะข้อมูลรวม ไม่มีชื่อนักเรียน — การดูรายเคสเป็นหน้าที่ของครูแนะแนวและทีมดูแล',
      `กลุ่มที่มีจำนวนน้อยกว่า ${MIN_CELL} ถูกกลบไว้ เพื่อป้องกันการระบุตัวนักเรียนโดยอ้อม`,
      'ห้ามใช้ตัวเลขเหล่านี้ประเมินครูหรือจัดอันดับห้องเรียน — จะทำให้ครูเลี่ยงการบันทึกเคส ซึ่งอันตรายกว่าไม่มีระบบ',
      'ตัวเลขที่สำคัญที่สุดคือความเร็วในการตอบสนอง ไม่ใช่จำนวนเคสที่ตรวจพบ',
    ],
  });
}));

/** แนวโน้มรายสัปดาห์ ใช้ดูว่าระบบทำงานสม่ำเสมอหรือไม่ */
analyticsRouter.get('/trend', requireCounselor, h((req, res) => {
  const weeks = int(req.query.weeks, 'จำนวนสัปดาห์', { min: 4, max: 52, required: false }) ?? 12;
  const rows = all(
    `SELECT strftime('%Y-%W', created_at) AS week,
            COUNT(*) AS assessments,
            SUM(CASE WHEN level >= 3 THEN 1 ELSE 0 END) AS priority,
            SUM(CASE WHEN data_sufficiency = 'INSUFFICIENT' THEN 1 ELSE 0 END) AS insufficient
       FROM assessments
      WHERE created_at >= datetime('now', ?)
      GROUP BY week ORDER BY week`,
    [`-${weeks * 7} days`],
  );
  res.json({ weeks: rows });
}));
