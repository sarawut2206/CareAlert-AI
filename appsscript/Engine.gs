/**
 * ═══════════════════════════════════════════════════════════════
 *  Engine.gs — สร้างอัตโนมัติ ห้ามแก้ไขไฟล์นี้ด้วยมือ
 * ═══════════════════════════════════════════════════════════════
 *
 *  สร้างจาก server/src/ ด้วยคำสั่ง:  node scripts/build-appsscript.mjs
 *  ถ้าต้องการแก้กฎ ให้แก้ที่ server/src/engine/ แล้วสร้างไฟล์นี้ใหม่
 *
 *  เวอร์ชันกฎจะปรากฏในทุกการประเมิน ตรวจย้อนหลังได้เสมอ
 */

// ค่าตั้งต้นแทน server/src/config.js (Apps Script ไม่มี node:fs)
// เขตเวลาไทยคงที่ ส่วนเวลาเรียนปรับได้จาก Script Properties ผ่าน applySchoolHours()
var config = {
  timezone: 420,
  schoolDayStartHour: 8,
  schoolDayEndHour: 16,
  llm: { enabled: false, apiKey: '', model: '', baseUrl: '' },
};

function applySchoolHours(startHour, endHour) {
  if (startHour) config.schoolDayStartHour = Number(startHour);
  if (endHour) config.schoolDayEndHour = Number(endHour);
}

// ตัวช่วยภาษา (LLM) ปิดถาวรบน Apps Script — การประเมินใช้กฎล้วน
function llmEnabled() { return false; }
function analyzeText(_text) { return null; }


// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/content/templates.js
// ─────────────────────────────────────────────────────────────

/**
 * ชุดคำถามของระบบ
 *
 * ⚠️ หมายเหตุด้านลิขสิทธิ์และความถูกต้องทางวิชาการ — อ่านก่อนแก้ไข
 * ข้อคำถามทั้งหมดในไฟล์นี้ "เขียนขึ้นใหม่" สำหรับบริบทโรงเรียนไทย
 * โดยอ้าง "โครงสร้างเชิงมิติ" (domain structure) ของเครื่องมือมาตรฐาน เช่น 9S / SDQ / PHQ-A
 * แต่ไม่ได้คัดลอกข้อคำถามจากเครื่องมือเหล่านั้น เพราะเครื่องมือเหล่านั้นมีเจ้าของสิทธิ์
 * และการดัดแปลงข้อโดยไม่ได้รับอนุญาตจะทำให้ค่าความเที่ยง/ความตรงที่รายงานไว้ใช้อ้างไม่ได้
 *
 * ถ้าโรงเรียนได้รับอนุญาตให้ใช้ฉบับจริงแล้ว ให้เพิ่มเป็น template ใหม่
 * และตั้ง `licensedInstrument: true` เพื่อให้ระบบแสดงที่มาและไม่ปนกับข้อที่เขียนเอง
 *
 * facet = มิติบริบทที่ข้อนี้ให้ข้อมูล (ดู engine/assess.js)
 *   severity | frequency | duration | impact | support | safety | protective | context
 */

const FREQ4 = [
  { value: 0, label: 'ไม่เลย' },
  { value: 1, label: 'บางวัน' },
  { value: 2, label: 'มากกว่าครึ่งหนึ่งของสัปดาห์' },
  { value: 3, label: 'เกือบทุกวัน' },
];

const AGREE4 = [
  { value: 0, label: 'ไม่จริงเลย' },
  { value: 1, label: 'จริงบ้าง' },
  { value: 2, label: 'ค่อนข้างจริง' },
  { value: 3, label: 'จริงมาก' },
];

// ─────────────────────────── เช็กอินรายวัน (30 วินาที) ───────────────────────────

const dailyCheckin = {
  id: 'daily-pulse',
  version: '1.0.0',
  title: 'เช็กอินวันนี้',
  subtitle: 'ใช้เวลาประมาณ 30 วินาที',
  intro: 'ไม่มีคำตอบถูกหรือผิด ตอบตามที่รู้สึกจริง ๆ ได้เลย',
  cadence: 'daily',
  items: [
    {
      id: 'd1',
      text: 'วันนี้ความรู้สึกโดยรวมของเธอเป็นอย่างไร',
      type: 'scale',
      domain: 'mood',
      facet: 'severity',
      weight: 1,
      reverse: true, // ค่าสูง = ดี → ต้องกลับด้าน
      options: [
        { value: 3, label: 'ดีมาก', emoji: '😄' },
        { value: 2, label: 'พอไหว', emoji: '🙂' },
        { value: 1, label: 'ไม่ค่อยดี', emoji: '😕' },
        { value: 0, label: 'แย่มาก', emoji: '😢' },
      ],
      required: true,
    },
    {
      id: 'd2',
      text: 'วันนี้มีเรื่องอะไรที่หนักใจไหม',
      type: 'multi',
      domain: 'context',
      facet: 'context',
      options: [
        { value: 'none', label: 'ไม่มี' },
        { value: 'study', label: 'การเรียน' },
        { value: 'friend', label: 'เพื่อน' },
        { value: 'bullying', label: 'ถูกล้อ / ถูกแกล้ง' },
        { value: 'family', label: 'ที่บ้าน' },
        { value: 'money', label: 'เรื่องเงิน' },
        { value: 'health', label: 'สุขภาพ / การนอน' },
        { value: 'safety', label: 'รู้สึกไม่ปลอดภัย' },
        { value: 'other', label: 'อื่น ๆ' },
      ],
    },
    {
      id: 'd_help',
      text: 'อยากให้ครูหรือผู้ใหญ่ที่ไว้ใจติดต่อกลับไหม',
      type: 'choice',
      domain: 'help',
      facet: 'context',
      options: [
        { value: 'no', label: 'ยังไม่ต้อง' },
        { value: 'maybe', label: 'ถ้าได้ก็ดี' },
        { value: 'yes', label: 'อยากคุยเร็ว ๆ นี้' },
      ],
      required: true,
    },
  ],
  consistencyPairs: [],
};

// ─────────────────────────── เช็กอินรายสัปดาห์ (ชุดหลัก 9 ข้อ) ───────────────────────────

const weeklyCheckin = {
  id: 'weekly-core',
  version: '1.0.0',
  title: 'เช็กอินประจำสัปดาห์',
  subtitle: 'ประมาณ 2 นาที',
  intro:
    'คำถามชุดนี้ช่วยให้โรงเรียนรู้ว่าเธอเป็นอย่างไรในสัปดาห์ที่ผ่านมา ' +
    'ไม่ใช่การสอบ ไม่มีคะแนน และไม่ใช่การตัดสินว่าใครปกติหรือไม่ปกติ ' +
    'ข้ามข้อที่ยังไม่พร้อมตอบได้',
  timeframe: 'ในช่วง 7 วันที่ผ่านมา',
  cadence: 'weekly',
  items: [
    { id: 'c1', text: 'ฉันรู้สึกเศร้า หดหู่ หรือใจคอห่อเหี่ยว', type: 'scale', options: FREQ4, domain: 'mood', facet: 'severity', weight: 1.0 },
    { id: 'c2', text: 'ฉันรู้สึกว่าไม่มีอะไรน่าสนใจหรือน่าสนุกเหมือนเดิม', type: 'scale', options: FREQ4, domain: 'mood', facet: 'severity', weight: 1.0 },
    { id: 'c3', text: 'ฉันรู้สึกกังวล ตึงเครียด หรือหงุดหงิดจนควบคุมได้ยาก', type: 'scale', options: FREQ4, domain: 'anxiety', facet: 'severity', weight: 0.9 },
    { id: 'c4', text: 'ฉันนอนไม่หลับ หลับยาก หรือตื่นกลางดึกบ่อย', type: 'scale', options: FREQ4, domain: 'sleep', facet: 'impact', weight: 0.8 },
    { id: 'c5', text: 'ฉันตั้งใจเรียนหรือทำงานที่ได้รับมอบหมายได้ยากกว่าปกติ', type: 'scale', options: FREQ4, domain: 'school', facet: 'impact', weight: 0.9 },
    { id: 'c6', text: 'ฉันถูกเพื่อนล้อเลียน แกล้ง กีดกัน หรือทำให้อับอาย (รวมทางออนไลน์)', type: 'scale', options: FREQ4, domain: 'bullying', facet: 'frequency', weight: 1.0 },
    { id: 'c7', text: 'ฉันมีคนที่ไว้ใจและพูดคุยด้วยได้เมื่อมีเรื่องไม่สบายใจ', type: 'scale', options: AGREE4, domain: 'support', facet: 'support', weight: 1.0, reverse: true },
    { id: 'c8', text: 'ที่บ้านมีเรื่องที่ทำให้ฉันไม่สบายใจ หรือรู้สึกไม่ปลอดภัย', type: 'scale', options: FREQ4, domain: 'home', facet: 'severity', weight: 1.0 },
    {
      id: 'c9',
      text: 'ฉันมีความคิดอยากทำร้ายตัวเอง หรือคิดว่าไม่อยากมีชีวิตอยู่',
      type: 'scale',
      options: FREQ4,
      domain: 'safety',
      facet: 'safety',
      weight: 1.0,
      critical: true,
      helper: 'ถ้าตอนนี้เธอกำลังรู้สึกแบบนั้นอยู่ กดปุ่ม “ขอความช่วยเหลือ” ด้านล่างได้ทันที',
    },
    {
      id: 'c10',
      text: 'มีอะไรอยากเล่าเพิ่มไหม (ไม่บังคับ)',
      type: 'text',
      domain: 'freetext',
      facet: 'context',
      required: false,
      maxLength: 2000,
      placeholder: 'เล่าเท่าที่อยากเล่าได้เลย',
    },
    {
      id: 'c_help',
      text: 'อยากให้ครูหรือผู้ใหญ่ที่ไว้ใจติดต่อกลับไหม',
      type: 'choice',
      domain: 'help',
      facet: 'context',
      required: true,
      options: [
        { value: 'no', label: 'ยังไม่ต้อง' },
        { value: 'maybe', label: 'ถ้าได้ก็ดี' },
        { value: 'yes', label: 'อยากคุยเร็ว ๆ นี้' },
      ],
    },
  ],
  /**
   * คู่ข้อที่ใช้ตรวจ "ความสอดคล้องของข้อมูล" (ไม่ใช่ตรวจว่าโกหก)
   * เมื่อไม่สอดคล้อง ระบบจะบอกว่า "ข้อมูลยังไม่เพียงพอสำหรับการสรุป" และชวนคุยเพิ่ม
   */
  consistencyPairs: [
    { a: 'c1', b: 'c2', rule: 'similar', tolerance: 2, note: 'อารมณ์เศร้ากับความไม่สนใจสิ่งรอบตัวมักไปด้วยกัน' },
    { a: 'c9', b: 'c1', rule: 'notLowerThan', note: 'ตอบว่ามีความคิดทำร้ายตัวเอง แต่ระบุว่าไม่มีอารมณ์เศร้าเลย' },
  ],
  // ข้อที่ถ้าไม่ตอบ ถือว่าข้อมูลไม่พอสรุป
  requiredForSufficiency: ['c1', 'c6', 'c9'],
};

// ─────────────────────────── ชุดคำถามเชิงลึก (เปิดตามเงื่อนไข) ───────────────────────────

