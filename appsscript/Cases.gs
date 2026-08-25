/**
 * Cases.gs — คิวเคส รายละเอียดเคส การดำเนินการ และข้อมูลนักเรียนสำหรับบุคลากร
 */

var OPEN_STATUSES = ['new', 'acknowledged', 'in_progress', 'referred', 'monitoring'];

function decorateCase_(c) {
  var s = c.student_id ? findBy_('students', 'id', c.student_id) : null;
  var cl = s ? findBy_('classrooms', 'id', s.classroom_id) : null;
  var owner = c.owner_user_id ? findBy_('users', 'id', c.owner_user_id) : null;
  return {
    id: num_(c.id),
    student_id: c.student_id === '' ? null : num_(c.student_id),
    subject_hint: c.subject_hint || null,
    origin: c.origin,
    level: num_(c.level),
    peak_level: num_(c.peak_level),
    status: c.status,
    owner_user_id: c.owner_user_id === '' ? null : num_(c.owner_user_id),
    opened_at: sqlStr_(c.opened_at),
    acknowledged_at: sqlStr_(c.acknowledged_at),
    first_contact_at: sqlStr_(c.first_contact_at),
    closed_at: sqlStr_(c.closed_at),
    close_reason: c.close_reason || null,
    acknowledge_due_at: sqlStr_(c.acknowledge_due_at),
    contact_due_at: sqlStr_(c.contact_due_at),
    next_followup_at: sqlStr_(c.next_followup_at),
    safety_confirmed: truthy_(c.safety_confirmed) ? 1 : 0,
    protection_needed: truthy_(c.protection_needed) ? 1 : 0,
    guardian_informed: truthy_(c.guardian_informed) ? 1 : 0,
    referral_json: String(c.referral_json || '[]'),
    summary: c.summary || null,
    student_name: s ? s.display_name : null,
    student_code: s ? String(s.student_code) : null,
    classroom: cl ? cl.name : null,
    owner_name: owner ? owner.display_name : null,
    levelInfo: LEVELS[num_(c.level)],
    acknowledgeSla: slaStatus(sqlStr_(c.acknowledge_due_at), sqlStr_(c.acknowledged_at)),
    contactSla: slaStatus(sqlStr_(c.contact_due_at), sqlStr_(c.first_contact_at)),
    isOpen: OPEN_STATUSES.indexOf(c.status) >= 0,
  };
}

/** ครูที่ปรึกษาเห็นเฉพาะห้องตัวเองหรือเคสที่ถูกมอบหมายให้ */
function visibleCases_(user) {
  var all = readAll_('cases');
  if (user.role !== 'teacher') return all;
  return all.filter(function (c) {
    if (String(c.owner_user_id) === String(user.id)) return true;
    if (!c.student_id) return false;
    return canAccessStudent_(user, c.student_id);
  });
}

function caseSummary_(ctx) {
  var u = requireStaff_(ctx);
  var open = visibleCases_(u).filter(function (c) { return OPEN_STATUSES.indexOf(c.status) >= 0; });
  var s = { total: open.length, l4: 0, l3: 0, l2: 0, overdue: 0, unacknowledged: 0 };
  open.forEach(function (c) {
    var lv = num_(c.level);
    if (lv === 4) s.l4++; else if (lv === 3) s.l3++; else s.l2++;
    if (slaStatus(sqlStr_(c.contact_due_at), sqlStr_(c.first_contact_at)) === 'overdue') s.overdue++;
    if (c.status === 'new') s.unacknowledged++;
  });
  return { summary: s };
}

function caseList_(query, ctx) {
  var u = requireStaff_(ctx);
  var status = query.status || 'open';
  var level = query.level ? num_(query.level) : null;
  var list = visibleCases_(u);

  if (status === 'open') list = list.filter(function (c) { return OPEN_STATUSES.indexOf(c.status) >= 0; });
  else if (status !== 'all') list = list.filter(function (c) { return c.status === status; });
  if (level) list = list.filter(function (c) { return num_(c.level) === level; });

  var out = list.map(decorateCase_).sort(function (a, b) {
    if (b.level !== a.level) return b.level - a.level;
    var rank = function (st) { return st === 'new' ? 0 : st === 'acknowledged' ? 1 : 2; };
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return String(a.contact_due_at) < String(b.contact_due_at) ? -1 : 1;
  });
  audit_(ctx, 'cases.list', null, null, { status: status, count: out.length });
  return { cases: out };
}

