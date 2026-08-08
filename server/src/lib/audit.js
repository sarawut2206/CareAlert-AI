import { run } from '../db.js';

/**
 * บันทึกร่องรอยการใช้งาน (PDPA / ตรวจสอบย้อนหลัง)
 * ใช้กับทุกการ "เข้าถึงข้อมูลนักเรียนรายบุคคล" ไม่ใช่เฉพาะการแก้ไข
 */
export function audit(req, action, { entity = null, entityId = null, detail = null } = {}) {
  try {
    run(
      `INSERT INTO audit_log (actor_user_id, actor_role, action, entity, entity_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req?.user?.id ?? null,
        req?.user?.role ?? 'anonymous',
        action,
        entity,
        entityId === null ? null : String(entityId),
        typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : null,
        req?.ip ?? null,
      ],
    );
  } catch (err) {
    // audit ต้องไม่ทำให้คำขอหลักล้มเหลว แต่ต้องเห็นใน log ของเซิร์ฟเวอร์
    console.error('[audit] บันทึกไม่สำเร็จ:', err.message);
  }
}