const followUps = {
  mood: {
    id: 'fu-mood',
    version: '1.0.0',
    title: 'ขอถามเพิ่มอีกนิดเรื่องความรู้สึก',
    trigger: 'โดเมนอารมณ์ ≥ 2',
    items: [
      {
        id: 'm_dur', text: 'ความรู้สึกแบบนี้เป็นมานานแค่ไหนแล้ว', type: 'choice', domain: 'mood', facet: 'duration',
        options: [
          { value: 0, label: 'ไม่กี่วัน' },
          { value: 1, label: 'ประมาณ 1–2 สัปดาห์' },
          { value: 2, label: 'ประมาณ 1 เดือน' },
          { value: 3, label: 'นานกว่า 1 เดือน' },
        ],
      },
      {
        id: 'm_impact', text: 'มันกระทบชีวิตประจำวันของเธอมากแค่ไหน (การเรียน การกิน การนอน การอยู่กับเพื่อน)',
        type: 'scale', options: AGREE4, domain: 'mood', facet: 'impact',
      },
      { id: 'm_hope', text: 'ฉันรู้สึกว่าเรื่องนี้จะไม่มีวันดีขึ้น', type: 'scale', options: AGREE4, domain: 'mood', facet: 'severity', weight: 1.2 },
      {
        id: 'm_trend', text: 'เทียบกับเดือนที่แล้ว ตอนนี้เป็นอย่างไร', type: 'choice', domain: 'mood', facet: 'trajectory',
        options: [
          { value: 0, label: 'ดีขึ้น' },
          { value: 1, label: 'พอ ๆ เดิม' },
          { value: 2, label: 'แย่ลง' },
          { value: 3, label: 'แย่ลงมาก' },
        ],
      },
      {
        id: 'm_help', text: 'เคยบอกเรื่องนี้กับใครไหม', type: 'multi', domain: 'support', facet: 'support',
        options: [
          { value: 'none', label: 'ยังไม่เคยบอกใคร' },
          { value: 'friend', label: 'เพื่อน' },
          { value: 'family', label: 'คนในครอบครัว' },
          { value: 'teacher', label: 'ครู' },
          { value: 'counselor', label: 'ครูแนะแนว' },
          { value: 'doctor', label: 'หมอ / พยาบาล' },
        ],
      },
    ],
  },

  bullying: {
    id: 'fu-bullying',
    version: '1.0.0',
    title: 'ขอถามเพิ่มเรื่องที่เกิดขึ้นกับเธอ',
    trigger: 'มีสัญญาณการถูกรังแก',
    notice: 'การบอกเรื่องนี้ไม่ใช่การฟ้อง และเธอไม่ได้ทำอะไรผิด',
    items: [
      {
        id: 'b_type', text: 'เป็นแบบไหนบ้าง (เลือกได้หลายข้อ)', type: 'multi', domain: 'bullying', facet: 'context',
        options: [
          { value: 'verbal', label: 'ล้อเลียน ด่าทอ' },
          { value: 'physical', label: 'ตี ผลัก ทำร้ายร่างกาย' },
          { value: 'social', label: 'กีดกัน ไม่ให้เข้ากลุ่ม' },
          { value: 'cyber', label: 'ทางออนไลน์ / โซเชียล' },
          { value: 'property', label: 'ทำลาย/ขโมยของ' },
          { value: 'sexual', label: 'ล่วงเกินทางเพศ' },
          { value: 'extortion', label: 'ข่มขู่ รีดไถเงิน' },
        ],
      },
      {
        id: 'b_freq', text: 'เกิดขึ้นบ่อยแค่ไหน', type: 'choice', domain: 'bullying', facet: 'frequency',
        options: [
          { value: 0, label: 'เคยครั้งเดียว' },
          { value: 1, label: 'นาน ๆ ครั้ง' },
          { value: 2, label: 'เกือบทุกสัปดาห์' },
          { value: 3, label: 'เกือบทุกวัน' },
        ],
      },
      {
        id: 'b_dur', text: 'เป็นมานานแค่ไหน', type: 'choice', domain: 'bullying', facet: 'duration',
        options: [
          { value: 0, label: 'เพิ่งเริ่ม' },
          { value: 1, label: 'ไม่กี่สัปดาห์' },
          { value: 2, label: 'หลายเดือน' },
          { value: 3, label: 'มากกว่า 1 ปี' },
        ],
      },
      { id: 'b_impact', text: 'เรื่องนี้ทำให้ไม่อยากมาโรงเรียน หรือกระทบการเรียนแค่ไหน', type: 'scale', options: AGREE4, domain: 'bullying', facet: 'impact' },
      { id: 'b_safe', text: 'ตอนนี้ที่โรงเรียน ฉันรู้สึกไม่ปลอดภัย', type: 'scale', options: AGREE4, domain: 'safety', facet: 'safety', weight: 1.0 },
      {
        id: 'b_told', text: 'มีผู้ใหญ่คนไหนรู้เรื่องนี้แล้วบ้าง', type: 'choice', domain: 'support', facet: 'support',
        options: [
          { value: 3, label: 'ยังไม่มีใครรู้' },
          { value: 2, label: 'บอกแล้วแต่ยังไม่มีอะไรเปลี่ยน' },
          { value: 1, label: 'บอกแล้วกำลังช่วยอยู่' },
          { value: 0, label: 'บอกแล้วและดีขึ้น' },
        ],
      },
      { id: 'b_retaliation', text: 'ฉันกลัวว่าถ้าบอกครู จะโดนเอาคืน', type: 'scale', options: AGREE4, domain: 'bullying', facet: 'context' },
      { id: 'b_where', text: 'เกิดขึ้นที่ไหนบ้าง (ไม่บังคับ)', type: 'text', domain: 'freetext', facet: 'context', required: false, maxLength: 500 },
    ],
  },

  safety: {
    id: 'fu-safety',
    version: '1.0.0',
    title: 'ขอบคุณที่บอกเรา',
    trigger: 'มีสัญญาณด้านความปลอดภัย',
    notice:
      'สิ่งที่เธอกำลังรู้สึกอยู่เป็นเรื่องที่หนักมาก และเธอไม่ควรต้องเผชิญคนเดียว ' +
      'คำถามต่อไปนี้ช่วยให้ผู้ใหญ่รู้ว่าจะช่วยเธออย่างไรได้เร็วที่สุด ตอบเท่าที่ไหว',
    alwaysShowHelpline: true,
    items: [
      {
        id: 's_freq', text: 'ความคิดแบบนี้เกิดขึ้นบ่อยแค่ไหน', type: 'choice', domain: 'safety', facet: 'frequency',
        options: [
          { value: 0, label: 'เคยผ่านเข้ามาแวบเดียว' },
          { value: 1, label: 'นาน ๆ ครั้ง' },
          { value: 2, label: 'หลายครั้งต่อสัปดาห์' },
          { value: 3, label: 'เกือบตลอดเวลา' },
        ],
      },
      {
        id: 's_plan', text: 'เคยคิดถึงวิธีการไหม', type: 'choice', domain: 'safety', facet: 'safety', critical: true,
        options: [
          { value: 0, label: 'ไม่เคย' },
          { value: 2, label: 'เคยคิดบ้าง' },
          { value: 3, label: 'คิดไว้ค่อนข้างชัดเจน' },
          { value: null, label: 'ยังไม่อยากตอบข้อนี้' },
        ],
      },
      {
        id: 's_past', text: 'เคยลงมือทำร้ายตัวเองมาก่อนไหม', type: 'choice', domain: 'safety', facet: 'safety', critical: true,
        options: [
          { value: 0, label: 'ไม่เคย' },
          { value: 2, label: 'เคย นานมาแล้ว' },
          { value: 3, label: 'เคย ภายในเดือนนี้' },
          { value: null, label: 'ยังไม่อยากตอบข้อนี้' },
        ],
      },
      {
        id: 's_now', text: 'ตอนนี้ เธอปลอดภัยไหม', type: 'choice', domain: 'safety', facet: 'safety', critical: true, required: true,
        options: [
          { value: 0, label: 'ตอนนี้ปลอดภัย' },
          { value: 2, label: 'ไม่แน่ใจ' },
          { value: 3, label: 'ตอนนี้ฉันไม่ปลอดภัย' },
        ],
      },
      {
        id: 's_who', text: 'ตอนนี้มีใครอยู่ใกล้ ๆ ที่เธอไว้ใจไหม', type: 'choice', domain: 'support', facet: 'support',
        options: [
          { value: 0, label: 'มี และคุยด้วยได้' },
          { value: 2, label: 'มี แต่ยังไม่กล้าบอก' },
          { value: 3, label: 'ตอนนี้ไม่มีใครเลย' },
        ],
      },
      {
        id: 's_talk', text: 'ยินดีให้ครูแนะแนวติดต่อกลับหาเธอไหม', type: 'choice', domain: 'help', facet: 'context', required: true,
        options: [
          { value: 'yes', label: 'ยินดี ติดต่อได้เลย' },
          { value: 'later', label: 'ขอเป็นวันพรุ่งนี้' },
          { value: 'no', label: 'ยังไม่พร้อม' },
        ],
        helper: 'ไม่ว่าจะเลือกข้อไหน ผู้ใหญ่ที่รับผิดชอบจะได้รับเรื่องนี้ เพราะความปลอดภัยของเธอสำคัญที่สุด',
      },
    ],
  },

  home: {
    id: 'fu-home',
    version: '1.0.0',
    title: 'ขอถามเพิ่มเรื่องที่บ้าน',
    trigger: 'โดเมนครอบครัว ≥ 2',
    items: [
      {
        id: 'h_what', text: 'เรื่องที่บ้านเป็นแบบไหน (เลือกได้หลายข้อ)', type: 'multi', domain: 'home', facet: 'context',
        options: [
          { value: 'conflict', label: 'ทะเลาะกันบ่อย' },
          { value: 'money', label: 'ปัญหาเรื่องเงิน' },
          { value: 'illness', label: 'มีคนป่วย' },
          { value: 'separation', label: 'พ่อแม่แยกทาง' },
          { value: 'alcohol', label: 'มีคนดื่มสุรา/ใช้สารเสพติด' },
          { value: 'violence', label: 'มีการทำร้ายร่างกาย' },
          { value: 'neglect', label: 'ไม่มีคนดูแล' },
          { value: 'other', label: 'อื่น ๆ' },
        ],
      },
      { id: 'h_safe', text: 'ที่บ้าน ฉันรู้สึกไม่ปลอดภัย', type: 'scale', options: AGREE4, domain: 'safety', facet: 'safety', critical: true },
      {
        id: 'h_dur', text: 'เป็นมานานแค่ไหน', type: 'choice', domain: 'home', facet: 'duration',
        options: [
          { value: 0, label: 'เพิ่งเกิด' },
          { value: 1, label: 'ไม่กี่สัปดาห์' },
          { value: 2, label: 'หลายเดือน' },
          { value: 3, label: 'นานเป็นปี' },
        ],
      },
      { id: 'h_note', text: 'อยากเล่าเพิ่มไหม (ไม่บังคับ)', type: 'text', domain: 'freetext', facet: 'context', required: false, maxLength: 1500 },
    ],
  },
};

// ─────────────────────────── ชุดคำถาม "เล่าเรื่องของตัวเอง" ───────────────────────────

