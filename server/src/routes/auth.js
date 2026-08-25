import { Router } from 'express';
import { get, all, run, getSetting } from '../db.js';
import { verifyPassword, hashPassword, signToken } from '../lib/crypto.js';
import { h, str, int, bad, unauthorized, forbidden, notFound, AppError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { audit } from '../lib/audit.js';

export const authRouter = Router();

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

/**
 * ═══════════════════════════════════════════════════════════
 *  ตั้งค่าครั้งแรก — ตั้งชื่อผู้ใช้และรหัสผ่านของผู้ดูแลบนหน้าจอ
 * ═══════════════════════════════════════════════════════════
 *
 *  ปัญหาที่แก้: การตั้งรหัสผ่านผ่านตัวแปรบนโฮสต์ทำให้ผู้ติดตั้งพลาดง่ายมาก
 *  พิมพ์ผิดหนึ่งตัวก็เข้าระบบไม่ได้เลย และไม่มีทางกู้นอกจากลบฐานข้อมูล
 *
 *  เงื่อนไขความปลอดภัย: หน้านี้เปิดได้ก็ต่อเมื่อ "ยังไม่เคยมีใครเข้าระบบสำเร็จเลย"
 *  พอมีคนตั้งค่าและเข้าระบบครั้งแรกได้ ประตูนี้จะปิดถาวร เปิดซ้ำไม่ได้อีก
 *  และตอนที่ยังเปิดอยู่ ระบบยังไม่มีข้อมูลนักเรียนใด ๆ ให้เสียหาย
 */
function needsSetup() {
  const row = get('SELECT COUNT(*) AS n FROM users WHERE last_login_at IS NOT NULL');
  return (row?.n ?? 0) === 0;
}

authRouter.get('/setup-status', h((_req, res) => {
  res.json({ needsSetup: needsSetup() });
}));

authRouter.post('/setup', h((req, res) => {
  if (!needsSetup()) {
    throw forbidden('ระบบถูกตั้งค่าเรียบร้อยแล้ว — หน้านี้ใช้ได้เฉพาะครั้งแรกเท่านั้น');
  }

  const username = str(req.body?.username, 'ชื่อผู้ใช้', { min: 3, max: 64 }).toLowerCase();
  const displayName = str(req.body?.displayName, 'ชื่อที่แสดง', { required: false, max: 120 }) || 'ผู้ดูแลระบบ';
  const password = str(req.body?.password, 'รหัสผ่าน', { min: 8, max: 200, trim: false });
  const confirm = str(req.body?.confirmPassword, 'ยืนยันรหัสผ่าน', { min: 8, max: 200, trim: false });

  if (password !== confirm) throw bad('รหัสผ่านสองช่องไม่ตรงกัน');
  if (password.toLowerCase().includes(username.toLowerCase())) {
    throw bad('รหัสผ่านต้องไม่มีชื่อผู้ใช้อยู่ในนั้น — เดาง่ายเกินไปสำหรับบัญชีที่เห็นข้อมูลนักเรียนทั้งโรงเรียน');
  }
  if (!/[^a-zA-Z]/.test(password)) {
    throw bad('รหัสผ่านควรมีตัวเลขหรือสัญลักษณ์อย่างน้อยหนึ่งตัว');
  }

  const hash = hashPassword(password);
  const existing = get('SELECT id FROM users WHERE username = ?', [username]);

  if (existing) {
    run(
      `UPDATE users SET role = 'admin', password_hash = ?, display_name = ?, active = 1,
                        must_change_password = 0, failed_logins = 0, locked_until = NULL
         WHERE id = ?`,
      [hash, displayName, existing.id],
    );
  } else {
    run(
      `INSERT INTO users (role, username, password_hash, display_name, must_change_password)
       VALUES ('admin', ?, ?, ?, 0)`,
      [username, hash, displayName],
    );
  }

  const user = get('SELECT * FROM users WHERE username = ?', [username]);

  // ปิดบัญชีผู้ดูแลอื่นที่ยังไม่เคยถูกใช้ — กันรหัสเริ่มต้นที่ตั้งไว้ตอนติดตั้งค้างเป็นทางเข้าลับ
  const stale = run(
    `UPDATE users SET active = 0
       WHERE role = 'admin' AND id != ? AND last_login_at IS NULL`,
    [user.id],
  );

  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [user.id]);
  audit({ ...req, user }, 'setup.completed', { entity: 'user', entityId: user.id });
  console.log(`[setup] ตั้งค่าผู้ดูแลระบบ "${username}" เรียบร้อย — ปิดหน้าตั้งค่าถาวรแล้ว`);
  if (stale.changes) console.log(`[setup] ปิดบัญชีผู้ดูแลที่ไม่เคยถูกใช้ ${stale.changes} บัญชี`);

  res.json({ token: signToken({ sub: user.id, role: user.role }), user: publicUser(user) });
}));

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

