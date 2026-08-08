import { get } from '../db.js';
import { verifyToken } from '../lib/crypto.js';
import { unauthorized, forbidden } from '../lib/http.js';

/** อ่าน token → แนบ req.user (ไม่บังคับว่าต้องมี) */
export function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (payload?.sub) {
    const user = get(
      'SELECT id, role, username, display_name, active FROM users WHERE id = ?',
      [payload.sub],
    );
    if (user && user.active) {
      req.user = user;
      if (user.role === 'student') {
        req.student = get('SELECT * FROM students WHERE user_id = ?', [user.id]);
      }
    }
  }
  next();
}

/** บังคับว่าต้อง login และ (ถ้าระบุ) ต้องมี role ที่กำหนด */
export function requireAuth(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** บุคลากรทุกระดับที่ดูเคสได้ */
export const requireStaff = requireAuth('teacher', 'counselor', 'admin');

/** ผู้ที่ตัดสินใจส่งต่อ/ปิดเคสระดับสูงได้ */
export const requireCounselor = requireAuth('counselor', 'admin');

/**
 * ครูที่ปรึกษาเห็นเฉพาะห้องที่รับผิดชอบ; counselor/admin เห็นทั้งโรงเรียน
 * คืน true ถ้าเข้าถึงได้
 */
export function canAccessStudent(user, studentId) {
  if (!user) return false;
  if (user.role === 'counselor' || user.role === 'admin') return true;
  if (user.role === 'teacher') {
    const row = get(
      `SELECT s.id FROM students s
         JOIN classrooms c ON c.id = s.classroom_id
        WHERE s.id = ? AND c.advisor_user_id = ?`,
      [studentId, user.id],
    );
    return !!row;
  }
  return false;
}