const selfReport = {
  id: 'self-report',
  version: '1.0.0',
  title: 'เล่าเรื่องของเธอ',
  intro:
    'เล่าเท่าที่อยากเล่าได้เลย ข้ามข้อไหนก็ได้ ' +
    'สิ่งที่เธอเขียนจะถูกอ่านโดยครูที่รับผิดชอบระบบดูแลช่วยเหลือนักเรียนเท่านั้น',
  items: [
    {
      id: 'sr_what', text: 'เรื่องที่อยากเล่าเกี่ยวกับอะไร (เลือกได้หลายข้อ)', type: 'multi',
      domain: 'context', facet: 'context', required: true,
      options: [
        { value: 'mood', label: 'ความรู้สึก / อารมณ์' },
        { value: 'bullying', label: 'ถูกล้อ ถูกแกล้ง ถูกรังแก' },
        { value: 'friend', label: 'เรื่องเพื่อน' },
        { value: 'family', label: 'เรื่องที่บ้าน' },
        { value: 'study', label: 'การเรียน' },
        { value: 'money', label: 'เรื่องเงิน' },
        { value: 'health', label: 'สุขภาพ / การนอน' },
        { value: 'love', label: 'ความสัมพันธ์' },
        { value: 'safety', label: 'รู้สึกไม่ปลอดภัย' },
        { value: 'other', label: 'อื่น ๆ' },
      ],
    },
    { id: 'sr_severity', text: 'ตอนนี้เรื่องนี้หนักแค่ไหนสำหรับเธอ', type: 'scale', options: AGREE4, domain: 'mood', facet: 'severity', required: true },
    {
      id: 'sr_dur', text: 'เป็นมานานแค่ไหนแล้ว', type: 'choice', domain: 'context', facet: 'duration',
      options: [
        { value: 0, label: 'เพิ่งเกิดวันนี้' },
        { value: 1, label: 'ไม่กี่วัน' },
        { value: 2, label: 'หลายสัปดาห์' },
        { value: 3, label: 'เป็นเดือนขึ้นไป' },
      ],
    },
    { id: 'sr_impact', text: 'มันกระทบการเรียน การนอน หรือการใช้ชีวิตแค่ไหน', type: 'scale', options: AGREE4, domain: 'context', facet: 'impact' },
    {
      id: 'sr_safe', text: 'ตอนนี้เธอปลอดภัยไหม', type: 'choice', domain: 'safety', facet: 'safety', critical: true, required: true,
      options: [
        { value: 0, label: 'ปลอดภัยดี' },
        { value: 2, label: 'ไม่ค่อยแน่ใจ' },
        { value: 3, label: 'ตอนนี้ฉันไม่ปลอดภัย' },
      ],
    },
    {
      id: 'sr_support', text: 'ตอนนี้มีใครที่เธอคุยเรื่องนี้ด้วยได้ไหม', type: 'choice', domain: 'support', facet: 'support',
      options: [
        { value: 0, label: 'มี และเคยคุยแล้ว' },
        { value: 1, label: 'มี แต่ยังไม่ได้คุย' },
        { value: 3, label: 'ยังไม่มีใครเลย' },
      ],
    },
    { id: 'sr_body', text: 'เล่าให้ฟังหน่อยได้ไหม', type: 'text', domain: 'freetext', facet: 'context', required: false, maxLength: 4000, placeholder: 'เขียนเท่าที่ไหว ไม่ต้องเรียบเรียงให้สวยก็ได้' },
    {
      id: 'c_help', text: 'อยากให้ครูติดต่อกลับไหม', type: 'choice', domain: 'help', facet: 'context', required: true,
      options: [
        { value: 'yes', label: 'อยากคุยเร็ว ๆ นี้' },
        { value: 'maybe', label: 'ถ้าได้ก็ดี' },
        { value: 'no', label: 'ยังไม่ต้อง แค่อยากเล่า' },
      ],
    },
  ],
  consistencyPairs: [],
  requiredForSufficiency: ['sr_what', 'sr_safe'],
};

// ─────────────────────────── ชุดคำถาม "เป็นห่วงเพื่อน" ───────────────────────────

const friendConcern = {
  id: 'friend-concern',
  version: '1.0.0',
  title: 'เป็นห่วงเพื่อน',
  intro:
    'การบอกครูเพราะเป็นห่วงเพื่อน ไม่ใช่การฟ้อง — เป็นการช่วยชีวิตเพื่อน ' +
    'เธอเลือกไม่บอกชื่อตัวเองก็ได้',
  items: [
    {
      id: 'f_what', text: 'เธอสังเกตเห็นอะไร (เลือกได้หลายข้อ)', type: 'multi', domain: 'context', facet: 'context', required: true,
      options: [
        { value: 'sad', label: 'ดูเศร้า ร้องไห้บ่อย' },
        { value: 'withdrawn', label: 'เงียบลง แยกตัวจากเพื่อน' },
        { value: 'bullied', label: 'ถูกแกล้ง / ถูกรังแก' },
        { value: 'selfharm', label: 'มีร่องรอยทำร้ายตัวเอง' },
        { value: 'saidDeath', label: 'พูดถึงการตาย หรือไม่อยากอยู่' },
        { value: 'giveaway', label: 'แจกของ / บอกลา' },
        { value: 'threat', label: 'พูดว่าจะทำร้ายคนอื่น' },
        { value: 'weapon', label: 'เห็นอาวุธ' },
        { value: 'home', label: 'มีปัญหาที่บ้าน' },
        { value: 'substance', label: 'ใช้สารเสพติด' },
        { value: 'absent', label: 'ขาดเรียนบ่อยผิดปกติ' },
        { value: 'other', label: 'อื่น ๆ' },
      ],
    },
    {
      // "เห็นครั้งล่าสุดเมื่อไหร่" คือความสด (recency) ไม่ใช่ระยะเวลาที่เป็นมา (duration)
      // จึงไม่คิดเป็นคะแนนความรุนแรง — กฎ L4.FRIEND_LETHAL_SIGNS อ่านค่านี้โดยตรงแทน
      id: 'f_when', text: 'เห็นครั้งล่าสุดเมื่อไหร่', type: 'choice', domain: 'context', facet: 'context',
      noDomainScore: true, required: true,
      options: [
        { value: 3, label: 'วันนี้' },
        { value: 2, label: 'ภายในสัปดาห์นี้' },
        { value: 1, label: 'ภายในเดือนนี้' },
        { value: 0, label: 'นานกว่านั้น' },
      ],
    },
    {
      id: 'f_safe', text: 'เธอคิดว่าตอนนี้เพื่อนปลอดภัยไหม', type: 'choice', domain: 'safety', facet: 'safety', critical: true, required: true,
      options: [
        { value: 0, label: 'น่าจะปลอดภัย' },
        { value: 2, label: 'ไม่แน่ใจ' },
        { value: 3, label: 'คิดว่าไม่ปลอดภัย ต้องช่วยด่วน' },
      ],
    },
    {
      id: 'f_known', text: 'มีผู้ใหญ่คนไหนรู้เรื่องนี้แล้วไหม', type: 'choice', domain: 'support', facet: 'support',
      options: [
        { value: 3, label: 'ยังไม่มีใครรู้' },
        { value: 1, label: 'น่าจะมีคนรู้แล้ว' },
        { value: 0, label: 'ไม่ทราบ' },
      ],
    },
    { id: 'f_detail', text: 'เล่าให้ฟังหน่อยได้ไหมว่าเกิดอะไรขึ้น', type: 'text', domain: 'freetext', facet: 'context', required: false, maxLength: 2000 },
  ],
};

// ─────────────────────────── บันทึกข้อสังเกตของครู ───────────────────────────

const staffNote = {
  id: 'staff-observation',
  version: '1.0.0',
  title: 'บันทึกข้อสังเกตของบุคลากร',
  intro: 'บันทึกสิ่งที่ "สังเกตเห็น" เป็นข้อเท็จจริง หลีกเลี่ยงการตีความหรือวินิจฉัย',
  items: [
    {
      id: 'n_what', text: 'สังเกตเห็นอะไร (เลือกได้หลายข้อ)', type: 'multi', domain: 'context', facet: 'context', required: true,
      options: [
        { value: 'mood', label: 'อารมณ์เปลี่ยนไปชัดเจน' },
        { value: 'withdrawn', label: 'แยกตัว เงียบผิดปกติ' },
        { value: 'grades', label: 'ผลการเรียนตกลง' },
        { value: 'absent', label: 'ขาดเรียน/มาสาย บ่อยขึ้น' },
        { value: 'appearance', label: 'สุขอนามัย/การแต่งกายเปลี่ยนไป' },
        { value: 'injury', label: 'มีร่องรอยบาดเจ็บ' },
        { value: 'aggression', label: 'ก้าวร้าวมากขึ้น' },
        { value: 'peer', label: 'มีความขัดแย้งกับเพื่อน' },
        { value: 'disclosure', label: 'นักเรียนเล่าเรื่องกับครูโดยตรง' },
        { value: 'family', label: 'ทราบว่ามีปัญหาที่บ้าน' },
      ],
    },
    {
      id: 'n_change', text: 'เปลี่ยนแปลงจากเดิมมากแค่ไหน', type: 'scale', options: AGREE4, domain: 'context', facet: 'severity', required: true,
    },
    {
      id: 'n_dur', text: 'สังเกตเห็นมานานแค่ไหน', type: 'choice', domain: 'context', facet: 'duration', required: true,
      options: [
        { value: 0, label: 'เพิ่งวันนี้' },
        { value: 1, label: 'ประมาณ 1 สัปดาห์' },
        { value: 2, label: 'หลายสัปดาห์' },
        { value: 3, label: 'เป็นเดือนขึ้นไป' },
      ],
    },
    {
      id: 'n_safety', text: 'มีข้อกังวลด้านความปลอดภัยหรือไม่', type: 'choice', domain: 'safety', facet: 'safety', critical: true, required: true,
      options: [
        { value: 0, label: 'ไม่มี' },
        { value: 2, label: 'มีข้อสงสัย' },
        { value: 3, label: 'มีชัดเจน ต้องดำเนินการทันที' },
      ],
    },
    { id: 'n_detail', text: 'รายละเอียดที่สังเกตเห็น (เชิงข้อเท็จจริง)', type: 'text', domain: 'freetext', facet: 'context', required: true, maxLength: 3000 },
    { id: 'n_done', text: 'ดำเนินการอะไรไปแล้วบ้าง (ถ้ามี)', type: 'text', domain: 'freetext', facet: 'context', required: false, maxLength: 1500 },
  ],
};

const templates = {
  [dailyCheckin.id]: dailyCheckin,
  [weeklyCheckin.id]: weeklyCheckin,
  [selfReport.id]: selfReport,
  [friendConcern.id]: friendConcern,
  [staffNote.id]: staffNote,
  [followUps.mood.id]: followUps.mood,
  [followUps.bullying.id]: followUps.bullying,
  [followUps.safety.id]: followUps.safety,
  [followUps.home.id]: followUps.home,
};

function getTemplate(id) {
  return templates[id] || null;
}

/** รวมข้อจาก template หลัก + ชุดเชิงลึกทั้งหมด เพื่อใช้ตอนประเมิน */
function allItemsById() {
  const map = new Map();
  for (const t of Object.values(templates)) {
    for (const item of t.items) map.set(item.id, { ...item, templateId: t.id });
  }
  return map;
}

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/content/lifeskills.js
// ─────────────────────────────────────────────────────────────

