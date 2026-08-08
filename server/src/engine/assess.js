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

import { scanText } from './lexicon.js';

export const DIMENSIONS = [
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
export const DOMAIN_LABELS = {
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

export const domainLabel = (key) => DOMAIN_LABELS[key] ?? key;

/**
 * @param {object} input
 * @param {Array}  input.items    ข้อที่ถูกแสดงจริง
 * @param {object} input.answers
 * @param {Array}  [input.history] assessment ก่อนหน้า (ใหม่→เก่า) รูปแบบจาก DB
 */
export function assess({ items, answers, history = [] }) {
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
