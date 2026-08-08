/**
 * ขั้นที่ 5: Alert — ตัดสิน "ระดับการดำเนินการ"
 *
 * ข้อกำหนดที่ห้ามละเมิด:
 *  1. ระดับต้องมาจากกฎที่เขียนไว้ล่วงหน้า อ่านเข้าใจได้ และตรวจสอบย้อนหลังได้ทุกข้อ
 *     — ห้ามใช้โมเดลกล่องดำตัดสินระดับ
 *  2. ประเมิน "ทุกกฎ" แล้วเอาระดับสูงสุด (ไม่ใช่หยุดที่กฎแรก)
 *     เพื่อให้เห็นเหตุผลครบทุกข้อในเอกสารเคส
 *  3. ปัจจัยปกป้องบันทึกได้ แต่ "ห้ามใช้ลดระดับ"
 *  4. ระดับนี้คือ "ต้องทำอะไรต่อ" ไม่ใช่ "เด็กคนนี้เป็นอะไร" และไม่ใช่การทำนายพฤติกรรม
 */

import { domainLabel } from './assess.js';

export const LEVELS = {
  1: { code: 'L1', name: 'Support', th: 'สนับสนุนตามปกติ', color: 'green' },
  2: { code: 'L2', name: 'Review', th: 'ให้ผู้รับผิดชอบตรวจสอบ', color: 'yellow' },
  3: { code: 'L3', name: 'Priority Intervention', th: 'ต้องช่วยเหลือโดยเร็ว', color: 'orange' },
  4: { code: 'L4', name: 'Immediate Safety Review', th: 'ตรวจสอบความปลอดภัยทันที', color: 'red' },
};