function loadCase_(id, user) {
  var c = findBy_('cases', 'id', id);
  need_(c, 'ไม่พบเคสนี้', 404);
  if (user.role === 'teacher') {
    var ok = String(c.owner_user_id) === String(user.id) ||
      (c.student_id && canAccessStudent_(user, c.student_id));
    need_(ok, 'เคสนี้อยู่นอกความรับผิดชอบของคุณ', 403);
  }
  return c;
}

function caseDetail_(id, ctx) {
  var u = requireStaff_(ctx);
  var c = loadCase_(id, u);

  var linkIds = readAll_('case_links')
    .filter(function (l) { return String(l.case_id) === String(id); })
    .map(function (l) { return String(l.assessment_id); });

  var assessments = readAll_('assessments')
    .filter(function (a) { return linkIds.indexOf(String(a.id)) >= 0; })
    .sort(function (a, b) { return sqlStr_(a.created_at) < sqlStr_(b.created_at) ? 1 : -1; })
    .map(function (a) {
      return {
        id: num_(a.id), source_type: a.source_type, source_id: num_(a.source_id),
        level: num_(a.level), concern_index: num_(a.concern_index),
        data_sufficiency: a.data_sufficiency, engine_version: a.engine_version,
        created_at: sqlStr_(a.created_at),
        dimensions: parseJson_(a.dimensions_json, {}),
        flags: parseJson_(a.flags_json, {}),
        rationale: parseJson_(a.rationale_json, {}),
      };
    });

  var sources = [];
  assessments.forEach(function (a) {
    if (a.source_type === 'checkin') {
      var ck = findBy_('checkins', 'id', a.source_id);
      if (!ck) return;
      var t = getTemplate(ck.template_id);
      sources.push({
        kind: 'checkin', id: num_(ck.id), at: sqlStr_(ck.submitted_at),
        templateId: ck.template_id, templateTitle: t ? t.title : ck.template_id,
        answers: parseJson_(ck.answers_json, {}),
      });
    } else {
      var r = findBy_('reports', 'id', a.source_id);
      if (!r) return;
      sources.push({
        kind: r.kind, id: num_(r.id), at: sqlStr_(r.submitted_at),
        anonymous: truthy_(r.anonymous), subjectHint: r.subject_hint || null,
        body: r.body || null,
        categories: parseJson_(r.categories_json, []),
        answers: parseJson_(r.answers_json, {}),
      });
    }
  });

  var events = readAll_('case_events')
    .filter(function (e) { return String(e.case_id) === String(id); })
    .sort(function (a, b) { return sqlStr_(a.created_at) < sqlStr_(b.created_at) ? -1 : 1; })
    .map(function (e) {
      var actor = e.actor_user_id ? findBy_('users', 'id', e.actor_user_id) : null;
      return {
        id: num_(e.id), type: e.type, note: e.note || null,
        created_at: sqlStr_(e.created_at),
        actor_name: actor ? actor.display_name : null,
        payload: parseJson_(e.payload_json, {}),
      };
    });

  var student = null;
  if (c.student_id) {
    var s = findBy_('students', 'id', c.student_id);
    if (s) {
      var cl = findBy_('classrooms', 'id', s.classroom_id);
      var adv = cl && cl.advisor_user_id ? findBy_('users', 'id', cl.advisor_user_id) : null;
      student = {
        id: num_(s.id), student_code: String(s.student_code), display_name: s.display_name,
        birth_year: s.birth_year || null, guardian_name: s.guardian_name || null,
        guardian_phone: s.guardian_phone || null, notes: s.notes || '',
        classroom: cl ? cl.name : null, advisor: adv ? adv.display_name : null,
      };
    }
  }

  var trend = c.student_id ? readAll_('assessments')
    .filter(function (a) { return String(a.student_id) === String(c.student_id); })
    .sort(function (a, b) { return sqlStr_(a.created_at) < sqlStr_(b.created_at) ? -1 : 1; })
    .map(function (a) {
      return { created_at: sqlStr_(a.created_at), level: num_(a.level), concern_index: num_(a.concern_index), data_sufficiency: a.data_sufficiency };
    }) : [];

  var defs = {};
  allItemsById().forEach(function (item, id2) {
    defs[id2] = { text: item.text, type: item.type, critical: !!item.critical, options: item.options || null };
  });

  audit_(ctx, 'case.view', 'case', id);
  return {
    case: decorateCase_(c), student: student, assessments: assessments, sources: sources,
    events: events, trend: trend, closeBlockers: closeBlockers_(c), itemDefs: defs,
  };
}

