import { Router } from 'express';
import { get, run, all } from '../db.js';
import { h, bad, str, plainObject, oneOf, forbidden } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { audit } from '../lib/audit.js';
import { dailyCheckin, weeklyCheckin, followUps, getTemplate } from '../content/templates.js';
import { runEngine } from '../engine/index.js';
import { ingestAssessment, assessmentHistory } from '../services/cases.js';
import { recommendModules } from '../content/lifeskills.js';
import { helplines, crisisScreen } from '../content/help.js';

export const checkinRouter = Router();

/**
 * เงื่อนไขการเปิดชุดคำถามเชิงลึก (Disclose)
 * เก็บไว้ฝั่งเซิร์ฟเวอร์ เพื่อให้แก้เกณฑ์ได้ที่เดียวและตรวจสอบได้
 */
export function followUpTriggers(answers = {}) {
  const n = (id) => {
    const v = Number(answers[id]);
    return Number.isNaN(v) ? 0 : v;
  };
  const tags = Array.isArray(answers.d2) ? answers.d2 : [];
  const open = [];

  if (n('c1') >= 2 || n('c2') >= 2 || n('c3') >= 2 || (answers.d1 !== undefined && n('d1') <= 1)) {
    open.push(followUps.mood.id);
  }
  if (n('c6') >= 1 || tags.includes('bullying')) open.push(followUps.bullying.id);
  if (n('c8') >= 2 || tags.includes('family')) open.push(followUps.home.id);
  // ความปลอดภัยเปิดง่ายที่สุดโดยตั้งใจ — ยอมถามเกิน ดีกว่าพลาด
  if (n('c9') >= 1 || tags.includes('safety')) open.push(followUps.safety.id);

  return [...new Set(open)];
}

/** ดึงข้อคำถามทั้งหมดจากรายชื่อ template */
function collectItems(templateIds) {
  const items = [];
  const pairs = [];
  const required = [];
  for (const id of templateIds) {
    const t = getTemplate(id);
    if (!t) throw bad(`ไม่พบชุดคำถาม: ${id}`);
    items.push(...t.items);
    if (t.consistencyPairs) pairs.push(...t.consistencyPairs);
    if (t.requiredForSufficiency) required.push(...t.requiredForSufficiency);
  }
  return { items, pairs, required };
}

// ─────────────────────────── ชุดคำถาม ───────────────────────────

checkinRouter.get('/templates', requireAuth(), h((req, res) => {
  const cadence = req.query.cadence === 'daily' ? 'daily' : 'weekly';
  const template = cadence === 'daily' ? dailyCheckin : weeklyCheckin;
  res.json({ template, followUps });
}));

/** ให้ client ถามว่า "ตอบมาแบบนี้ ต้องเปิดคำถามเพิ่มชุดไหน" */
checkinRouter.post('/follow-ups', requireAuth(), h((req, res) => {
  const answers = plainObject(req.body?.answers, 'คำตอบ');
  const ids = followUpTriggers(answers);
  res.json({ followUps: ids.map((id) => getTemplate(id)).filter(Boolean) });
}));

/** ประวัติเช็กอินของตัวเอง (นักเรียนเห็นของตัวเองได้ แต่ไม่เห็นระดับหรือคะแนน) */
checkinRouter.get('/mine', requireAuth('student'), h((req, res) => {
  const rows = all(
    `SELECT id, template_id, submitted_at FROM checkins
      WHERE student_id = ? ORDER BY submitted_at DESC LIMIT 30`,
    [req.student.id],
  );
  res.json({ checkins: rows });
}));

// ─────────────────────────── ส่งเช็กอิน ───────────────────────────

checkinRouter.post(
  '/submit',
  requireAuth('student'),
  rateLimit({ windowMs: 60_000, max: 12 }),
  h(async (req, res) => {
    const student = req.student;
    if (!student) throw forbidden('บัญชีนี้ไม่ได้ผูกกับข้อมูลนักเรียน');

    const baseTemplateId = oneOf(req.body?.templateId, 'ชุดคำถาม', [dailyCheckin.id, weeklyCheckin.id]);
    const answers = plainObject(req.body?.answers, 'คำตอบ');
    const timings = plainObject(req.body?.timings, 'เวลาในการตอบ');
    const durationMs = Number(req.body?.durationMs) || 0;

    // เชื่อชุดคำถามเชิงลึกจากฝั่ง client ได้เฉพาะที่ตรงกับเงื่อนไขของเซิร์ฟเวอร์
    const allowed = new Set(followUpTriggers(answers));
    const requestedFollowUps = Array.isArray(req.body?.followUpIds) ? req.body.followUpIds : [];
    const usedFollowUps = requestedFollowUps.filter((id) => allowed.has(id));

    const templateIds = [baseTemplateId, ...usedFollowUps];
    const { items, pairs, required } = collectItems(templateIds);

    const history = assessmentHistory(student.id);
    const result = await runEngine({
      source: 'checkin', items, answers, timings, durationMs, pairs, required, history,
    });

    const template = getTemplate(baseTemplateId);
    const ins = run(
      `INSERT INTO checkins
         (student_id, template_id, template_version, answers_json, item_timings_json, duration_ms, anonymous)
       VALUES (?,?,?,?,?,?,0)`,
      [student.id, baseTemplateId, template.version, JSON.stringify(answers), JSON.stringify(timings), durationMs],
    );

    const { caseId } = ingestAssessment({
      sourceType: 'checkin',
      sourceId: Number(ins.lastInsertRowid),
      studentId: student.id,
      source: 'checkin',
      result,
      actorUserId: req.user.id,
    });

    audit(req, 'checkin.submitted', { entity: 'checkin', entityId: ins.lastInsertRowid, detail: { level: result.level } });

    // สิ่งที่นักเรียนได้เห็น — ไม่มีระดับ ไม่มีคะแนน ไม่มีชื่อกฎ
    res.json({
      ok: true,
      message: result.studentMessage,
      showHelpline: result.studentMessage.showHelpline,
      helplines: result.studentMessage.showHelpline ? helplines : [],
      crisis: result.level === 4 ? crisisScreen : null,
      recommendedModules: recommendModules(result.contextTags, result.domains),
      caseOpened: !!caseId,
    });
  }),
);

/** ทดลองกลไกประเมินโดยไม่บันทึกลงฐานข้อมูล — สำหรับตรวจสอบ/อบรมครูเท่านั้น */
checkinRouter.post('/dry-run', requireAuth('admin', 'counselor'), h(async (req, res) => {
  const templateIds = Array.isArray(req.body?.templateIds) && req.body.templateIds.length
    ? req.body.templateIds
    : [weeklyCheckin.id];
  const answers = plainObject(req.body?.answers, 'คำตอบ');
  const { items, pairs, required } = collectItems(templateIds);
  const result = await runEngine({
    source: str(req.body?.source, 'แหล่งข้อมูล', { required: false }) ?? 'checkin',
    items, answers, pairs, required, history: [],
  });
  audit(req, 'engine.dryRun');
  res.json(result);
}));