/** กฎทั้งหมด เรียงตามระดับ — ทุกข้อมี id ที่จะถูกบันทึกลงเคส */
const RULES = [
  // ─────────── ระดับ 4: ตรวจสอบความปลอดภัยทันที ───────────
  {
    id: 'L4.SAFETY_NOW', level: 4,
    label: 'มีคำตอบที่ระบุตรง ๆ ว่าขณะนี้ไม่ปลอดภัย',
    // ใช้คะแนนจาก "คำตอบ" เท่านั้น (domains) ไม่ใช่ค่าที่ถูกยกขึ้นจากคลังคำ
    // เพื่อไม่ให้เหตุผลที่แสดงต่อครูคลาดเคลื่อนจากสิ่งที่นักเรียนตอบจริง
    test: (c) => (c.domains.safety ?? 0) >= 3,
  },
  {
    id: 'L4.SAFETY_PLAN', level: 4,
    label: 'มีคำตอบที่บ่งชี้ว่าคิดถึงวิธีการ หรือเคยลงมือภายในเดือนนี้',
    test: (c) => num(c.answers.s_plan) >= 3 || num(c.answers.s_past) >= 3,
  },
  {
    id: 'L4.LEXICON_CRITICAL', level: 4,
    label: 'ข้อความมีคำที่บ่งชี้ความเสี่ยงร้ายแรง (ต้องให้มนุษย์อ่านเอง)',
    test: (c) => c.lexicon.maxSeverity === 'CRITICAL',
    detail: (c) => c.lexicon.hits.filter((h) => h.severity === 'CRITICAL').map((h) => h.label).join(', '),
  },
  {
    id: 'L4.FRIEND_IMMINENT', level: 4,
    label: 'เพื่อนแจ้งว่าคิดว่าตอนนี้ไม่ปลอดภัย',
    test: (c) => c.source === 'friend_report' && num(c.answers.f_safe) >= 3,
  },
  {
    id: 'L4.FRIEND_LETHAL_SIGNS', level: 4,
    label: 'เพื่อนรายงานสัญญาณเร่งด่วน (พูดถึงการตาย ร่องรอยทำร้ายตัวเอง แจกของ อาวุธ หรือขู่ทำร้ายผู้อื่น) ภายในสัปดาห์นี้',
    test: (c) =>
      c.source === 'friend_report' &&
      num(c.answers.f_when) >= 2 &&
      hasAny(c.contextTags, ['context:saidDeath', 'context:selfharm', 'context:giveaway', 'context:threat', 'context:weapon']),
  },
  {
    id: 'L4.STAFF_SAFETY', level: 4,
    label: 'บุคลากรระบุว่ามีข้อกังวลด้านความปลอดภัยชัดเจน',
    test: (c) => c.source === 'staff_note' && num(c.answers.n_safety) >= 3,
  },
  {
    id: 'L4.HOME_UNSAFE', level: 4,
    label: 'นักเรียนระบุว่าที่บ้านไม่ปลอดภัย ร่วมกับมีการทำร้ายร่างกาย',
    test: (c) => num(c.answers.h_safe) >= 3 || (num(c.answers.h_safe) >= 2 && hasAny(c.contextTags, ['home:violence'])),
  },

  // ─────────── ระดับ 3: ต้องช่วยเหลือโดยเร็ว ───────────
  {
    id: 'L3.SAFETY_SIGNAL', level: 3,
    label: 'มีสัญญาณด้านความปลอดภัยที่ยังไม่ถึงขั้นฉุกเฉิน',
    test: (c) => c.dim.safety === 2 || (c.domains.safety ?? 0) >= 2,
  },
  {
    id: 'L3.LEXICON_HIGH', level: 3,
    label: 'ข้อความมีคำที่บ่งชี้ความเสี่ยงระดับสูง',
    test: (c) => c.lexicon.maxSeverity === 'HIGH',
    detail: (c) => c.lexicon.hits.filter((h) => h.severity === 'HIGH').map((h) => h.label).join(', '),
  },
  {
    id: 'L3.BULLYING_ONGOING', level: 3,
    label: 'ถูกรังแกต่อเนื่องและกระทบชีวิตประจำวัน',
    test: (c) => (c.domains.bullying ?? 0) >= 2 && c.dim.frequency >= 2 && c.dim.impact >= 2,
  },
  {
    id: 'L3.HIGH_INDEX', level: 3,
    label: 'ดัชนีความห่วงใยรวมอยู่ในระดับสูง (≥ 65)',
    test: (c) => c.concernIndex >= 65,
    detail: (c) => `ดัชนี ${c.concernIndex}/100`,
  },
  {
    id: 'L3.MULTI_DOMAIN_CHRONIC', level: 3,
    label: 'มีปัญหาพร้อมกันหลายด้านและเป็นมานาน',
    test: (c) => c.elevatedDomains.length >= 2 && c.dim.duration >= 2,
    detail: (c) => `ด้านที่พบสัญญาณ: ${c.elevatedDomains.map(domainLabel).join(', ')}`,
  },
  {
    id: 'L3.PERSISTENT', level: 3,
    label: 'พบสัญญาณต่อเนื่องตั้งแต่ 3 ครั้งขึ้นไปโดยยังไม่ดีขึ้น',
    test: (c) => c.history.consecutiveElevated >= 3,
  },
  {
    id: 'L3.EXPLICIT_HELP', level: 3,
    label: 'นักเรียนขอให้ผู้ใหญ่ติดต่อกลับ ร่วมกับมีสัญญาณความทุกข์',
    test: (c) => c.wantsContact === 'yes' && (c.dim.severity >= 1 || c.dim.safety >= 1 || c.lexicon.hits.length > 0),
  },
  {
    id: 'L3.ISOLATION', level: 3,
    label: 'ไม่มีใครให้พึ่งพาเลย ร่วมกับมีความทุกข์ระดับสูง',
    test: (c) => c.dim.isolation >= 3 && c.dim.severity >= 2,
  },
  {
    id: 'L3.ESCALATING', level: 3,
    label: 'สถานการณ์แย่ลงอย่างชัดเจนเทียบกับครั้งก่อน',
    test: (c) => c.dim.trajectory >= 3,
  },

  // ─────────── ระดับ 2: ให้ผู้รับผิดชอบตรวจสอบ ───────────
  {
    id: 'L2.MODERATE_INDEX', level: 2,
    label: 'ดัชนีความห่วงใยอยู่ในระดับปานกลาง (35–64)',
    test: (c) => c.concernIndex >= 35,
    detail: (c) => `ดัชนี ${c.concernIndex}/100`,
  },
  {
    id: 'L2.SINGLE_DOMAIN', level: 2,
    label: 'พบสัญญาณชัดเจนอย่างน้อยหนึ่งด้าน',
    test: (c) => c.elevatedDomains.length >= 1,
    detail: (c) => `ด้าน: ${c.elevatedDomains.map(domainLabel).join(', ')}`,
  },
  {
    id: 'L2.INSUFFICIENT_WITH_SIGNAL', level: 2,
    label: 'ข้อมูลยังไม่เพียงพอสำหรับการสรุป แต่มีสัญญาณบางอย่าง — ต้องให้มนุษย์ดู',
    test: (c) => c.validation.dataSufficiency === 'INSUFFICIENT' && (c.concernIndex > 0 || c.lexicon.hits.length > 0),
  },
  {
    id: 'L2.TREND_WORSENING', level: 2,
    label: 'แนวโน้มแย่ลงเมื่อเทียบกับครั้งก่อน',
    test: (c) => c.dim.trajectory >= 2,
  },
  {
    id: 'L2.STAFF_NOTE', level: 2,
    label: 'บุคลากรบันทึกข้อสังเกต — ทุกบันทึกต้องได้รับการตรวจสอบ',
    test: (c) => c.source === 'staff_note',
  },
  {
    id: 'L2.FRIEND_REPORT', level: 2,
    label: 'มีเพื่อนแจ้งความเป็นห่วง — ทุกการแจ้งต้องได้รับการตรวจสอบ',
    test: (c) => c.source === 'friend_report',
  },
  {
    id: 'L2.WANTS_CONTACT', level: 2,
    label: 'นักเรียนแสดงความต้องการให้ผู้ใหญ่ติดต่อกลับ',
    test: (c) => c.wantsContact !== 'no',
  },
  {
    id: 'L2.LEXICON_MODERATE', level: 2,
    label: 'ข้อความมีคำที่บ่งชี้ความทุกข์',
    test: (c) => c.lexicon.maxSeverity === 'MODERATE',
  },
  {
    id: 'L2.CONSECUTIVE', level: 2,
    label: 'พบสัญญาณต่อเนื่อง 2 ครั้งติดกัน',
    test: (c) => c.history.consecutiveElevated >= 2,
  },
  {
    id: 'L2.SELF_DISCLOSURE', level: 2,
    label: 'นักเรียนเลือกเล่าปัญหาของตนเองเข้ามา',
    test: (c) => c.source === 'self_report',
  },
];