// ───────────────────────────────────────────────────────────────
//  โหมดทดลอง — เข้าระบบด้วยการกดชื่อตัวเอง แล้วตั้ง PIN เอง
//
//  ปัญหาที่แก้: การแจกกระดาษรหัสผ่านหลายร้อยใบทำให้การทดลองไม่เกิดขึ้นจริง
//
//  ความเสี่ยงที่ต้องคุมไว้ 2 ข้อ:
//   1. รายชื่อนักเรียนจริงหลุดสู่สาธารณะ → กันด้วย "รหัสเข้าโรงเรียน" ที่ครูบอกในห้อง
//   2. เพื่อนกดชื่อเราแล้วสวมรอย → กันด้วย PIN ที่นักเรียนตั้งเองในการเข้าครั้งแรก
//      (ช่วงเสี่ยงเหลือแค่ "ครั้งแรกก่อนใครจะตั้ง" จึงควรให้ครูคุมตอนตั้งพร้อมกันในคาบ)
// ───────────────────────────────────────────────────────────────

const rosterLimiter = rateLimit({ windowMs: 60_000, max: 20 });

function trialConfig() {
  return getSetting('trial.roster', { enabled: false, accessCode: '', classroomIds: [] });
}

/** ตรวจว่าโหมดทดลองเปิดอยู่ และรหัสเข้าโรงเรียนถูกต้อง */
function requireTrial(accessCode) {
  const cfg = trialConfig();
  if (!cfg.enabled) throw forbidden('ยังไม่ได้เปิดโหมดทดลองสำหรับการเข้าด้วยรายชื่อ');
  const expected = String(cfg.accessCode ?? '').trim();
  if (expected && String(accessCode ?? '').trim().toUpperCase() !== expected.toUpperCase()) {
    throw unauthorized('รหัสเข้าโรงเรียนไม่ถูกต้อง — ถามครูประจำวิชาได้เลย');
  }
  return cfg;
}

/** สถานะโหมดทดลอง — ให้หน้า login รู้ว่าจะแสดงปุ่ม "กดชื่อตัวเอง" ไหม (ไม่เปิดเผยรหัส) */
authRouter.get('/roster/status', h((_req, res) => {
  const cfg = trialConfig();
  res.json({ enabled: !!cfg.enabled, requiresAccessCode: !!String(cfg.accessCode ?? '').trim() });
}));

/** รายชื่อห้องเรียนที่เปิดให้ทดลอง (ยังไม่แสดงชื่อนักเรียน) */
authRouter.post('/roster/classrooms', rosterLimiter, h((req, res) => {
  const cfg = requireTrial(req.body?.accessCode);
  const ids = Array.isArray(cfg.classroomIds) ? cfg.classroomIds : [];

  const rows = ids.length
    ? all(
        `SELECT cl.id, cl.name, COUNT(s.id) AS student_count
           FROM classrooms cl LEFT JOIN students s ON s.classroom_id = cl.id AND s.active = 1
          WHERE cl.id IN (${ids.map(() => '?').join(',')})
          GROUP BY cl.id ORDER BY cl.name`,
        ids,
      )
    : [];

  res.json({ classrooms: rows });
}));

/** รายชื่อนักเรียนในห้องที่เลือก — ชื่อกับสถานะตั้งรหัสเท่านั้น ไม่มีข้อมูลอื่นเลย */
authRouter.post('/roster/students', rosterLimiter, h((req, res) => {
  const cfg = requireTrial(req.body?.accessCode);
  const classroomId = int(req.body?.classroomId, 'ห้องเรียน');
  const ids = Array.isArray(cfg.classroomIds) ? cfg.classroomIds : [];
  if (!ids.includes(classroomId)) throw forbidden('ห้องนี้ยังไม่ได้เปิดให้ทดลอง');

  const rows = all(
    `SELECT s.id, s.display_name, u.self_pin_set
       FROM students s JOIN users u ON u.id = s.user_id
      WHERE s.classroom_id = ? AND s.active = 1 AND u.active = 1
      ORDER BY s.display_name`,
    [classroomId],
  );

  res.json({
    students: rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      claimed: !!r.self_pin_set,
    })),
  });
}));

