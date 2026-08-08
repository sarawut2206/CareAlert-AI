import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import './db.js';

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
