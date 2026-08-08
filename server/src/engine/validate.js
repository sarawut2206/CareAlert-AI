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
export function validate({ items, answers, timings = {}, durationMs = 0, pairs = [], required = [], history = [] }) {
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