/** ตัวปรับ — บันทึกไว้ประกอบการพิจารณาของมนุษย์ แต่ไม่เปลี่ยนระดับ */
const MODIFIERS = [
  {
    id: 'MOD.PROTECTIVE', label: 'มีปัจจัยปกป้อง (มีคนไว้ใจ/เคยขอความช่วยเหลือ)',
    test: (c) => c.dim.protective >= 2,
    effect: 'บันทึกไว้เป็นจุดแข็งที่ใช้ต่อยอดได้ — ไม่ใช้ลดระดับ',
  },
  {
    id: 'MOD.INSUFFICIENT_DATA', label: 'ข้อมูลยังไม่เพียงพอสำหรับการสรุป',
    test: (c) => c.validation.dataSufficiency === 'INSUFFICIENT',
    effect: 'ห้ามบันทึกว่า “ไม่พบปัญหา” — ต้องชวนคุยหรือเช็กอินซ้ำ',
  },
  {
    id: 'MOD.LOW_CONFIDENCE_TEXT', label: 'คำที่ตรวจพบอาจเป็นการปฏิเสธหรือกล่าวถึงผู้อื่น',
    test: (c) => c.lexicon.hits.some((h) => h.confidence !== 'high'),
    effect: 'ต้องให้มนุษย์อ่านข้อความจริงก่อนสรุป',
  },
  {
    id: 'MOD.RETALIATION_RISK', label: 'นักเรียนกลัวถูกเอาคืนถ้าบอกครู',
    test: (c) => num(c.answers.b_retaliation) >= 2,
    effect: 'ต้องวางแผนคุ้มครองก่อนดำเนินการกับผู้กระทำ',
  },
  {
    id: 'MOD.NOT_READY', label: 'นักเรียนยังไม่พร้อมให้ติดต่อ',
    test: (c) => c.answers.s_talk === 'no' || c.answers.c_help === 'no',
    effect: 'ยังต้องติดต่อตามระดับความปลอดภัย แต่ให้เริ่มด้วยการสร้างความไว้วางใจ',
  },
];

