import { Router } from 'express';
import { h } from '../lib/http.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { helplines, crisisScreen } from '../content/help.js';
import { ruleBook, ENGINE_VERSION, llmEnabled } from '../engine/index.js';
import { LEVELS } from '../engine/triage.js';
import { DIMENSIONS } from '../engine/assess.js';
import { LEXICON_CATEGORIES } from '../engine/lexicon.js';
import { getSetting } from '../db.js';

export const metaRouter = Router();

/** เปิดสาธารณะ — หน้าขอความช่วยเหลือต้องเข้าถึงได้แม้ยังไม่ล็อกอิน */
metaRouter.get('/help', h((_req, res) => {
  res.json({ helplines, crisisScreen, school: getSetting('school.contacts', []) });
}));

metaRouter.get('/consent', h((_req, res) => {
  res.json({ consent: getSetting('consent', defaultConsent()) });
}));

/**
 * ความโปร่งใสของระบบ — เปิดให้บุคลากรดูได้ว่ากลไกใช้กฎอะไรบ้าง
 * (ถ้าอธิบายกฎให้ครูฟังไม่ได้ ครูก็ไม่ควรเชื่อผลของระบบ)
 */
metaRouter.get('/engine', requireAuth('teacher', 'counselor', 'admin', 'director'), h((_req, res) => {
  res.json({
    engineVersion: ENGINE_VERSION,
    levels: LEVELS,
    dimensions: DIMENSIONS,
    lexiconCategories: LEXICON_CATEGORIES,
    llmEnabled: llmEnabled(),
    ...ruleBook(),
    principles: [
      'ระบบไม่วินิจฉัยโรค ไม่จับโกหก และไม่ทำนายว่าใครจะก่อเหตุ',
      'ระดับที่ระบบเสนอคือ “ต้องทำอะไรต่อ” ไม่ใช่ “เด็กคนนี้เป็นอะไร”',
      'ทุกระดับตั้งแต่ 2 ขึ้นไปต้องมีมนุษย์ตรวจสอบ',
      'ระบบไม่เคยตัดสินใจแทนคน และไม่แจ้งหน่วยงานภายนอกโดยอัตโนมัติ',
      'ข้อมูลไม่พอ = “ยังสรุปไม่ได้” ไม่ใช่ “ไม่มีปัญหา”',
      'ปัจจัยปกป้องใช้ประกอบการวางแผนช่วยเหลือ แต่ไม่ใช้ลดระดับ',
    ],
  });
}));

metaRouter.get('/ping', requireAuth(), h((req, res) => {
  res.json({ ok: true, role: req.user.role, at: new Date().toISOString() });
}));

function defaultConsent() {
  return {
    version: '1.0.0',
    title: 'สิ่งที่เธอควรรู้ก่อนใช้ระบบนี้',
    points: [
      'ระบบนี้มีไว้เพื่อช่วยเหลือ ไม่ได้มีไว้จับผิดหรือลงโทษ',
      'สิ่งที่เธอเขียนจะถูกอ่านโดยครูที่รับผิดชอบระบบดูแลช่วยเหลือนักเรียนเท่านั้น ไม่ใช่ครูทุกคน',
      'ระบบไม่ได้อ่านแชตส่วนตัว โซเชียลมีเดีย หรือกล้องของเธอ',
      'ระบบไม่ได้วินิจฉัยว่าเธอเป็นโรคอะไร และไม่ได้ตัดสินว่าเธอเป็นคนแบบไหน',
      'เธอเลือกไม่บอกชื่อได้ และข้ามคำถามที่ยังไม่พร้อมตอบได้',
      'ข้อยกเว้นเรื่องความลับ: ถ้ามีสัญญาณว่าเธอหรือคนอื่นอาจไม่ปลอดภัย ครูจำเป็นต้องรู้ตัวตนของเธอเพื่อช่วยได้ทัน — เราบอกเรื่องนี้ไว้ล่วงหน้าเสมอ',
      'เธอขอดูหรือขอลบข้อมูลของตัวเองได้ โดยติดต่อครูแนะแนว',
    ],
    acceptLabel: 'เข้าใจแล้ว เริ่มใช้งาน',
  };
}