/**
 * ชั้นที่ 1: กิจกรรมทักษะชีวิต — ใช้ได้กับนักเรียนทุกคน ไม่มีคะแนน ไม่มีการจัดอันดับ
 *
 * เนื้อหาอิงหลักการที่มีหลักฐานรองรับในโปรแกรมป้องกันเชิงจิตสังคมในโรงเรียน
 * (การกำกับตนเอง การจัดการอารมณ์ การสื่อสาร การแก้ความขัดแย้ง ทักษะสังคม การขอความช่วยเหลือ)
 * แต่ "ไม่ใช่การรักษา" และไม่ใช้แทนการพบผู้เชี่ยวชาญ
 *
 * ชนิดของขั้นตอน:
 *   read     — อ่านสั้น ๆ
 *   practice — ลงมือทำทันทีในหน้าจอ
 *   quiz     — เลือกตอบเพื่อทบทวน (ไม่เก็บคะแนน แค่ให้ feedback)
 *   reflect  — เขียนสะท้อนตัวเอง (บันทึกเป็นข้อความอิสระ และผ่านการตรวจสัญญาณความปลอดภัย)
 */

const lifeskillModules = [
  {
    id: 'stress-basics',
    title: 'ความเครียดทำงานยังไง',
    emoji: '🌊',
    minutes: 4,
    tags: ['จัดการความเครียด'],
    goal: 'เข้าใจว่าความเครียดไม่ใช่ศัตรู และมีวิธีลดระดับมันได้ด้วยตัวเอง',
    steps: [
      {
        type: 'read',
        title: 'ความเครียดคือสัญญาณ ไม่ใช่ความอ่อนแอ',
        body:
          'เวลาเจอเรื่องกดดัน ร่างกายจะหลั่งฮอร์โมนให้เราตื่นตัว หัวใจเต้นเร็ว หายใจถี่ ' +
          'นี่เป็นระบบเตือนภัยที่ปกติมาก\n\n' +
          'ปัญหาไม่ได้อยู่ที่ "มีความเครียด" แต่อยู่ที่ "เครียดนานเกินไปโดยไม่มีทางระบาย" ' +
          'เหมือนกล้ามเนื้อที่เกร็งค้างไว้ทั้งวัน',
      },
      {
        type: 'practice',
        title: 'ลองหายใจแบบ 4-7-8',
        body: 'ทำตามจังหวะด้านล่าง 4 รอบ ถ้ารู้สึกเวียนหัวให้หยุดก่อน แล้วหายใจปกติ',
        widget: 'breathing',
        config: { inhale: 4, hold: 7, exhale: 8, rounds: 4 },
      },
      {
        type: 'quiz',
        title: 'ทบทวน',
        body: 'ข้อไหนช่วยลดความเครียดได้จริงในระยะยาว',
        options: [
          { id: 'a', text: 'อดนอนเพื่อทำงานให้เสร็จ', correct: false, feedback: 'การอดนอนทำให้สมองจัดการอารมณ์ได้แย่ลงในวันถัดไป' },
          { id: 'b', text: 'เล่าให้คนที่ไว้ใจฟัง', correct: true, feedback: 'ถูกต้อง การได้พูดออกมาช่วยลดแรงกดดันในใจได้จริง' },
          { id: 'c', text: 'เก็บไว้คนเดียวจนกว่าจะหายไปเอง', correct: false, feedback: 'ส่วนใหญ่มันไม่หายเอง และมักสะสมจนหนักกว่าเดิม' },
        ],
      },
      {
        type: 'reflect',
        title: 'ลองเขียนดู',
        prompt: 'สัปดาห์นี้อะไรทำให้เธอเครียดที่สุด และมีอะไรที่พอช่วยได้บ้าง',
      },
    ],
  },

  {
    id: 'emotion-naming',
    title: 'เรียกชื่ออารมณ์ให้ถูก',
    emoji: '🎨',
    minutes: 4,
    tags: ['จัดการอารมณ์'],
    goal: 'แยกแยะอารมณ์ได้ละเอียดขึ้น เพื่อจัดการได้ตรงจุดขึ้น',
    steps: [
      {
        type: 'read',
        title: 'ทำไมต้องเรียกชื่อ',
        body:
          'เวลาเราบอกได้แค่ว่า "รู้สึกแย่" สมองจะหาทางออกไม่ถูก ' +
          'แต่ถ้าบอกได้ว่า "ฉันรู้สึกน้อยใจเพราะเพื่อนไม่ชวน" เราจะเห็นทางแก้ชัดขึ้นทันที\n\n' +
          'งานวิจัยเรียกสิ่งนี้ว่า affect labeling — แค่เรียกชื่ออารมณ์ได้ถูก ความรุนแรงของมันก็ลดลงแล้ว',
      },
      {
        type: 'practice',
        title: 'จับคู่ความรู้สึกกับสถานการณ์',
        body: 'ลองนึกถึงเรื่องที่เกิดขึ้นวันนี้ แล้วเลือกคำที่ใกล้เคียงที่สุด',
        widget: 'emotion-wheel',
        config: {
          groups: [
            { name: 'เศร้า', words: ['ผิดหวัง', 'เหงา', 'น้อยใจ', 'ท้อ', 'หมดแรง'] },
            { name: 'โกรธ', words: ['หงุดหงิด', 'ไม่ยุติธรรม', 'ถูกละเมิด', 'รำคาญ'] },
            { name: 'กลัว', words: ['กังวล', 'ไม่มั่นใจ', 'กลัวผิดพลาด', 'ไม่ปลอดภัย'] },
            { name: 'ดี', words: ['โล่ง', 'ภูมิใจ', 'อบอุ่น', 'มีความหวัง'] },
          ],
        },
      },
      {
        type: 'reflect',
        title: 'สะท้อนตัวเอง',
        prompt: 'อารมณ์ที่เธอเจอบ่อยที่สุดในสัปดาห์นี้คืออะไร และมันมักเกิดตอนไหน',
      },
    ],
  },

  {
    id: 'communicate',
    title: 'พูดสิ่งที่คิดโดยไม่ทะเลาะ',
    emoji: '💬',
    minutes: 5,
    tags: ['การสื่อสาร'],
    goal: 'ใช้ประโยค "ฉันรู้สึก..." แทนการกล่าวโทษ',
    steps: [
      {
        type: 'read',
        title: 'สูตรประโยคที่ไม่จุดชนวน',
        body:
          'เปรียบเทียบสองประโยคนี้\n\n' +
          '❌ "เธอนี่เห็นแก่ตัวจริง ๆ"\n' +
          '✅ "ฉันรู้สึกน้อยใจ ตอนที่ไม่ได้ถูกชวนไปด้วย อยากให้บอกกันก่อนได้ไหม"\n\n' +
          'สูตรคือ: ฉันรู้สึก___ ตอนที่___ อยากให้___',
      },
      {
        type: 'practice',
        title: 'ลองแปลงประโยค',
        body: 'ลองเขียนประโยคของเธอเองด้วยสูตรด้านบน สำหรับเรื่องที่ค้างคาใจอยู่',
        widget: 'i-message',
      },
      {
        type: 'quiz',
        title: 'ทบทวน',
        body: 'ประโยคไหนมีโอกาสได้รับการรับฟังมากที่สุด',
        options: [
          { id: 'a', text: '"เธอไม่เคยฟังฉันเลย"', correct: false, feedback: 'คำว่า "ไม่เคย" มักทำให้อีกฝ่ายตั้งการ์ดทันที' },
          { id: 'b', text: '"ฉันรู้สึกไม่ถูกรับฟัง ตอนที่พูดแล้วถูกขัด"', correct: true, feedback: 'ใช่ พูดถึงความรู้สึกและเหตุการณ์ โดยไม่ตัดสินตัวตนของอีกฝ่าย' },
          { id: 'c', text: 'เงียบแล้วเก็บไว้', correct: false, feedback: 'เงียบช่วยเลี่ยงการปะทะได้ชั่วคราว แต่ปัญหายังอยู่และมักสะสม' },
        ],
      },
    ],
  },

  {
    id: 'conflict',
    title: 'คลี่คลายความขัดแย้ง',
    emoji: '🤝',
    minutes: 5,
    tags: ['แก้ความขัดแย้ง'],
    goal: 'มีขั้นตอนที่ใช้ได้จริงเมื่อทะเลาะกับเพื่อน',
    steps: [
      {
        type: 'read',
        title: '4 ขั้นตอน STOP',
        body:
          'S — Stop: หยุดก่อน อย่าตอบตอนกำลังเดือด รอ 10 นาทีเป็นอย่างน้อย\n' +
          'T — Think: เรื่องนี้จริง ๆ แล้วเราต้องการอะไร\n' +
          'O — Options: มีทางเลือกอะไรบ้างนอกจากเอาชนะ\n' +
          'P — Pick: เลือกทางที่เราจะไม่เสียใจในอีกหนึ่งสัปดาห์',
      },
      {
        type: 'read',
        title: 'เส้นที่ต้องขอความช่วยเหลือ',
        body:
          'ความขัดแย้งบางแบบไม่ควรแก้เอง ให้บอกครูทันทีเมื่อ:\n\n' +
          '• มีการทำร้ายร่างกาย หรือขู่ว่าจะทำร้าย\n' +
          '• มีอาวุธเข้ามาเกี่ยว\n' +
          '• มีการข่มขู่ รีดไถ หรือคุกคามทางเพศ\n' +
          '• มีคนหลายคนรุมคนเดียวซ้ำ ๆ\n\n' +
          'การบอกครูในกรณีเหล่านี้ไม่ใช่การฟ้อง แต่คือการทำให้ทุกคนปลอดภัย',
      },
      {
        type: 'reflect',
        title: 'ลองใช้ STOP',
        prompt: 'นึกถึงเรื่องที่ยังค้างใจกับใครสักคน ถ้าใช้ STOP เธอจะเลือกทำอะไร',
      },
    ],
  },

  {
    id: 'bullying',
    title: 'เมื่อถูกรังแก',
    emoji: '🛡️',
    minutes: 6,
    tags: ['รับมือ bullying'],
    goal: 'รู้ว่าอะไรคือการรังแก และมีขั้นตอนที่ปลอดภัยในการรับมือ',
    steps: [
      {
        type: 'read',
        title: 'แยกให้ออกว่าอะไรคือการรังแก',
        body:
          'การรังแก (bullying) มี 3 อย่างประกอบกัน:\n\n' +
          '1. ตั้งใจทำให้เจ็บ ทั้งกายหรือใจ\n' +
          '2. เกิดซ้ำ ๆ ไม่ใช่ครั้งเดียว\n' +
          '3. มีอำนาจไม่เท่ากัน เช่น มากกว่า แรงกว่า หรือมีพวกมากกว่า\n\n' +
          'การล้อกันเล่นที่ทุกฝ่ายสนุกด้วยกันจริง ๆ ไม่ใช่การรังแก ' +
          'แต่ถ้ามีคนหนึ่งบอกให้หยุดแล้วยังไม่หยุด — นั่นคือการรังแก',
      },
      {
        type: 'read',
        title: 'สิ่งที่ทำได้ตอนนี้',
        body:
          '• เก็บหลักฐาน: แคปหน้าจอ จดวันเวลา สถานที่ ใครอยู่ตรงนั้นบ้าง\n' +
          '• อย่าตอบโต้ทางเดียวกัน เพราะมักถูกกลับมาใช้เล่นงานเรา\n' +
          '• อยู่ในที่ที่มีคนอื่น หลีกเลี่ยงพื้นที่ลับตา\n' +
          '• บอกผู้ใหญ่อย่างน้อยหนึ่งคน แม้จะเคยบอกแล้วไม่มีอะไรเปลี่ยน — ให้บอกอีกคน\n' +
          '• จำไว้ว่าไม่ใช่ความผิดของเธอ ไม่ว่าใครจะพูดว่าอย่างไร',
      },
      {
        type: 'quiz',
        title: 'ทบทวน',
        body: 'ถ้าถูกด่าในกลุ่มแชตทุกวันมาสองเดือน ควรทำอย่างไรก่อน',
        options: [
          { id: 'a', text: 'ด่ากลับให้หนักกว่า', correct: false, feedback: 'มักทำให้บานปลาย และเราอาจกลายเป็นผู้ถูกกล่าวหาเสียเอง' },
          { id: 'b', text: 'เก็บหลักฐานแล้วบอกผู้ใหญ่ที่ไว้ใจ', correct: true, feedback: 'ใช่ หลักฐานทำให้ผู้ใหญ่ช่วยได้ตรงจุดและเร็วขึ้น' },
          { id: 'c', text: 'ออกจากกลุ่มแล้วไม่บอกใคร', correct: false, feedback: 'ออกจากกลุ่มช่วยลดการเจอได้ แต่เรื่องมักไม่จบ และเราจะยังอยู่คนเดียว' },
        ],
      },
      {
        type: 'read',
        title: 'ถ้าเราเผลอเป็นฝ่ายทำเอง',
        body:
          'บางครั้งเราก็เป็นคนที่ทำให้คนอื่นเจ็บโดยไม่ตั้งใจ หรือทำตามเพื่อน ' +
          'การยอมรับและหยุดตั้งแต่วันนี้มีค่ามาก\n\n' +
          'สิ่งที่ช่วยได้: หยุดทันที ขอโทษอย่างจริงใจโดยไม่แก้ตัว ' +
          'และถ้ารู้สึกว่าหยุดเองไม่ได้ ให้บอกครูแนะแนว — ระบบนี้มีไว้ช่วย ไม่ได้มีไว้ลงโทษ',
      },
    ],
  },

  {
    id: 'help-friend',
    title: 'ช่วยเพื่อนอย่างปลอดภัย',
    emoji: '🫂',
    minutes: 6,
    tags: ['ช่วยเพื่อน'],
    goal: 'รู้ว่าจะฟังเพื่อนอย่างไร และเมื่อไหร่ที่ต้องบอกผู้ใหญ่',
    steps: [
      {
        type: 'read',
        title: 'กฎข้อเดียวที่สำคัญที่สุด',
        body:
          '❗ อย่ารับปากว่าจะเก็บเป็นความลับ ถ้าเรื่องนั้นเกี่ยวกับความปลอดภัยหรือชีวิต\n\n' +
          'พูดแบบนี้ได้: "เราจะอยู่ข้าง ๆ นาย แต่ถ้าเป็นเรื่องที่นายอาจไม่ปลอดภัย ' +
          'เราจะต้องบอกผู้ใหญ่ เพราะเราไม่อยากเสียนายไป"\n\n' +
          'การบอกผู้ใหญ่ไม่ใช่การหักหลังเพื่อน แต่คือการที่เราคนเดียวแบกไม่ไหว — และไม่ควรต้องแบกคนเดียว',
      },
      {
        type: 'read',
        title: 'ฟังอย่างไรให้ช่วยได้จริง',
        body:
          'ทำ:\n' +
          '• อยู่ด้วยเงียบ ๆ ก็ช่วยได้\n' +
          '• ถามว่า "ตอนนี้เป็นยังไงบ้าง" แล้วรอฟังจริง ๆ\n' +
          '• พูดว่า "ขอบคุณที่เล่าให้ฟัง" และ "มันหนักจริง ๆ นะ"\n\n' +
          'ไม่ทำ:\n' +
          '• อย่ารีบให้คำแนะนำ หรือบอกว่า "คิดมากไปเอง"\n' +
          '• อย่าเปรียบเทียบว่าคนอื่นแย่กว่า\n' +
          '• อย่าโพสต์หรือเล่าต่อให้คนอื่นฟัง',
      },
      {
        type: 'read',
        title: 'สัญญาณที่ต้องบอกผู้ใหญ่ทันที',
        body:
          '• พูดถึงการตาย การหายไป หรือไม่อยากมีชีวิตอยู่\n' +
          '• มีร่องรอยการทำร้ายตัวเอง\n' +
          '• แจกของสำคัญ หรือพูดจาเหมือนบอกลา\n' +
          '• บอกว่าถูกทำร้ายที่บ้าน หรือถูกล่วงละเมิด\n' +
          '• พูดว่าจะทำร้ายคนอื่น หรือมีอาวุธ\n\n' +
          'ในเมนู "เป็นห่วงเพื่อน" เธอแจ้งได้โดยไม่ต้องบอกชื่อตัวเอง',
      },
      {
        type: 'quiz',
        title: 'ทบทวน',
        body: 'เพื่อนบอกว่า "อย่าบอกใครนะ เราแค่ไม่อยากตื่นมาอีกแล้ว" ควรทำอย่างไร',
        options: [
          { id: 'a', text: 'รับปากว่าจะไม่บอกใคร', correct: false, feedback: 'สัญญาแบบนี้ทำให้เราติดกับ และเพื่อนอาจไม่ได้รับการช่วยเหลือทัน' },
          { id: 'b', text: 'อยู่กับเพื่อน แล้วบอกผู้ใหญ่ที่ไว้ใจโดยเร็วที่สุด', correct: true, feedback: 'ใช่ นี่คือสัญญาณที่ต้องมีผู้ใหญ่เข้ามาช่วยทันที' },
          { id: 'c', text: 'เปลี่ยนเรื่องคุยเพื่อให้เพื่อนอารมณ์ดีขึ้น', correct: false, feedback: 'ความหวังดี แต่ไม่พอ เรื่องนี้เกินกำลังของเพื่อนคนเดียว' },
        ],
      },
    ],
  },

  {
    id: 'ask-for-help',
    title: 'ขอความช่วยเหลือเป็น',
    emoji: '🙋',
    minutes: 4,
    tags: ['ขอความช่วยเหลือ'],
    goal: 'รู้ว่าจะเริ่มประโยคแรกอย่างไร และจะขอกับใคร',
    steps: [
      {
        type: 'read',
        title: 'ประโยคแรกยากที่สุด — เตรียมไว้ก่อนได้',
        body:
          'ลองใช้ประโยคสำเร็จรูปเหล่านี้ได้เลย\n\n' +
          '• "ครูครับ/ค่ะ ผม/หนูมีเรื่องอยากคุยด้วย ขอเวลาสัก 10 นาทีได้ไหม"\n' +
          '• "ช่วงนี้หนูไม่ค่อยโอเค ไม่รู้จะเริ่มยังไงดี"\n' +
          '• "หนูอยากให้ครูช่วย แต่ยังไม่อยากให้ใครรู้ทั้งหมด"\n\n' +
          'ไม่ต้องเล่าให้ครบในครั้งแรกก็ได้ เริ่มแค่บอกว่า "มีเรื่อง" ก็พอ',
      },
      {
        type: 'read',
        title: 'ถ้าบอกแล้วไม่มีอะไรเกิดขึ้น',
        body:
          'บางครั้งผู้ใหญ่คนแรกที่เราบอกอาจยุ่ง ฟังไม่ทัน หรือไม่เข้าใจ ' +
          'นั่นไม่ได้แปลว่าเรื่องของเราไม่สำคัญ\n\n' +
          'ให้บอกอีกคน — ครูแนะแนว ครูที่ปรึกษา พยาบาลโรงเรียน ญาติ หรือสายด่วน 1323 ' +
          'ที่คุยได้ตลอด 24 ชั่วโมงโดยไม่ต้องบอกชื่อ',
      },
      {
        type: 'practice',
        title: 'เลือกคนของเธอ',
        body: 'ลองนึกชื่อผู้ใหญ่ 2 คนที่เธอพอจะบอกได้ (ไม่ต้องเขียนลงระบบก็ได้ แค่นึกไว้ในใจ)',
        widget: 'trusted-adults',
      },
    ],
  },

  {
    id: 'sleep-focus',
    title: 'นอนหลับกับสมาธิ',
    emoji: '🌙',
    minutes: 4,
    tags: ['ดูแลตัวเอง'],
    goal: 'ปรับการนอนให้เป็นตัวช่วย ไม่ใช่ตัวปัญหา',
    steps: [
      {
        type: 'read',
        title: 'ทำไมการนอนถึงเกี่ยวกับอารมณ์',
        body:
          'สมองส่วนที่ควบคุมอารมณ์จะทำงานแย่ลงชัดเจนเมื่อนอนไม่พอ ' +
          'เรื่องเล็ก ๆ จะกลายเป็นเรื่องใหญ่ และเราจะหงุดหงิดง่ายขึ้นโดยไม่รู้ตัว\n\n' +
          'วัยรุ่นส่วนใหญ่ต้องการการนอนประมาณ 8–10 ชั่วโมง ซึ่งมากกว่าผู้ใหญ่',
      },
      {
        type: 'read',
        title: '3 อย่างที่เปลี่ยนได้คืนนี้',
        body:
          '1. วางโทรศัพท์ให้ไกลมือ 30 นาทีก่อนนอน (แสงและการเลื่อนจอทำให้สมองไม่ยอมพัก)\n' +
          '2. เข้านอนและตื่นเวลาใกล้เคียงกันทุกวัน รวมถึงวันหยุด\n' +
          '3. ถ้านอนไม่หลับเกิน 20 นาที ให้ลุกไปทำอะไรเงียบ ๆ แล้วค่อยกลับมานอน',
      },
      {
        type: 'reflect',
        title: 'ลองตั้งเป้าเล็ก ๆ',
        prompt: 'คืนนี้เธอจะลองเปลี่ยนอะไรหนึ่งอย่าง',
      },
    ],
  },

  {
    id: 'online-safety',
    title: 'ปลอดภัยในโลกออนไลน์',
    emoji: '📱',
    minutes: 5,
    tags: ['รับมือ bullying', 'ดูแลตัวเอง'],
    goal: 'รับมือกับการถูกคุกคามออนไลน์และการถูกกดดันให้ส่งรูป',
    steps: [
      {
        type: 'read',
        title: 'กฎ 3 ข้อของการถูกคุกคามออนไลน์',
        body:
          '1. อย่าลบหลักฐาน — แคปเก็บไว้ก่อน แล้วค่อยบล็อก\n' +
          '2. อย่าตอบโต้ในที่สาธารณะ — ยิ่งตอบ ยิ่งขยาย\n' +
          '3. บอกผู้ใหญ่ — ไม่ว่าจะอายแค่ไหน เรื่องนี้จัดการคนเดียวไม่ได้',
      },
      {
        type: 'read',
        title: 'ถ้าถูกขู่ด้วยรูปหรือคลิป',
        body:
          'ถ้ามีคนขู่ว่าจะปล่อยรูปของเธอ ไม่ว่าเธอจะเป็นคนส่งเองหรือไม่:\n\n' +
          '• เธอไม่ได้ทำผิด และเธอไม่ควรถูกโทษ\n' +
          '• อย่าจ่ายเงิน อย่าส่งรูปเพิ่ม เพราะการยอมมักทำให้ถูกเรียกร้องมากขึ้น\n' +
          '• เก็บหลักฐานทั้งหมด แล้วบอกผู้ใหญ่ทันที\n' +
          '• โทร 1300 หรือแจ้งครูแนะแนว — นี่เป็นเรื่องที่กฎหมายคุ้มครองเด็กดูแลอยู่',
      },
      {
        type: 'quiz',
        title: 'ทบทวน',
        body: 'มีคนแปลกหน้าทักมาชวนคุยแล้วขอรูป ควรทำอย่างไร',
        options: [
          { id: 'a', text: 'ส่งรูปธรรมดาไปก่อนพอเป็นมารยาท', correct: false, feedback: 'คนที่ตั้งใจหลอกมักเริ่มจากคำขอเล็ก ๆ ก่อนเสมอ' },
          { id: 'b', text: 'ไม่ส่ง แคปเก็บไว้ บล็อก และบอกผู้ใหญ่', correct: true, feedback: 'ใช่ ครบทั้งการป้องกันตัวและการมีคนช่วย' },
          { id: 'c', text: 'บล็อกเงียบ ๆ แล้วไม่บอกใคร', correct: false, feedback: 'ดีกว่าไม่ทำอะไร แต่คนนั้นอาจไปทำแบบเดียวกันกับคนอื่นต่อ' },
        ],
      },
    ],
  },
];

