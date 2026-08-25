/**
 * Api.gs — จุดรับคำขอทั้งหมดจากหน้าเว็บ
 *
 * หน้าเว็บส่ง POST มาที่ URL เดียว พร้อม { path, method, token, body }
 * แล้วไฟล์นี้กระจายไปตามเส้นทาง ซึ่งตั้งชื่อให้ตรงกับฉบับ Node ทุกเส้นทาง
 * เพื่อให้โค้ดหน้าเว็บแทบไม่ต้องแก้เลย
 *
 * เหตุผลที่ใช้ POST อย่างเดียวและส่ง Content-Type เป็น text/plain:
 *   Apps Script ตั้งส่วนหัว CORS เองไม่ได้ ถ้าส่งเป็น application/json
 *   เบราว์เซอร์จะยิง preflight ก่อน ซึ่ง Apps Script ตอบไม่ได้ คำขอจะพังทั้งหมด
 *   การใช้ text/plain ทำให้เป็นคำขอแบบง่ายที่ไม่ต้อง preflight
 */

function doGet(e) {
  // ใช้เช็กว่าติดตั้งสำเร็จหรือยัง เปิดใน URL ได้เลย
  return json_({ ok: true, service: 'CareAlert AI (Google Sheets)', ready: isReady_() });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var ctx = { user: null, student: null };
    var payload = verifyToken_(req.token);
    if (payload && payload.sub) {
      var u = findBy_('users', 'id', payload.sub);
      if (u && truthy_(u.active)) {
        ctx.user = u;
        if (u.role === 'student') ctx.student = findBy_('students', 'user_id', u.id);
      }
    }
    var data = route_(String(req.path || ''), String(req.method || 'GET').toUpperCase(), req.body || {}, ctx);
    out = { ok: true, status: 200, data: data === undefined ? { ok: true } : data };
  } catch (err) {
    out = {
      ok: false,
      status: err && err.__status ? err.__status : 500,
      error: err && err.message ? err.message : 'เกิดข้อผิดพลาดภายในระบบ',
      code: err && err.__code ? err.__code : 'INTERNAL',
    };
    if (!err || !err.__status) console.error(err && err.stack ? err.stack : err);
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isReady_() {
  try { return readAll_('users').length > 0; } catch (e) { return false; }
}

// ─────────────────────────── ตัวช่วยสิทธิ์ ───────────────────────────

function requireUser_(ctx, roles) {
  need_(ctx.user, 'กรุณาเข้าสู่ระบบ', 401);
  if (roles && roles.length && roles.indexOf(ctx.user.role) < 0) {
    throw fail_(403, 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้', 'FORBIDDEN');
  }
  return ctx.user;
}

var STAFF_ROLES = ['teacher', 'counselor', 'admin'];

function requireStaff_(ctx) { return requireUser_(ctx, STAFF_ROLES); }

/** ครูที่ปรึกษาเห็นเฉพาะห้องที่รับผิดชอบ ครูแนะแนวและผู้ดูแลเห็นทั้งโรงเรียน */
function canAccessStudent_(user, studentId) {
  if (!user) return false;
  if (user.role === 'counselor' || user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  var s = findBy_('students', 'id', studentId);
  if (!s) return false;
  var cl = findBy_('classrooms', 'id', s.classroom_id);
  return cl && String(cl.advisor_user_id) === String(user.id);
}

// ─────────────────────────── ตารางเส้นทาง ───────────────────────────

function route_(path, method, body, ctx) {
  var p = path.replace(/^\/api/, '');
  var qi = p.indexOf('?');
  var query = {};
  if (qi >= 0) {
    var qs = p.substring(qi + 1);
    p = p.substring(0, qi);
    qs.split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
  }
  var seg = p.split('/').filter(function (x) { return x !== ''; });
  var key = method + ' /' + seg.join('/');

  // ── สาธารณะ ──────────────────────────────────────────────
  if (key === 'GET /health') return { ok: true, service: 'CareAlert AI' };
  if (key === 'GET /meta/help') {
    return { helplines: helplines, crisisScreen: crisisScreen, school: (getSetting_('school', {}) || {}).contacts || [] };
  }
  if (key === 'GET /meta/consent') return { consent: getSetting_('consent', defaultConsent_()) };

  if (key === 'POST /auth/login') return authLogin_(body, ctx);
  if (key === 'GET /auth/roster/status') {
    var cfg = getSetting_('trial.roster', { enabled: false, accessCode: '', classroomIds: [] });
    return { enabled: !!cfg.enabled, requiresAccessCode: !!String(cfg.accessCode || '').trim() };
  }
  if (key === 'POST /auth/roster/classrooms') return rosterClassrooms_(body);
  if (key === 'POST /auth/roster/students') return rosterStudents_(body);
  if (key === 'POST /auth/roster/enter') return rosterEnter_(body, ctx);

  // ── ต้องเข้าสู่ระบบ ───────────────────────────────────────
  if (key === 'GET /auth/me') return authMe_(ctx);
  if (key === 'POST /auth/change-password') return changePassword_(body, ctx);

  // ── เช็กอิน ──────────────────────────────────────────────
  if (key === 'GET /checkin/templates') {
    requireUser_(ctx);
    return { template: query.cadence === 'daily' ? dailyCheckin : weeklyCheckin, followUps: followUps };
  }
  if (key === 'POST /checkin/follow-ups') {
    requireUser_(ctx);
    var ids = followUpTriggers(body.answers || {});
    return { followUps: ids.map(function (id) { return getTemplate(id); }).filter(Boolean) };
  }
  if (key === 'GET /checkin/mine') return checkinMine_(ctx);
  if (key === 'POST /checkin/submit') return checkinSubmit_(body, ctx);

  // ── การแจ้งเรื่อง ─────────────────────────────────────────
  if (key === 'GET /reports/templates') {
    var u = requireUser_(ctx);
    return { self: selfReport, friend: friendConcern, staffNote: u.role === 'student' ? null : staffNote };
  }
  if (key === 'POST /reports/self') return reportSelf_(body, ctx);
  if (key === 'POST /reports/friend') return reportFriend_(body, ctx);
  if (key === 'POST /reports/staff-note') return reportStaffNote_(body, ctx);

  // ── ทักษะชีวิต ────────────────────────────────────────────
  if (key === 'GET /lifeskills') return lifeskillsList_(ctx);
  if (seg[0] === 'lifeskills' && seg.length === 2 && method === 'GET') return lifeskillOne_(seg[1], ctx);
  if (seg[0] === 'lifeskills' && seg[2] === 'progress' && method === 'POST') return lifeskillProgress_(seg[1], body, ctx);
  if (seg[0] === 'lifeskills' && seg[2] === 'reflection' && method === 'POST') return lifeskillReflection_(seg[1], body, ctx);

  // ── เคส ──────────────────────────────────────────────────
  if (key === 'GET /cases/summary') return caseSummary_(ctx);
  if (key === 'GET /cases') return caseList_(query, ctx);
  if (seg[0] === 'cases' && seg.length === 2 && method === 'GET') return caseDetail_(num_(seg[1]), ctx);
  if (seg[0] === 'cases' && seg.length === 3 && method === 'POST') return caseAction_(num_(seg[1]), seg[2], body, ctx);

  // ── นักเรียน ─────────────────────────────────────────────
  if (key === 'GET /students/meta/classrooms') return classroomsForStaff_(ctx);
  if (key === 'GET /students') return studentSearch_(query, ctx);
  if (seg[0] === 'students' && seg.length === 2 && method === 'GET') return studentProfile_(num_(seg[1]), ctx);
  if (seg[0] === 'students' && seg[2] === 'notes' && method === 'PUT') return studentNotes_(num_(seg[1]), body, ctx);

  // ── สรุปผลและกฎ ───────────────────────────────────────────
  if (key === 'GET /analytics/overview') return analyticsOverview_(query, ctx);
  if (key === 'GET /analytics/executive') return analyticsExecutive_(query, ctx);
  if (key === 'GET /meta/engine') return metaEngine_(ctx);

  // ── ผู้ดูแลระบบ ───────────────────────────────────────────
  if (p.indexOf('/admin') === 0) return adminRoute_(seg, method, body, query, ctx);

  throw fail_(404, 'ไม่พบปลายทางที่เรียก: ' + key, 'NOT_FOUND');
}

// ─────────────────────────── เข้าสู่ระบบ ───────────────────────────

function publicUser_(u) {
  return {
    id: num_(u.id), role: u.role, username: u.username,
    displayName: u.display_name, mustChangePassword: truthy_(u.must_change_password),
  };
}

function lockedUntilActive_(u) {
  var lu = sqlStr_(u.locked_until);
  if (!lu) return false;
  return new Date(lu.replace(' ', 'T') + 'Z') > new Date();
}

function authLogin_(body, ctx) {
  var username = String(body.username || '').trim().toLowerCase();
  var password = String(body.password || '');
  need_(username, 'กรุณากรอกชื่อผู้ใช้');
  need_(password, 'กรุณากรอกรหัสผ่าน');

  var u = findBy_('users', 'username', username);
  if (!u || !truthy_(u.active)) {
    audit_(ctx, 'login.failed', null, null, 'ไม่พบผู้ใช้: ' + username);
    throw fail_(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'UNAUTHORIZED');
  }
  if (lockedUntilActive_(u)) {
    throw fail_(429, 'บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ในอีก ' + LOCK_MINUTES + ' นาที', 'LOCKED');
  }
  if (!verifyPin_(password, u.salt, u.pass_hash)) {
    var failed = num_(u.failed_logins) + 1;
    update_('users', u.id, {
      failed_logins: failed,
      locked_until: failed >= MAX_ATTEMPTS ? toSqlDate(new Date(Date.now() + LOCK_MINUTES * 60000)) : sqlStr_(u.locked_until) || '',
    });
    audit_(ctx, 'login.failed', 'user', u.id);
    throw fail_(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'UNAUTHORIZED');
  }
  update_('users', u.id, { failed_logins: 0, locked_until: '', last_login_at: nowSql() });
  audit_({ user: u }, 'login.success', 'user', u.id);
  return { token: signToken_(num_(u.id), u.role), user: publicUser_(u) };
}

function authMe_(ctx) {
  var u = requireUser_(ctx);
  var student = null;
  if (ctx.student) {
    var cl = findBy_('classrooms', 'id', ctx.student.classroom_id);
    student = {
      id: num_(ctx.student.id),
      studentCode: String(ctx.student.student_code),
      classroom: cl ? cl.name : null,
      hasConsent: true,
    };
  }
  return { user: publicUser_(u), student: student };
}

function changePassword_(body, ctx) {
  var u = requireUser_(ctx);
  var current = String(body.currentPassword || '');
  var next = String(body.newPassword || '');
  need_(verifyPin_(current, u.salt, u.pass_hash), 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  need_(next.length >= 6, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร');
  need_(next !== current, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
  var h = makeHash_(next);
  update_('users', u.id, { pass_hash: h.hash, salt: h.salt, must_change_password: 0 });
  audit_(ctx, 'password.changed', 'user', u.id);
  return { ok: true };
}

// ─────────────────────────── โหมดทดลอง: กดชื่อตัวเอง ───────────────────────────

function trialCfg_() {
  return getSetting_('trial.roster', { enabled: false, accessCode: '', classroomIds: [] });
}

function requireTrial_(accessCode) {
  var cfg = trialCfg_();
  need_(cfg.enabled, 'ยังไม่ได้เปิดโหมดทดลองสำหรับการเข้าด้วยรายชื่อ', 403);
  var expected = String(cfg.accessCode || '').trim();
  if (expected && String(accessCode || '').trim().toUpperCase() !== expected.toUpperCase()) {
    throw fail_(401, 'รหัสเข้าโรงเรียนไม่ถูกต้อง — ถามครูประจำวิชาได้เลย', 'UNAUTHORIZED');
  }
  return cfg;
}

function rosterClassrooms_(body) {
  var cfg = requireTrial_(body.accessCode);
  var ids = cfg.classroomIds || [];
  var students = readAll_('students');
  var out = readAll_('classrooms')
    .filter(function (c) { return ids.indexOf(num_(c.id)) >= 0; })
    .map(function (c) {
      var n = students.filter(function (s) {
        return String(s.classroom_id) === String(c.id) && truthy_(s.active);
      }).length;
      return { id: num_(c.id), name: c.name, level: c.level, student_count: n };
    });
  return { classrooms: out };
}

function rosterStudents_(body) {
  var cfg = requireTrial_(body.accessCode);
  var cid = num_(body.classroomId);
  need_((cfg.classroomIds || []).indexOf(cid) >= 0, 'ห้องนี้ยังไม่ได้เปิดให้ทดลอง', 403);
  var users = readAll_('users');
  var byId = {};
  users.forEach(function (u) { byId[String(u.id)] = u; });
  var out = readAll_('students')
    .filter(function (s) { return String(s.classroom_id) === String(cid) && truthy_(s.active); })
    .map(function (s) {
      var u = byId[String(s.user_id)];
      return { id: num_(s.id), displayName: s.display_name, claimed: !!(u && truthy_(u.self_pin_set)) };
    })
    .sort(function (a, b) { return a.displayName < b.displayName ? -1 : 1; });
  return { students: out };
}

function rosterEnter_(body, ctx) {
  var cfg = requireTrial_(body.accessCode);
  var sid = num_(body.studentId);
  var pin = String(body.pin || '').trim();
  need_(/^\d{4,6}$/.test(pin), 'รหัสต้องเป็นตัวเลข 4–6 หลัก');

  var s = findBy_('students', 'id', sid);
  need_(s && truthy_(s.active), 'ไม่พบนักเรียนคนนี้', 404);
  need_((cfg.classroomIds || []).indexOf(num_(s.classroom_id)) >= 0, 'ห้องนี้ยังไม่ได้เปิดให้ทดลอง', 403);

  var u = findBy_('users', 'id', s.user_id);
  need_(u && truthy_(u.active), 'บัญชีนี้ใช้งานไม่ได้', 404);
  if (lockedUntilActive_(u)) {
    throw fail_(429, 'ใส่รหัสผิดหลายครั้ง กรุณารออีก ' + LOCK_MINUTES + ' นาที แล้วลองใหม่', 'LOCKED');
  }

  // ครั้งแรก — ตั้งรหัสของตัวเอง
  if (!truthy_(u.self_pin_set)) {
    var confirm = String(body.confirmPin || '').trim();
    need_(pin === confirm, 'รหัสสองช่องไม่ตรงกัน ลองใหม่อีกครั้ง');
    need_(!/^(\d)\1+$/.test(pin), 'อย่าใช้เลขซ้ำกันทั้งหมด เช่น 1111 — เดาง่ายเกินไป');
    need_(['1234', '0000', '12345', '123456'].indexOf(pin) < 0, 'รหัสนี้เดาง่ายเกินไป ลองเลขอื่นดู');
    var h = makeHash_(pin);
    update_('users', u.id, {
      pass_hash: h.hash, salt: h.salt, self_pin_set: 1, must_change_password: 0,
      failed_logins: 0, locked_until: '', last_login_at: nowSql(),
    });
    audit_({ user: u }, 'roster.claim', 'student', sid);
    return { token: signToken_(num_(u.id), u.role), user: publicUser_(u), claimed: true };
  }

  // ครั้งต่อไป — ตรวจรหัส
  if (!verifyPin_(pin, u.salt, u.pass_hash)) {
    var failed = num_(u.failed_logins) + 1;
    update_('users', u.id, {
      failed_logins: failed,
      locked_until: failed >= MAX_ATTEMPTS ? toSqlDate(new Date(Date.now() + LOCK_MINUTES * 60000)) : sqlStr_(u.locked_until) || '',
    });
    audit_(ctx, 'roster.failed', 'student', sid);
    throw fail_(401, 'รหัสไม่ถูกต้อง — ถ้าลืมรหัส บอกครูให้ตั้งใหม่ให้ได้', 'UNAUTHORIZED');
  }
  update_('users', u.id, { failed_logins: 0, locked_until: '', last_login_at: nowSql() });
  audit_({ user: u }, 'roster.login', 'student', sid);
  return { token: signToken_(num_(u.id), u.role), user: publicUser_(u), claimed: false };
}

function defaultConsent_() {
  return {
    version: '1.0.0',
    title: 'สิ่งที่เธอควรรู้ก่อนใช้ระบบนี้',
    points: [
      'ระบบนี้มีไว้เพื่อช่วยเหลือ ไม่ได้มีไว้จับผิดหรือลงโทษ',
      'สิ่งที่เธอเขียนจะถูกอ่านโดยครูที่รับผิดชอบระบบดูแลช่วยเหลือนักเรียนเท่านั้น ไม่ใช่ครูทุกคน',
      'ระบบไม่ได้อ่านแชตส่วนตัว โซเชียลมีเดีย หรือกล้องของเธอ',
      'ระบบไม่ได้วินิจฉัยว่าเธอเป็นโรคอะไร และไม่ได้ตัดสินว่าเธอเป็นคนแบบไหน',
      'เธอเลือกไม่บอกชื่อได้ และข้ามคำถามที่ยังไม่พร้อมตอบได้',
      'ข้อยกเว้นเรื่องความลับ: ถ้ามีสัญญาณว่าเธอหรือคนอื่นอาจไม่ปลอดภัย ครูจำเป็นต้องรู้ตัวตนของเธอเพื่อช่วยได้ทัน — เราบอกเรื่องนี้ไว้ล่วงหน้าเสมอ',
      'เธอขอดูหรือขอลบข้อมูลของตัวเองได้ โดยติดต่อครูแนะแนว',
    ],
    acceptLabel: 'เข้าใจแล้ว เริ่มใช้งาน',
  };
}
