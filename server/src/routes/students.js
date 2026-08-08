import { Router } from 'express';
import { all, get, run, hydrate } from '../db.js';
import { h, str, int, notFound, forbidden } from '../lib/http.js';
import { requireStaff, canAccessStudent } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { LEVELS } from '../engine/triage.js';

export const studentsRouter = Router();

/** ค้นหานักเรียน — ผลลัพธ์จำกัดตามสิทธิ์ และถูกบันทึกใน audit log เสมอ */
studentsRouter.get('/', requireStaff, h((req, res) => {
  const q = str(req.query.q, 'คำค้น', { required: false, max: 100 }) ?? '';
  const classroomId = req.query.classroomId ? Number(req.query.classroomId) : null;

  let sql = `SELECT s.id, s.student_code, s.display_name, cl.name AS classroom
               FROM students s LEFT JOIN classrooms cl ON cl.id = s.classroom_id
              WHERE s.active = 1`;
  const params = [];

  if (q) { sql += ' AND (s.display_name LIKE ? OR s.student_code LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (classroomId) { sql += ' AND s.classroom_id = ?'; params.push(classroomId); }
  if (req.user.role === 'teacher') { sql += ' AND cl.advisor_user_id = ?'; params.push(req.user.id); }

  sql += ' ORDER BY cl.name, s.display_name LIMIT 200';
  const rows = all(sql, params);

  audit(req, 'students.search', { detail: { q, classroomId, count: rows.length } });
  res.json({ students: rows });
}));

/**
 * โปรไฟล์นักเรียนสำหรับบุคลากร
 * แสดง "ประวัติการดูแล" ไม่ใช่ "แฟ้มประวัติความเสี่ยง"
 * ไม่มีการจัดอันดับ ไม่มีป้ายกำกับตัวบุคคล
 */
studentsRouter.get('/:id', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสนักเรียน');
  if (!canAccessStudent(req.user, id)) throw forbidden('นักเรียนคนนี้อยู่นอกความรับผิดชอบของคุณ');

  const student = get(
    `SELECT s.*, cl.name AS classroom, u.display_name AS advisor
       FROM students s
       LEFT JOIN classrooms cl ON cl.id = s.classroom_id
       LEFT JOIN users u ON u.id = cl.advisor_user_id
      WHERE s.id = ?`,
    [id],
  );
  if (!student) throw notFound('ไม่พบนักเรียน');

  const cases = all(
    `SELECT id, level, peak_level, status, origin, opened_at, closed_at, close_reason
       FROM cases WHERE student_id = ? ORDER BY opened_at DESC`,
    [id],
  ).map((c) => ({ ...c, levelInfo: LEVELS[c.level] }));

  const trend = all(
    `SELECT created_at, level, concern_index, data_sufficiency, dimensions_json
       FROM assessments WHERE student_id = ? ORDER BY created_at ASC LIMIT 60`,
    [id],
  ).map(hydrate);

  const checkinCount = get('SELECT COUNT(*) AS n FROM checkins WHERE student_id = ?', [id])?.n ?? 0;
  const consent = get(
    'SELECT version, granted_by, granted_at FROM consents WHERE student_id = ? AND withdrawn_at IS NULL ORDER BY id DESC LIMIT 1',
    [id],
  );

  audit(req, 'student.view', { entity: 'student', entityId: id });
  res.json({ student, cases, trend, checkinCount, consent: consent ?? null });
}));

/** บันทึกบริบทที่จำเป็นต่อการช่วยเหลือ (ไม่ใช่ที่เก็บความเห็นส่วนตัวเรื่องนิสัยเด็ก) */
studentsRouter.put('/:id/notes', requireStaff, h((req, res) => {
  const id = int(req.params.id, 'รหัสนักเรียน');
  if (!canAccessStudent(req.user, id)) throw forbidden();
  const notes = str(req.body?.notes, 'บันทึก', { required: false, max: 3000 });

  run('UPDATE students SET notes = ? WHERE id = ?', [notes, id]);
  audit(req, 'student.notes.update', { entity: 'student', entityId: id });
  res.json({ ok: true });
}));

studentsRouter.get('/meta/classrooms', requireStaff, h((req, res) => {
  const rows = req.user.role === 'teacher'
    ? all(`SELECT cl.id, cl.name, cl.level, COUNT(s.id) AS student_count
             FROM classrooms cl LEFT JOIN students s ON s.classroom_id = cl.id AND s.active = 1
            WHERE cl.advisor_user_id = ? GROUP BY cl.id ORDER BY cl.name`, [req.user.id])
    : all(`SELECT cl.id, cl.name, cl.level, u.display_name AS advisor, COUNT(s.id) AS student_count
             FROM classrooms cl
             LEFT JOIN users u ON u.id = cl.advisor_user_id
             LEFT JOIN students s ON s.classroom_id = cl.id AND s.active = 1
            GROUP BY cl.id ORDER BY cl.name`);
  res.json({ classrooms: rows });
}));