function getModule(id) {
  return lifeskillModules.find((m) => m.id === id) ?? null;
}

/** แนะนำโมดูลตามสิ่งที่นักเรียนบอกมา (ไม่ใช่การรักษา เป็นแค่การจัดลำดับเนื้อหา) */
function recommendModules(contextTags = [], domains = {}) {
  const picks = new Set();
  const tag = (t) => contextTags.some((x) => x.endsWith(`:${t}`));

  if (tag('bullying') || (domains.bullying ?? 0) >= 1) { picks.add('bullying'); picks.add('online-safety'); }
  if ((domains.mood ?? 0) >= 1 || (domains.anxiety ?? 0) >= 1) { picks.add('stress-basics'); picks.add('emotion-naming'); }
  if ((domains.sleep ?? 0) >= 1) picks.add('sleep-focus');
  if ((domains.support ?? 0) >= 1) picks.add('ask-for-help');
  if (tag('friend') || tag('study')) picks.add('communicate');
  if ((domains.home ?? 0) >= 1) picks.add('ask-for-help');

  // ให้ทุกคนได้อย่างน้อย 3 โมดูล
  for (const m of ['stress-basics', 'communicate', 'help-friend']) {
    if (picks.size >= 3) break;
    picks.add(m);
  }
  return [...picks].slice(0, 4);
}

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/content/help.js
// ─────────────────────────────────────────────────────────────