/**
 * @param {object} ctx ผลรวมจาก assess() + validate() + บริบทของแหล่งข้อมูล
 * @returns {{level:number, levelCode:string, matched:Array, modifiers:Array, actions:object}}
 */
export function triage(ctx) {
  const c = normalize(ctx);

  const matched = [];
  for (const rule of RULES) {
    let hit = false;
    try { hit = !!rule.test(c); } catch { hit = false; }
    if (hit) {
      matched.push({
        id: rule.id,
        level: rule.level,
        label: rule.label,
        detail: rule.detail ? safe(() => rule.detail(c)) : null,
      });
    }
  }

  const modifiers = MODIFIERS
    .filter((m) => safe(() => m.test(c)) === true)
    .map((m) => ({ id: m.id, label: m.label, effect: m.effect }));

  const level = matched.length ? Math.max(...matched.map((m) => m.level)) : 1;
  matched.sort((a, b) => b.level - a.level);

  const insufficient = c.validation.dataSufficiency === 'INSUFFICIENT';
  const levelCode = level === 1 && insufficient ? 'L1-U' : LEVELS[level].code;

  return {
    level,
    levelCode,
    matched,
    modifiers,
    /** กฎที่ตัดสินระดับสุดท้าย — ใช้แสดงเป็นเหตุผลหลักในหน้าเคส */
    decidingRules: matched.filter((m) => m.level === level).map((m) => m.id),
    actions: actionPlan(level, c),
    studentMessage: studentMessage(level, c),
  };
}

// ─────────────────────────── แผนการดำเนินการ (Intervene) ───────────────────────────

