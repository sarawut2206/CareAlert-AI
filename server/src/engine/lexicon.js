/**
 * คลังคำสัญญาณความปลอดภัย (Safety Lexicon)
 *
 * หลักการที่ต้องเข้าใจก่อนอ่านโค้ดนี้:
 *  1. นี่ไม่ใช่ "เครื่องจับโกหก" และไม่ใช่ "ตัวทำนายผู้ก่อเหตุ"
 *     หน้าที่เดียวของมันคือ "สะกิดให้มนุษย์อ่านข้อความนี้เร็วขึ้น"
 *  2. ระบบยอมรับ false positive (เตือนเกิน) แต่ไม่ยอมรับ false negative (พลาด)
 *     ต้นทุนของการเตือนเกิน = ครูคุยกับนักเรียนหนึ่งครั้ง
 *     ต้นทุนของการพลาด = ชีวิตนักเรียนหนึ่งคน
 *  3. ผลลัพธ์จากไฟล์นี้ "ยกระดับ" ได้อย่างเดียว ห้ามใช้เพื่อลดระดับหรือปิดเคส
 *  4. คะแนนจากไฟล์นี้ไม่เคยแสดงให้นักเรียนเห็น
 */

const CATEGORIES = [
  {
    code: 'SUICIDE_INTENT',
    label: 'สัญญาณความคิดจบชีวิต',
    severity: 'CRITICAL',
    terms: [
      'ฆ่าตัวตาย', 'อยากตาย', 'ไม่อยากอยู่แล้ว', 'ไม่อยากมีชีวิตอยู่', 'จบชีวิต',
      'อยากหายไปจากโลก', 'ตายไปคงดีกว่า', 'ตายไปซะ', 'ไม่มีฉันคงดีกว่า',
      'โลกนี้ไม่มีฉันก็ได้', 'แขวนคอ', 'กระโดดตึก', 'กินยาตาย', 'ลาก่อนทุกคน',
      'suicide', 'kill myself', 'end my life', 'want to die',
    ],
  },
  {
    code: 'SELF_HARM',
    label: 'สัญญาณการทำร้ายตนเอง',
    severity: 'CRITICAL',
    terms: [
      'ทำร้ายตัวเอง', 'กรีดแขน', 'กรีดข้อมือ', 'เชือดข้อมือ', 'ทำร้ายร่างกายตัวเอง',
      'เอามีดกรีด', 'ลงโทษตัวเองด้วยการ', 'เผาตัวเอง', 'self harm', 'selfharm', 'cutting myself',
    ],
  },
  {
    code: 'VIOLENCE_THREAT',
    label: 'สัญญาณการจะทำร้ายผู้อื่น',
    severity: 'CRITICAL',
    terms: [
      'จะฆ่ามัน', 'จะฆ่าให้ตาย', 'อยากฆ่า', 'จะเอาคืนให้ตาย', 'จะยิง', 'เอาปืนไปโรงเรียน',
      'พกปืน', 'พกมีดไปโรงเรียน', 'จะระเบิดโรงเรียน', 'ยิงโรงเรียน', 'วางแผนเอาคืน',
      'shoot up', 'kill them all',
    ],
  },
  {
    code: 'ABUSE',
    label: 'สัญญาณการถูกกระทำ/ล่วงละเมิด',
    severity: 'CRITICAL',
    terms: [
      'ถูกล่วงละเมิด', 'โดนล่วงละเมิด', 'ลวนลาม', 'ข่มขืน', 'ถูกบังคับให้', 'โดนบังคับให้',
      'พ่อตี', 'แม่ตี', 'โดนตีทุกวัน', 'ถูกทำร้ายที่บ้าน', 'โดนทำร้ายร่างกาย',
      'จับหน้าอก', 'ถูกจับของสงวน', 'ส่งรูปโป๊', 'ถูกขู่ด้วยรูป',
    ],
  },
  {
    code: 'WEAPON',
    label: 'มีการกล่าวถึงอาวุธ',
    severity: 'HIGH',
    terms: ['พกมีด', 'พกอาวุธ', 'เอามีดมา', 'มีปืน', 'อาวุธปืน'],
  },
  {
    code: 'RUNAWAY',
    label: 'สัญญาณหนีออกจากบ้าน/ไม่ปลอดภัยเรื่องที่พัก',
    severity: 'HIGH',
    terms: ['หนีออกจากบ้าน', 'ไม่กลับบ้าน', 'ไม่มีที่ไป', 'ไม่มีที่อยู่', 'นอนข้างนอก'],
  },
  {
    code: 'SUBSTANCE',
    label: 'สัญญาณสารเสพติด',
    severity: 'HIGH',
    terms: ['ยาบ้า', 'ยาไอซ์', 'เสพยา', 'กัญชา', 'ใบกระท่อม', 'พอตบุหรี่ไฟฟ้า', 'กินเหล้าทุกวัน'],
  },
  {
    code: 'BULLYING',
    label: 'สัญญาณการถูกรังแก',
    severity: 'MODERATE',
    terms: [
      'โดนแกล้ง', 'ถูกแกล้ง', 'โดนบูลลี่', 'บูลลี่', 'โดนล้อ', 'โดนรังแก', 'ถูกรังแก',
      'โดนกลั่นแกล้ง', 'โดนด่าในกลุ่ม', 'ไม่มีใครคุยด้วย', 'ถูกกีดกัน', 'โดนตบ', 'โดนต่อย',
      'bully', 'bullied',
    ],
  },
  {
    code: 'DISTRESS',
    label: 'สัญญาณความทุกข์ทั่วไป',
    severity: 'MODERATE',
    terms: [
      'ทนไม่ไหว', 'หมดหวัง', 'ไม่มีทางออก', 'เหนื่อยมาก', 'ร้องไห้ทุกคืน', 'นอนไม่หลับหลายวัน',
      'ไม่อยากไปโรงเรียน', 'กลัวมาก', 'เครียดมาก', 'ไม่มีใครเข้าใจ', 'อยู่คนเดียวตลอด',
    ],
  },
  {
    code: 'HELP_SEEKING',
    label: 'การขอความช่วยเหลือโดยตรง',
    severity: 'HIGH',
    terms: ['ช่วยหนูด้วย', 'ช่วยผมด้วย', 'ขอความช่วยเหลือ', 'อยากคุยกับใครสักคน', 'ช่วยด้วย'],
  },
];

