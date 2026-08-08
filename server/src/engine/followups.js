import { followUps } from '../content/templates.js';

/**
 * ขั้นที่ 2: Disclose — เงื่อนไขเปิดชุดคำถามเชิงลึก
 *
 * แยกออกมาเป็นโมดูลบริสุทธิ์ (ไม่พึ่ง express หรือฐานข้อมูล)
 * เพื่อให้ทั้งเซิร์ฟเวอร์จริงและโหมดสาธิตใช้เกณฑ์ชุดเดียวกัน — เกณฑ์จะได้ไม่แตกออกจากกัน
 *
 * หมายเหตุ: เกณฑ์ของชุด "ความปลอดภัย" ต่ำที่สุดโดยตั้งใจ (≥ 1 = "บางวัน")
 * เพราะยอมถามเกินดีกว่าพลาด
 */
export function followUpTriggers(answers = {}) {
  const n = (id) => {
    const v = Number(answers[id]);
    return Number.isNaN(v) ? 0 : v;
  };
  const tags = Array.isArray(answers.d2) ? answers.d2 : [];
  const open = [];

  if (n('c1') >= 2 || n('c2') >= 2 || n('c3') >= 2 || (answers.d1 !== undefined && n('d1') <= 1)) {
    open.push(followUps.mood.id);
  }
  if (n('c6') >= 1 || tags.includes('bullying')) open.push(followUps.bullying.id);
  if (n('c8') >= 2 || tags.includes('family')) open.push(followUps.home.id);
  if (n('c9') >= 1 || tags.includes('safety')) open.push(followUps.safety.id);

  return [...new Set(open)];
}
