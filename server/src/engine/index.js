/**
 * กลไกประเมินของ CareAlert AI — จุดเข้าเดียว
 *
 * ลำดับการทำงาน: Validate → Assess → (LLM assist) → Triage → SLA
 * ทุกขั้นตอนบันทึกเหตุผลไว้ครบ เพื่อให้ตอบคำถามได้เสมอว่า "ทำไมเคสนี้ถึงเป็นระดับนี้"
 */

import { validate } from './validate.js';
import { assess } from './assess.js';
import { triage, LEVELS, ruleBook, buildActionPlan, buildStudentMessage } from './triage.js';
import { computeDeadlines } from './sla.js';
import { analyzeText, llmEnabled } from './llm.js';
import { ENGINE_VERSION } from './version.js';

export { LEVELS, ruleBook, ENGINE_VERSION, llmEnabled };
export { slaStatus, nowSql, toSqlDate, parseSql } from './sla.js';

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
export async function runEngine(input) {
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
    llm = await analyzeText(freeText);
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
