/**
 * Admin.gs — หน้าสรุปผล แดชบอร์ดผู้บริหาร และการจัดการระบบ
 *
 * กติกาความเป็นส่วนตัวของหน้าสรุป:
 *   แสดงเฉพาะข้อมูลรวม ไม่มีชื่อนักเรียน และกลบกลุ่มที่เล็กกว่า MIN_CELL
 *   เพราะกลุ่มเล็กเดาตัวบุคคลได้ง่าย
 */

function mask_(n) { return (n > 0 && n < MIN_CELL) ? null : n; }

function sinceSql_(days) {
  return toSqlDate(new Date(Date.now() - days * 86400000));
}

function medianOf_(arr) {
  if (!arr.length) return null;
  var s = arr.slice().sort(function (a, b) { return a - b; });
  return Math.round(s[Math.floor(s.length / 2)] * 10) / 10;
}

function hoursBetween_(a, b) {
  return (new Date(b.replace(' ', 'T') + 'Z') - new Date(a.replace(' ', 'T') + 'Z')) / 3600000;
}

function collectTags_(assessments) {
  var tally = {};
  assessments.forEach(function (a) {
    if (num_(a.level) < 2) return;
    var f = parseJson_(a.flags_json, {});
    (f.contextTags || []).forEach(function (t) { tally[t] = (tally[t] || 0) + 1; });
    (f.lexicon || []).forEach(function (c) { tally['lexicon:' + c] = (tally['lexicon:' + c] || 0) + 1; });
  });
  return tally;
}

