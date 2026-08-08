import { Router } from 'express';
import { get, run, all } from '../db.js';
import { h, bad, str, plainObject, bool, notFound } from '../lib/http.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { audit } from '../lib/audit.js';
import { selfReport, friendConcern, staffNote, getTemplate } from '../content/templates.js';
import { runEngine } from '../engine/index.js';
import { ingestAssessment, assessmentHistory } from '../services/cases.js';
import { recommendModules } from '../content/lifeskills.js';
import { helplines, crisisScreen } from '../content/help.js';
import { referenceCode } from '../lib/crypto.js';

export const reportsRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 10 });

reportsRouter.get('/templates', requireAuth(), h((req, res) => {
  res.json({
    self: selfReport,
    friend: friendConcern,
    staffNote: req.user.role === 'student' ? null : staffNote,
  });
}));

// ─────────────────────────── เล่าเรื่องของตัวเอง ───────────────────────────

reportsRouter.post('/self', requireAuth('student'), limiter, h(async (req, res) => {
  const answers = plainObject(req.body?.answers, 'คำตอบ');
  const anonymous = bool(req.body?.anonymous);
  const template = selfReport;

  const history = assessmentHistory(req.student.id);
  const result = await runEngine({
    source: 'self_report', items: template.items, answers,
    pairs: template.consistencyPairs, required: template.requiredForSufficiency, history,
  });

  const ins = run(
    `INSERT INTO reports
       (kind, reporter_user_id, reporter_student_id, subject_student_id, anonymous,
        categories_json, answers_json, body, wants_contact)
     VALUES ('self', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id, req.student.id,
      anonymous ? null : req.student.id,
      anonymous ? 1 : 0,
      JSON.stringify(Array.isArray(answers.sr_what) ? answers.sr_what : []),
      JSON.stringify(answers),
      typeof answers.sr_body === 'string' ? answers.sr_body : null,
      result.wantsContact === 'yes' ? 1 : 0,
    ],
  );

  /**
   * ถ้านักเรียนเลือกไม่เปิดเผยชื่อ แต่มีสัญญาณระดับ 4
   * ระบบยังต้องเปิดเคส เพราะความปลอดภัยสำคัญกว่าการไม่ระบุตัวตน
   * — แต่จะแนบตัวตนก็ต่อเมื่อถึงระดับ 4 เท่านั้น และแจ้งนักเรียนตรง ๆ ว่าเป็นแบบนั้น
   *   (เงื่อนไขนี้ถูกบอกไว้ล่วงหน้าในเอกสารความยินยอม)
   */
  const identityAttached = !anonymous || result.level >= 4;

  const { caseId } = ingestAssessment({
    sourceType: 'report',
    sourceId: Number(ins.lastInsertRowid),
    studentId: identityAttached ? req.student.id : null,
    subjectHint: identityAttached ? null : 'นักเรียนแจ้งโดยไม่ประสงค์ออกนาม',
    source: 'self_report',
    result,
    actorUserId: req.user.id,
  });

  audit(req, 'report.self', { entity: 'report', entityId: ins.lastInsertRowid, detail: { level: result.level, anonymous } });

  res.json({
    ok: true,
    message: result.studentMessage,
    identityDisclosed: identityAttached && anonymous,
    identityNotice:
      identityAttached && anonymous
        ? 'เพราะสิ่งที่เธอเล่าเกี่ยวกับความปลอดภัย ครูที่รับผิดชอบจึงจำเป็นต้องรู้ว่าเป็นเธอ เพื่อจะช่วยได้ทัน เราบอกเรื่องนี้ไว้ล่วงหน้าเสมอ'
        : null,
    helplines: result.studentMessage.showHelpline ? helplines : [],
    crisis: result.level === 4 ? crisisScreen : null,
    recommendedModules: recommendModules(result.contextTags, result.domains),
    caseOpened: !!caseId,
  });
}));

// ─────────────────────────── เป็นห่วงเพื่อน ───────────────────────────

reportsRouter.post('/friend', requireAuth(), limiter, h(async (req, res) => {
  const answers = plainObject(req.body?.answers, 'คำตอบ');
  const anonymous = bool(req.body?.anonymous);
  const subjectHint = str(req.body?.subjectHint, 'ข้อมูลของเพื่อน', { required: false, max: 300 });
  const subjectStudentId = req.body?.subjectStudentId ? Number(req.body.subjectStudentId) : null;

  if (!subjectHint && !subjectStudentId) {
    throw bad('กรุณาระบุอย่างน้อยว่าเพื่อนคนนี้เป็นใคร เช่น ชื่อเล่นหรือห้องเรียน เพื่อให้ครูตามหาได้');
  }

  const subject = subjectStudentId
    ? get('SELECT id FROM students WHERE id = ? AND active = 1', [subjectStudentId])
    : null;

  const history = subject ? assessmentHistory(subject.id) : [];
  const result = await runEngine({
    source: 'friend_report', items: friendConcern.items, answers, history,
  });

  const ins = run(
    `INSERT INTO reports
       (kind, reporter_user_id, reporter_student_id, subject_student_id, subject_hint,
        anonymous, categories_json, answers_json, body)
     VALUES ('friend', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      anonymous ? null : req.user.id,
      anonymous || !req.student ? null : req.student.id,
      subject?.id ?? null,
      subjectHint,
      anonymous ? 1 : 0,
      JSON.stringify(Array.isArray(answers.f_what) ? answers.f_what : []),
      JSON.stringify(answers),
      typeof answers.f_detail === 'string' ? answers.f_detail : null,
    ],
  );

  const { caseId } = ingestAssessment({
    sourceType: 'report',
    sourceId: Number(ins.lastInsertRowid),
    studentId: subject?.id ?? null,
    subjectHint: subject ? null : subjectHint,
    source: 'friend_report',
    result,
    actorUserId: anonymous ? null : req.user.id,
  });

  audit(req, 'report.friend', { entity: 'report', entityId: ins.lastInsertRowid, detail: { level: result.level, anonymous } });

  res.json({
    ok: true,
    message: {
      tone: result.level >= 3 ? 'urgent-care' : 'warm',
      title: 'ขอบคุณที่บอกเรา',
      body:
        result.level >= 4
          ? 'สิ่งที่เธอแจ้งเป็นเรื่องเร่งด่วน ครูที่รับผิดชอบได้รับเรื่องแล้วและจะดำเนินการทันที ' +
            'ถ้าตอนนี้เพื่อนอยู่กับเธอและมีอันตราย ให้โทร 1669 หรือ 191 ทันที'
          : 'ครูที่รับผิดชอบจะตรวจสอบเรื่องนี้ การที่เธอกล้าบอกอาจช่วยเพื่อนได้มากกว่าที่คิด',
      showHelpline: result.level >= 3,
    },
    helplines: result.level >= 3 ? helplines : [],
    referenceCode: anonymous ? referenceCode() : null,
    caseOpened: !!caseId,
  });
}));

