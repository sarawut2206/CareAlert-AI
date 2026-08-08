/**
 * ตัวแทนของ server/src/config.js สำหรับ "โหมดสาธิต" ที่รันในเบราว์เซอร์
 *
 * ไฟล์จริงเรียกใช้ node:fs / node:path / node:crypto ซึ่งไม่มีในเบราว์เซอร์
 * vite.config.ts จะสลับมาใช้ไฟล์นี้แทนเฉพาะตอน build โหมดสาธิต
 * ทำให้ engine/sla.js และ engine/llm.js ทำงานได้โดยไม่ต้องแก้โค้ดฝั่งเซิร์ฟเวอร์เลย
 */

export const config = {
  port: 0,
  nodeEnv: 'demo',
  dbPath: '',
  webDist: '',
  jwtSecret: 'demo',
  jwtTtlSeconds: 8 * 3600,

  // เวลาเรียนของโรงเรียน (ใช้คำนวณ SLA ของระดับ 2–3)
  timezone: 420, // UTC+7
  schoolDayStartHour: 8,
  schoolDayEndHour: 16,

  // ตัวช่วยภาษาปิดเสมอในโหมดสาธิต — ไม่มีการเรียก API ภายนอกใด ๆ ทั้งสิ้น
  llm: { enabled: false, apiKey: '', model: '', baseUrl: '' },

  retention: { checkinDays: 365, closedCaseDays: 1095, auditDays: 1095 },
};