// คำที่บ่งชี้ว่าประโยคอาจเป็นการปฏิเสธ/เล่าถึงผู้อื่น → ลดความเชื่อมั่น แต่ "ไม่ลบทิ้ง"
//  - ADJACENT: ต้องอยู่ติดหน้าคำที่ตรวจพบพอดี (กัน "ไม่" ที่ลอยอยู่ในประโยคอื่น)
//  - NEARBY:   อยู่ที่ใดก็ได้ในช่วง 12 ตัวอักษรก่อนหน้า
const HEDGE_ADJACENT = ['ไม่', 'เลิก', 'หยุด'];
const HEDGE_NEARBY = ['ไม่ได้', 'ไม่เคย', 'ไม่คิดจะ'];
const THIRD_PARTY = ['เพื่อนบอกว่า', 'เพื่อนพูดว่า', 'มีคนบอกว่า', 'ในข่าว', 'ในหนัง', 'ในเกม'];

const WINDOW = 12; // จำนวนตัวอักษรก่อนคำที่ใช้ดูบริบท

/**
 * ตรวจข้อความอิสระ
 * @param {string} text
 * @returns {{hits: Array, maxSeverity: string|null, categories: string[]}}
 */
export function scanText(text) {
  const empty = { hits: [], maxSeverity: null, categories: [] };
  if (!text || typeof text !== 'string') return empty;

  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const hits = [];

  for (const cat of CATEGORIES) {
    for (const term of cat.terms) {
      const idx = normalized.indexOf(term.toLowerCase());
      if (idx === -1) continue;

      const before = normalized.slice(Math.max(0, idx - WINDOW), idx);
      const negated =
        HEDGE_ADJACENT.some((w) => before.endsWith(w)) ||
        HEDGE_NEARBY.some((w) => before.includes(w));
      const thirdParty = THIRD_PARTY.some((w) => normalized.includes(w));

      hits.push({
        category: cat.code,
        label: cat.label,
        severity: cat.severity,
        term,
        confidence: negated ? 'low' : thirdParty ? 'medium' : 'high',
        // สำคัญ: แม้ confidence ต่ำก็ยังส่งให้มนุษย์ดู เพียงแต่ติดป้ายไว้
        note: negated
          ? 'บริบทอาจเป็นการปฏิเสธ — ต้องให้มนุษย์อ่านเอง'
          : thirdParty
            ? 'อาจกล่าวถึงผู้อื่น — ต้องให้มนุษย์อ่านเอง'
            : null,
      });
      break; // นับหมวดละครั้ง
    }
  }

  const order = { CRITICAL: 3, HIGH: 2, MODERATE: 1 };
  const maxSeverity = hits.reduce(
    (acc, h) => ((order[h.severity] ?? 0) > (order[acc] ?? 0) ? h.severity : acc),
    null,
  );

  return { hits, maxSeverity, categories: [...new Set(hits.map((h) => h.category))] };
}

export const LEXICON_CATEGORIES = CATEGORIES.map(({ code, label, severity }) => ({ code, label, severity }));