// ─────────────────────────── บันทึกข้อสังเกตของบุคลากร ───────────────────────────

reportsRouter.post('/staff-note', requireStaff, h(async (req, res) => {
  const answers = plainObject(req.body?.answers, 'คำตอบ');
  const studentId = Number(req.body?.studentId);
  if (!studentId) throw bad('กรุณาเลือกนักเรียน');

  const student = get('SELECT id FROM students WHERE id = ? AND active = 1', [studentId]);
  if (!student) throw notFound('ไม่พบนักเรียน');

  const history = assessmentHistory(student.id);
  const result = await runEngine({
    source: 'staff_note', items: staffNote.items, answers, history,
  });

  const ins = run(
    `INSERT INTO reports
       (kind, reporter_user_id, subject_student_id, categories_json, answers_json, body)
     VALUES ('staff_note', ?, ?, ?, ?, ?)`,
    [
      req.user.id, student.id,
      JSON.stringify(Array.isArray(answers.n_what) ? answers.n_what : []),
      JSON.stringify(answers),
      typeof answers.n_detail === 'string' ? answers.n_detail : null,
    ],
  );

  const { caseId, escalated, created } = ingestAssessment({
    sourceType: 'report',
    sourceId: Number(ins.lastInsertRowid),
    studentId: student.id,
    source: 'staff_note',
    result,
    actorUserId: req.user.id,
  });

  audit(req, 'report.staffNote', { entity: 'student', entityId: student.id, detail: { level: result.level } });

  res.json({
    ok: true,
    level: result.level,
    levelCode: result.levelCode,
    levelInfo: result.levelInfo,
    rationale: result.rationale,
    actions: result.actions,
    deadlines: result.deadlines,
    caseId, escalated, created,
  });
}));

/** ประวัติการแจ้งของตัวเอง */
reportsRouter.get('/mine', requireAuth('student'), h((req, res) => {
  const rows = all(
    `SELECT id, kind, anonymous, submitted_at, categories_json FROM reports
      WHERE reporter_student_id = ? ORDER BY submitted_at DESC LIMIT 30`,
    [req.student.id],
  );
  res.json({
    reports: rows.map((r) => ({
      id: r.id, kind: r.kind, anonymous: !!r.anonymous, submittedAt: r.submitted_at,
      categories: JSON.parse(r.categories_json || '[]'),
    })),
  });
}));
