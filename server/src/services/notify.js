/**
 * การแจ้งเตือนออกนอกระบบ (ไม่บังคับ)
 *
 * ข้อควรระวังด้าน PDPA: payload นี้ "ห้ามมีชื่อนักเรียนหรือเนื้อหาที่นักเรียนเขียน"
 * ส่งไปแค่ว่า "มีเคสระดับเท่าไหร่รออยู่" แล้วให้ผู้รับผิดชอบเข้ามาดูในระบบ
 * เพราะช่องทางอย่างแชตกลุ่มไม่ใช่ที่ปลอดภัยสำหรับข้อมูลอ่อนไหวของเด็ก
 */

import { getSetting } from '../db.js';

export async function notify({ caseId, level, kind }) {
  if (level < 3) return; // แจ้งเตือนเฉพาะระดับที่ต้องรีบ

  const webhook = getSetting('notify.webhookUrl', null);
  if (!webhook) return;

  const text =
    level === 4
      ? `[CareAlert] เคสระดับ 4 — ต้องตรวจสอบความปลอดภัยทันที (เคส #${caseId}) กรุณาเข้าระบบเพื่อดูรายละเอียด`
      : `[CareAlert] เคสระดับ 3 — ต้องติดต่อภายใน 24 ชั่วโมง (เคส #${caseId}) กรุณาเข้าระบบเพื่อดูรายละเอียด`;

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, caseId, level, kind, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn('[notify] ส่งการแจ้งเตือนไม่สำเร็จ:', err.message);
  }
}
