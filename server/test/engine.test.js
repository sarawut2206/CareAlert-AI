/**
 * ชุดทดสอบกลไกประเมิน — ทดสอบ "กฎ" ล้วน ๆ โดยไม่แตะฐานข้อมูล
 * รันด้วย: npm test
 *
 * ชุดนี้คือหลักฐานว่ากฎทำงานตามที่เขียนไว้ในเอกสาร
 * ทุกครั้งที่แก้กฎ ต้องแก้/เพิ่มเทสต์ด้วยเสมอ
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runEngine } from '../src/engine/index.js';
import { weeklyCheckin, followUps, friendConcern, staffNote } from '../src/content/templates.js';
import { validate } from '../src/engine/validate.js';
import { scanText } from '../src/engine/lexicon.js';
import { computeDeadlines } from '../src/engine/sla.js';

const core = weeklyCheckin.items;
const opts = {
  pairs: weeklyCheckin.consistencyPairs,
  required: weeklyCheckin.requiredForSufficiency,
};

const wellAnswers = {
  c1: 0, c2: 0, c3: 1, c4: 0, c5: 1, c6: 0, c7: 3, c8: 0, c9: 0, c_help: 'no',
};

async function run(answers, extra = {}) {
  return runEngine({
    source: 'checkin', items: core, answers, history: [], ...opts, ...extra,
  });
}

// ─────────────────────────── ระดับ 1 ───────────────────────────

test('นักเรียนที่ตอบว่าโดยรวมดี → ระดับ 1 และไม่เปิดเคส', async () => {
  const r = await run(wellAnswers, { timings: fakeTimings(core, 3000) });
  assert.equal(r.level, 1);
  assert.equal(r.levelCode, 'L1');
  assert.equal(r.dataSufficiency, 'LIMITED'); // ครั้งแรกยังไม่มี baseline
});

// ─────────────────────────── ระดับ 4: ความปลอดภัย ───────────────────────────

test('ตอบว่ามีความคิดทำร้ายตัวเองเกือบทุกวัน → ระดับ 4', async () => {
  const r = await run({ ...wellAnswers, c9: 3 }, { timings: fakeTimings(core, 3000) });
  assert.equal(r.level, 4);
  assert.ok(r.rationale.decidingRules.includes('L4.SAFETY_NOW'));
});

test('ระบุว่าตอนนี้ไม่ปลอดภัยในชุดคำถามเชิงลึก → ระดับ 4', async () => {
  const items = [...core, ...followUps.safety.items];
  const r = await runEngine({
    source: 'checkin', items, history: [], ...opts,
    answers: { ...wellAnswers, c9: 1, s_freq: 1, s_plan: 0, s_past: 0, s_now: 3, s_who: 2, s_talk: 'yes' },
  });
  assert.equal(r.level, 4);
});

test('เคยลงมือทำร้ายตัวเองภายในเดือนนี้ → ระดับ 4 แม้ตอนนี้บอกว่าปลอดภัย', async () => {
  const items = [...core, ...followUps.safety.items];
  const r = await runEngine({
    source: 'checkin', items, history: [], ...opts,
    answers: { ...wellAnswers, c9: 1, s_now: 0, s_past: 3, s_talk: 'no' },
  });
  assert.equal(r.level, 4);
  assert.ok(r.rationale.decidingRules.includes('L4.SAFETY_PLAN'));
});

test('ข้อความอิสระที่มีสัญญาณร้ายแรง → ระดับ 4 แม้คะแนนข้ออื่นปกติ', async () => {
  const r = await run({ ...wellAnswers, c10: 'ช่วงนี้เหนื่อยมาก บางทีก็คิดว่าอยากตายไปเลย' });
  assert.equal(r.level, 4);
  assert.ok(r.needsHumanRead, 'ต้องติดธงให้มนุษย์อ่านข้อความต้นฉบับ');
});

test('ปัจจัยปกป้องสูง ห้ามลดระดับ 4 ลง', async () => {
  const r = await run({ ...wellAnswers, c7: 3, c9: 3 });
  assert.equal(r.level, 4);
  assert.equal(r.dimensions.protective, 3);
});

// ─────────────────────────── ระดับ 3 ───────────────────────────

test('ถูกรังแกต่อเนื่องและกระทบชีวิต → ระดับ 3', async () => {
  const items = [...core, ...followUps.bullying.items];
  const r = await runEngine({
    source: 'checkin', items, history: [], ...opts,
    answers: {
      ...wellAnswers, c6: 3, c7: 1,
      b_freq: 3, b_dur: 2, b_impact: 3, b_safe: 1, b_told: 3, b_retaliation: 3,
    },
  });
  assert.equal(r.level, 3);
  assert.ok(r.rationale.modifiers.some((m) => m.id === 'MOD.RETALIATION_RISK'),
    'ต้องเตือนเรื่องการคุ้มครองจากการถูกเอาคืน');
});

test('ขอให้ผู้ใหญ่ติดต่อกลับ ร่วมกับมีความทุกข์ → ระดับ 3', async () => {
  const r = await run({ ...wellAnswers, c1: 2, c_help: 'yes' });
  assert.equal(r.level, 3);
});

// ─────────────────────────── ระดับ 2 ───────────────────────────

test('มีสัญญาณด้านเดียว → ระดับ 2', async () => {
  const r = await run({ ...wellAnswers, c4: 2 });
  assert.equal(r.level, 2);
});

test('บันทึกข้อสังเกตของครูทุกครั้ง ต้องได้รับการตรวจสอบอย่างน้อยระดับ 2', async () => {
  const r = await runEngine({
    source: 'staff_note', items: staffNote.items, history: [],
    answers: { n_what: ['absent'], n_change: 1, n_dur: 1, n_safety: 0, n_detail: 'มาสายบ่อยขึ้นในสัปดาห์นี้' },
  });
  assert.ok(r.level >= 2);
});

// ─────────────────────────── เป็นห่วงเพื่อน ───────────────────────────

test('เพื่อนแจ้งว่าเห็นสัญญาณเร่งด่วนวันนี้ → ระดับ 4', async () => {
  const r = await runEngine({
    source: 'friend_report', items: friendConcern.items, history: [],
    answers: { f_what: ['saidDeath', 'withdrawn'], f_when: 3, f_safe: 2, f_known: 3 },
  });
  assert.equal(r.level, 4);
});

test('เหตุผลที่แสดงต้องตรงกับสิ่งที่ผู้แจ้งตอบจริง — ห้ามอ้างว่า “ตอบว่าไม่ปลอดภัย” ทั้งที่ตอบว่า “ไม่แน่ใจ”', async () => {
  const r = await runEngine({
    source: 'friend_report', items: friendConcern.items, history: [],
    answers: {
      f_what: ['saidDeath'], f_when: 3, f_safe: 2, f_known: 3,
      f_detail: 'เพื่อนบอกว่าไม่อยากอยู่แล้ว',
    },
  });
  assert.equal(r.level, 4, 'ยังต้องเป็นระดับ 4 จากข้อความและสัญญาณเร่งด่วน');
  const ids = r.rationale.matched.map((m) => m.id);
  assert.ok(!ids.includes('L4.SAFETY_NOW'), 'ห้ามอ้างกฎที่มาจากคำตอบซึ่งไม่ได้ถูกตอบจริง');
  assert.ok(ids.includes('L4.LEXICON_CRITICAL') && ids.includes('L4.FRIEND_LETHAL_SIGNS'));

  // "เห็นวันนี้" คือความสด ไม่ใช่ระยะเวลาที่เป็นมา — ห้ามนับเป็นคะแนนความเรื้อรัง
  assert.equal(r.dimensions.duration, 0);
  assert.ok(!ids.includes('L3.MULTI_DOMAIN_CHRONIC'));
});

test('เหตุผลที่แสดงต้องเป็นภาษาไทย ไม่ใช่รหัสโดเมนภายใน', async () => {
  const r = await run({ ...wellAnswers, c1: 2, c6: 2, c_help: 'no' });
  const detail = r.rationale.matched.map((m) => m.detail).filter(Boolean).join(' ');
  assert.ok(!/\b(mood|bullying|safety|support|context)\b/.test(detail), `พบรหัสภายในหลุดออกมา: ${detail}`);
});

test('เพื่อนแจ้งเรื่องทั่วไป → อย่างน้อยระดับ 2 (ทุกการแจ้งต้องมีคนดู)', async () => {
  const r = await runEngine({
    source: 'friend_report', items: friendConcern.items, history: [],
    answers: { f_what: ['sad'], f_when: 1, f_safe: 0, f_known: 1 },
  });
  assert.ok(r.level >= 2);
});

// ─────────────────────────── คุณภาพข้อมูล ───────────────────────────

test('ตอบเหมือนกันทุกข้อและเร็วมาก → ข้อมูลยังไม่เพียงพอสำหรับการสรุป', async () => {
  const answers = Object.fromEntries(
    core.filter((i) => i.type === 'scale').map((i) => [i.id, 0]),
  );
  answers.c_help = 'no';
  const r = await run(answers, { timings: fakeTimings(core, 300), durationMs: 2000 });

  assert.equal(r.dataSufficiency, 'INSUFFICIENT');
  assert.notEqual(r.validation.label, 'ปกติ');
  assert.match(r.validation.label, /ยังไม่เพียงพอ/);
});

test('ตอบไม่ครบข้อสำคัญ → ข้อมูลไม่เพียงพอ และห้ามสรุปว่าไม่มีปัญหา', async () => {
  const r = await run({ c1: 1, c2: 1, c_help: 'no' });
  assert.equal(r.dataSufficiency, 'INSUFFICIENT');
  assert.ok(r.rationale.modifiers.some((m) => m.id === 'MOD.INSUFFICIENT_DATA'));
});

test('คำตอบขัดแย้งกันเอง → ติดธง INCONSISTENT ไม่ใช่ตัดสินว่าโกหก', () => {
  const v = validate({
    items: core,
    answers: { ...wellAnswers, c9: 2, c1: 0 },
    pairs: weeklyCheckin.consistencyPairs,
    required: weeklyCheckin.requiredForSufficiency,
    timings: fakeTimings(core, 3000),
  });
  assert.ok(v.flags.includes('INCONSISTENT'));
  assert.ok(v.notes.some((n) => n.code === 'INCONSISTENT'));
});

// ─────────────────────────── คลังคำ ───────────────────────────

test('คลังคำจับสัญญาณร้ายแรงได้ และติดป้ายเมื่อบริบทเป็นการปฏิเสธ', () => {
  const a = scanText('ผมอยากตาย');
  assert.equal(a.maxSeverity, 'CRITICAL');

  const b = scanText('เมื่อก่อนเคยคิด แต่ตอนนี้ไม่อยากตายแล้วนะ');
  assert.equal(b.maxSeverity, 'CRITICAL', 'ต้องยังส่งให้มนุษย์อ่าน ไม่ตัดทิ้งเอง');
  assert.ok(b.hits.some((x) => x.confidence !== 'high'), 'แต่ต้องติดป้ายว่าความเชื่อมั่นต่ำ');

  const c = scanText('วันนี้อากาศดีมาก ไปเล่นบาสกับเพื่อน');
  assert.equal(c.maxSeverity, null);
});

// ─────────────────────────── กำหนดเวลา ───────────────────────────

test('ระดับ 4 ต้องมีกำหนดติดต่อภายใน 1 ชั่วโมงตามเวลานาฬิกาจริง', async () => {
  const r = await run({ ...wellAnswers, c9: 3 });
  const due = new Date(`${r.deadlines.contactDueAt.replace(' ', 'T')}Z`);
  const diffMin = (due - Date.now()) / 60000;
  assert.ok(diffMin > 55 && diffMin < 65, `ได้ ${diffMin} นาที`);
  assert.equal(r.actions.twoPersonRule, true);
});

test('กำหนดเวลาระดับ 2–3 ต้องนับเป็นวันเรียน ไม่ใช่ยืดออกไปเป็นเท่าตัว', () => {
  // จันทร์ 09:00 น. ตามเวลาไทย (UTC+7) = 02:00 UTC
  const mondayMorning = new Date('2026-08-10T02:00:00Z');

  const l3 = computeDeadlines(3, { acknowledgeWithinMinutes: 240, contactWithinMinutes: 480, followUpDays: [3] }, mondayMorning);
  const l3Contact = new Date(`${l3.contactDueAt.replace(' ', 'T')}Z`);
  const l3Days = (l3Contact - mondayMorning) / 86400000;
  assert.ok(l3Days > 0.5 && l3Days < 2, `ระดับ 3 ควรครบกำหนดภายในวันเรียนถัดไป แต่ได้ ${l3Days.toFixed(2)} วัน`);

  const l2 = computeDeadlines(2, { acknowledgeWithinMinutes: 480, contactWithinMinutes: 1440, followUpDays: [7] }, mondayMorning);
  const l2Contact = new Date(`${l2.contactDueAt.replace(' ', 'T')}Z`);
  const l2Days = (l2Contact - mondayMorning) / 86400000;
  assert.ok(l2Days > 2 && l2Days < 5, `ระดับ 2 ควรครบกำหนดราว 3 วันเรียน แต่ได้ ${l2Days.toFixed(2)} วัน`);
});

test('กำหนดเวลาข้ามวันหยุดสุดสัปดาห์ ไม่ให้เกินกำหนดตั้งแต่ยังไม่เปิดเรียน', () => {
  // ศุกร์ 15:00 น. ตามเวลาไทย = 08:00 UTC
  const fridayAfternoon = new Date('2026-08-14T08:00:00Z');
  const d = computeDeadlines(3, { acknowledgeWithinMinutes: 240, contactWithinMinutes: 480, followUpDays: [3] }, fridayAfternoon);
  const due = new Date(`${d.contactDueAt.replace(' ', 'T')}Z`);
  const dayLocal = new Date(due.getTime() + 420 * 60000).getUTCDay();
  assert.ok(dayLocal !== 0 && dayLocal !== 6, 'กำหนดเวลาต้องไม่ตกวันเสาร์หรืออาทิตย์');
});

// ─────────────────────────── ตัวช่วย ───────────────────────────

function fakeTimings(items, ms) {
  return Object.fromEntries(items.map((i) => [i.id, ms]));
}
