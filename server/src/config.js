import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.dirname(here);
export const PROJECT_ROOT = path.dirname(SERVER_ROOT);

// โหลด .env แบบง่าย (ไม่ต้องพึ่ง dotenv)
const envPath = path.join(SERVER_ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const env = process.env;

export const config = {
  port: Number(env.PORT || 8787),
  nodeEnv: env.NODE_ENV || 'development',
  dbPath: env.DB_PATH || path.join(SERVER_ROOT, 'data', 'carealert.db'),
  webDist: path.join(PROJECT_ROOT, 'web', 'dist'),

  // ลับ: ใน production ต้องตั้งค่าเอง มิฉะนั้น token จะใช้ไม่ได้หลัง restart
  jwtSecret: env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  jwtTtlSeconds: Number(env.JWT_TTL || 60 * 60 * 8),

  // เวลาราชการของโรงเรียน (ใช้คำนวณ SLA)
  timezone: env.TZ_OFFSET_MINUTES ? Number(env.TZ_OFFSET_MINUTES) : 420, // UTC+7
  schoolDayStartHour: Number(env.SCHOOL_START_HOUR || 8),
  schoolDayEndHour: Number(env.SCHOOL_END_HOUR || 16),

  // ตัวช่วย LLM (ปิดโดยค่าเริ่มต้น) — ยกระดับความสนใจได้เท่านั้น ห้ามลดระดับ
  llm: {
    enabled: env.LLM_ENABLED === 'true',
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.LLM_MODEL || 'claude-sonnet-5',
    baseUrl: env.LLM_BASE_URL || 'https://api.anthropic.com',
  },

  // นโยบายเก็บข้อมูล (PDPA) — หน่วยเป็นวัน
  retention: {
    checkinDays: Number(env.RETENTION_CHECKIN_DAYS || 365),
    closedCaseDays: Number(env.RETENTION_CASE_DAYS || 365 * 3),
    auditDays: Number(env.RETENTION_AUDIT_DAYS || 365 * 3),
  },
};

if (config.nodeEnv === 'production' && !env.JWT_SECRET) {
  console.warn('[คำเตือน] ไม่ได้ตั้ง JWT_SECRET — ผู้ใช้จะหลุด login ทุกครั้งที่ restart');
}