/**
 * ช่องทางขอความช่วยเหลือ — แสดงได้ทุกหน้าจอ ไม่ต้องล็อกอิน
 * ตรวจสอบเบอร์เหล่านี้กับหน่วยงานอีกครั้งก่อนใช้จริง และแก้ไขเบอร์ของโรงเรียนให้ถูกต้อง
 */

const helplines = [
  {
    id: 'dmh1323',
    name: 'สายด่วนสุขภาพจิต 1323',
    phone: '1323',
    org: 'กรมสุขภาพจิต กระทรวงสาธารณสุข',
    hours: 'ตลอด 24 ชั่วโมง',
    for: 'เครียด เศร้า วิตกกังวล คิดทำร้ายตัวเอง อยากปรึกษา',
    priority: 1,
  },
  {
    id: 'emergency1669',
    name: 'การแพทย์ฉุกเฉิน 1669',
    phone: '1669',
    org: 'สถาบันการแพทย์ฉุกเฉินแห่งชาติ',
    hours: 'ตลอด 24 ชั่วโมง',
    for: 'มีอันตรายต่อชีวิตเฉพาะหน้า บาดเจ็บ หมดสติ',
    priority: 1,
  },
  {
    id: 'police191',
    name: 'ตำรวจ 191',
    phone: '191',
    org: 'สำนักงานตำรวจแห่งชาติ',
    hours: 'ตลอด 24 ชั่วโมง',
    for: 'มีอันตรายเฉพาะหน้า ถูกทำร้าย',
    priority: 1,
  },
  {
    id: 'social1300',
    name: 'ศูนย์ช่วยเหลือสังคม 1300',
    phone: '1300',
    org: 'กระทรวงการพัฒนาสังคมและความมั่นคงของมนุษย์',
    hours: 'ตลอด 24 ชั่วโมง',
    for: 'ถูกทำร้ายในครอบครัว ล่วงละเมิด ไม่มีที่พึ่ง คุ้มครองเด็ก',
    priority: 2,
  },
  {
    id: 'childline1387',
    name: 'สายเด็ก 1387',
    phone: '1387',
    org: 'มูลนิธิสายเด็ก (Childline Thailand)',
    hours: 'ตามเวลาให้บริการของมูลนิธิ',
    for: 'เด็กและเยาวชนที่อยากปรึกษาเรื่องใดก็ได้',
    priority: 2,
  },
  {
    id: 'samaritans',
    name: 'สะมาริตันส์แห่งประเทศไทย',
    phone: '02-713-6791',
    org: 'สมาคมสะมาริตันส์แห่งประเทศไทย',
    hours: 'ตามเวลาให้บริการของสมาคม',
    for: 'รับฟังเมื่อรู้สึกสิ้นหวัง อยากมีคนคุยด้วย',
    priority: 3,
  },
];

/** ข้อความสำหรับหน้าจอวิกฤต — ต้องอ่านง่ายและไม่ตัดสิน */
const crisisScreen = {
  title: 'เธอไม่ได้อยู่คนเดียว',
  body:
    'ความรู้สึกแบบนี้หนักมาก และมันไม่ได้แปลว่าเธออ่อนแอ ' +
    'ตอนนี้มีคนพร้อมคุยกับเธอทันที โทรได้เลย ฟรี และไม่ต้องบอกชื่อก็ได้',
  steps: [
    'ถ้าตอนนี้ไม่ปลอดภัย ให้ไปอยู่ใกล้คนอื่น หรือโทร 1669 / 191',
    'โทร 1323 คุยกับผู้เชี่ยวชาญได้ตลอด 24 ชั่วโมง',
    'บอกผู้ใหญ่ที่เธอไว้ใจอย่างน้อยหนึ่งคน ในหรือนอกโรงเรียนก็ได้',
    'ถ้ามีของที่อาจใช้ทำร้ายตัวเองอยู่ใกล้ตัว ให้เอาออกไปให้ไกล หรือขอให้คนอื่นเก็บไว้',
  ],
  footer: 'ครูที่ดูแลเรื่องนี้ได้รับเรื่องของเธอแล้ว และจะติดต่อกลับโดยเร็วที่สุด',
};

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/engine/version.js
// ─────────────────────────────────────────────────────────────

/**
 * เวอร์ชันของกลไกประเมิน — บันทึกลงทุก assessment
 * ถ้าแก้กฎ ต้องขึ้นเวอร์ชัน เพื่อให้ย้อนดูได้ว่าเคสเก่าถูกประเมินด้วยกฎชุดไหน
 */
