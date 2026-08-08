import { Router } from 'express';
import { all, get, run } from '../db.js';
import { h, str, int, notFound, bad } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { lifeskillModules, getModule } from '../content/lifeskills.js';
import { scanText } from '../engine/lexicon.js';
import { runEngine } from '../engine/index.js';
import { ingestAssessment } from '../services/cases.js';
import { audit } from '../lib/audit.js';
import { helplines } from '../content/help.js';

export const lifeskillsRouter = Router();

lifeskillsRouter.get('/', requireAuth(), h((req, res) => {
  const progress = req.student
    ? all('SELECT module_id, step_index, completed FROM lifeskill_progress WHERE student_id = ?', [req.student.id])
    : [];
  const byId = Object.fromEntries(progress.map((p) => [p.module_id, p]));

  res.json({
    modules: lifeskillModules.map((m) => ({
      id: m.id, title: m.title, emoji: m.emoji, minutes: m.minutes,
      tags: m.tags, goal: m.goal, stepCount: m.steps.length,
      progress: byId[m.id] ? { stepIndex: byId[m.id].step_index, completed: !!byId[m.id].completed } : null,
    })),
  });
}));

lifeskillsRouter.get('/:id', requireAuth(), h((req, res) => {
  const module = getModule(req.params.id);
  if (!module) throw notFound('ไม่พบกิจกรรมนี้');
  const progress = req.student
    ? get('SELECT step_index, completed, reflection FROM lifeskill_progress WHERE student_id = ? AND module_id = ?',
        [req.student.id, module.id])
    : null;
  res.json({ module, progress: progress ?? null });
}));

/** บันทึกความคืบหน้า — ไม่มีคะแนน ไม่มีการจัดอันดับ */
lifeskillsRouter.post('/:id/progress', requireAuth('student'), h((req, res) => {
  const module = getModule(req.params.id);
  if (!module) throw notFound('ไม่พบกิจกรรมนี้');

  const stepIndex = int(req.body?.stepIndex, 'ขั้นตอน', { min: 0, max: module.steps.length });
  const completed = stepIndex >= module.steps.length - 1 && req.body?.completed === true;

  run(
    `INSERT INTO lifeskill_progress (student_id, module_id, step_index, completed, updated_at)
     VALUES (?,?,?,?, datetime('now'))
     ON CONFLICT(student_id, module_id) DO UPDATE SET
       step_index = MAX(step_index, excluded.step_index),
       completed  = MAX(completed, excluded.completed),
       updated_at = datetime('now')`,
    [req.student.id, module.id, stepIndex, completed ? 1 : 0],
  );
  res.json({ ok: true, completed });
}));

/**
 * บันทึกข้อความสะท้อนตัวเอง
 *
 * สำคัญ: ข้อความจากกิจกรรมทักษะชีวิต "ก็ต้องผ่านการตรวจสัญญาณความปลอดภัยด้วย"
 * เพราะนักเรียนหลายคนเผลอเล่าเรื่องหนัก ๆ ในช่องที่ดูปลอดภัยกว่าแบบสอบถาม
 * แต่เนื้อหาสะท้อนตัวเองทั่วไปจะไม่ถูกส่งให้ครูอ่าน — ส่งเฉพาะเมื่อพบสัญญาณ
 */
lifeskillsRouter.post('/:id/reflection', requireAuth('student'), h(async (req, res) => {
  const module = getModule(req.params.id);
  if (!module) throw notFound('ไม่พบกิจกรรมนี้');
  const text = str(req.body?.text, 'ข้อความ', { min: 1, max: 4000 });

  run(
    `INSERT INTO lifeskill_progress (student_id, module_id, step_index, reflection, updated_at)
     VALUES (?,?,0,?, datetime('now'))
     ON CONFLICT(student_id, module_id) DO UPDATE SET
       reflection = excluded.reflection, updated_at = datetime('now')`,
    [req.student.id, module.id, text],
  );

  const scan = scanText(text);
  if (scan.hits.length === 0) {
    return res.json({ ok: true, escalated: false });
  }

  // พบสัญญาณ → ให้กลไกเดิมประเมิน โดยถือว่าเป็นการเล่าเรื่องของตัวเอง
  const items = [{ id: 'ls_reflection', type: 'text', domain: 'freetext', facet: 'context' }];
  const result = await runEngine({
    source: 'self_report', items, answers: { ls_reflection: text }, history: [],
  });

  const ins = run(
    `INSERT INTO reports (kind, reporter_user_id, reporter_student_id, subject_student_id, categories_json, answers_json, body)
     VALUES ('self', ?, ?, ?, ?, ?, ?)`,
    [req.user.id, req.student.id, req.student.id,
     JSON.stringify(scan.categories), JSON.stringify({ moduleId: module.id }), text],
  );

  const { caseId } = ingestAssessment({
    sourceType: 'report', sourceId: Number(ins.lastInsertRowid),
    studentId: req.student.id, source: 'self_report', result, actorUserId: req.user.id,
  });

  audit(req, 'lifeskill.reflection.escalated', { entity: 'student', entityId: req.student.id, detail: { level: result.level } });

  res.json({
    ok: true,
    escalated: !!caseId,
    message: result.studentMessage,
    helplines: result.studentMessage.showHelpline ? helplines : [],
  });
}));
