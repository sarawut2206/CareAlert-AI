import { AppError } from '../lib/http.js';

/**
 * จำกัดอัตราการเรียกแบบง่าย (เก็บในหน่วยความจำ)
 * พอสำหรับโรงเรียนเดียว/เซิร์ฟเวอร์เดียว ถ้าขยายหลายเครื่องค่อยเปลี่ยนไปใช้ store กลาง
 *
 * หมายเหตุ: ห้ามใช้กับเส้นทางที่เกี่ยวกับความปลอดภัยจนทำให้นักเรียนส่งเรื่องไม่ได้
 * ค่าที่ตั้งไว้จึงหลวมพอสำหรับการใช้งานปกติ และกันเฉพาะการยิงถล่ม
 */
const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 30, key = (req) => req.ip } = {}) {
  return (req, _res, next) => {
    const k = `${req.path}|${key(req)}`;
    const now = Date.now();
    const entry = buckets.get(k);

    if (!entry || now > entry.resetAt) {
      buckets.set(k, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return next(new AppError(429, 'ส่งข้อมูลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 'RATE_LIMITED'));
    }
    next();
  };
}

// เก็บกวาดทุก 5 นาที กัน memory โต
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}, 5 * 60_000).unref();