/**
 * เข้าระบบด้วยรายชื่อ
 *  - ยังไม่เคยตั้งรหัส  → ตั้งรหัสใหม่ (ต้องส่ง confirmPin มาด้วย)
 *  - ตั้งรหัสแล้ว       → ตรวจรหัส
 */
authRouter.post('/roster/enter', rosterLimiter, h((req, res) => {
  const cfg = requireTrial(req.body?.accessCode);
  const studentId = int(req.body?.studentId, 'นักเรียน');
  const pin = str(req.body?.pin, 'รหัส', { max: 20, trim: true });

  if (!/^\d{4,6}$/.test(pin)) throw bad('รหัสต้องเป็นตัวเลข 4–6 หลัก');

  const row = get(
    `SELECT s.id AS student_id, s.classroom_id, u.*
       FROM students s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.active = 1 AND u.active = 1`,
    [studentId],
  );
  if (!row) throw notFound('ไม่พบนักเรียนคนนี้');

  const ids = Array.isArray(cfg.classroomIds) ? cfg.classroomIds : [];
  if (!ids.includes(row.classroom_id)) throw forbidden('ห้องนี้ยังไม่ได้เปิดให้ทดลอง');

  if (row.locked_until && new Date(`${row.locked_until.replace(' ', 'T')}Z`) > new Date()) {
    throw new AppError(429, `ใส่รหัสผิดหลายครั้ง กรุณารออีก ${LOCK_MINUTES} นาที แล้วลองใหม่`, 'LOCKED');
  }

  // ── ครั้งแรก: ตั้งรหัสของตัวเอง ──────────────────────────
  if (!row.self_pin_set) {
    const confirm = str(req.body?.confirmPin, 'ยืนยันรหัส', { max: 20, trim: true });
    if (pin !== confirm) throw bad('รหัสสองช่องไม่ตรงกัน ลองใหม่อีกครั้ง');
    if (/^(\d)\1+$/.test(pin)) throw bad('อย่าใช้เลขซ้ำกันทั้งหมด เช่น 1111 — เดาง่ายเกินไป');
    if (['1234', '0000', '12345', '123456'].includes(pin)) throw bad('รหัสนี้เดาง่ายเกินไป ลองเลขอื่นดู');

    run(
      `UPDATE users SET password_hash = ?, self_pin_set = 1, must_change_password = 0,
                        failed_logins = 0, locked_until = NULL, last_login_at = datetime('now')
         WHERE id = ?`,
      [hashPassword(pin), row.id],
    );
    audit({ ...req, user: row }, 'roster.claim', { entity: 'student', entityId: studentId });

    return res.json({
      token: signToken({ sub: row.id, role: row.role }),
      user: publicUser({ ...row, must_change_password: 0 }),
      claimed: true,
    });
  }

  // ── ครั้งต่อไป: ตรวจรหัส ────────────────────────────────
  if (!verifyPassword(pin, row.password_hash)) {
    const failed = row.failed_logins + 1;
    run(
      `UPDATE users SET failed_logins = ?,
              locked_until = CASE WHEN ? >= ? THEN datetime('now', '+${LOCK_MINUTES} minutes') ELSE locked_until END
         WHERE id = ?`,
      [failed, failed, MAX_ATTEMPTS, row.id],
    );
    audit(req, 'roster.failed', { entity: 'student', entityId: studentId });
    throw unauthorized('รหัสไม่ถูกต้อง — ถ้าลืมรหัส บอกครูให้ตั้งใหม่ให้ได้');
  }

  run(
    `UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?`,
    [row.id],
  );
  audit({ ...req, user: row }, 'roster.login', { entity: 'student', entityId: studentId });

  res.json({
    token: signToken({ sub: row.id, role: row.role }),
    user: publicUser(row),
    claimed: false,
  });
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
