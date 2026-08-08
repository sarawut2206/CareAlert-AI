/** ข้อผิดพลาดที่ตั้งใจส่งกลับให้ผู้ใช้ (มีข้อความภาษาไทย) */
export class AppError extends Error {
  constructor(status, message, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const bad = (msg, code) => new AppError(400, msg, code || 'BAD_REQUEST');
export const unauthorized = (msg = 'กรุณาเข้าสู่ระบบ') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'ไม่พบข้อมูล') => new AppError(404, msg, 'NOT_FOUND');

/** ครอบ async route handler ให้ error ตกไปที่ error middleware */
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ───────── ตัวช่วยตรวจ input (แทน zod เพื่อไม่เพิ่ม dependency) ─────────

export function str(value, field, { min = 0, max = 5000, required = true, trim = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`กรุณากรอก ${field}`);
    return null;
  }
  if (typeof value !== 'string') throw bad(`${field} ต้องเป็นข้อความ`);
  const v = trim ? value.trim() : value;
  if (v.length < min) throw bad(`${field} สั้นเกินไป`);
  if (v.length > max) throw bad(`${field} ยาวเกิน ${max} ตัวอักษร`);
  return v;
}

export function int(value, field, { min = -Infinity, max = Infinity, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`กรุณาระบุ ${field}`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw bad(`${field} ต้องเป็นจำนวนเต็ม`);
  if (n < min || n > max) throw bad(`${field} อยู่นอกช่วงที่กำหนด`);
  return n;
}

export function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function oneOf(value, field, options, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`กรุณาเลือก ${field}`);
    return null;
  }
  if (!options.includes(value)) throw bad(`${field} ไม่ถูกต้อง`);
  return value;
}

export function plainObject(value, field) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw bad(`${field} ไม่ถูกต้อง`);
  return value;
}

export function stringArray(value, field, { max = 50 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw bad(`${field} ไม่ถูกต้อง`);
  if (value.length > max) throw bad(`${field} มีรายการมากเกินไป`);
  return value.filter((v) => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
}
