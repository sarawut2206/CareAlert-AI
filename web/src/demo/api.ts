/**
 * โหมดสาธิต — "เซิร์ฟเวอร์จำลอง" ที่ทำงานทั้งหมดในเบราว์เซอร์
 *
 * สิ่งที่ของจริง:
 *   ✅ กลไกประเมินทั้งหมด (validate / assess / lexicon / triage / sla) เป็นไฟล์เดียวกับเซิร์ฟเวอร์จริง
 *   ✅ ชุดคำถาม เนื้อหาทักษะชีวิต และเบอร์สายด่วน เป็นชุดเดียวกับของจริง
 *   ✅ เงื่อนไขบังคับก่อนปิดเคส และการยกระดับอัตโนมัติ
 *
 * สิ่งที่ไม่ใช่ของจริง:
 *   ❌ ข้อมูลนักเรียนทั้งหมดเป็นข้อมูลสมมติ
 *   ❌ ไม่มีการส่งข้อมูลออกจากเครื่องผู้ใช้เลย — ทุกอย่างอยู่ในหน่วยความจำของแท็บนี้
 *   ❌ ปิดแท็บแล้วข้อมูลหายทั้งหมด และไม่มีครูคนใดได้รับข้อมูล
 */

// @ts-ignore — โมดูลฝั่งเซิร์ฟเวอร์เขียนด้วย JavaScript ล้วน
import { runEngine, ruleBook, ENGINE_VERSION, slaStatus } from '../../../server/src/engine/index.js';
// @ts-ignore
import { LEVELS } from '../../../server/src/engine/triage.js';
// @ts-ignore
import { DIMENSIONS } from '../../../server/src/engine/assess.js';
// @ts-ignore
import { LEXICON_CATEGORIES, scanText } from '../../../server/src/engine/lexicon.js';
// @ts-ignore
import { followUpTriggers } from '../../../server/src/engine/followups.js';
// @ts-ignore
import { computeDeadlines, toSqlDate } from '../../../server/src/engine/sla.js';
// @ts-ignore
import { dailyCheckin, weeklyCheckin, selfReport, friendConcern, staffNote, followUps, getTemplate, allItemsById } from '../../../server/src/content/templates.js';
// @ts-ignore
import { lifeskillModules, getModule, recommendModules } from '../../../server/src/content/lifeskills.js';
// @ts-ignore
import { helplines, crisisScreen } from '../../../server/src/content/help.js';

import { ApiError } from '../api';

// ─────────────────────────── ข้อมูลสมมติ ───────────────────────────

const now = () => toSqlDate(new Date());
const daysAgo = (d: number) => toSqlDate(new Date(Date.now() - d * 86400000));

type AnyRec = Record<string, any>;

const users: AnyRec[] = [
  { id: 1, role: 'admin', username: 'admin', password: 'admin1234', display_name: 'ผู้ดูแลระบบ (สาธิต)', active: 1, last_login_at: daysAgo(1) },
  { id: 5, role: 'director', username: 'director', password: 'director1234', display_name: 'ผู้อำนวยการ วิชัย', active: 1, last_login_at: daysAgo(1) },
  { id: 2, role: 'counselor', username: 'counselor', password: 'counsel1234', display_name: 'ครูแนะแนว สมฤดี', active: 1, last_login_at: daysAgo(0) },
  { id: 3, role: 'teacher', username: 'teacher1', password: 'teacher1234', display_name: 'ครูที่ปรึกษา อนุชา', active: 1, last_login_at: daysAgo(2) },
  { id: 4, role: 'teacher', username: 'teacher2', password: 'teacher1234', display_name: 'ครูที่ปรึกษา ปิยะดา', active: 1, last_login_at: daysAgo(3) },
  { id: 10, role: 'student', username: '30101', password: '123456', display_name: 'นักเรียนตัวอย่าง ก', active: 1 },
  { id: 11, role: 'student', username: '30102', password: '123456', display_name: 'นักเรียนตัวอย่าง ข', active: 1 },
  { id: 12, role: 'student', username: '30103', password: '123456', display_name: 'นักเรียนตัวอย่าง ค', active: 1 },
  { id: 13, role: 'student', username: '30201', password: '123456', display_name: 'นักเรียนตัวอย่าง ง', active: 1 },
];

const classrooms: AnyRec[] = [
  { id: 1, name: 'ม.3/1', level: 'ม.3', advisor_user_id: 3, advisor: 'ครูที่ปรึกษา อนุชา' },
  { id: 2, name: 'ม.3/2', level: 'ม.3', advisor_user_id: 4, advisor: 'ครูที่ปรึกษา ปิยะดา' },
];

const students: AnyRec[] = [
  { id: 1, user_id: 10, student_code: '30101', display_name: 'นักเรียนตัวอย่าง ก', classroom_id: 1, guardian_name: 'ผู้ปกครองสมมติ', guardian_phone: '08x-xxx-xxxx', notes: '', active: 1 },
  { id: 2, user_id: 11, student_code: '30102', display_name: 'นักเรียนตัวอย่าง ข', classroom_id: 1, guardian_name: '', guardian_phone: '', notes: '', active: 1 },
  { id: 3, user_id: 12, student_code: '30103', display_name: 'นักเรียนตัวอย่าง ค', classroom_id: 1, guardian_name: '', guardian_phone: '', notes: '', active: 1 },
  { id: 4, user_id: 13, student_code: '30201', display_name: 'นักเรียนตัวอย่าง ง', classroom_id: 2, guardian_name: '', guardian_phone: '', notes: '', active: 1 },
];

const state = {
  checkins: [] as AnyRec[],
  reports: [] as AnyRec[],
  assessments: [] as AnyRec[],
  cases: [] as AnyRec[],
  caseLinks: [] as AnyRec[],
  caseEvents: [] as AnyRec[],
  lifeskillProgress: [] as AnyRec[],
  auditLog: [] as AnyRec[],
  // โหมดทดลอง — เปิดไว้ในหน้าสาธิตเพื่อให้ลองกดชื่อได้ทันที
  trial: { enabled: true, accessCode: 'DEMO', classroomIds: [1, 2] },
  settings: {
    school: {
      name: 'โรงเรียนตัวอย่าง (ข้อมูลสมมติ)',
      contacts: [{ label: 'ห้องแนะแนว', detail: 'อาคาร 1 ชั้น 2 (เวลา 08.00–16.00 น.)' }],
    },
    notifyWebhookUrl: null as string | null,
  },
  seq: { assessment: 0, case: 0, event: 0, checkin: 0, report: 0 },
  session: null as AnyRec | null,
};

const nextId = (k: keyof typeof state.seq) => (state.seq[k] += 1);

function audit(action: string, entity?: string, entityId?: any) {
  state.auditLog.unshift({
    id: state.auditLog.length + 1,
    actor_user_id: state.session?.id ?? null,
    actor_role: state.session?.role ?? 'anonymous',
    actor_name: state.session?.display_name ?? null,
    action, entity: entity ?? null, entity_id: entityId ?? null,
    ip: '127.0.0.1 (สาธิต)', created_at: now(),
  });
}

// ─────────────────────────── ตรรกะเคส (ย่อจาก services/cases.js) ───────────────────────────

function pickOwner(level: number, studentId: number | null) {
  if (level >= 3) return 2; // ครูแนะแนว
  const s = students.find((x) => x.id === studentId);
  const cl = classrooms.find((c) => c.id === s?.classroom_id);
  return cl?.advisor_user_id ?? 2;
}

