import crypto from 'node:crypto';
import { config } from '../config.js';

// ───────── รหัสผ่าน: scrypt (มีใน Node อยู่แล้ว ไม่ต้องลง bcrypt ที่ต้อง build native) ─────────

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(plain, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(plain, salt, expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ───────── JWT (HS256) แบบเขียนเอง เพื่อไม่ต้องพึ่ง dependency ─────────

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, ttlSeconds = config.jwtTtlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${head}.${b64url(JSON.stringify(body))}`;
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** รหัสสุ่มอ่านง่าย ใช้เป็นรหัสติดตามเรื่องแบบไม่ระบุตัวตน (ตัดอักษรที่สับสน) */
export function referenceCode(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (const byte of crypto.randomBytes(len)) out += alphabet[byte % alphabet.length];
  return out;
}