function actionPlan(level, c) {
  const base = {
    4: {
      headline: 'ต้องตรวจสอบความปลอดภัยทันที',
      owner: 'ครูแนะแนว/หัวหน้าระบบดูแลช่วยเหลือ + ผู้บริหารรับทราบ',
      acknowledgeWithinMinutes: 30,
      contactWithinMinutes: 60,
      twoPersonRule: true,
      steps: [
        'ตรวจสอบว่านักเรียนอยู่ที่ไหน และอยู่กับใครในขณะนี้',
        'พบนักเรียนแบบตัวต่อตัวในที่ปลอดภัย โดยมีผู้ใหญ่อย่างน้อย 2 คนรับรู้',
        'ประเมินความปลอดภัยเฉพาะหน้า (ตอนนี้ปลอดภัยหรือไม่ / มีวิธีการในมือหรือไม่)',
        'อย่าปล่อยให้นักเรียนอยู่คนเดียวจนกว่าจะยืนยันความปลอดภัย',
        'ติดต่อผู้ปกครองตามแนวปฏิบัติของโรงเรียน เว้นแต่ผู้ปกครองคือแหล่งที่มาของอันตราย',
        'ประสานหน่วยบริการสุขภาพจิต / สายด่วน 1323 / 1669 เมื่อจำเป็น',
        'บันทึกทุกขั้นตอนพร้อมเวลาในระบบ',
      ],
      followUpDays: [1, 3, 7, 30],
    },
    3: {
      headline: 'ต้องติดต่อและช่วยเหลือโดยเร็ว',
      owner: 'ครูแนะแนว ร่วมกับครูที่ปรึกษา',
      // ระดับ 2–3 นับเป็น "นาทีของเวลาเรียน" (1 วันเรียน = 480 นาที)
      // อย่าใส่เป็นชั่วโมงนาฬิกา มิฉะนั้นกำหนดเวลาจะยืดออกไปเป็นเท่าตัว
      acknowledgeWithinMinutes: 240,  // ครึ่งวันเรียน
      contactWithinMinutes: 480,      // 1 วันเรียน (≈ ภายในวันเรียนถัดไป)
      twoPersonRule: false,
      steps: [
        'นัดคุยกับนักเรียนภายใน 24 ชั่วโมง ในที่ที่เป็นส่วนตัว',
        'ใช้การฟังเชิงลึก ไม่ซักถามแบบสอบสวน ไม่ตัดสิน',
        'ประเมินความปลอดภัยซ้ำด้วยคำถามตรง ๆ อย่างสุภาพ',
        'ระบุปัจจัยปกป้องและคนที่นักเรียนไว้ใจ',
        'ตกลงแผนช่วยเหลือร่วมกับนักเรียน และนัดติดตาม',
        'พิจารณาแจ้งผู้ปกครอง และส่งต่อครูแนะแนว/นักจิตวิทยา/สถานพยาบาลตามความจำเป็น',
      ],
      followUpDays: [3, 7, 30],
    },
    2: {
      headline: 'ให้ผู้รับผิดชอบตรวจสอบ',
      owner: 'ครูที่ปรึกษา',
      acknowledgeWithinMinutes: 480,   // 1 วันเรียน
      contactWithinMinutes: 3 * 480,   // 3 วันเรียน
      twoPersonRule: false,
      steps: [
        'ทบทวนข้อมูลย้อนหลังของนักเรียนในระบบ',
        'หาโอกาสพูดคุยแบบไม่เป็นทางการภายใน 3 วันเรียน',
        'ยืนยันว่าข้อมูลตรงกับสิ่งที่สังเกตเห็นจริงหรือไม่',
        'ถ้าข้อมูลยังไม่พอ ให้ชวนเช็กอินซ้ำ — ห้ามสรุปว่า “ไม่มีปัญหา”',
        'บันทึกผลการพูดคุยและตัดสินใจว่าจะปิดเคส ติดตามต่อ หรือยกระดับ',
      ],
      followUpDays: [7, 30],
    },
    1: {
      headline: 'สนับสนุนตามปกติ (ชั้นที่ 1)',
      owner: 'ระบบดูแลทั่วไป',
      acknowledgeWithinMinutes: null,
      contactWithinMinutes: null,
      twoPersonRule: false,
      steps: [
        'ไม่เปิดเคส',
        'นักเรียนได้รับกิจกรรมทักษะชีวิตตามปกติ',
        'ระบบติดตามแนวโน้มในการเช็กอินครั้งถัดไป',
      ],
      followUpDays: [],
    },
  }[level];

  const extra = [];
  if (c.answers.b_retaliation !== undefined && num(c.answers.b_retaliation) >= 2) {
    extra.push('วางแผนคุ้มครองนักเรียนจากการถูกเอาคืน ก่อนดำเนินการใด ๆ กับผู้กระทำ');
  }
  if (c.contextTags.includes('home:violence') || c.lexicon.categories.includes('ABUSE')) {
    extra.push('พิจารณาแนวปฏิบัติการคุ้มครองเด็ก และการแจ้งหน่วยงานตามกฎหมาย (สายด่วน 1300)');
  }
  if (c.lexicon.categories.includes('SUBSTANCE')) {
    extra.push('ประสานงานด้านสารเสพติดตามระบบของโรงเรียน โดยเน้นการช่วยเหลือ ไม่ใช่การลงโทษ');
  }
  if (c.validation.dataSufficiency === 'INSUFFICIENT') {
    extra.push('ข้อมูลยังไม่เพียงพอ — ให้ยืนยันด้วยการพูดคุยโดยตรงก่อนสรุปใด ๆ');
  }

  return { ...base, extraSteps: extra };
}

// ─────────────────────────── ข้อความที่นักเรียนเห็น ───────────────────────────
// นักเรียนไม่เคยเห็นระดับ คะแนน หรือกฎที่ทำงาน — เห็นเฉพาะข้อความที่ช่วยได้จริง