function addEvent(caseId: number, type: string, note: string | null, payload: AnyRec = {}) {
  state.caseEvents.push({
    id: nextId('event'), case_id: caseId, type,
    actor_user_id: state.session?.id ?? null,
    actor_name: state.session?.display_name ?? 'ระบบ',
    note, payload: payload, payload_json: JSON.stringify(payload), created_at: now(),
  });
}

function assessmentHistory(studentId: number | null) {
  if (!studentId) return [];
  return state.assessments
    .filter((a) => a.student_id === studentId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 8);
}

function ingest(opts: {
  sourceType: 'checkin' | 'report'; sourceId: number; studentId: number | null;
  subjectHint?: string | null; source: string; result: AnyRec;
}) {
  const { sourceType, sourceId, studentId, subjectHint, source, result } = opts;

  const assessment = {
    id: nextId('assessment'), source_type: sourceType, source_id: sourceId,
    student_id: studentId, engine_version: result.engineVersion,
    level: result.level, concern_index: result.concernIndex,
    data_sufficiency: result.dataSufficiency,
    dimensions: result.dimensions, dimensions_json: JSON.stringify(result.dimensions),
    flags: {
      validation: result.validation.flags, lexicon: result.lexicon.categories,
      contextTags: result.contextTags, wantsContact: result.wantsContact,
      needsHumanRead: result.needsHumanRead,
    },
    rationale: result.rationale,
    llm_used: 0, created_at: now(),
  };
  state.assessments.push(assessment);

  if (result.level < 2) return { assessmentId: assessment.id, caseId: null };

  const existing = studentId
    ? state.cases.find((c) => c.student_id === studentId && c.status !== 'closed')
    : null;

  if (existing) {
    if (result.level > existing.level) {
      const d = computeDeadlines(result.level, result.actions);
      existing.level = result.level;
      existing.peak_level = Math.max(existing.peak_level, result.level);
      existing.acknowledge_due_at = d.acknowledgeDueAt;
      existing.contact_due_at = d.contactDueAt;
      addEvent(existing.id, 'escalate', `ยกระดับเป็น ${result.levelCode}`, { decidingRules: result.rationale.decidingRules });
    } else {
      addEvent(existing.id, 'note', 'มีข้อมูลใหม่เข้ามาในเคสนี้', { level: result.level, source });
    }
    state.caseLinks.push({ case_id: existing.id, assessment_id: assessment.id });
    return { assessmentId: assessment.id, caseId: existing.id };
  }

  const d = computeDeadlines(result.level, result.actions);
  const c: AnyRec = {
    id: nextId('case'), student_id: studentId ?? null, subject_hint: subjectHint ?? null,
    origin: source === 'checkin' ? 'checkin' : source,
    level: result.level, peak_level: result.level, status: 'new',
    owner_user_id: pickOwner(result.level, studentId),
    acknowledge_due_at: d.acknowledgeDueAt, contact_due_at: d.contactDueAt,
    next_followup_at: d.nextFollowUpAt, opened_at: now(),
    acknowledged_at: null, first_contact_at: null, closed_at: null, close_reason: null,
    safety_confirmed: 0, protection_needed: 0, guardian_informed: 0, referral_json: '[]',
    summary: result.rationale.matched.slice(0, 3).map((m: AnyRec) => m.label).join(' • '),
  };
  state.cases.push(c);
  state.caseLinks.push({ case_id: c.id, assessment_id: assessment.id });
  addEvent(c.id, 'opened', `เปิดเคสระดับ ${result.levelCode}`, { decidingRules: result.rationale.decidingRules });
  return { assessmentId: assessment.id, caseId: c.id };
}

function closeBlockers(c: AnyRec) {
  const b: string[] = [];
  if (!c.first_contact_at) b.push('ยังไม่ได้บันทึกว่าได้พูดคุยกับนักเรียนแล้ว');
  if (!c.safety_confirmed) b.push('ยังไม่ได้ยืนยันความปลอดภัยของนักเรียน');
  if (!state.caseEvents.some((e) => e.case_id === c.id && ['action', 'referral'].includes(e.type))) {
    b.push('ยังไม่มีบันทึกการดำเนินการหรือการส่งต่อ');
  }
  if (c.peak_level >= 4 && !c.guardian_informed) {
    b.push('เคยเป็นระดับ 4 — ต้องระบุผลการแจ้งผู้ปกครองหรือเหตุผลที่ไม่แจ้ง');
  }
  return b;
}

function decorate(c: AnyRec): AnyRec {
  const s = students.find((x) => x.id === c.student_id);
  const cl = classrooms.find((x) => x.id === s?.classroom_id);
  return {
    ...c,
    student_name: s?.display_name ?? null,
    student_code: s?.student_code ?? null,
    classroom: cl?.name ?? null,
    owner_name: users.find((u) => u.id === c.owner_user_id)?.display_name ?? null,
    levelInfo: LEVELS[c.level],
    acknowledgeSla: slaStatus(c.acknowledge_due_at, c.acknowledged_at),
    contactSla: slaStatus(c.contact_due_at, c.first_contact_at),
    isOpen: c.status !== 'closed',
  };
}

// ─────────────────────────── ข้อมูลตั้งต้นให้หน้าจอครูไม่ว่างเปล่า ───────────────────────────

let seeded = false;

