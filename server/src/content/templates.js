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

export const dailyCheckin = {
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

export const weeklyCheckin = {
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

export const followUps = {
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

export const selfReport = {
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

export const friendConcern = {
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

export const staffNote = {
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

export const templates = {
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

export function getTemplate(id) {
  return templates[id] || null;
}

/** รวมข้อจาก template หลัก + ชุดเชิงลึกทั้งหมด เพื่อใช้ตอนประเมิน */
export function allItemsById() {
  const map = new Map();
  for (const t of Object.values(templates)) {
    for (const item of t.items) map.set(item.id, { ...item, templateId: t.id });
  }
  return map;
}
