import { Router } from 'express';
import { all, get } from '../db.js';
import { h, int } from '../lib/http.js';
import { requireStaff, requireCounselor } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { slaStatus } from '../engine/sla.js';

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