async function seedOnce() {
  if (seeded) return;
  seeded = true;
  const keep = state.session;
  state.session = null;

  // เคส 1 — ถูกรังแกต่อเนื่อง (ระดับ 3) กำลังดำเนินการอยู่
  const bully = await runEngine({
    source: 'checkin',
    items: [...weeklyCheckin.items, ...followUps.bullying.items],
    answers: {
      c1: 2, c2: 2, c3: 2, c4: 2, c5: 2, c6: 3, c7: 1, c8: 0, c9: 0, c_help: 'maybe',
      b_type: ['verbal', 'social', 'cyber'], b_freq: 3, b_dur: 2, b_impact: 3,
      b_safe: 1, b_told: 3, b_retaliation: 3,
    },
    pairs: weeklyCheckin.consistencyPairs,
    required: weeklyCheckin.requiredForSufficiency,
    history: [],
  });
  const r1 = ingest({ sourceType: 'checkin', sourceId: nextId('checkin'), studentId: 1, source: 'checkin', result: bully });
  state.checkins.push({
    id: state.seq.checkin, student_id: 1, template_id: weeklyCheckin.id,
    answers: { c1: 2, c2: 2, c3: 2, c4: 2, c5: 2, c6: 3, c7: 1, c8: 0, c9: 0, c_help: 'maybe', b_freq: 3, b_dur: 2, b_impact: 3, b_told: 3, b_retaliation: 3 },
    submitted_at: daysAgo(2),
  });
  if (r1.caseId) {
    const c = state.cases.find((x) => x.id === r1.caseId)!;
    c.opened_at = daysAgo(2);
    c.acknowledged_at = daysAgo(2);
    c.status = 'in_progress';
    state.session = users.find((u) => u.id === 2)!;
    addEvent(c.id, 'acknowledged', 'รับเรื่องแล้ว');
    state.session = null;
  }

  // ประวัติย้อนหลัง 8 สัปดาห์ — ให้แดชบอร์ดผู้บริหารมีแนวโน้มให้ดู
  // (สังเคราะห์เฉพาะแถวสรุปสำหรับกราฟรวม ไม่ใช่เคสจริง)
  const histPattern = [
    { d: 55, n: 3, hi: 0 }, { d: 48, n: 4, hi: 0 }, { d: 41, n: 4, hi: 1 },
    { d: 34, n: 5, hi: 0 }, { d: 27, n: 4, hi: 1 }, { d: 20, n: 5, hi: 0 },
    { d: 13, n: 6, hi: 1 }, { d: 6, n: 5, hi: 0 },
  ];
  for (const wk of histPattern) {
    for (let i = 0; i < wk.n; i++) {
      const sid = students[i % students.length].id;
      const level = i === 0 && wk.hi ? 3 : i % 3 === 0 ? 2 : 1;
      state.assessments.push({
        id: nextId('assessment'), source_type: 'checkin', source_id: 0,
        student_id: sid, engine_version: ENGINE_VERSION,
        level, concern_index: level === 3 ? 68 : level === 2 ? 42 : 12,
        data_sufficiency: 'SUFFICIENT',
        dimensions: { severity: level - 1, impact: level - 1, frequency: 0, duration: 0, isolation: 1, trajectory: 0, safety: 0, protective: 2 },
        dimensions_json: '',
        flags: { validation: [], lexicon: [], contextTags: level >= 2 ? ['context:study'] : [], wantsContact: 'no', needsHumanRead: false },
        rationale: { matched: [], modifiers: [], decidingRules: [], note: '' },
        llm_used: 0, created_at: daysAgo(wk.d - (i % 5)),
      });
      state.checkins.push({
        id: nextId('checkin'), student_id: sid, template_id: 'weekly-core',
        answers: {}, submitted_at: daysAgo(wk.d - (i % 5)),
      });
    }
  }

  // เคส 2 — บุคลากรบันทึกข้อสังเกต (ระดับ 2) ยังไม่มีใครรับเรื่อง
  const note = await runEngine({
    source: 'staff_note', items: staffNote.items, history: [],
    answers: {
      n_what: ['withdrawn', 'grades', 'absent'], n_change: 2, n_dur: 2, n_safety: 0,
      n_detail: 'สองสัปดาห์ที่ผ่านมามาสายเกือบทุกวัน นั่งคนเดียวตอนพักกลางวัน ส่งงานไม่ครบ 3 วิชา',
    },
  });
  const nid = nextId('report');
  state.reports.push({
    id: nid, kind: 'staff_note', subject_student_id: 4,
    categories: ['withdrawn', 'grades', 'absent'],
    answers: { n_what: ['withdrawn', 'grades', 'absent'], n_change: 2, n_dur: 2, n_safety: 0 },
    body: 'สองสัปดาห์ที่ผ่านมามาสายเกือบทุกวัน นั่งคนเดียวตอนพักกลางวัน ส่งงานไม่ครบ 3 วิชา',
    submitted_at: daysAgo(1),
  });
  const r2 = ingest({ sourceType: 'report', sourceId: nid, studentId: 4, source: 'staff_note', result: note });
  if (r2.caseId) state.cases.find((x) => x.id === r2.caseId)!.opened_at = daysAgo(1);

  state.session = keep;
}

// ─────────────────────────── ตัวจัดเส้นทาง ───────────────────────────

const ok = (body: any = { ok: true }) => body;
const need = (cond: any, msg: string, status = 400) => { if (!cond) throw new ApiError(status, msg); };

function requireSession() {
  need(state.session, 'กรุณาเข้าสู่ระบบ', 401);
  return state.session!;
}
function currentStudent() {
  const u = requireSession();
  return students.find((s) => s.user_id === u.id) ?? null;
}