function studentMessage(level, c) {
  if (level === 4) {
    return {
      tone: 'urgent-care',
      title: 'ขอบคุณที่บอกเรา เธอไม่ได้อยู่คนเดียว',
      body:
        'สิ่งที่เธอเขียนมาสำคัญมาก ครูที่ดูแลเรื่องนี้จะติดต่อเธอโดยเร็วที่สุด ' +
        'ระหว่างนี้ถ้ารู้สึกว่าทนไม่ไหว โทรสายด่วนสุขภาพจิต 1323 ได้ตลอด 24 ชั่วโมง ' +
        'ถ้ามีอันตรายเฉพาะหน้า โทร 191 หรือ 1669',
      showHelpline: true,
    };
  }
  if (level === 3) {
    return {
      tone: 'supportive',
      title: 'ขอบคุณที่ไว้ใจเล่าให้ฟัง',
      body:
        'เรื่องที่เธอเล่ามาเป็นเรื่องที่ควรมีผู้ใหญ่ช่วย ครูแนะแนวจะติดต่อเธอเร็ว ๆ นี้ ' +
        'ถ้าอยากคุยก่อน โทร 1323 ได้ตลอดเวลา',
      showHelpline: true,
    };
  }
  if (level === 2) {
    return {
      tone: 'warm',
      title: 'ขอบคุณที่เช็กอิน',
      body:
        c.validation.dataSufficiency === 'INSUFFICIENT'
          ? 'เราอยากเข้าใจเธอมากขึ้นอีกนิด ไว้เช็กอินอีกครั้งได้นะ และถ้าอยากคุยกับใคร บอกเราได้เสมอ'
          : 'ครูที่ปรึกษาจะแวะมาคุยด้วยเร็ว ๆ นี้ ระหว่างนี้ลองทำกิจกรรมทักษะชีวิตที่แนะนำไว้ดูได้',
      showHelpline: false,
    };
  }
  return {
    tone: 'light',
    title: 'ขอบคุณที่เช็กอินวันนี้',
    body: 'ถ้าวันไหนรู้สึกไม่โอเค กลับมาบอกเราได้เสมอ ประตูนี้เปิดตลอด',
    showHelpline: false,
  };
}

// ─────────────────────────── ตัวช่วย ───────────────────────────

function normalize(ctx) {
  return {
    dim: ctx.dimensions ?? {},
    domains: ctx.domains ?? {},
    elevatedDomains: ctx.elevatedDomains ?? [],
    concernIndex: ctx.concernIndex ?? 0,
    lexicon: ctx.lexicon ?? { hits: [], maxSeverity: null, categories: [] },
    criticalAnswers: ctx.criticalAnswers ?? [],
    contextTags: ctx.contextTags ?? [],
    wantsContact: ctx.wantsContact ?? 'no',
    history: ctx.history ?? { consecutiveElevated: 0, delta: null, previousIndex: null },
    validation: ctx.validation ?? { dataSufficiency: 'LIMITED', flags: [] },
    answers: ctx.answers ?? {},
    source: ctx.source ?? 'checkin',
  };
}

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? -1 : n;
}

function hasAny(list, values) {
  return values.some((v) => list.includes(v));
}

function safe(fn) {
  try { return fn(); } catch { return null; }
}

/**
 * สร้างแผนการดำเนินการสำหรับระดับที่กำหนด
 * ใช้เมื่อระดับถูกยกขึ้นภายหลัง (เช่น ตัวช่วยภาษายกระดับ) จึงต้องคำนวณแผนใหม่
 */
export function buildActionPlan(level, ctx) {
  return actionPlan(level, normalize(ctx));
}

/** ข้อความที่แสดงให้นักเรียนเห็นสำหรับระดับที่กำหนด */
export function buildStudentMessage(level, ctx) {
  return studentMessage(level, normalize(ctx));
}

/** เปิดให้เอกสาร/หน้าแอดมินดึงไปแสดงได้ว่า "ระบบใช้กฎอะไรบ้าง" (ความโปร่งใส) */
export function ruleBook() {
  return {
    rules: RULES.map(({ id, level, label }) => ({ id, level, label })),
    modifiers: MODIFIERS.map(({ id, label, effect }) => ({ id, label, effect })),
  };
}