const ENGINE_VERSION = 'rules-1.0.0';

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/engine/lexicon.js
// ─────────────────────────────────────────────────────────────

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
function scanText(text) {
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

const LEXICON_CATEGORIES = CATEGORIES.map(({ code, label, severity }) => ({ code, label, severity }));

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/engine/assess.js
// ─────────────────────────────────────────────────────────────

/**
 * ขั้นที่ 4: Assess — จัดข้อมูลตามบริบท
 *
 * ระบบไม่ได้ "ให้คะแนนความเสี่ยงของเด็ก" แต่จัดข้อมูลที่นักเรียนบอกมา
 * ลงในมิติที่เอกสารวิชาการใช้พิจารณา (ความรุนแรง ระยะเวลา ความถี่ ผลกระทบ
 * การมีคนช่วย แนวโน้ม ความปลอดภัย ปัจจัยปกป้อง)
 *
 * concernIndex เป็นเพียง "ตัวช่วยจัดลำดับคิว" ไม่ใช่คำตัดสิน
 * การตัดสินระดับการดำเนินการอยู่ใน triage.js ซึ่งใช้กฎที่อธิบายได้ทีละข้อ
 */


const DIMENSIONS = [
  { key: 'severity',   label: 'ความรุนแรง',        weight: 0.24 },
  { key: 'impact',     label: 'ผลกระทบต่อชีวิต',   weight: 0.18 },
  { key: 'frequency',  label: 'ความถี่',            weight: 0.14 },
  { key: 'duration',   label: 'ระยะเวลา',           weight: 0.12 },
  { key: 'isolation',  label: 'การขาดคนช่วยเหลือ', weight: 0.12 },
  { key: 'trajectory', label: 'แนวโน้มแย่ลง',      weight: 0.10 },
  { key: 'safety',     label: 'ความปลอดภัยปัจจุบัน', weight: 0.10 },
];

const CONTACT_ITEMS = ['c_help', 'd_help', 's_talk'];

/** ชื่อโดเมนเป็นภาษาไทย — ใช้เมื่อแสดงเหตุผลให้บุคลากรอ่าน (ห้ามให้รหัสภายในหลุดออกหน้าจอ) */
const DOMAIN_LABELS = {
  mood: 'อารมณ์เศร้า',
  anxiety: 'ความวิตกกังวล',
  sleep: 'การนอน',
  school: 'การเรียน',
  bullying: 'การถูกรังแก',
  support: 'การขาดคนช่วยเหลือ',
  home: 'เรื่องที่บ้าน',
  safety: 'ความปลอดภัย',
  context: 'เรื่องที่แจ้งเข้ามา',
};

const domainLabel = (key) => DOMAIN_LABELS[key] ?? key;

/**
 * @param {object} input
 * @param {Array}  input.items    ข้อที่ถูกแสดงจริง
 * @param {object} input.answers
 * @param {Array}  [input.history] assessment ก่อนหน้า (ใหม่→เก่า) รูปแบบจาก DB
 */
function assess({ items, answers, history = [] }) {
  const byFacet = {};
  const domains = {};
  const criticalAnswers = [];
  const freeText = [];

  for (const item of items) {
    const raw = answers[item.id];

    if (item.type === 'text') {
      if (typeof raw === 'string' && raw.trim()) freeText.push(raw.trim());
      continue;
    }
    if (item.type === 'multi') {
      // ตัวเลือกหลายข้อไม่ให้คะแนนตรง ๆ แต่ใช้เป็นบริบท (ดู contextTags)
      continue;
    }
    if (raw === undefined || raw === null || raw === '') continue;

    const num = Number(raw);
    if (Number.isNaN(num)) continue;

    const maxVal = maxOptionValue(item);
    let concern = item.reverse ? maxVal - num : num;
    concern = clamp(scale3(concern, maxVal), 0, 3);

    const facet = item.facet || 'severity';
    (byFacet[facet] ??= []).push({ id: item.id, concern, weight: item.weight ?? 1 });

    // บางข้อมีค่าเป็นตัวเลขแต่ไม่ได้แปลว่า "รุนแรงกว่า" (เช่น ความสดของเหตุการณ์)
    if (item.domain && item.domain !== 'freetext' && item.domain !== 'help' && !item.noDomainScore) {
      domains[item.domain] = Math.max(domains[item.domain] ?? 0, concern);
    }
    if (item.critical && concern >= 2) {
      criticalAnswers.push({ itemId: item.id, text: item.text, concern });
    }
  }

  // ── มิติบริบท ──────────────────────────────────────────────────
  const dim = {
    severity: facetMax(byFacet.severity),
    impact: facetMax(byFacet.impact),
    frequency: facetMax(byFacet.frequency),
    duration: facetMax(byFacet.duration),
    isolation: facetMax(byFacet.support),
    safety: facetMax(byFacet.safety),
    trajectory: facetMax(byFacet.trajectory),
    protective: 0,
  };
  dim.protective = 3 - dim.isolation;

  // ── สัญญาณจากข้อความอิสระ ──────────────────────────────────────
  const lexicon = scanText(freeText.join('\n'));
  if (lexicon.maxSeverity === 'CRITICAL') dim.safety = Math.max(dim.safety, 3);
  else if (lexicon.maxSeverity === 'HIGH') dim.safety = Math.max(dim.safety, 2);

  // ── แนวโน้ม เทียบกับครั้งก่อน ──────────────────────────────────
  const acuteNow = dim.severity + dim.impact + dim.frequency;
  const prev = history[0] ? parseDims(history[0]) : null;
  let historyInfo = { previousIndex: null, delta: null, consecutiveElevated: 0 };

  if (prev) {
    const acutePrev = prev.severity + prev.impact + prev.frequency;
    const jump = acuteNow - acutePrev;
    const computed = jump >= 4 ? 3 : jump >= 3 ? 2 : jump >= 2 ? 1 : 0;
    dim.trajectory = Math.max(dim.trajectory, computed);
    historyInfo.previousIndex = history[0].concern_index ?? null;
  }
  historyInfo.consecutiveElevated = countConsecutiveElevated(history, dim);

  // ── ดัชนีความห่วงใย (ใช้จัดลำดับคิว) ──────────────────────────
  let base = 0;
  for (const d of DIMENSIONS) base += (dim[d.key] / 3) * d.weight;
  base *= 100;

  // ปัจจัยปกป้องลดดัชนีได้เล็กน้อย และ "ห้าม" ลดเมื่อมีสัญญาณความปลอดภัย
  let relief = 0;
  if (dim.safety === 0 && dim.severity <= 1 && lexicon.maxSeverity === null) {
    relief = (dim.protective / 3) * 8;
  }
  const concernIndex = Math.round(clamp(base - relief, 0, 100));

  if (historyInfo.previousIndex !== null) {
    historyInfo.delta = concernIndex - historyInfo.previousIndex;
  }

  const elevatedDomains = Object.entries(domains).filter(([, v]) => v >= 2).map(([k]) => k);

  return {
    dimensions: dim,
    domains,
    elevatedDomains,
    concernIndex,
    lexicon,
    freeTextLength: freeText.join(' ').length,
    criticalAnswers,
    contextTags: collectMulti(items, answers),
    wantsContact: readContactPreference(answers),
    history: historyInfo,
  };
}

// ─────────────────────────── ตัวช่วย ───────────────────────────

function maxOptionValue(item) {
  if (!Array.isArray(item.options) || !item.options.length) return 3;
  const nums = item.options.map((o) => Number(o.value)).filter((n) => !Number.isNaN(n));
  return nums.length ? Math.max(...nums) : 3;
}

/** ปรับสเกลใด ๆ ให้อยู่ในช่วง 0..3 */
function scale3(value, maxVal) {
  if (!maxVal || maxVal === 3) return value;
  return (value / maxVal) * 3;
}

function facetMax(list) {
  if (!list?.length) return 0;
  return Math.round(Math.max(...list.map((x) => Math.min(3, x.concern * (x.weight ?? 1)))));
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function parseDims(row) {
  try {
    const d = typeof row.dimensions_json === 'string' ? JSON.parse(row.dimensions_json) : row.dimensions_json;
    return { severity: d?.severity ?? 0, impact: d?.impact ?? 0, frequency: d?.frequency ?? 0, safety: d?.safety ?? 0 };
  } catch {
    return { severity: 0, impact: 0, frequency: 0, safety: 0 };
  }
}

/** นับว่ามีสัญญาณต่อเนื่องกี่ครั้งติดกัน (รวมครั้งนี้) */
function countConsecutiveElevated(history, current) {
  let n = current.severity >= 2 || current.safety >= 1 ? 1 : 0;
  if (!n) return 0;
  for (const row of history) {
    const d = parseDims(row);
    if (d.severity >= 2 || d.safety >= 1) n += 1;
    else break;
  }
  return n;
}

function collectMulti(items, answers) {
  const tags = [];
  for (const item of items) {
    if (item.type !== 'multi') continue;
    const v = answers[item.id];
    if (Array.isArray(v)) tags.push(...v.filter((x) => x && x !== 'none').map((x) => `${item.domain}:${x}`));
  }
  return [...new Set(tags)];
}

function readContactPreference(answers) {
  for (const id of CONTACT_ITEMS) {
    const v = answers[id];
    if (v === 'yes') return 'yes';
  }
  for (const id of CONTACT_ITEMS) {
    const v = answers[id];
    if (v === 'maybe' || v === 'later') return 'maybe';
  }
  return 'no';
}

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/engine/validate.js
// ─────────────────────────────────────────────────────────────

/**
 * ขั้นที่ 3: Validate — ตรวจ "คุณภาพของข้อมูล" ไม่ใช่ตรวจว่านักเรียนโกหก
 *
 * เป้าหมายเดียว: ตอบให้ได้ว่า "ข้อมูลชุดนี้พอจะสรุปอะไรได้แค่ไหน"
 * ผลลัพธ์ที่สำคัญที่สุดคือ dataSufficiency = INSUFFICIENT
 * ซึ่งแปลว่า "ข้อมูลยังไม่เพียงพอสำหรับการสรุป" — ไม่ใช่ "นักเรียนปกติ"
 */

const RAPID_MS_PER_ITEM = 700;      // เร็วกว่านี้ แปลว่าอาจกดผ่านโดยไม่ได้อ่าน
const UNIFORM_MIN_ITEMS = 6;        // ต้องมีอย่างน้อยเท่านี้ถึงจะบอกว่า "ตอบเหมือนกันหมด"
const UNIFORM_MS_PER_ITEM = 1200;

const isAnswered = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/**
 * @param {object} input
 * @param {Array}  input.items       ข้อคำถามที่ "ถูกแสดงจริง" ในครั้งนี้
 * @param {object} input.answers     { itemId: value }
 * @param {object} [input.timings]   { itemId: ms }
 * @param {number} [input.durationMs]
 * @param {Array}  [input.pairs]     consistencyPairs ที่รวมจากทุก template ที่แสดง
 * @param {Array}  [input.required]  itemId ที่ถ้าไม่ตอบ ถือว่าข้อมูลไม่พอ
 * @param {Array}  [input.history]   assessment ก่อนหน้า (ใหม่→เก่า)
 */
function validate({ items, answers, timings = {}, durationMs = 0, pairs = [], required = [], history = [] }) {
  const flags = [];
  const notes = [];

  const scored = items.filter((i) => i.type !== 'text');
  const answeredIds = scored.filter((i) => isAnswered(answers[i.id])).map((i) => i.id);
  const completeness = scored.length ? answeredIds.length / scored.length : 0;

  // ── 1. ความครบถ้วน ──────────────────────────────────────────────
  const missingRequired = required.filter((id) => !isAnswered(answers[id]));
  if (missingRequired.length) {
    flags.push('MISSING_KEY_ITEMS');
    notes.push({ code: 'MISSING_KEY_ITEMS', message: `ยังไม่ได้ตอบข้อสำคัญ ${missingRequired.length} ข้อ`, items: missingRequired });
  }
  if (completeness < 0.7) {
    flags.push('LOW_COMPLETENESS');
    notes.push({ code: 'LOW_COMPLETENESS', message: `ตอบเพียง ${Math.round(completeness * 100)}% ของข้อทั้งหมด` });
  }

  // ── 2. ความเร็วในการตอบ ─────────────────────────────────────────
  const times = answeredIds.map((id) => timings[id]).filter((t) => typeof t === 'number' && t > 0);
  const medianTime = median(times);
  const perItem = times.length >= 3
    ? medianTime
    : (durationMs && scored.length ? durationMs / scored.length : null);

  if (perItem !== null && perItem < RAPID_MS_PER_ITEM && answeredIds.length >= 4) {
    flags.push('RAPID_RESPONDING');
    notes.push({
      code: 'RAPID_RESPONDING',
      message: `ตอบเร็วผิดปกติ (เฉลี่ย ${Math.round(perItem)} มิลลิวินาทีต่อข้อ) — อาจยังไม่ได้อ่านคำถาม`,
    });
  }

  // ── 3. ตอบค่าเดียวกันทั้งชุด ────────────────────────────────────
  const scaleAnswers = scored
    .filter((i) => i.type === 'scale' && isAnswered(answers[i.id]))
    .map((i) => Number(answers[i.id]));
  if (
    scaleAnswers.length >= UNIFORM_MIN_ITEMS &&
    new Set(scaleAnswers).size === 1 &&
    perItem !== null && perItem < UNIFORM_MS_PER_ITEM
  ) {
    flags.push('UNIFORM_RESPONDING');
    notes.push({ code: 'UNIFORM_RESPONDING', message: 'เลือกคำตอบเดียวกันทุกข้อและตอบเร็วมาก' });
  }

  // ── 4. ความสอดคล้องระหว่างข้อ ───────────────────────────────────
  for (const pair of pairs) {
    const a = answers[pair.a];
    const b = answers[pair.b];
    if (!isAnswered(a) || !isAnswered(b)) continue;
    const na = Number(a); const nb = Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) continue;

    let violated = false;
    if (pair.rule === 'similar') violated = Math.abs(na - nb) > (pair.tolerance ?? 2);
    else if (pair.rule === 'notLowerThan') violated = na > 0 && nb === 0;

    if (violated) {
      flags.push('INCONSISTENT');
      notes.push({
        code: 'INCONSISTENT',
        message: `คำตอบข้อ ${pair.a} กับ ${pair.b} ไม่สอดคล้องกัน${pair.note ? ` (${pair.note})` : ''}`,
        items: [pair.a, pair.b],
      });
    }
  }

  // ── 5. เปรียบเทียบกับครั้งก่อน ──────────────────────────────────
  let trend = null;
  if (history.length === 0) {
    flags.push('FIRST_SUBMISSION');
    notes.push({ code: 'FIRST_SUBMISSION', message: 'ยังไม่มีข้อมูลครั้งก่อนไว้เปรียบเทียบ' });
  } else {
    const prev = history[0];
    const delta = null; // คำนวณจริงใน assess.js ซึ่งรู้ค่า concernIndex ปัจจุบัน
    trend = { previousIndex: prev.concern_index ?? prev.concernIndex ?? null, delta };
  }

  // ── สรุประดับความเพียงพอของข้อมูล ───────────────────────────────
  const qualityFlags = flags.filter((f) =>
    ['RAPID_RESPONDING', 'UNIFORM_RESPONDING', 'INCONSISTENT'].includes(f));

  let dataSufficiency = 'SUFFICIENT';
  if (missingRequired.length > 0 || completeness < 0.7 || qualityFlags.length >= 2) {
    dataSufficiency = 'INSUFFICIENT';
  } else if (completeness < 0.9 || qualityFlags.length === 1 || flags.includes('FIRST_SUBMISSION')) {
    dataSufficiency = 'LIMITED';
  }

  return {
    completeness: Number(completeness.toFixed(2)),
    answeredCount: answeredIds.length,
    scoredCount: scored.length,
    medianItemMs: medianTime,
    flags: [...new Set(flags)],
    notes,
    trend,
    dataSufficiency,
    /** ข้อความที่ต้องใช้เวลาแสดงผล — ห้ามเปลี่ยนเป็นคำว่า "ปกติ" */
    label:
      dataSufficiency === 'INSUFFICIENT'
        ? 'ข้อมูลยังไม่เพียงพอสำหรับการสรุป'
        : dataSufficiency === 'LIMITED'
          ? 'ข้อมูลพอใช้ได้ แต่ยังมีข้อจำกัด'
          : 'ข้อมูลครบถ้วนพอสำหรับการพิจารณาเบื้องต้น',
  };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/engine/triage.js
// ─────────────────────────────────────────────────────────────

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


const LEVELS = {
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
function triage(ctx) {
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
function buildActionPlan(level, ctx) {
  return actionPlan(level, normalize(ctx));
}

/** ข้อความที่แสดงให้นักเรียนเห็นสำหรับระดับที่กำหนด */
function buildStudentMessage(level, ctx) {
  return studentMessage(level, normalize(ctx));
}

/** เปิดให้เอกสาร/หน้าแอดมินดึงไปแสดงได้ว่า "ระบบใช้กฎอะไรบ้าง" (ความโปร่งใส) */
function ruleBook() {
  return {
    rules: RULES.map(({ id, level, label }) => ({ id, level, label })),
    modifiers: MODIFIERS.map(({ id, label, effect }) => ({ id, label, effect })),
  };
}

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/engine/sla.js
// ─────────────────────────────────────────────────────────────

/**
 * ขั้นที่ 6: Intervene — คำนวณกำหนดเวลาที่ต้องดำเนินการ
 *
 * ระดับ 4 ใช้เวลานาฬิกาจริง (ความปลอดภัยรอเวลาราชการไม่ได้)
 * ระดับ 2–3 ใช้ "เวลาเรียน" (ข้ามเสาร์-อาทิตย์และนอกเวลาเรียน) เพื่อให้ SLA เป็นจริงได้
 */


const MS_MIN = 60 * 1000;
const OFFSET_MS = config.timezone * MS_MIN;

/** แปลง Date → รูปแบบเดียวกับ datetime('now') ของ SQLite (UTC) */
function toSqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function nowSql() {
  return toSqlDate(new Date());
}

function parseSql(value) {
  if (!value) return null;
  return new Date(`${String(value).replace(' ', 'T')}Z`);
}

/** เวลาท้องถิ่นของโรงเรียน (ใช้ตัดสินว่าอยู่ในเวลาเรียนไหม) */
function local(date) {
  return new Date(date.getTime() + OFFSET_MS);
}
function fromLocal(date) {
  return new Date(date.getTime() - OFFSET_MS);
}

function isSchoolDay(localDate) {
  const day = localDate.getUTCDay(); // 0 = อาทิตย์, 6 = เสาร์
  return day !== 0 && day !== 6;
}

function startOfSchoolDay(localDate) {
  const d = new Date(localDate);
  d.setUTCHours(config.schoolDayStartHour, 0, 0, 0);
  return d;
}
function endOfSchoolDay(localDate) {
  const d = new Date(localDate);
  d.setUTCHours(config.schoolDayEndHour, 0, 0, 0);
  return d;
}
function nextSchoolDayStart(localDate) {
  const d = new Date(localDate);
  d.setUTCDate(d.getUTCDate() + 1);
  let candidate = startOfSchoolDay(d);
  let guard = 0;
  while (!isSchoolDay(candidate) && guard++ < 14) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate = startOfSchoolDay(candidate);
  }
  return candidate;
}

/**
 * บวกเวลาโดยนับเฉพาะเวลาเรียน
 * @param {Date} from
 * @param {number} minutes
 */
function addSchoolMinutes(from, minutes) {
  let cursor = local(from);

  if (!isSchoolDay(cursor)) cursor = nextSchoolDayStart(cursor);
  else if (cursor < startOfSchoolDay(cursor)) cursor = startOfSchoolDay(cursor);
  else if (cursor >= endOfSchoolDay(cursor)) cursor = nextSchoolDayStart(cursor);

  let remaining = minutes;
  let guard = 0;
  while (remaining > 0 && guard++ < 200) {
    const availableToday = (endOfSchoolDay(cursor) - cursor) / MS_MIN;
    if (remaining <= availableToday) {
      cursor = new Date(cursor.getTime() + remaining * MS_MIN);
      remaining = 0;
    } else {
      remaining -= availableToday;
      cursor = nextSchoolDayStart(cursor);
    }
  }
  return fromLocal(cursor);
}

/**
 * คำนวณกำหนดเวลาของเคสตามระดับ
 * @returns {{acknowledgeDueAt: string, contactDueAt: string, nextFollowUpAt: string|null}}
 */
function computeDeadlines(level, actions, from = new Date()) {
  const ackMin = actions.acknowledgeWithinMinutes;
  const contactMin = actions.contactWithinMinutes;

  const wallClock = level === 4;
  const add = (minutes) =>
    wallClock ? new Date(from.getTime() + minutes * MS_MIN) : addSchoolMinutes(from, minutes);

  const firstFollowUpDays = actions.followUpDays?.[0] ?? null;

  return {
    acknowledgeDueAt: toSqlDate(add(ackMin ?? 24 * 60)),
    contactDueAt: toSqlDate(add(contactMin ?? 3 * 24 * 60)),
    nextFollowUpAt: firstFollowUpDays
      ? toSqlDate(new Date(from.getTime() + firstFollowUpDays * 24 * 60 * MS_MIN))
      : null,
  };
}

/** สถานะกำหนดเวลา ใช้ระบายสีในคิวของบุคลากร */
function slaStatus(dueAtSql, doneAtSql) {
  const due = parseSql(dueAtSql);
  if (!due) return 'none';
  const done = parseSql(doneAtSql);
  if (done) return done <= due ? 'met' : 'late';
  const now = Date.now();
  if (now > due.getTime()) return 'overdue';
  if (due.getTime() - now < 60 * MS_MIN) return 'due-soon';
  return 'on-track';
}

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/engine/followups.js
// ─────────────────────────────────────────────────────────────


/**
 * ขั้นที่ 2: Disclose — เงื่อนไขเปิดชุดคำถามเชิงลึก
 *
 * แยกออกมาเป็นโมดูลบริสุทธิ์ (ไม่พึ่ง express หรือฐานข้อมูล)
 * เพื่อให้ทั้งเซิร์ฟเวอร์จริงและโหมดสาธิตใช้เกณฑ์ชุดเดียวกัน — เกณฑ์จะได้ไม่แตกออกจากกัน
 *
 * หมายเหตุ: เกณฑ์ของชุด "ความปลอดภัย" ต่ำที่สุดโดยตั้งใจ (≥ 1 = "บางวัน")
 * เพราะยอมถามเกินดีกว่าพลาด
 */
function followUpTriggers(answers = {}) {
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

// ─────────────────────────────────────────────────────────────
// ที่มา: server/src/engine/index.js
// ─────────────────────────────────────────────────────────────

/**
 * กลไกประเมินของ CareAlert AI — จุดเข้าเดียว
 *
 * ลำดับการทำงาน: Validate → Assess → (LLM assist) → Triage → SLA
 * ทุกขั้นตอนบันทึกเหตุผลไว้ครบ เพื่อให้ตอบคำถามได้เสมอว่า "ทำไมเคสนี้ถึงเป็นระดับนี้"
 */








/**
 * @param {object} input
 * @param {'checkin'|'self_report'|'friend_report'|'staff_note'} input.source
 * @param {Array}  input.items      ข้อคำถามที่ถูกแสดงจริง
 * @param {object} input.answers
 * @param {object} [input.timings]
 * @param {number} [input.durationMs]
 * @param {Array}  [input.pairs]
 * @param {Array}  [input.required]
 * @param {Array}  [input.history]  assessment ก่อนหน้าของนักเรียนคนนี้ (ใหม่→เก่า)
 */
function runEngine(input) {
  const {
    source = 'checkin', items = [], answers = {},
    timings = {}, durationMs = 0, pairs = [], required = [], history = [],
  } = input;

  // ── 1. Validate ────────────────────────────────────────────────
  const validation = validate({ items, answers, timings, durationMs, pairs, required, history });

  // ── 2. Assess ──────────────────────────────────────────────────
  const assessment = assess({ items, answers, history });

  // ── 3. ตัวช่วยภาษา (ถ้าเปิดใช้) — ยกระดับได้อย่างเดียว ─────────
  let llm = null;
  const freeText = items
    .filter((i) => i.type === 'text')
    .map((i) => answers[i.id])
    .filter((v) => typeof v === 'string' && v.trim())
    .join('\n');

  if (llmEnabled() && freeText) {
    llm = analyzeText(freeText);
  }

  // ── 4. Triage ──────────────────────────────────────────────────
  const decision = triage({ ...assessment, validation, answers, source });

  let level = decision.level;
  const llmNote = [];
  if (llm && llm.suggestedMinLevel > level) {
    llmNote.push({
      id: 'LLM.RAISED',
      level: llm.suggestedMinLevel,
      label: 'ตัวช่วยภาษาเห็นสัญญาณที่คลังคำจับไม่ได้ จึงยกระดับขึ้น (ต้องให้มนุษย์อ่านข้อความจริง)',
      detail: llm.summary,
    });
    level = llm.suggestedMinLevel;
  }

  const raised = level !== decision.level;
  const ctx = { ...assessment, validation, answers, source };

  const finalLevelCode = raised ? LEVELS[level].code : decision.levelCode;
  const actions = raised ? buildActionPlan(level, ctx) : decision.actions;
  const message = raised ? buildStudentMessage(level, ctx) : decision.studentMessage;

  const deadlines = computeDeadlines(level, actions);

  return {
    engineVersion: ENGINE_VERSION,
    level,
    levelCode: finalLevelCode,
    levelInfo: LEVELS[level],
    concernIndex: assessment.concernIndex,
    dataSufficiency: validation.dataSufficiency,
    dimensions: assessment.dimensions,
    domains: assessment.domains,
    elevatedDomains: assessment.elevatedDomains,
    contextTags: assessment.contextTags,
    wantsContact: assessment.wantsContact,
    validation,
    lexicon: assessment.lexicon,
    llm,
    rationale: {
      matched: [...llmNote, ...decision.matched],
      modifiers: decision.modifiers,
      decidingRules: raised ? ['LLM.RAISED'] : decision.decidingRules,
      note:
        'ระดับนี้หมายถึง “ต้องดำเนินการอะไรต่อ” ไม่ใช่การวินิจฉัยโรค ' +
        'และไม่ใช่การทำนายพฤติกรรมของนักเรียน',
    },
    actions,
    deadlines,
    studentMessage: message,
    /** ธงที่ต้องให้มนุษย์อ่านข้อความต้นฉบับเอง */
    needsHumanRead:
      assessment.lexicon.hits.length > 0 ||
      !!llm ||
      validation.dataSufficiency === 'INSUFFICIENT',
  };
}