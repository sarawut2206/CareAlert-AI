/**
 * ทดสอบเส้นทางหลักแบบ end-to-end กับ API จริง
 * ใช้ตอนตรวจรับระบบ: node server/test/smoke.mjs
 * ต้องรันเซิร์ฟเวอร์ไว้ก่อน (npm start หรือ npm run dev)
 */

const BASE = process.env.BASE_URL || 'http://localhost:8787';
let pass = 0; let fail = 0;

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function check(label, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ✔ ${label}`); }
  else { fail += 1; console.log(`  ✖ ${label} ${extra}`); }
}

const login = async (username, password) => {
  const r = await api('/api/auth/login', { method: 'POST', body: { username, password } });
  if (r.status !== 200) throw new Error(`เข้าสู่ระบบไม่สำเร็จ (${username}): ${JSON.stringify(r.data)}`);
  return r.data.token;
};

console.log(`\nทดสอบระบบที่ ${BASE}\n`);

const health = await api('/api/health');
check('เซิร์ฟเวอร์ตอบสนอง', health.status === 200);

// ── นักเรียน ──────────────────────────────────────────────
const studentToken = await login('30101', '123456');
check('นักเรียนเข้าสู่ระบบได้', !!studentToken);

const me = await api('/api/auth/me', { token: studentToken });
check('อ่านข้อมูลตัวเองได้', me.data.user?.role === 'student');

const tpl = await api('/api/checkin/templates?cadence=weekly', { token: studentToken });
check('ดึงชุดคำถามรายสัปดาห์ได้', tpl.data.template?.items?.length >= 9);

// 1) เช็กอินที่ไม่มีสัญญาณ → ไม่เปิดเคส
const calm = await api('/api/checkin/submit', {
  token: studentToken, method: 'POST',
  body: {
    templateId: 'weekly-core',
    answers: { c1: 0, c2: 0, c3: 1, c4: 0, c5: 0, c6: 0, c7: 3, c8: 0, c9: 0, c_help: 'no' },
    timings: { c1: 3000, c2: 3000, c3: 3000, c4: 3000, c5: 3000, c6: 3000, c7: 3000, c8: 3000, c9: 3000 },
    durationMs: 40000,
  },
});
check('เช็กอินปกติ → ไม่เปิดเคส', calm.data.caseOpened === false, JSON.stringify(calm.data));
check('นักเรียนไม่เห็นระดับหรือคะแนน',
  calm.data.level === undefined && calm.data.concernIndex === undefined);

// 2) ตรวจว่าเซิร์ฟเวอร์เปิดชุดคำถามเชิงลึกเอง
const fu = await api('/api/checkin/follow-ups', {
  token: studentToken, method: 'POST',
  body: { answers: { c1: 3, c6: 2, c9: 2 } },
});
const fuIds = (fu.data.followUps ?? []).map((t) => t.id);
check('เปิดชุดคำถามเชิงลึกตามเงื่อนไข',
  fuIds.includes('fu-mood') && fuIds.includes('fu-bullying') && fuIds.includes('fu-safety'),
  JSON.stringify(fuIds));

// 3) เช็กอินที่มีสัญญาณความปลอดภัย → เปิดเคสระดับ 4 + แสดงสายด่วน
const student2 = await login('30102', '123456');
const crisis = await api('/api/checkin/submit', {
  token: student2, method: 'POST',
  body: {
    templateId: 'weekly-core',
    followUpIds: ['fu-safety'],
    answers: {
      c1: 3, c2: 3, c3: 2, c4: 2, c5: 2, c6: 1, c7: 0, c8: 1, c9: 2, c_help: 'maybe',
      s_freq: 2, s_plan: 0, s_past: 0, s_now: 3, s_who: 3, s_talk: 'yes',
    },
    durationMs: 90000,
  },
});
check('เคสความปลอดภัยถูกเปิด', crisis.data.caseOpened === true);
check('นักเรียนเห็นหน้าจอวิกฤต + สายด่วน',
  !!crisis.data.crisis && crisis.data.helplines?.length > 0);

// 4) เป็นห่วงเพื่อน (ไม่ระบุตัวตน)
const friend = await api('/api/reports/friend', {
  token: studentToken, method: 'POST',
  body: {
    anonymous: true,
    subjectHint: 'เพื่อนห้อง ม.3/2 ชื่อเล่นว่าใหม่',
    answers: { f_what: ['saidDeath', 'withdrawn'], f_when: 3, f_safe: 2, f_known: 3, f_detail: 'เพื่อนบอกว่าไม่อยากอยู่แล้ว' },
  },
});
check('แจ้งเป็นห่วงเพื่อนแบบไม่ระบุตัวตนได้', friend.data.ok === true);
check('ได้รับรหัสอ้างอิงสำหรับติดตาม', !!friend.data.referenceCode);

// 5) นักเรียนต้องเข้าถึงคิวเคสไม่ได้
const forbidden = await api('/api/cases', { token: studentToken });
check('นักเรียนเข้าถึงคิวเคสไม่ได้', forbidden.status === 403, `ได้ ${forbidden.status}`);

// ── บุคลากร ──────────────────────────────────────────────
const counselorToken = await login('counselor', 'counsel1234');
const queue = await api('/api/cases?status=open', { token: counselorToken });
check('ครูแนะแนวเห็นคิวเคส', queue.data.cases?.length >= 2, JSON.stringify(queue.data).slice(0, 200));

const l4 = queue.data.cases.find((c) => c.level === 4);
check('มีเคสระดับ 4 อยู่ในคิว', !!l4);

const detail = await api(`/api/cases/${l4.id}`, { token: counselorToken });
check('เปิดรายละเอียดเคสได้', detail.status === 200);
check('เห็นเหตุผลที่ระบบให้ระดับนี้', detail.data.assessments?.[0]?.rationale?.matched?.length > 0);
check('เห็นข้อความต้นฉบับที่นักเรียนตอบ', detail.data.sources?.length > 0);
check('มีรายการสิ่งที่ต้องทำก่อนปิดเคส', detail.data.closeBlockers?.length > 0);

// 6) ปิดเคสโดยยังไม่ได้คุยกับนักเรียน → ต้องถูกปฏิเสธ
const badClose = await api(`/api/cases/${l4.id}/close`, {
  token: counselorToken, method: 'POST', body: { reason: 'ดูแล้วไม่น่าจะมีอะไร' },
});
check('ปิดเคสโดยยังไม่ได้ดำเนินการ → ถูกปฏิเสธ', badClose.status === 400, JSON.stringify(badClose.data));

// 7) เดินตามวงจรให้ครบ แล้วปิดเคส
await api(`/api/cases/${l4.id}/acknowledge`, { token: counselorToken, method: 'POST' });
await api(`/api/cases/${l4.id}/contact`, {
  token: counselorToken, method: 'POST',
  body: { note: 'พบนักเรียนที่ห้องแนะแนว ประเมินความปลอดภัยแล้ว มีผู้ปกครองมารับ', safetyConfirmed: true },
});
await api(`/api/cases/${l4.id}/action`, {
  token: counselorToken, method: 'POST', body: { note: 'วางแผนความปลอดภัยร่วมกับนักเรียนและผู้ปกครอง', kind: 'safety-plan' },
});
await api(`/api/cases/${l4.id}/guardian`, {
  token: counselorToken, method: 'POST', body: { informed: true, note: 'แจ้งผู้ปกครองทางโทรศัพท์' },
});
const goodClose = await api(`/api/cases/${l4.id}/close`, {
  token: counselorToken, method: 'POST',
  body: { reason: 'ดำเนินการครบตามแผน นักเรียนปลอดภัย ส่งต่อการติดตามรายเดือน' },
});
check('ปิดเคสได้เมื่อครบวงจร', goodClose.data.ok === true, JSON.stringify(goodClose.data));

// 8) ครูที่ปรึกษาเห็นเฉพาะห้องตัวเอง
const teacher2 = await login('teacher2', 'teacher1234');
const t2Queue = await api('/api/cases?status=all', { token: teacher2 });
const leaked = (t2Queue.data.cases ?? []).filter((c) => c.classroom && c.classroom !== 'ม.3/2');
check('ครูที่ปรึกษาไม่เห็นเคสของห้องอื่น', leaked.length === 0, JSON.stringify(leaked.map((c) => c.classroom)));

// 9) ความโปร่งใสของกฎ
const engine = await api('/api/meta/engine', { token: counselorToken });
check('เปิดดูกฎทั้งหมดของระบบได้', engine.data.rules?.length > 15);

// 10) หน้าขอความช่วยเหลือเข้าถึงได้โดยไม่ต้องล็อกอิน
const help = await api('/api/meta/help');
check('หน้าขอความช่วยเหลือเปิดได้โดยไม่ต้องล็อกอิน', help.data.helplines?.length > 0);

// 10.5) ผู้บริหาร: เห็นภาพรวม แต่ห้ามเห็นรายบุคคล
const directorToken = await login('director', 'director1234');
const exec = await api('/api/analytics/executive?days=90', { token: directorToken });
check('ผู้บริหารเปิดแดชบอร์ดภาพรวมได้', exec.status === 200 && exec.data.kpi !== undefined,
  JSON.stringify(exec.data).slice(0, 150));
check('แดชบอร์ดผู้บริหารไม่มีชื่อนักเรียน',
  !JSON.stringify(exec.data).includes('นักเรียนตัวอย่าง'));

const execCases = await api('/api/cases', { token: directorToken });
check('ผู้บริหารเข้าคิวเคสรายบุคคลไม่ได้', execCases.status === 403, `ได้ ${execCases.status}`);
const execStudents = await api('/api/students', { token: directorToken });
check('ผู้บริหารค้นหานักเรียนรายคนไม่ได้', execStudents.status === 403, `ได้ ${execStudents.status}`);

// 11) ผู้ดูแลเห็น audit log
const adminToken = await login('admin', 'admin1234');
const auditLog = await api('/api/admin/audit?limit=20', { token: adminToken });
check('มีร่องรอยการเข้าถึงข้อมูล (audit log)', auditLog.data.entries?.length > 0);
check('การเปิดดูเคสถูกบันทึกไว้', auditLog.data.entries.some((e) => e.action === 'case.view'));

console.log(`\nผลรวม: ผ่าน ${pass} / ล้มเหลว ${fail}\n`);
process.exit(fail ? 1 : 0);