function analyticsOverview_(query, ctx) {
  requireStaff_(ctx);
  var days = query.days ? num_(query.days) : 30;
  var since = sinceSql_(days);

  var assess = readAll_('assessments').filter(function (a) { return sqlStr_(a.created_at) >= since; });
  var cases = readAll_('cases').filter(function (c) { return sqlStr_(c.opened_at) >= since; });

  var byLevelTally = {};
  assess.forEach(function (a) { byLevelTally[num_(a.level)] = (byLevelTally[num_(a.level)] || 0) + 1; });

  var originTally = {};
  cases.forEach(function (c) { originTally[c.origin] = (originTally[c.origin] || 0) + 1; });

  var sla = { total: cases.length, ackMet: 0, ackLate: 0, contactMet: 0, contactLate: 0, stillOpen: 0 };
  var closeHours = [];
  cases.forEach(function (c) {
    var a = slaStatus(sqlStr_(c.acknowledge_due_at), sqlStr_(c.acknowledged_at));
    var k = slaStatus(sqlStr_(c.contact_due_at), sqlStr_(c.first_contact_at));
    if (a === 'met') sla.ackMet++;
    if (a === 'late' || a === 'overdue') sla.ackLate++;
    if (k === 'met') sla.contactMet++;
    if (k === 'late' || k === 'overdue') sla.contactLate++;
    if (c.status !== 'closed') sla.stillOpen++;
    if (sqlStr_(c.closed_at)) closeHours.push(hoursBetween_(sqlStr_(c.opened_at), sqlStr_(c.closed_at)));
  });

  var activeIds = {};
  readCols_('checkins', ['student_id', 'submitted_at']).forEach(function (r) {
    if (sqlStr_(r.submitted_at) >= since) activeIds[String(r.student_id)] = 1;
  });
  var totalStudents = readAll_('students').filter(function (s) { return truthy_(s.active); }).length;
  var active = Object.keys(activeIds).length;

  var suffTally = {};
  assess.forEach(function (a) { suffTally[a.data_sufficiency] = (suffTally[a.data_sufficiency] || 0) + 1; });

  var tags = collectTags_(assess);
  var progress = readAll_('lifeskill_progress').filter(function (p) { return sqlStr_(p.updated_at) >= since; });

  audit_(ctx, 'analytics.overview', null, null, { days: days });

  return {
    days: days,
    byLevel: Object.keys(byLevelTally).map(function (lv) { return { level: num_(lv), n: byLevelTally[lv] }; })
      .sort(function (a, b) { return a.level - b.level; }),
    byOrigin: Object.keys(originTally).map(function (o) { return { origin: o, n: mask_(originTally[o]) }; }),
    sla: Object.assign(sla, { medianCloseHours: medianOf_(closeHours) }),
    participation: { active: active, total: totalStudents, rate: totalStudents ? Math.round((active / totalStudents) * 100) : 0 },
    sufficiency: Object.keys(suffTally).map(function (k) { return { data_sufficiency: k, n: suffTally[k] }; }),
    topTags: Object.keys(tags).map(function (t) { return { tag: t, n: mask_(tags[t]) }; })
      .filter(function (t) { return t.n !== null; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 12),
    lifeskills: { started: progress.length, completed: progress.filter(function (p) { return truthy_(p.completed); }).length },
    note: 'ตัวเลขเหล่านี้ใช้เพื่อปรับปรุงระบบดูแลของโรงเรียน ไม่ใช่เพื่อประเมินครูหรือจัดอันดับห้องเรียน กลุ่มที่มีจำนวนน้อยกว่า ' + MIN_CELL + ' ถูกกลบไว้เพื่อป้องกันการระบุตัวนักเรียน',
  };
}

/** แดชบอร์ดผู้บริหาร — ภาพรวมทั้งโรงเรียนแบบไม่มีชื่อนักเรียน */
function analyticsExecutive_(query, ctx) {
  requireUser_(ctx, ['director', 'counselor', 'admin']);
  var days = query.days ? num_(query.days) : 90;
  var since = sinceSql_(days);

  var students = readAll_('students').filter(function (s) { return truthy_(s.active); });
  var classrooms = readAll_('classrooms');
  var allCases = readAll_('cases');
  var open = allCases.filter(function (c) { return c.status !== 'closed'; });

  var activeIds = {};
  readCols_('checkins', ['student_id', 'submitted_at']).forEach(function (r) {
    if (sqlStr_(r.submitted_at) >= since) activeIds[String(r.student_id)] = 1;
  });
  var active = Object.keys(activeIds).length;

  var kpi = {
    students: students.length,
    activeStudents: active,
    participationRate: students.length ? Math.round((active / students.length) * 100) : 0,
    openL4: open.filter(function (c) { return num_(c.level) === 4; }).length,
    openL3: open.filter(function (c) { return num_(c.level) === 3; }).length,
    openL2: open.filter(function (c) { return num_(c.level) === 2; }).length,
    overdue: open.filter(function (c) { return slaStatus(sqlStr_(c.contact_due_at), sqlStr_(c.first_contact_at)) === 'overdue'; }).length,
    unacknowledged: open.filter(function (c) { return c.status === 'new'; }).length,
  };

  var period = allCases.filter(function (c) { return sqlStr_(c.opened_at) >= since; });
  var ackMet = 0, contactMet = 0, contactH = [], closeH = [];
  period.forEach(function (c) {
    if (slaStatus(sqlStr_(c.acknowledge_due_at), sqlStr_(c.acknowledged_at)) === 'met') ackMet++;
    if (slaStatus(sqlStr_(c.contact_due_at), sqlStr_(c.first_contact_at)) === 'met') contactMet++;
    if (sqlStr_(c.first_contact_at)) contactH.push(hoursBetween_(sqlStr_(c.opened_at), sqlStr_(c.first_contact_at)));
    if (sqlStr_(c.closed_at)) closeH.push(hoursBetween_(sqlStr_(c.opened_at), sqlStr_(c.closed_at)));
  });

  var assess = readAll_('assessments').filter(function (a) { return sqlStr_(a.created_at) >= since; });
  var weekKey = function (s) {
    var d = new Date(s.replace(' ', 'T') + 'Z');
    var start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var wk = Math.floor((d.getTime() - start.getTime()) / (7 * 86400000));
    return d.getUTCFullYear() + '-' + ('0' + wk).slice(-2);
  };
  var wmap = {};
  assess.forEach(function (a) {
    var k = weekKey(sqlStr_(a.created_at));
    if (!wmap[k]) wmap[k] = { assessments: 0, priority: 0, cases: 0 };
    wmap[k].assessments++;
    if (num_(a.level) >= 3) wmap[k].priority++;
  });
  period.forEach(function (c) {
    var k = weekKey(sqlStr_(c.opened_at));
    if (!wmap[k]) wmap[k] = { assessments: 0, priority: 0, cases: 0 };
    wmap[k].cases++;
  });
  var weekly = Object.keys(wmap).sort().map(function (w) {
    return { week: w, assessments: wmap[w].assessments, priority: wmap[w].priority, cases: wmap[w].cases };
  });

  // แยกตามระดับชั้นเท่านั้น ไม่แยกรายห้อง — กันการใช้จัดอันดับครู
  var grades = {};
  students.forEach(function (s) {
    var cl = findBy_('classrooms', 'id', s.classroom_id);
    var g = cl ? cl.level : 'ไม่ระบุ';
    if (!grades[g]) grades[g] = { students: 0, active: 0 };
    grades[g].students++;
    if (activeIds[String(s.id)]) grades[g].active++;
  });
  var byGradeLevel = Object.keys(grades).sort().map(function (g) {
    var v = grades[g];
    if (v.students < MIN_CELL) return { grade: g, students: v.students, active: null, rate: null };
    return { grade: g, students: v.students, active: v.active, rate: Math.round((v.active / v.students) * 100) };
  });

  var tags = collectTags_(assess);
  var originTally = {};
  period.forEach(function (c) { originTally[c.origin] = (originTally[c.origin] || 0) + 1; });
  var progress = readAll_('lifeskill_progress').filter(function (p) { return sqlStr_(p.updated_at) >= since; });

  audit_(ctx, 'analytics.executive', null, null, { days: days });

  return {
    days: days, kpi: kpi,
    sla: {
      total: period.length,
      ackRate: period.length ? Math.round((ackMet / period.length) * 100) : null,
      contactRate: period.length ? Math.round((contactMet / period.length) * 100) : null,
      medianContactHours: medianOf_(contactH),
      medianCloseHours: medianOf_(closeH),
    },
    funnel: {
      opened: period.length,
      acknowledged: period.filter(function (c) { return !!sqlStr_(c.acknowledged_at); }).length,
      contacted: period.filter(function (c) { return !!sqlStr_(c.first_contact_at); }).length,
      referred: period.filter(function (c) { return c.status === 'referred'; }).length,
      closed: period.filter(function (c) { return c.status === 'closed'; }).length,
    },
    weekly: weekly,
    byGradeLevel: byGradeLevel,
    topCategories: Object.keys(tags).map(function (t) { return { tag: t, n: mask_(tags[t]) }; })
      .filter(function (t) { return t.n !== null; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 10),
    origins: Object.keys(originTally).map(function (o) { return { origin: o, n: mask_(originTally[o]) }; }),
    lifeskills: { started: progress.length, completed: progress.filter(function (p) { return truthy_(p.completed); }).length },
    governance: [
      'แดชบอร์ดนี้แสดงเฉพาะข้อมูลรวม ไม่มีชื่อนักเรียน — การดูรายเคสเป็นหน้าที่ของครูแนะแนวและทีมดูแล',
      'กลุ่มที่มีจำนวนน้อยกว่า ' + MIN_CELL + ' ถูกกลบไว้ เพื่อป้องกันการระบุตัวนักเรียนโดยอ้อม',
      'ห้ามใช้ตัวเลขเหล่านี้ประเมินครูหรือจัดอันดับห้องเรียน — จะทำให้ครูเลี่ยงการบันทึกเคส ซึ่งอันตรายกว่าไม่มีระบบ',
      'ตัวเลขที่สำคัญที่สุดคือความเร็วในการตอบสนอง ไม่ใช่จำนวนเคสที่ตรวจพบ',
    ],
  };
}

// ─────────────────────────── ผู้ดูแลระบบ ───────────────────────────

function randomCode_(len) {
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = '';
  for (var i = 0; i < len; i++) out += a.charAt(Math.floor(Math.random() * a.length));
  return out;
}

function adminRoute_(seg, method, body, query, ctx) {
  var key = method + ' /' + seg.join('/');

  // รีเซ็ตรหัสที่นักเรียนตั้งเอง — ครูแนะแนวทำได้ด้วย (นักเรียนลืมรหัสบ่อย)
  if (seg[1] === 'students' && seg[3] === 'reset-pin' && method === 'POST') {
    requireUser_(ctx, ['admin', 'counselor']);
    var sid = num_(seg[2]);
    var st = findBy_('students', 'id', sid);
    need_(st, 'ไม่พบนักเรียน', 404);
    update_('users', st.user_id, { self_pin_set: 0, failed_logins: 0, locked_until: '' });
    audit_(ctx, 'admin.student.resetPin', 'student', sid);
    return { ok: true, message: st.display_name + ' ตั้งรหัสใหม่ได้แล้วในการเข้าครั้งถัดไป' };
  }

  requireUser_(ctx, ['admin']);

  if (key === 'GET /admin/users') {
    return {
      users: readAll_('users').filter(function (u) { return u.role !== 'student'; }).map(function (u) {
        return {
          id: num_(u.id), role: u.role, username: u.username, display_name: u.display_name,
          active: truthy_(u.active) ? 1 : 0, last_login_at: sqlStr_(u.last_login_at),
          must_change_password: truthy_(u.must_change_password) ? 1 : 0,
        };
      }),
    };
  }

  if (key === 'POST /admin/users') {
    var role = body.role;
    need_(['teacher', 'counselor', 'admin', 'director'].indexOf(role) >= 0, 'บทบาทไม่ถูกต้อง');
    var username = String(body.username || '').trim().toLowerCase();
    var displayName = String(body.displayName || '').trim();
    need_(username.length >= 3, 'ชื่อผู้ใช้สั้นเกินไป');
    need_(displayName.length >= 2, 'กรุณากรอกชื่อที่แสดง');
    need_(!findBy_('users', 'username', username), 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
    var temp = randomCode_(10);
    var h = makeHash_(temp);
    var u = insert_('users', {
      role: role, username: username, pass_hash: h.hash, salt: h.salt,
      display_name: displayName, active: 1, self_pin_set: 0, must_change_password: 1,
      failed_logins: 0, created_at: nowSql(),
    });
    audit_(ctx, 'admin.user.create', 'user', u.id, { role: role, username: username });
    return { ok: true, id: num_(u.id), tempPassword: temp };
  }

  if (seg[1] === 'users' && seg[3] === 'reset-password' && method === 'POST') {
    var uid = num_(seg[2]);
    need_(findBy_('users', 'id', uid), 'ไม่พบผู้ใช้', 404);
    var t2 = randomCode_(10);
    var h2 = makeHash_(t2);
    update_('users', uid, { pass_hash: h2.hash, salt: h2.salt, must_change_password: 1, failed_logins: 0, locked_until: '' });
    audit_(ctx, 'admin.user.resetPassword', 'user', uid);
    return { ok: true, tempPassword: t2 };
  }

  if (seg[1] === 'users' && seg[3] === 'active' && method === 'POST') {
    var uid2 = num_(seg[2]);
    need_(uid2 !== num_(ctx.user.id) || body.active, 'ปิดบัญชีของตัวเองไม่ได้');
    update_('users', uid2, { active: body.active ? 1 : 0 });
    audit_(ctx, 'admin.user.active', 'user', uid2, { active: !!body.active });
    return { ok: true };
  }

  if (key === 'POST /admin/classrooms') {
    var name = String(body.name || '').trim();
    var level = String(body.level || '').trim();
    need_(name, 'กรุณากรอกชื่อห้อง');
    need_(level, 'กรุณากรอกระดับชั้น');
    need_(!findBy_('classrooms', 'name', name), 'มีห้องนี้อยู่แล้ว');
    var c = insert_('classrooms', {
      name: name, level: level,
      advisor_user_id: body.advisorUserId ? num_(body.advisorUserId) : '',
      created_at: nowSql(),
    });
    audit_(ctx, 'admin.classroom.create', 'classroom', c.id);
    return { ok: true, id: num_(c.id) };
  }

  if (seg[1] === 'classrooms' && seg.length === 3 && method === 'PUT') {
    update_('classrooms', num_(seg[2]), { advisor_user_id: body.advisorUserId ? num_(body.advisorUserId) : '' });
    audit_(ctx, 'admin.classroom.update', 'classroom', seg[2]);
    return { ok: true };
  }

  if (key === 'POST /admin/students/import') return importStudents_(body, ctx);

  if (key === 'GET /admin/settings') {
    return {
      school: getSetting_('school', { name: '', contacts: [] }),
      notify: null,
      consent: getSetting_('consent', defaultConsent_()),
      retention: { checkinDays: 365, closedCaseDays: 1095, auditDays: 1095 },
      llmEnabled: false,
    };
  }

  if (key === 'PUT /admin/settings') {
    if (body.school !== undefined) setSetting_('school', body.school);
    if (body.consent !== undefined) setSetting_('consent', body.consent);
    audit_(ctx, 'admin.settings.update');
    return { ok: true };
  }

  if (key === 'GET /admin/trial') {
    var students = readAll_('students');
    var users = readAll_('users');
    var byId = {};
    users.forEach(function (u) { byId[String(u.id)] = u; });
    return {
      trial: getSetting_('trial.roster', { enabled: false, accessCode: '', classroomIds: [] }),
      progress: readAll_('classrooms').map(function (c) {
        var inRoom = students.filter(function (s) { return String(s.classroom_id) === String(c.id) && truthy_(s.active); });
        return {
          id: num_(c.id), name: c.name, total: inRoom.length,
          claimed: inRoom.filter(function (s) {
            var u = byId[String(s.user_id)];
            return u && truthy_(u.self_pin_set);
          }).length,
        };
      }).sort(function (a, b) { return a.name.localeCompare(b.name, 'th', { numeric: true }); }),
    };
  }

  if (key === 'PUT /admin/trial') {
    var enabled = !!body.enabled;
    var code = String(body.accessCode || '').trim();
    var ids = (body.classroomIds || []).map(num_).filter(function (n) { return n > 0; });
    need_(!enabled || code, 'ต้องตั้งรหัสเข้าโรงเรียนก่อนเปิดโหมดทดลอง — เพื่อไม่ให้รายชื่อนักเรียนจริงเปิดสู่สาธารณะ');
    need_(!enabled || ids.length, 'เลือกอย่างน้อยหนึ่งห้องเรียนที่จะเปิดให้ทดลอง');
    setSetting_('trial.roster', { enabled: enabled, accessCode: code, classroomIds: ids });
    audit_(ctx, 'admin.trial.update', null, null, { enabled: enabled, classrooms: ids.length });
    return { ok: true };
  }

  if (key === 'GET /admin/audit') {
    var limit = query.limit ? num_(query.limit) : 100;
    var action = String(query.action || '');
    var rows = readAll_('audit_log');
    if (action) rows = rows.filter(function (r) { return String(r.action).indexOf(action) === 0; });
    return {
      entries: rows.sort(function (a, b) { return num_(b.id) - num_(a.id); }).slice(0, limit).map(function (r) {
        var actor = r.actor_user_id ? findBy_('users', 'id', r.actor_user_id) : null;
        return {
          id: num_(r.id), actor_name: actor ? actor.display_name : null, actor_role: r.actor_role,
          action: r.action, entity: r.entity || null, entity_id: r.entity_id || null,
          ip: null, created_at: sqlStr_(r.created_at),
        };
      }),
    };
  }

  if (key === 'POST /admin/retention/purge') {
    // บน Google Sheets การลบแถวจำนวนมากช้าและเสี่ยง จึงให้ดาวน์โหลดสำเนาแล้วลบด้วยมือแทน
    return {
      ok: true, dryRun: true,
      report: { checkins: 0, closedCases: 0, auditLog: 0 },
      policy: { checkinDays: 365, closedCaseDays: 1095, auditDays: 1095 },
      note: 'บนฉบับ Google Sheets ให้ลบข้อมูลเก่าโดยเปิด Sheet แล้วลบแถวเอง หลังสำรองไฟล์แล้ว',
    };
  }

  throw fail_(404, 'ไม่พบปลายทางที่เรียก: ' + key, 'NOT_FOUND');
}

/** นำเข้ารายชื่อ: รหัส,ชื่อ,ห้อง[,ปีเกิด] — สร้างบัญชีและห้องเรียนให้อัตโนมัติ */
function importStudents_(body, ctx) {
  var csv = String(body.csv || '');
  need_(csv.trim(), 'ไม่มีข้อมูลนักเรียน');
  var lines = csv.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

  var created = [], errors = [];
  for (var i = 0; i < lines.length; i++) {
    var cols = lines[i].split(',').map(function (c) { return c.trim(); });
    var code = cols[0], name = cols[1], room = cols[2], birth = cols[3];

    if (!code || !name) { errors.push({ line: i + 1, message: 'ต้องมีอย่างน้อย รหัสประจำตัว และ ชื่อ' }); continue; }
    if (/^(รหัส|code|student|id)/i.test(code)) continue;
    if (findBy_('students', 'student_code', code)) { errors.push({ line: i + 1, message: 'มีรหัส ' + code + ' อยู่แล้ว' }); continue; }

    var classroomId = '';
    if (room) {
      var cl = findBy_('classrooms', 'name', room);
      if (!cl) cl = insert_('classrooms', { name: room, level: room.split('/')[0], advisor_user_id: '', created_at: nowSql() });
      classroomId = num_(cl.id);
    }

    var pin = String(Math.floor(100000 + Math.random() * 900000));
    var h = makeHash_(pin);
    var u = insert_('users', {
      role: 'student', username: String(code).toLowerCase(), pass_hash: h.hash, salt: h.salt,
      display_name: name, active: 1, self_pin_set: 0, must_change_password: 0,
      failed_logins: 0, created_at: nowSql(),
    });
    insert_('students', {
      user_id: num_(u.id), student_code: code, display_name: name,
      classroom_id: classroomId, birth_year: birth || '', active: 1, created_at: nowSql(),
    });
    created.push({ code: code, name: name, classroom: room || null, pin: pin });
  }

  audit_(ctx, 'admin.students.import', null, null, { created: created.length, errors: errors.length });
  return { ok: true, created: created, errors: errors };
}