function closeBlockers_(c) {
  var b = [];
  if (!sqlStr_(c.first_contact_at)) b.push('ยังไม่ได้บันทึกว่าได้พูดคุยกับนักเรียนแล้ว');
  if (!truthy_(c.safety_confirmed)) b.push('ยังไม่ได้ยืนยันความปลอดภัยของนักเรียน');
  var hasAction = readAll_('case_events').some(function (e) {
    return String(e.case_id) === String(c.id) && (e.type === 'action' || e.type === 'referral');
  });
  if (!hasAction) b.push('ยังไม่มีบันทึกการดำเนินการหรือการส่งต่อ');
  if (num_(c.peak_level) >= 4 && !truthy_(c.guardian_informed)) {
    b.push('เคยเป็นระดับ 4 — ต้องระบุผลการแจ้งผู้ปกครองหรือเหตุผลที่ไม่แจ้ง');
  }
  return b;
}

function caseAction_(id, action, body, ctx) {
  var u = requireStaff_(ctx);
  var c = loadCase_(id, u);
  var isSenior = u.role === 'counselor' || u.role === 'admin';
  var note = String(body.note || '').trim();

  if (action === 'acknowledge') {
    need_(!sqlStr_(c.acknowledged_at), 'เคสนี้ถูกรับเรื่องไปแล้ว');
    update_('cases', id, {
      acknowledged_at: nowSql(),
      status: c.status === 'new' ? 'acknowledged' : c.status,
      owner_user_id: c.owner_user_id || num_(u.id),
    });
    addEvent_(id, 'acknowledged', num_(u.id), 'รับเรื่องแล้ว');

  } else if (action === 'contact') {
    need_(note.length >= 5, 'กรุณาบันทึกรายละเอียดการพูดคุย');
    update_('cases', id, {
      first_contact_at: sqlStr_(c.first_contact_at) || nowSql(),
      acknowledged_at: sqlStr_(c.acknowledged_at) || nowSql(),
      status: (c.status === 'new' || c.status === 'acknowledged') ? 'in_progress' : c.status,
      owner_user_id: c.owner_user_id || num_(u.id),
      safety_confirmed: body.safetyConfirmed ? 1 : 0,
      protection_needed: body.protectionNeeded ? 1 : 0,
    });
    addEvent_(id, 'contacted', num_(u.id), note, { safetyConfirmed: !!body.safetyConfirmed, protectionNeeded: !!body.protectionNeeded });

  } else if (action === 'action') {
    need_(note.length >= 3, 'กรุณาระบุรายละเอียดการดำเนินการ');
    if (c.status === 'new' || c.status === 'acknowledged') update_('cases', id, { status: 'in_progress' });
    addEvent_(id, 'action', num_(u.id), note, { kind: body.kind || '' });

  } else if (action === 'referral') {
    var to = String(body.to || '').trim();
    need_(to, 'กรุณาระบุปลายทางการส่งต่อ');
    var list = parseJson_(c.referral_json, []);
    list.push({ to: to, note: note, at: nowSql(), by: u.display_name });
    update_('cases', id, { referral_json: JSON.stringify(list), status: 'referred' });
    addEvent_(id, 'referral', num_(u.id), 'ส่งต่อไปยัง ' + to, { to: to, note: note });

  } else if (action === 'guardian') {
    need_(note.length >= 3, 'กรุณาบันทึกรายละเอียด');
    var informed = !!body.informed;
    update_('cases', id, { guardian_informed: informed ? 1 : 0 });
    addEvent_(id, 'action', num_(u.id), (informed ? 'แจ้งผู้ปกครองแล้ว: ' : 'ยังไม่แจ้งผู้ปกครอง: ') + note, { informed: informed });

  } else if (action === 'followup') {
    need_(note.length >= 3, 'กรุณาบันทึกผลการติดตาม');
    var days = num_(body.nextInDays);
    var next = days ? toSqlDate(new Date(Date.now() + days * 86400000)) : '';
    update_('cases', id, {
      next_followup_at: next,
      status: ['new', 'acknowledged', 'in_progress'].indexOf(c.status) >= 0 ? 'monitoring' : c.status,
    });
    addEvent_(id, 'followup', num_(u.id), note, { studentStatus: body.studentStatus || 'unknown', nextFollowUpAt: next });

  } else if (action === 'level') {
    var level = num_(body.level);
    var reason = String(body.reason || '').trim();
    need_(level >= 2 && level <= 4, 'ระดับไม่ถูกต้อง');
    need_(reason.length >= 10, 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร');
    need_(level >= num_(c.level) || isSenior, 'การลดระดับต้องดำเนินการโดยครูแนะแนวหรือผู้ดูแลระบบ', 403);
    addEvent_(id, level > num_(c.level) ? 'escalate' : 'note', num_(u.id),
      'เปลี่ยนระดับจาก ' + num_(c.level) + ' เป็น ' + level + ': ' + reason,
      { from: num_(c.level), to: level, manual: true });
    update_('cases', id, { level: level, peak_level: Math.max(num_(c.peak_level), level) });

  } else if (action === 'assign') {
    var uid = num_(body.userId);
    var target = findBy_('users', 'id', uid);
    need_(target && target.role !== 'student', 'ไม่พบผู้ใช้ที่เลือก');
    update_('cases', id, { owner_user_id: uid });
    addEvent_(id, 'note', num_(u.id), 'มอบหมายให้ ' + target.display_name, { ownerUserId: uid });

  } else if (action === 'close') {
    need_(c.status !== 'closed', 'เคสนี้ปิดไปแล้ว');
    var creason = String(body.reason || '').trim();
    need_(creason.length >= 10, 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร');
    var blockers = closeBlockers_(c);
    var override = !!body.override;
    need_(blockers.length === 0 || override, 'ยังปิดเคสไม่ได้: ' + blockers.join(' / '));
    need_(!(blockers.length && override) || isSenior, 'การปิดเคสทั้งที่ยังมีข้อค้าง ต้องดำเนินการโดยครูแนะแนวหรือผู้ดูแลระบบ', 403);
    need_(num_(c.peak_level) < 4 || isSenior, 'เคสที่เคยเป็นระดับ 4 ต้องปิดโดยครูแนะแนวหรือผู้ดูแลระบบ', 403);
    update_('cases', id, { status: 'closed', closed_at: nowSql(), close_reason: creason });
    addEvent_(id, 'closed', num_(u.id), creason, { override: override, blockers: blockers });

  } else if (action === 'reopen') {
    need_(isSenior, 'ต้องเป็นครูแนะแนวหรือผู้ดูแลระบบ', 403);
    update_('cases', id, { status: 'in_progress', closed_at: '', close_reason: '' });
    addEvent_(id, 'reopened', num_(u.id), note);

  } else if (action === 'note') {
    need_(note.length >= 2, 'กรุณาระบุบันทึก');
    addEvent_(id, 'note', num_(u.id), note);

  } else {
    throw fail_(404, 'ไม่รู้จักการดำเนินการ: ' + action, 'NOT_FOUND');
  }

  audit_(ctx, 'case.' + action, 'case', id);
  return { ok: true, closeBlockers: closeBlockers_(findBy_('cases', 'id', id)) };
}

// ─────────────────────────── นักเรียน ───────────────────────────

function classroomsForStaff_(ctx) {
  var u = requireUser_(ctx, STAFF_ROLES.concat(['director']));
  var students = readAll_('students');
  var list = readAll_('classrooms');
  if (u.role === 'teacher') {
    list = list.filter(function (c) { return String(c.advisor_user_id) === String(u.id); });
  }
  return {
    classrooms: list.map(function (c) {
      var adv = c.advisor_user_id ? findBy_('users', 'id', c.advisor_user_id) : null;
      return {
        id: num_(c.id), name: c.name, level: c.level,
        advisor: adv ? adv.display_name : null,
        student_count: students.filter(function (s) {
          return String(s.classroom_id) === String(c.id) && truthy_(s.active);
        }).length,
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'th', { numeric: true }); }),
  };
}

function studentSearch_(query, ctx) {
  var u = requireStaff_(ctx);
  var term = String(query.q || '').toLowerCase();
  var cid = query.classroomId ? num_(query.classroomId) : null;
  var list = readAll_('students').filter(function (s) { return truthy_(s.active); });

  if (u.role === 'teacher') {
    list = list.filter(function (s) {
      var cl = findBy_('classrooms', 'id', s.classroom_id);
      return cl && String(cl.advisor_user_id) === String(u.id);
    });
  }
  if (cid) list = list.filter(function (s) { return num_(s.classroom_id) === cid; });
  if (term) {
    list = list.filter(function (s) {
      return String(s.display_name).toLowerCase().indexOf(term) >= 0 ||
        String(s.student_code).indexOf(term) >= 0;
    });
  }
  audit_(ctx, 'students.search', null, null, { q: term, count: list.length });
  return {
    students: list.slice(0, 200).map(function (s) {
      var cl = findBy_('classrooms', 'id', s.classroom_id);
      return { id: num_(s.id), student_code: String(s.student_code), display_name: s.display_name, classroom: cl ? cl.name : null };
    }),
  };
}

function studentProfile_(id, ctx) {
  var u = requireStaff_(ctx);
  need_(canAccessStudent_(u, id), 'นักเรียนคนนี้อยู่นอกความรับผิดชอบของคุณ', 403);
  var s = findBy_('students', 'id', id);
  need_(s, 'ไม่พบนักเรียน', 404);
  var cl = findBy_('classrooms', 'id', s.classroom_id);
  var adv = cl && cl.advisor_user_id ? findBy_('users', 'id', cl.advisor_user_id) : null;

  audit_(ctx, 'student.view', 'student', id);
  return {
    student: {
      id: num_(s.id), student_code: String(s.student_code), display_name: s.display_name,
      birth_year: s.birth_year || null, guardian_name: s.guardian_name || null,
      guardian_phone: s.guardian_phone || null, notes: s.notes || '',
      classroom: cl ? cl.name : null, advisor: adv ? adv.display_name : null,
    },
    cases: filterBy_('cases', 'student_id', id).map(function (c) {
      return {
        id: num_(c.id), level: num_(c.level), peak_level: num_(c.peak_level), status: c.status,
        origin: c.origin, opened_at: sqlStr_(c.opened_at), closed_at: sqlStr_(c.closed_at),
        close_reason: c.close_reason || null, levelInfo: LEVELS[num_(c.level)],
      };
    }).sort(function (a, b) { return String(a.opened_at) < String(b.opened_at) ? 1 : -1; }),
    trend: readAll_('assessments')
      .filter(function (a) { return String(a.student_id) === String(id); })
      .sort(function (a, b) { return sqlStr_(a.created_at) < sqlStr_(b.created_at) ? -1 : 1; })
      .map(function (a) {
        return { created_at: sqlStr_(a.created_at), level: num_(a.level), concern_index: num_(a.concern_index), data_sufficiency: a.data_sufficiency };
      }),
    checkinCount: readCols_('checkins', ['student_id']).filter(function (r) { return String(r.student_id) === String(id); }).length,
    consent: null,
  };
}

function studentNotes_(id, body, ctx) {
  var u = requireStaff_(ctx);
  need_(canAccessStudent_(u, id), 'ไม่มีสิทธิ์', 403);
  update_('students', id, { notes: String(body.notes || '').slice(0, 3000) });
  audit_(ctx, 'student.notes.update', 'student', id);
  return { ok: true };
}

function metaEngine_(ctx) {
  requireUser_(ctx, STAFF_ROLES.concat(['director']));
  var rb = ruleBook();
  return {
    engineVersion: ENGINE_VERSION,
    levels: LEVELS,
    dimensions: DIMENSIONS,
    lexiconCategories: LEXICON_CATEGORIES,
    llmEnabled: false,
    rules: rb.rules,
    modifiers: rb.modifiers,
    principles: [
      'ระบบไม่วินิจฉัยโรค ไม่จับโกหก และไม่ทำนายว่าใครจะก่อเหตุ',
      'ระดับที่ระบบเสนอคือ “ต้องทำอะไรต่อ” ไม่ใช่ “เด็กคนนี้เป็นอะไร”',
      'ทุกระดับตั้งแต่ 2 ขึ้นไปต้องมีมนุษย์ตรวจสอบ',
      'ระบบไม่เคยตัดสินใจแทนคน และไม่แจ้งหน่วยงานภายนอกโดยอัตโนมัติ',
      'ข้อมูลไม่พอ = “ยังสรุปไม่ได้” ไม่ใช่ “ไม่มีปัญหา”',
      'ปัจจัยปกป้องใช้ประกอบการวางแผนช่วยเหลือ แต่ไม่ใช้ลดระดับ',
    ],
  };
}
