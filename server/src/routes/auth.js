import { Router } from 'express';
import { get, run } from '../db.js';
import { verifyPassword, hashPassword, signToken } from '../lib/crypto.js';
import { h, str, bad, unauthorized, AppError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

export const authRouter = Router();

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

authRouter.post('/login', h((req, res) => {
  const username = str(req.body?.username, 'ชื่อผู้ใช้', { max: 64 });
  const password = str(req.body?.password, 'รหัสผ่าน', { max: 200, trim: false });

  const user = get('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);

  if (!user || !user.active) {
    audit(req, 'login.failed', { detail: `ไม่พบผู้ใช้: ${username}` });
    throw unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  if (user.locked_until && new Date(`${user.locked_until.replace(' ', 'T')}Z`) > new Date()) {
    throw new AppError(429, `บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ในอีก ${LOCK_MINUTES} นาที`, 'LOCKED');
  }

  if (!verifyPassword(password, user.password_hash)) {
    const failed = user.failed_logins + 1;
    run(
      `UPDATE users SET failed_logins = ?, locked_until = CASE WHEN ? >= ? THEN datetime('now', '+${LOCK_MINUTES} minutes') ELSE locked_until END WHERE id = ?`,
      [failed, failed, MAX_ATTEMPTS, user.id],
    );
    audit(req, 'login.failed', { entity: 'user', entityId: user.id });
    throw unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  run(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?`, [user.id]);
  audit({ ...req, user }, 'login.success', { entity: 'user', entityId: user.id });

  res.json({
    token: signToken({ sub: user.id, role: user.role }),
    user: publicUser(user),
  });
}));

authRouter.get('/me', requireAuth(), h((req, res) => {
  const student = req.student
    ? {
        id: req.student.id,
        studentCode: req.student.student_code,
        classroom: get('SELECT name FROM classrooms WHERE id = ?', [req.student.classroom_id])?.name ?? null,
        hasConsent: !!get(
          'SELECT id FROM consents WHERE student_id = ? AND withdrawn_at IS NULL LIMIT 1',
          [req.student.id],
        ),
      }
    : null;
  res.json({ user: publicUser(req.user), student });
}));

authRouter.post('/change-password', requireAuth(), h((req, res) => {
  const current = str(req.body?.currentPassword, 'รหัสผ่านปัจจุบัน', { max: 200, trim: false });
  const next = str(req.body?.newPassword, 'รหัสผ่านใหม่', { min: 6, max: 200, trim: false });

  const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!verifyPassword(current, user.password_hash)) throw bad('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  if (current === next) throw bad('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');

  run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hashPassword(next), user.id]);
  audit(req, 'password.changed', { entity: 'user', entityId: user.id });
  res.json({ ok: true });
}));

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    username: user.username,
    displayName: user.display_name,
    mustChangePassword: !!user.must_change_password,
  };
}