export async function demoRequest(path: string, method: string, body: any): Promise<any> {
  await seedOnce();

  // ข้อมูลอยู่ในหน่วยความจำ พอรีเฟรชหน้าจะหาย — กู้ session จาก token ที่เก็บไว้
  // เพื่อให้ผู้เข้าชมไม่หลุดออกจากระบบทุกครั้งที่กดรีเฟรช
  if (!state.session) {
    const t = localStorage.getItem('carealert.token');
    const id = t?.startsWith('demo.') ? Number(t.slice(5)) : null;
    const u = users.find((x) => x.id === id);
    if (u) state.session = u;
  }

  const [rawPath, query] = path.replace(/^\/api/, '').split('?');
  const q = new URLSearchParams(query ?? '');
  const seg = rawPath.split('/').filter(Boolean);
  const key = `${method} /${seg.join('/')}`;

  // ── ทั่วไป ────────────────────────────────────────────────
  if (key === 'GET /health') return ok({ ok: true, service: 'CareAlert AI (โหมดสาธิต)' });
  if (key === 'GET /meta/help') return ok({ helplines, crisisScreen, school: state.settings.school.contacts });
  if (key === 'GET /meta/consent') return ok({ consent: DEMO_CONSENT });

  // ── เข้าสู่ระบบ ───────────────────────────────────────────
  if (key === 'POST /auth/login') {
    const u = users.find((x) => x.username === String(body?.username ?? '').toLowerCase().trim());
    need(u && u.password === body?.password, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
    state.session = u!;
    audit('login.success', 'user', u!.id);
    return ok({ token: `demo.${u!.id}`, user: publicUser(u!) });
  }
  if (key === 'GET /auth/me') {
    const u = requireSession();
    const s = students.find((x) => x.user_id === u.id);
    return ok({
      user: publicUser(u),
      student: s ? {
        id: s.id, studentCode: s.student_code,
        classroom: classrooms.find((c) => c.id === s.classroom_id)?.name ?? null,
        hasConsent: true,
      } : null,
    });
  }
  if (key === 'POST /auth/change-password') return ok({ ok: true });

  // ── โหมดทดลอง: กดชื่อตัวเอง ───────────────────────────────
  if (key === 'GET /auth/roster/status') {
    return ok({ enabled: state.trial.enabled, requiresAccessCode: !!state.trial.accessCode });
  }
  if (key === 'POST /auth/roster/classrooms') {
    need(state.trial.enabled, 'ยังไม่ได้เปิดโหมดทดลอง', 403);
    need(String(body?.accessCode ?? '').trim().toUpperCase() === state.trial.accessCode,
      'รหัสเข้าโรงเรียนไม่ถูกต้อง — ในโหมดสาธิตใช้รหัส DEMO', 401);
    return ok({
      classrooms: classrooms
        .filter((c) => state.trial.classroomIds.includes(c.id))
        .map((c) => ({ ...c, student_count: students.filter((s) => s.classroom_id === c.id).length })),
    });
  }
  if (key === 'POST /auth/roster/students') {
    need(state.trial.enabled, 'ยังไม่ได้เปิดโหมดทดลอง', 403);
    need(String(body?.accessCode ?? '').trim().toUpperCase() === state.trial.accessCode, 'รหัสเข้าโรงเรียนไม่ถูกต้อง', 401);
    const cid = Number(body?.classroomId);
    need(state.trial.classroomIds.includes(cid), 'ห้องนี้ยังไม่ได้เปิดให้ทดลอง', 403);
    return ok({
      students: students.filter((s) => s.classroom_id === cid).map((s) => ({
        id: s.id, displayName: s.display_name, claimed: !!s.self_pin_set,
      })),
    });
  }
  if (key === 'POST /auth/roster/enter') {
    need(state.trial.enabled, 'ยังไม่ได้เปิดโหมดทดลอง', 403);
    need(String(body?.accessCode ?? '').trim().toUpperCase() === state.trial.accessCode, 'รหัสเข้าโรงเรียนไม่ถูกต้อง', 401);
    const s = students.find((x) => x.id === Number(body?.studentId));
    need(s, 'ไม่พบนักเรียนคนนี้', 404);
    const pin = String(body?.pin ?? '');
    need(/^\d{4,6}$/.test(pin), 'รหัสต้องเป็นตัวเลข 4–6 หลัก');

    if (!s!.self_pin_set) {
      need(pin === String(body?.confirmPin ?? ''), 'รหัสสองช่องไม่ตรงกัน ลองใหม่อีกครั้ง');
      need(!/^(\d)\1+$/.test(pin), 'อย่าใช้เลขซ้ำกันทั้งหมด เช่น 1111 — เดาง่ายเกินไป');
      need(!['1234', '0000', '12345', '123456'].includes(pin), 'รหัสนี้เดาง่ายเกินไป ลองเลขอื่นดู');
      s!.self_pin_set = 1;
      s!.pin = pin;
    } else {
      need(s!.pin === pin, 'รหัสไม่ถูกต้อง — ถ้าลืมรหัส บอกครูให้ตั้งใหม่ให้ได้', 401);
    }

    const u = users.find((x) => x.id === s!.user_id)!;
    state.session = u;
    audit('roster.login', 'student', s!.id);
    return ok({ token: `demo.${u.id}`, user: publicUser(u), claimed: !s!.self_pin_set });
  }

  // ── เช็กอิน ───────────────────────────────────────────────
  if (key === 'GET /checkin/templates') {
    return ok({ template: q.get('cadence') === 'daily' ? dailyCheckin : weeklyCheckin, followUps });
  }
  if (key === 'POST /checkin/follow-ups') {
    return ok({ followUps: followUpTriggers(body?.answers ?? {}).map((id: string) => getTemplate(id)).filter(Boolean) });
  }
  if (key === 'GET /checkin/mine') {
    const s = currentStudent();
    const mine = state.checkins.filter((c) => c.student_id === s?.id);
    const OFFSET = 420 * 60000;
    const dayKey = (sql: string) => new Date(new Date(`${sql.replace(' ', 'T')}Z`).getTime() + OFFSET).toISOString().slice(0, 10);
    const days = new Set(mine.map((c) => dayKey(c.submitted_at)));
    const todayKey = new Date(Date.now() + OFFSET).toISOString().slice(0, 10);
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const d = new Date(Date.now() + OFFSET - i * 86400000).toISOString().slice(0, 10);
      if (days.has(d)) streak += 1;
      else if (i > 0 || !days.has(todayKey)) break;
    }
    return ok({
      checkins: mine.map((c) => ({ id: c.id, template_id: c.template_id, submitted_at: c.submitted_at })).slice(0, 30),
      doneToday: days.has(todayKey),
      streak,
      daysDone: [...days].sort().reverse().slice(0, 30),
    });
  }
  if (key === 'POST /checkin/submit') {
    const s = currentStudent();
    need(s, 'บัญชีนี้ไม่ได้ผูกกับข้อมูลนักเรียน', 403);
    const answers = body?.answers ?? {};
    const allowed = new Set(followUpTriggers(answers));
    const used = (body?.followUpIds ?? []).filter((id: string) => allowed.has(id));
    const ids = [body?.templateId, ...used];
    const { items, pairs, required } = collect(ids);

    const result = await runEngine({
      source: 'checkin', items, answers, timings: body?.timings ?? {},
      durationMs: body?.durationMs ?? 0, pairs, required, history: assessmentHistory(s!.id),
    });

    const cid = nextId('checkin');
    state.checkins.push({ id: cid, student_id: s!.id, template_id: body?.templateId, answers, submitted_at: now() });
    const { caseId } = ingest({ sourceType: 'checkin', sourceId: cid, studentId: s!.id, source: 'checkin', result });
    audit('checkin.submitted', 'checkin', cid);

    return ok({
      ok: true, message: result.studentMessage, showHelpline: result.studentMessage.showHelpline,
      helplines: result.studentMessage.showHelpline ? helplines : [],
      crisis: result.level === 4 ? crisisScreen : null,
      recommendedModules: recommendModules(result.contextTags, result.domains),
      caseOpened: !!caseId,
    });
  }

  // ── การแจ้งเรื่อง ─────────────────────────────────────────
  if (key === 'GET /reports/templates') {
    const u = requireSession();
    return ok({ self: selfReport, friend: friendConcern, staffNote: u.role === 'student' ? null : staffNote });
  }
  if (key === 'POST /reports/self') {
    const s = currentStudent();
    need(s, 'เฉพาะบัญชีนักเรียน', 403);
    const answers = body?.answers ?? {};
    const anonymous = !!body?.anonymous;
    const result = await runEngine({
      source: 'self_report', items: selfReport.items, answers,
      pairs: selfReport.consistencyPairs, required: selfReport.requiredForSufficiency,
      history: assessmentHistory(s!.id),
    });
    const rid = nextId('report');
    state.reports.push({ id: rid, kind: 'self', subject_student_id: anonymous ? null : s!.id, anonymous: anonymous ? 1 : 0, categories: answers.sr_what ?? [], answers, body: answers.sr_body ?? null, submitted_at: now() });
    const attached = !anonymous || result.level >= 4;
    const { caseId } = ingest({
      sourceType: 'report', sourceId: rid, studentId: attached ? s!.id : null,
      subjectHint: attached ? null : 'นักเรียนแจ้งโดยไม่ประสงค์ออกนาม',
      source: 'self_report', result,
    });
    return ok({
      ok: true, message: result.studentMessage,
      identityDisclosed: attached && anonymous,
      identityNotice: attached && anonymous
        ? 'เพราะสิ่งที่เธอเล่าเกี่ยวกับความปลอดภัย ครูที่รับผิดชอบจึงจำเป็นต้องรู้ว่าเป็นเธอ เพื่อจะช่วยได้ทัน เราบอกเรื่องนี้ไว้ล่วงหน้าเสมอ'
        : null,
      helplines: result.studentMessage.showHelpline ? helplines : [],
      crisis: result.level === 4 ? crisisScreen : null,
      recommendedModules: recommendModules(result.contextTags, result.domains),
      caseOpened: !!caseId,
    });
  }
  if (key === 'POST /reports/friend') {
    requireSession();
    const answers = body?.answers ?? {};
    const hint = String(body?.subjectHint ?? '').trim();
    need(hint, 'กรุณาระบุอย่างน้อยว่าเพื่อนคนนี้เป็นใคร เพื่อให้ครูตามหาได้');
    const result = await runEngine({ source: 'friend_report', items: friendConcern.items, answers, history: [] });
    const rid = nextId('report');
    state.reports.push({ id: rid, kind: 'friend', subject_hint: hint, anonymous: body?.anonymous ? 1 : 0, categories: answers.f_what ?? [], answers, body: answers.f_detail ?? null, submitted_at: now() });
    const { caseId } = ingest({ sourceType: 'report', sourceId: rid, studentId: null, subjectHint: hint, source: 'friend_report', result });
    return ok({
      ok: true,
      message: {
        tone: result.level >= 3 ? 'urgent-care' : 'warm',
        title: 'ขอบคุณที่บอกเรา',
        body: result.level >= 4
          ? 'สิ่งที่เธอแจ้งเป็นเรื่องเร่งด่วน ครูที่รับผิดชอบได้รับเรื่องแล้วและจะดำเนินการทันที ถ้าตอนนี้เพื่อนอยู่กับเธอและมีอันตราย ให้โทร 1669 หรือ 191 ทันที'
          : 'ครูที่รับผิดชอบจะตรวจสอบเรื่องนี้ การที่เธอกล้าบอกอาจช่วยเพื่อนได้มากกว่าที่คิด',
        showHelpline: result.level >= 3,
      },
      helplines: result.level >= 3 ? helplines : [],
      referenceCode: body?.anonymous ? refCode() : null,
      caseOpened: !!caseId,
    });
  }
  if (key === 'POST /reports/staff-note') {
    requireSession();
    const answers = body?.answers ?? {};
    const sid = Number(body?.studentId);
    need(students.some((s) => s.id === sid), 'ไม่พบนักเรียน', 404);
    const result = await runEngine({ source: 'staff_note', items: staffNote.items, answers, history: assessmentHistory(sid) });
    const rid = nextId('report');
    state.reports.push({ id: rid, kind: 'staff_note', subject_student_id: sid, categories: answers.n_what ?? [], answers, body: answers.n_detail ?? null, submitted_at: now() });
    const { caseId } = ingest({ sourceType: 'report', sourceId: rid, studentId: sid, source: 'staff_note', result });
    audit('report.staffNote', 'student', sid);
    return ok({
      ok: true, level: result.level, levelCode: result.levelCode, levelInfo: result.levelInfo,
      rationale: result.rationale, actions: result.actions, deadlines: result.deadlines, caseId,
    });
  }

  // ── ทักษะชีวิต ────────────────────────────────────────────
  if (key === 'GET /lifeskills') {
    const s = currentStudent();
    return ok({
      modules: lifeskillModules.map((m: AnyRec) => {
        const p = state.lifeskillProgress.find((x) => x.student_id === s?.id && x.module_id === m.id);
        return {
          id: m.id, title: m.title, emoji: m.emoji, minutes: m.minutes, tags: m.tags,
          goal: m.goal, stepCount: m.steps.length,
          progress: p ? { stepIndex: p.step_index, completed: !!p.completed } : null,
        };
      }),
    });
  }
  if (seg[0] === 'lifeskills' && seg.length === 2 && method === 'GET') {
    const m = getModule(seg[1]);
    need(m, 'ไม่พบกิจกรรมนี้', 404);
    const s = currentStudent();
    const p = state.lifeskillProgress.find((x) => x.student_id === s?.id && x.module_id === m.id);
    return ok({ module: m, progress: p ? { step_index: p.step_index, completed: p.completed, reflection: p.reflection } : null });
  }
  if (seg[0] === 'lifeskills' && seg[2] === 'progress' && method === 'POST') {
    const s = currentStudent();
    const m = getModule(seg[1]);
    if (s && m) {
      const p = state.lifeskillProgress.find((x) => x.student_id === s.id && x.module_id === m.id);
      const completed = body?.completed === true;
      if (p) { p.step_index = Math.max(p.step_index, body?.stepIndex ?? 0); p.completed = p.completed || completed; }
      else state.lifeskillProgress.push({ student_id: s.id, module_id: m.id, step_index: body?.stepIndex ?? 0, completed: completed ? 1 : 0, reflection: null, updated_at: now() });
    }
    return ok();
  }
  if (seg[0] === 'lifeskills' && seg[2] === 'reflection' && method === 'POST') {
    const s = currentStudent();
    const m = getModule(seg[1]);
    need(s && m, 'ไม่พบกิจกรรมนี้', 404);
    const text = String(body?.text ?? '');
    const p = state.lifeskillProgress.find((x) => x.student_id === s!.id && x.module_id === m.id);
    if (p) p.reflection = text;
    else state.lifeskillProgress.push({ student_id: s!.id, module_id: m.id, step_index: 0, completed: 0, reflection: text, updated_at: now() });

    const scan = scanText(text);
    if (!scan.hits.length) return ok({ ok: true, escalated: false });

    const result = await runEngine({
      source: 'self_report', history: [],
      items: [{ id: 'ls_reflection', type: 'text', domain: 'freetext', facet: 'context' }],
      answers: { ls_reflection: text },
    });
    const rid = nextId('report');
    state.reports.push({ id: rid, kind: 'self', subject_student_id: s!.id, categories: scan.categories, answers: { moduleId: m.id }, body: text, submitted_at: now() });
    const { caseId } = ingest({ sourceType: 'report', sourceId: rid, studentId: s!.id, source: 'self_report', result });
    return ok({
      ok: true, escalated: !!caseId, message: result.studentMessage,
      helplines: result.studentMessage.showHelpline ? helplines : [],
    });
  }

  // ── เคส ───────────────────────────────────────────────────
  if (key === 'GET /cases/summary') {
    const open = visibleCases().filter((c) => c.status !== 'closed');
    const summary = { total: open.length, l4: 0, l3: 0, l2: 0, overdue: 0, unacknowledged: 0 };
    for (const c of open) {
      if (c.level === 4) summary.l4++; else if (c.level === 3) summary.l3++; else summary.l2++;
      if (slaStatus(c.contact_due_at, c.first_contact_at) === 'overdue') summary.overdue++;
      if (c.status === 'new') summary.unacknowledged++;
    }
    return ok({ summary });
  }
  if (key === 'GET /cases') {
    const status = q.get('status') ?? 'open';
    const level = q.get('level') ? Number(q.get('level')) : null;
    let list = visibleCases();
    if (status === 'open') list = list.filter((c) => c.status !== 'closed');
    else if (status !== 'all') list = list.filter((c) => c.status === status);
    if (level) list = list.filter((c) => c.level === level);
    audit('cases.list');
    return ok({
      cases: list
        .map(decorate)
        .sort((a, b) => b.level - a.level || (a.status === 'new' ? -1 : 1)),
    });
  }
  if (seg[0] === 'cases' && seg.length === 2 && method === 'GET') {
    const c = findCase(Number(seg[1]));
    const s = students.find((x) => x.id === c.student_id);
    const cl = classrooms.find((x) => x.id === s?.classroom_id);
    const links = state.caseLinks.filter((l) => l.case_id === c.id).map((l) => l.assessment_id);
    const assessments = state.assessments.filter((a) => links.includes(a.id)).reverse();

    const sources = assessments.map((a) => {
      if (a.source_type === 'checkin') {
        const ck = state.checkins.find((x) => x.id === a.source_id);
        if (!ck) return null;
        return { kind: 'checkin', id: ck.id, at: ck.submitted_at, templateId: ck.template_id, templateTitle: getTemplate(ck.template_id)?.title, answers: ck.answers };
      }
      const r = state.reports.find((x) => x.id === a.source_id);
      if (!r) return null;
      return { kind: r.kind, id: r.id, at: r.submitted_at, anonymous: !!r.anonymous, subjectHint: r.subject_hint, body: r.body, categories: r.categories, answers: r.answers };
    }).filter(Boolean);

    audit('case.view', 'case', c.id);
    return ok({
      case: decorate(c),
      student: s ? { ...s, classroom: cl?.name ?? null, advisor: cl?.advisor ?? null } : null,
      assessments, sources,
      events: state.caseEvents.filter((e) => e.case_id === c.id),
      trend: state.assessments.filter((a) => a.student_id === c.student_id).map((a) => ({ created_at: a.created_at, level: a.level, concern_index: a.concern_index, data_sufficiency: a.data_sufficiency })),
      closeBlockers: closeBlockers(c),
      itemDefs: Object.fromEntries([...allItemsById().entries()].map(([id, item]: any) => [id, { text: item.text, type: item.type, critical: !!item.critical, options: item.options ?? null }])),
    });
  }
  if (seg[0] === 'cases' && seg.length === 3 && method === 'POST') {
    const c = findCase(Number(seg[1]));
    const action = seg[2];
    const u = requireSession();

    if (action === 'acknowledge') {
      need(!c.acknowledged_at, 'เคสนี้ถูกรับเรื่องไปแล้ว');
      c.acknowledged_at = now(); c.owner_user_id = c.owner_user_id ?? u.id;
      if (c.status === 'new') c.status = 'acknowledged';
      addEvent(c.id, 'acknowledged', 'รับเรื่องแล้ว');
    } else if (action === 'contact') {
      need(String(body?.note ?? '').trim().length >= 5, 'กรุณาบันทึกรายละเอียดการพูดคุย');
      c.first_contact_at = c.first_contact_at ?? now();
      c.acknowledged_at = c.acknowledged_at ?? now();
      if (['new', 'acknowledged'].includes(c.status)) c.status = 'in_progress';
      c.safety_confirmed = body?.safetyConfirmed ? 1 : 0;
      c.protection_needed = body?.protectionNeeded ? 1 : 0;
      addEvent(c.id, 'contacted', body.note, { safetyConfirmed: !!body?.safetyConfirmed });
    } else if (action === 'action') {
      need(String(body?.note ?? '').trim().length >= 3, 'กรุณาระบุรายละเอียดการดำเนินการ');
      if (['new', 'acknowledged'].includes(c.status)) c.status = 'in_progress';
      addEvent(c.id, 'action', body.note);
    } else if (action === 'referral') {
      need(String(body?.to ?? '').trim(), 'กรุณาระบุปลายทางการส่งต่อ');
      c.status = 'referred';
      addEvent(c.id, 'referral', `ส่งต่อไปยัง ${body.to}`, { to: body.to, note: body?.note });
    } else if (action === 'guardian') {
      need(String(body?.note ?? '').trim().length >= 3, 'กรุณาบันทึกรายละเอียด');
      c.guardian_informed = body?.informed ? 1 : 0;
      addEvent(c.id, 'action', (body?.informed ? 'แจ้งผู้ปกครองแล้ว: ' : 'ยังไม่แจ้งผู้ปกครอง: ') + body.note);
    } else if (action === 'followup') {
      need(String(body?.note ?? '').trim().length >= 3, 'กรุณาบันทึกผลการติดตาม');
      const days = Number(body?.nextInDays ?? 0);
      c.next_followup_at = days ? toSqlDate(new Date(Date.now() + days * 86400000)) : null;
      if (['new', 'acknowledged', 'in_progress'].includes(c.status)) c.status = 'monitoring';
      addEvent(c.id, 'followup', body.note, { studentStatus: body?.studentStatus });
    } else if (action === 'level') {
      const level = Number(body?.level);
      need(String(body?.reason ?? '').trim().length >= 10, 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร');
      need(level >= c.level || ['counselor', 'admin'].includes(u.role), 'การลดระดับต้องดำเนินการโดยครูแนะแนวหรือผู้ดูแลระบบ', 403);
      addEvent(c.id, level > c.level ? 'escalate' : 'note', `เปลี่ยนระดับจาก ${c.level} เป็น ${level}: ${body.reason}`);
      c.level = level; c.peak_level = Math.max(c.peak_level, level);
    } else if (action === 'close') {
      need(c.status !== 'closed', 'เคสนี้ปิดไปแล้ว');
      need(String(body?.reason ?? '').trim().length >= 10, 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร');
      const blockers = closeBlockers(c);
      need(!blockers.length || body?.override, `ยังปิดเคสไม่ได้: ${blockers.join(' / ')}`);
      need(!(blockers.length && body?.override) || ['counselor', 'admin'].includes(u.role), 'การปิดเคสทั้งที่ยังมีข้อค้าง ต้องดำเนินการโดยครูแนะแนวหรือผู้ดูแลระบบ', 403);
      need(c.peak_level < 4 || ['counselor', 'admin'].includes(u.role), 'เคสที่เคยเป็นระดับ 4 ต้องปิดโดยครูแนะแนวหรือผู้ดูแลระบบ', 403);
      c.status = 'closed'; c.closed_at = now(); c.close_reason = body.reason;
      addEvent(c.id, 'closed', body.reason, { override: !!body?.override, blockers });
    } else if (action === 'reopen') {
      need(['counselor', 'admin'].includes(u.role), 'ต้องเป็นครูแนะแนวหรือผู้ดูแลระบบ', 403);
      c.status = 'in_progress'; c.closed_at = null; c.close_reason = null;
      addEvent(c.id, 'reopened', body?.reason ?? '');
    } else if (action === 'note') {
      addEvent(c.id, 'note', body?.note ?? '');
    } else if (action === 'assign') {
      c.owner_user_id = Number(body?.userId);
      addEvent(c.id, 'note', `มอบหมายให้ ${users.find((x) => x.id === c.owner_user_id)?.display_name}`);
    }
    audit(`case.${action}`, 'case', c.id);
    return ok({ ok: true, closeBlockers: closeBlockers(c) });
  }

  // ── นักเรียน ──────────────────────────────────────────────
  if (key === 'GET /students/meta/classrooms') {
    const u = requireSession();
    const list = u.role === 'teacher' ? classrooms.filter((c) => c.advisor_user_id === u.id) : classrooms;
    return ok({ classrooms: list.map((c) => ({ ...c, student_count: students.filter((s) => s.classroom_id === c.id).length })) });
  }
  if (key === 'GET /students') {
    const u = requireSession();
    need(u.role !== 'director', 'บทบาทผู้บริหารเข้าถึงข้อมูลนักเรียนรายคนไม่ได้', 403);
    const term = (q.get('q') ?? '').toLowerCase();
    const cid = q.get('classroomId') ? Number(q.get('classroomId')) : null;
    let list = students.filter((s) => s.active);
    if (u.role === 'teacher') list = list.filter((s) => classrooms.find((c) => c.id === s.classroom_id)?.advisor_user_id === u.id);
    if (cid) list = list.filter((s) => s.classroom_id === cid);
    if (term) list = list.filter((s) => s.display_name.toLowerCase().includes(term) || s.student_code.includes(term));
    audit('students.search');
    return ok({ students: list.map((s) => ({ id: s.id, student_code: s.student_code, display_name: s.display_name, classroom: classrooms.find((c) => c.id === s.classroom_id)?.name ?? null })) });
  }
  if (seg[0] === 'students' && seg.length === 2 && method === 'GET') {
    const s = students.find((x) => x.id === Number(seg[1]));
    need(s, 'ไม่พบนักเรียน', 404);
    const cl = classrooms.find((c) => c.id === s!.classroom_id);
    audit('student.view', 'student', s!.id);
    return ok({
      student: { ...s, classroom: cl?.name ?? null, advisor: cl?.advisor ?? null },
      cases: state.cases.filter((c) => c.student_id === s!.id).map((c) => ({ ...c, levelInfo: LEVELS[c.level] })),
      trend: state.assessments.filter((a) => a.student_id === s!.id),
      checkinCount: state.checkins.filter((c) => c.student_id === s!.id).length,
      consent: { version: '1.0.0', granted_by: 'student', granted_at: daysAgo(20) },
    });
  }
  if (seg[0] === 'students' && seg[2] === 'notes' && method === 'PUT') {
    const s = students.find((x) => x.id === Number(seg[1]));
    if (s) s.notes = body?.notes ?? '';
    return ok();
  }

  // ── ภาพรวมและกฎ ───────────────────────────────────────────
  if (key === 'GET /analytics/overview') return ok(analytics(Number(q.get('days') ?? 30)));
  if (key === 'GET /analytics/executive') {
    const u = requireSession();
    need(['director', 'counselor', 'admin'].includes(u.role), 'เฉพาะผู้บริหาร ครูแนะแนว หรือผู้ดูแลระบบ', 403);
    return ok(executiveAnalytics(Number(q.get('days') ?? 90)));
  }
  if (key === 'GET /meta/engine') {
    return ok({
      engineVersion: ENGINE_VERSION, levels: LEVELS, dimensions: DIMENSIONS,
      lexiconCategories: LEXICON_CATEGORIES, llmEnabled: false, ...ruleBook(),
      principles: [
        'ระบบไม่วินิจฉัยโรค ไม่จับโกหก และไม่ทำนายว่าใครจะก่อเหตุ',
        'ระดับที่ระบบเสนอคือ “ต้องทำอะไรต่อ” ไม่ใช่ “เด็กคนนี้เป็นอะไร”',
        'ทุกระดับตั้งแต่ 2 ขึ้นไปต้องมีมนุษย์ตรวจสอบ',
        'ระบบไม่เคยตัดสินใจแทนคน และไม่แจ้งหน่วยงานภายนอกโดยอัตโนมัติ',
        'ข้อมูลไม่พอ = “ยังสรุปไม่ได้” ไม่ใช่ “ไม่มีปัญหา”',
        'ปัจจัยปกป้องใช้ประกอบการวางแผนช่วยเหลือ แต่ไม่ใช้ลดระดับ',
      ],
    });
  }

  // ── ผู้ดูแลระบบ ───────────────────────────────────────────
  if (key === 'GET /admin/users') return ok({ users: users.filter((u) => u.role !== 'student').map(publicRow) });
  if (key === 'GET /admin/trial') {
    return ok({
      trial: state.trial,
      progress: classrooms.map((c) => {
        const inRoom = students.filter((s) => s.classroom_id === c.id);
        return { id: c.id, name: c.name, total: inRoom.length, claimed: inRoom.filter((s) => s.self_pin_set).length };
      }),
    });
  }
  if (key === 'PUT /admin/trial') {
    state.trial = {
      enabled: !!body?.enabled,
      accessCode: String(body?.accessCode ?? '').trim().toUpperCase(),
      classroomIds: Array.isArray(body?.classroomIds) ? body.classroomIds.map(Number) : [],
    };
    return ok();
  }
  if (seg[0] === 'admin' && seg[1] === 'students' && seg[3] === 'reset-pin' && method === 'POST') {
    const s = students.find((x) => x.id === Number(seg[2]));
    if (s) { s.self_pin_set = 0; s.pin = null; }
    return ok({ ok: true, message: `${s?.display_name ?? 'นักเรียน'} ตั้งรหัสใหม่ได้แล้วในการเข้าครั้งถัดไป` });
  }
  if (key === 'GET /admin/audit') return ok({ entries: state.auditLog.slice(0, Number(q.get('limit') ?? 100)) });
  if (key === 'GET /admin/settings') {
    return ok({ school: state.settings.school, notify: state.settings.notifyWebhookUrl, consent: DEMO_CONSENT, retention: { checkinDays: 365, closedCaseDays: 1095, auditDays: 1095 }, llmEnabled: false });
  }
  if (key === 'PUT /admin/settings') {
    if (body?.school) state.settings.school = body.school;
    if (body?.notifyWebhookUrl !== undefined) state.settings.notifyWebhookUrl = body.notifyWebhookUrl || null;
    return ok();
  }
  if (key === 'POST /admin/retention/purge') {
    return ok({ ok: true, dryRun: true, report: { checkins: 0, closedCases: 0, auditLog: 0 }, policy: { checkinDays: 365, closedCaseDays: 1095, auditDays: 1095 } });
  }
  if (rawPath.startsWith('/admin')) {
    throw new ApiError(400, 'โหมดสาธิตไม่รองรับการเพิ่ม/แก้ไขบัญชีและรายชื่อนักเรียน — ดาวน์โหลดโค้ดไปติดตั้งเพื่อใช้ส่วนนี้');
  }

  throw new ApiError(404, `โหมดสาธิตยังไม่รองรับ: ${key}`);
}

// ─────────────────────────── ตัวช่วย ───────────────────────────

function publicUser(u: AnyRec) {
  return { id: u.id, role: u.role, username: u.username, displayName: u.display_name, mustChangePassword: false };
}
function publicRow(u: AnyRec) {
  return { id: u.id, role: u.role, username: u.username, display_name: u.display_name, active: u.active, last_login_at: u.last_login_at, must_change_password: 0 };
}

function collect(ids: string[]) {
  const items: AnyRec[] = []; const pairs: AnyRec[] = []; const required: string[] = [];
  for (const id of ids) {
    const t = getTemplate(id);
    if (!t) continue;
    items.push(...t.items);
    if (t.consistencyPairs) pairs.push(...t.consistencyPairs);
    if (t.requiredForSufficiency) required.push(...t.requiredForSufficiency);
  }
  return { items, pairs, required };
}

function visibleCases() {
  const u = requireSession();
  // ผู้บริหารเห็นเฉพาะภาพรวม — เข้าคิวเคสรายบุคคลไม่ได้ (เหมือนเซิร์ฟเวอร์จริง)
  need(u.role !== 'director', 'บทบาทผู้บริหารเข้าถึงเคสรายบุคคลไม่ได้ — ดูภาพรวมได้ที่แดชบอร์ดผู้บริหาร', 403);
  if (u.role === 'teacher') {
    return state.cases.filter((c) => {
      const s = students.find((x) => x.id === c.student_id);
      const cl = classrooms.find((x) => x.id === s?.classroom_id);
      return cl?.advisor_user_id === u.id || c.owner_user_id === u.id;
    });
  }
  return state.cases;
}

function findCase(id: number) {
  const c = state.cases.find((x) => x.id === id);
  need(c, 'ไม่พบเคสนี้', 404);
  const u = requireSession();
  if (u.role === 'teacher') {
    const s = students.find((x) => x.id === c!.student_id);
    const cl = classrooms.find((x) => x.id === s?.classroom_id);
    need(cl?.advisor_user_id === u.id || c!.owner_user_id === u.id, 'เคสนี้อยู่นอกความรับผิดชอบของคุณ', 403);
  }
  return c!;
}

function analytics(days: number) {
  const byLevel = [1, 2, 3, 4].map((level) => ({ level, n: state.assessments.filter((a) => a.level === level).length })).filter((r) => r.n);
  const origins: Record<string, number> = {};
  for (const c of state.cases) origins[c.origin] = (origins[c.origin] ?? 0) + 1;

  const sla = { total: state.cases.length, ackMet: 0, ackLate: 0, contactMet: 0, contactLate: 0, stillOpen: 0 };
  for (const c of state.cases) {
    const a = slaStatus(c.acknowledge_due_at, c.acknowledged_at);
    const k = slaStatus(c.contact_due_at, c.first_contact_at);
    if (a === 'met') sla.ackMet++; if (a === 'late' || a === 'overdue') sla.ackLate++;
    if (k === 'met') sla.contactMet++; if (k === 'late' || k === 'overdue') sla.contactLate++;
    if (c.status !== 'closed') sla.stillOpen++;
  }

  const suffCount: Record<string, number> = {};
  for (const a of state.assessments) suffCount[a.data_sufficiency] = (suffCount[a.data_sufficiency] ?? 0) + 1;

  const tagCount: Record<string, number> = {};
  for (const a of state.assessments.filter((x) => x.level >= 2)) {
    for (const t of a.flags.contextTags ?? []) tagCount[t] = (tagCount[t] ?? 0) + 1;
    for (const c of a.flags.lexicon ?? []) tagCount[`lexicon:${c}`] = (tagCount[`lexicon:${c}`] ?? 0) + 1;
  }

  const active = new Set(state.checkins.map((c) => c.student_id)).size;

  return {
    days,
    byLevel,
    byOrigin: Object.entries(origins).map(([origin, n]) => ({ origin, n: n < 5 ? null : n })),
    sla: { ...sla, medianCloseHours: null },
    participation: { active, total: students.length, rate: Math.round((active / students.length) * 100) },
    sufficiency: Object.entries(suffCount).map(([data_sufficiency, n]) => ({ data_sufficiency, n })),
    topTags: Object.entries(tagCount).map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n).slice(0, 12),
    lifeskills: { started: state.lifeskillProgress.length, completed: state.lifeskillProgress.filter((p) => p.completed).length },
    note: 'โหมดสาธิต: ตัวเลขมาจากข้อมูลสมมติในแท็บนี้เท่านั้น · ในระบบจริงกลุ่มที่มีจำนวนน้อยกว่า 5 จะถูกกลบเพื่อป้องกันการระบุตัวนักเรียน',
  };
}

function executiveAnalytics(days: number) {
  const cutoff = daysAgo(days);
  const inPeriod = (d: string) => d >= cutoff;

  const active = new Set(state.checkins.filter((c) => inPeriod(c.submitted_at)).map((c) => c.student_id)).size;
  const open = state.cases.filter((c) => c.status !== 'closed');

  const kpi = {
    students: students.length,
    activeStudents: active,
    participationRate: Math.round((active / students.length) * 100),
    openL4: open.filter((c) => c.level === 4).length,
    openL3: open.filter((c) => c.level === 3).length,
    openL2: open.filter((c) => c.level === 2).length,
    overdue: open.filter((c) => slaStatus(c.contact_due_at, c.first_contact_at) === 'overdue').length,
    unacknowledged: open.filter((c) => c.status === 'new').length,
  };

  const period = state.cases.filter((c) => inPeriod(c.opened_at));
  let ackMet = 0; let contactMet = 0;
  const contactH: number[] = []; const closeH: number[] = [];
  const t = (s: string) => new Date(`${s.replace(' ', 'T')}Z`).getTime();
  for (const c of period) {
    if (slaStatus(c.acknowledge_due_at, c.acknowledged_at) === 'met') ackMet++;
    if (slaStatus(c.contact_due_at, c.first_contact_at) === 'met') contactMet++;
    if (c.first_contact_at) contactH.push((t(c.first_contact_at) - t(c.opened_at)) / 3600000);
    if (c.closed_at) closeH.push((t(c.closed_at) - t(c.opened_at)) / 3600000);
  }
  const median = (a: number[]) => (a.length ? Math.round([...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] * 10) / 10 : null);

  const weekKey = (s: string) => {
    const d = new Date(`${s.replace(' ', 'T')}Z`);
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const wk = Math.floor((d.getTime() - start.getTime()) / (7 * 86400000));
    return `${d.getUTCFullYear()}-${String(wk).padStart(2, '0')}`;
  };
  const wmap: Record<string, { assessments: number; priority: number; cases: number }> = {};
  for (const a of state.assessments.filter((x) => inPeriod(x.created_at))) {
    const k = weekKey(a.created_at);
    (wmap[k] ??= { assessments: 0, priority: 0, cases: 0 }).assessments++;
    if (a.level >= 3) wmap[k].priority++;
  }
  for (const c of period) {
    const k = weekKey(c.opened_at);
    (wmap[k] ??= { assessments: 0, priority: 0, cases: 0 }).cases++;
  }
  const weekly = Object.entries(wmap).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, v]) => ({ week, ...v }));

  const byGradeLevel = [...new Set(classrooms.map((c) => c.level))].map((grade) => {
    const ids = students.filter((s) => classrooms.find((c) => c.id === s.classroom_id)?.level === grade).map((s) => s.id);
    const act = new Set(state.checkins.filter((c) => inPeriod(c.submitted_at) && ids.includes(c.student_id)).map((c) => c.student_id)).size;
    return ids.length < 5
      ? { grade, students: ids.length, active: null, rate: null }
      : { grade, students: ids.length, active: act, rate: Math.round((act / ids.length) * 100) };
  });

  const tagCount: Record<string, number> = {};
  for (const a of state.assessments.filter((x) => inPeriod(x.created_at) && x.level >= 2)) {
    for (const tg of a.flags.contextTags ?? []) tagCount[tg] = (tagCount[tg] ?? 0) + 1;
    for (const c of a.flags.lexicon ?? []) tagCount[`lexicon:${c}`] = (tagCount[`lexicon:${c}`] ?? 0) + 1;
  }

  const originCount: Record<string, number> = {};
  for (const c of period) originCount[c.origin] = (originCount[c.origin] ?? 0) + 1;

  return {
    days, kpi,
    sla: {
      total: period.length,
      ackRate: period.length ? Math.round((ackMet / period.length) * 100) : null,
      contactRate: period.length ? Math.round((contactMet / period.length) * 100) : null,
      medianContactHours: median(contactH),
      medianCloseHours: median(closeH),
    },
    funnel: {
      opened: period.length,
      acknowledged: period.filter((c) => c.acknowledged_at).length,
      contacted: period.filter((c) => c.first_contact_at).length,
      referred: period.filter((c) => c.status === 'referred').length,
      closed: period.filter((c) => c.status === 'closed').length,
    },
    weekly, byGradeLevel,
    topCategories: Object.entries(tagCount).map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n).slice(0, 10),
    origins: Object.entries(originCount).map(([origin, n]) => ({ origin, n })),
    lifeskills: {
      started: state.lifeskillProgress.length,
      completed: state.lifeskillProgress.filter((p) => p.completed).length,
    },
    governance: [
      'โหมดสาธิต: ตัวเลขทั้งหมดมาจากข้อมูลสมมติในแท็บนี้',
      'แดชบอร์ดนี้แสดงเฉพาะข้อมูลรวม ไม่มีชื่อนักเรียน — การดูรายเคสเป็นหน้าที่ของครูแนะแนวและทีมดูแล',
      'ห้ามใช้ตัวเลขเหล่านี้ประเมินครูหรือจัดอันดับห้องเรียน',
      'ตัวเลขที่สำคัญที่สุดคือความเร็วในการตอบสนอง ไม่ใช่จำนวนเคสที่ตรวจพบ',
    ],
  };
}

function refCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

const DEMO_CONSENT = {
  version: '1.0.0-demo',
  title: 'สิ่งที่เธอควรรู้ก่อนใช้ระบบนี้',
  points: [
    '⚠️ นี่คือหน้าสาธิต ข้อมูลที่กรอกจะไม่ถูกส่งไปหาใคร และไม่มีครูคนใดได้รับ',
    'ในระบบจริง สิ่งที่เธอเขียนจะถูกอ่านโดยครูที่รับผิดชอบระบบดูแลช่วยเหลือนักเรียนเท่านั้น ไม่ใช่ครูทุกคน',
    'ระบบไม่ได้อ่านแชตส่วนตัว โซเชียลมีเดีย หรือกล้องของเธอ',
    'ระบบไม่ได้วินิจฉัยว่าเธอเป็นโรคอะไร และไม่ได้ตัดสินว่าเธอเป็นคนแบบไหน',
    'เธอเลือกไม่บอกชื่อได้ และข้ามคำถามที่ยังไม่พร้อมตอบได้',
    'ข้อยกเว้นเรื่องความลับ: ถ้ามีสัญญาณว่าเธอหรือคนอื่นอาจไม่ปลอดภัย ครูจำเป็นต้องรู้ตัวตนของเธอเพื่อช่วยได้ทัน',
    'เบอร์สายด่วนในระบบนี้เป็นเบอร์จริง โทรได้ตลอด 24 ชั่วโมง',
  ],
  acceptLabel: 'เข้าใจแล้ว',
};
