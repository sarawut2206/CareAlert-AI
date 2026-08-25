import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { get, run } from './db.js';
import { hashPassword } from './lib/crypto.js';

/**
 * Bootstrap บัญชีผู้ดูแลระบบ
 *
 * ปัญหาที่แก้: ติดตั้งบนโฮสต์แล้วฐานข้อมูลว่าง = ไม่มีใครล็อกอินได้เลย
 * จึงสร้างบัญชีผู้ดูแลให้หนึ่งบัญชี และบังคับเปลี่ยนรหัสผ่านทันทีที่เข้าครั้งแรก
 *
 * ตัวแปรที่เกี่ยวข้อง:
 *   ADMIN_USERNAME          ชื่อผู้ใช้ของผู้ดูแล (ค่าเริ่มต้น admin)
 *   ADMIN_INITIAL_PASSWORD  รหัสผ่านเริ่มต้น (แนะนำอย่างยิ่งบนโฮสต์สาธารณะ)
 *   ADMIN_RESET=true        กู้รหัสผ่านเมื่อลืม — ตั้งรหัสใหม่ให้บัญชีนี้ตอนบูต
 *                           ⚠️ ต้องลบตัวแปรนี้ทิ้งทันทีหลังเข้าระบบได้แล้ว
 *                           มิฉะนั้นรหัสจะถูกตั้งกลับทุกครั้งที่ระบบรีสตาร์ต
 */
{
  const adminUser = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const initial = process.env.ADMIN_INITIAL_PASSWORD || 'admin1234';
  const userCount = get('SELECT COUNT(*) AS n FROM users')?.n ?? 0;
  const existing = get('SELECT id FROM users WHERE username = ?', [adminUser]);

  /**
   * ระบบถูกตั้งค่าเสร็จแล้วหรือยัง — วัดจาก "เคยมีคนเข้าระบบสำเร็จไหม"
   *
   * ถ้าตั้งค่าเสร็จแล้ว ตัวแปร ADMIN_* ทั้งหมดจะไม่มีผลอีกเลย
   * ป้องกันกรณีที่ผู้ติดตั้งลืมลบ ADMIN_RESET ทิ้ง แล้วรหัสผ่านถูกตั้งกลับ
   * ทุกครั้งที่โฮสต์รีสตาร์ต ซึ่งเป็นกับดักที่ทำให้เข้าระบบไม่ได้แบบหาสาเหตุยาก
   */
  const alreadySetUp = (get('SELECT COUNT(*) AS n FROM users WHERE last_login_at IS NOT NULL')?.n ?? 0) > 0;
  const wantReset = process.env.ADMIN_RESET === 'true' && !alreadySetUp;

  if (process.env.ADMIN_RESET === 'true' && alreadySetUp) {
    console.warn('[bootstrap] ข้าม ADMIN_RESET เพราะระบบถูกตั้งค่าเรียบร้อยแล้ว — ลบตัวแปรนี้ทิ้งได้เลย');
  }

  if (userCount === 0 || (wantReset && !existing)) {
    run(
      `INSERT INTO users (role, username, password_hash, display_name, must_change_password)
       VALUES ('admin', ?, ?, 'ผู้ดูแลระบบ', 1)`,
      [adminUser, hashPassword(initial)],
    );
    console.log(`[bootstrap] สร้างบัญชีผู้ดูแลระบบ "${adminUser}" แล้ว`);
    if (!process.env.ADMIN_INITIAL_PASSWORD) {
      console.warn('[bootstrap] ⚠️ ใช้รหัสเริ่มต้น admin1234 — เข้าระบบแล้วระบบจะบังคับเปลี่ยนทันที');
    }
  } else if (wantReset && existing) {
    run(
      `UPDATE users SET password_hash = ?, must_change_password = 1, active = 1,
                        failed_logins = 0, locked_until = NULL
         WHERE id = ?`,
      [hashPassword(initial), existing.id],
    );
    console.warn(`[bootstrap] ⚠️ ADMIN_RESET เปิดอยู่ — ตั้งรหัสผ่านของ "${adminUser}" ใหม่แล้ว`);
    console.warn('[bootstrap] ⚠️ ลบตัวแปร ADMIN_RESET ทิ้งทันทีหลังเข้าระบบได้');
  }
}

import { attachUser } from './middleware/auth.js';
import { rateLimit } from './middleware/ratelimit.js';
import { AppError } from './lib/http.js';

import { authRouter } from './routes/auth.js';
import { metaRouter } from './routes/meta.js';
import { checkinRouter } from './routes/checkin.js';
import { reportsRouter } from './routes/reports.js';
import { casesRouter } from './routes/cases.js';
import { studentsRouter } from './routes/students.js';
import { lifeskillsRouter } from './routes/lifeskills.js';
import { analyticsRouter } from './routes/analytics.js';
import { adminRouter } from './routes/admin.js';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));

// ส่วนหัวความปลอดภัยพื้นฐาน (ไม่ต้องพึ่ง helmet)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// อนุญาต Vite dev server ตอนพัฒนา
if (config.nodeEnv !== 'production') {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CareAlert AI', version: '0.1.0' }));

app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 30 }), authRouter);
app.use('/api/meta', metaRouter);
app.use('/api/checkin', checkinRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/cases', casesRouter);
app.use('/api/students', studentsRouter);
app.use('/api/lifeskills', lifeskillsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/admin', adminRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'ไม่พบปลายทางที่เรียก', code: 'NOT_FOUND' }));

// เสิร์ฟหน้าเว็บที่ build แล้ว (production) — เปิดพอร์ตเดียวจบ
if (existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
}

// ตัวจัดการข้อผิดพลาดกลาง
app.use((err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error('[error]', req.method, req.path, err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ', code: 'INTERNAL' });
});

app.listen(config.port, () => {
  console.log(`\n  CareAlert AI API  →  http://localhost:${config.port}`);
  console.log(`  ฐานข้อมูล: ${config.dbPath}`);
  console.log(`  ตัวช่วยภาษา (LLM): ${config.llm.enabled ? 'เปิดใช้งาน' : 'ปิด (ใช้กฎอย่างเดียว)'}\n`);
});
