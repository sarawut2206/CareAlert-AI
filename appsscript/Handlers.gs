/**
 * Handlers.gs — ตรรกะของแต่ละเส้นทาง
 *
 * ทุกอย่างที่เกี่ยวกับ "การตัดสินระดับ" อยู่ใน Engine.gs ไม่ใช่ที่นี่
 * ไฟล์นี้ทำหน้าที่: อ่าน/เขียน Sheet, ตรวจสิทธิ์, และเรียกกลไกประเมิน
 */

// ─────────────────────────── การเปิดและอัปเดตเคส ───────────────────────────

function schoolHours_() {
  var s = getSetting_('school', {}) || {};
  applySchoolHours(s.startHour || 8, s.endHour || 16);
}

function assessmentHistory_(studentId) {
  if (!studentId) return [];
  return readAll_('assessments')
    .filter(function (a) { return String(a.student_id) === String(studentId); })
    .sort(function (a, b) { return sqlStr_(a.created_at) < sqlStr_(b.created_at) ? 1 : -1; })
    .slice(0, 8)
    .map(function (a) {
      return {
        id: num_(a.id),
        level: num_(a.level),
        concern_index: num_(a.concern_index),
        dimensions_json: String(a.dimensions_json || '{}'),
        data_sufficiency: a.data_sufficiency,
        created_at: sqlStr_(a.created_at),
      };
    });
}

function pickOwner_(level, studentId) {
  if (level >= 3) {
    var c = readAll_('users').filter(function (u) {
      return u.role === 'counselor' && truthy_(u.active);
    })[0];
    if (c) return num_(c.id);
  }
  if (studentId) {
    var s = findBy_('students', 'id', studentId);
    var cl = s ? findBy_('classrooms', 'id', s.classroom_id) : null;
    if (cl && cl.advisor_user_id) return num_(cl.advisor_user_id);
  }
  var fb = readAll_('users').filter(function (u) {
    return (u.role === 'counselor' || u.role === 'admin') && truthy_(u.active);
  })[0];
  return fb ? num_(fb.id) : '';
}

function addEvent_(caseId, type, actorUserId, note, payload) {
  insert_('case_events', {
    case_id: caseId, type: type, actor_user_id: actorUserId || '',
    note: note || '', payload_json: JSON.stringify(payload || {}), created_at: nowSql(),
  });
}

/**
 * บันทึกผลประเมิน และเปิด/ยกระดับเคสถ้าจำเป็น
 * กติกา: นักเรียนหนึ่งคนมีเคสเปิดอยู่ได้ครั้งละหนึ่งเคส
 *        ระบบยกระดับให้เองได้ แต่ไม่ลดระดับให้เอง (ต้องเป็นการตัดสินใจของมนุษย์)
 */
function ingest_(opts) {
  var result = opts.result;
  var studentId = opts.studentId || '';

  var assessment = insert_('assessments', {
    source_type: opts.sourceType,
    source_id: opts.sourceId,
    student_id: studentId,
    engine_version: result.engineVersion,
    level: result.level,
    concern_index: result.concernIndex,
    data_sufficiency: result.dataSufficiency,
    dimensions_json: JSON.stringify(result.dimensions),
    flags_json: JSON.stringify({
      validation: result.validation.flags,
      lexicon: result.lexicon.categories,
      contextTags: result.contextTags,
      wantsContact: result.wantsContact,
      needsHumanRead: result.needsHumanRead,
    }),
    rationale_json: JSON.stringify(result.rationale),
    created_at: nowSql(),
  });

  if (result.level < 2) return { assessmentId: assessment.id, caseId: null };

  var existing = null;
  if (studentId) {
    existing = readAll_('cases').filter(function (c) {
      return String(c.student_id) === String(studentId) && c.status !== 'closed';
    })[0] || null;
  }

  var d = computeDeadlines(result.level, result.actions);

  if (existing) {
    var escalated = result.level > num_(existing.level);
    if (escalated) {
      update_('cases', existing.id, {
        level: result.level,
        peak_level: Math.max(num_(existing.peak_level), result.level),
        acknowledge_due_at: d.acknowledgeDueAt,
        contact_due_at: d.contactDueAt,
        owner_user_id: existing.owner_user_id || pickOwner_(result.level, studentId),
      });
      addEvent_(num_(existing.id), 'escalate', opts.actorUserId, 'ยกระดับเป็น ' + result.levelCode,
        { from: num_(existing.level), to: result.level, decidingRules: result.rationale.decidingRules });
    } else {
      addEvent_(num_(existing.id), 'note', opts.actorUserId, 'มีข้อมูลใหม่เข้ามาในเคสนี้',
        { level: result.level, source: opts.source });
    }
    insert_('case_links', { case_id: num_(existing.id), assessment_id: num_(assessment.id) });
    return { assessmentId: assessment.id, caseId: num_(existing.id), escalated: escalated, created: false };
  }

  var summary = result.rationale.matched.slice(0, 3).map(function (m) { return m.label; }).join(' • ');
  var c = insert_('cases', {
    student_id: studentId,
    subject_hint: opts.subjectHint || '',
    origin: opts.source === 'checkin' ? 'checkin' : opts.source,
    level: result.level,
    peak_level: result.level,
    status: 'new',
    owner_user_id: pickOwner_(result.level, studentId),
    acknowledge_due_at: d.acknowledgeDueAt,
    contact_due_at: d.contactDueAt,
    next_followup_at: d.nextFollowUpAt || '',
    opened_at: nowSql(),
    safety_confirmed: 0, protection_needed: 0, guardian_informed: 0,
    referral_json: '[]',
    summary: summary,
  });
  insert_('case_links', { case_id: num_(c.id), assessment_id: num_(assessment.id) });
  addEvent_(num_(c.id), 'opened', opts.actorUserId, 'เปิดเคสระดับ ' + result.levelCode,
    { decidingRules: result.rationale.decidingRules, dataSufficiency: result.dataSufficiency });

  return { assessmentId: assessment.id, caseId: num_(c.id), escalated: false, created: true };
}

function collectItems_(templateIds) {
  var items = [], pairs = [], required = [];
  templateIds.forEach(function (id) {
    var t = getTemplate(id);
    if (!t) return;
    items = items.concat(t.items);
    if (t.consistencyPairs) pairs = pairs.concat(t.consistencyPairs);
    if (t.requiredForSufficiency) required = required.concat(t.requiredForSufficiency);
  });
  return { items: items, pairs: pairs, required: required };
}

// ─────────────────────────── เช็กอิน ───────────────────────────

function checkinSubmit_(body, ctx) {
  requireUser_(ctx, ['student']);
  need_(ctx.student, 'บัญชีนี้ไม่ได้ผูกกับข้อมูลนักเรียน', 403);
  schoolHours_();

  var baseId = body.templateId === dailyCheckin.id ? dailyCheckin.id : weeklyCheckin.id;
  var answers = body.answers || {};

  // เชื่อชุดคำถามเชิงลึกจากหน้าเว็บได้เฉพาะที่ตรงเงื่อนไขฝั่งเซิร์ฟเวอร์
  var allowed = followUpTriggers(answers);
  var used = (body.followUpIds || []).filter(function (id) { return allowed.indexOf(id) >= 0; });
  var c = collectItems_([baseId].concat(used));

  var result = runEngine({
    source: 'checkin', items: c.items, answers: answers,
    timings: body.timings || {}, durationMs: num_(body.durationMs),
    pairs: c.pairs, required: c.required,
    history: assessmentHistory_(ctx.student.id),
  });

  var row = insert_('checkins', {
    student_id: num_(ctx.student.id),
    template_id: baseId,
    template_version: getTemplate(baseId).version,
    answers_json: JSON.stringify(answers),
    timings_json: JSON.stringify(body.timings || {}),
    duration_ms: num_(body.durationMs),
    submitted_at: nowSql(),
  });

  var ing = ingest_({
    sourceType: 'checkin', sourceId: num_(row.id), studentId: num_(ctx.student.id),
    source: 'checkin', result: result, actorUserId: num_(ctx.user.id),
  });
  audit_(ctx, 'checkin.submitted', 'checkin', row.id, { level: result.level });
  CacheService.getScriptCache().remove('mine:' + ctx.student.id);

  return {
    ok: true,
    message: result.studentMessage,
    showHelpline: result.studentMessage.showHelpline,
    helplines: result.studentMessage.showHelpline ? helplines : [],
    crisis: result.level === 4 ? crisisScreen : null,
    recommendedModules: recommendModules(result.contextTags, result.domains),
    caseOpened: !!ing.caseId,
  };
}

/** เส้นทางที่ถูกเรียกบ่อยที่สุด — อ่านแค่ 2 คอลัมน์ และจำผลไว้สั้น ๆ */
function checkinMine_(ctx) {
  requireUser_(ctx, ['student']);
  var sid = String(ctx.student.id);
  var cache = CacheService.getScriptCache();
  var hit = cache.get('mine:' + sid);
  if (hit) return JSON.parse(hit);

  var rows = readCols_('checkins', ['student_id', 'template_id', 'submitted_at'])
    .filter(function (r) { return String(r.student_id) === sid; });

  var OFFSET = config.timezone * 60000;
  var dayOf = function (v) {
    var s = sqlStr_(v);
    if (!s) return null;
    return new Date(new Date(s.replace(' ', 'T') + 'Z').getTime() + OFFSET).toISOString().slice(0, 10);
  };
  var days = {};
  rows.forEach(function (r) { var d = dayOf(r.submitted_at); if (d) days[d] = 1; });
  var todayKey = new Date(Date.now() + OFFSET).toISOString().slice(0, 10);

  var streak = 0;
  for (var i = 0; i < 400; i++) {
    var d = new Date(Date.now() + OFFSET - i * 86400000).toISOString().slice(0, 10);
    if (days[d]) streak += 1;
    else if (i > 0 || !days[todayKey]) break;
  }

  var sorted = rows.sort(function (a, b) { return sqlStr_(a.submitted_at) < sqlStr_(b.submitted_at) ? 1 : -1; });
  var out = {
    checkins: sorted.slice(0, 30).map(function (r) {
      return { id: r.__row, template_id: r.template_id, submitted_at: sqlStr_(r.submitted_at) };
    }),
    doneToday: !!days[todayKey],
    streak: streak,
    daysDone: Object.keys(days).sort().reverse().slice(0, 30),
  };
  cache.put('mine:' + sid, JSON.stringify(out), 120);
  return out;
}

// ─────────────────────────── การแจ้งเรื่อง ───────────────────────────

function reportSelf_(body, ctx) {
  requireUser_(ctx, ['student']);
  schoolHours_();
  var answers = body.answers || {};
  var anonymous = !!body.anonymous;

  var result = runEngine({
    source: 'self_report', items: selfReport.items, answers: answers,
    pairs: selfReport.consistencyPairs, required: selfReport.requiredForSufficiency,
    history: assessmentHistory_(ctx.student.id),
  });

  // ระดับ 4 ต้องผูกตัวตนเสมอ แม้นักเรียนเลือกไม่บอกชื่อ
  // เงื่อนไขนี้ถูกบอกไว้ล่วงหน้าในเอกสารความยินยอมและบนหน้าจอก่อนเริ่มเล่า
  var attached = !anonymous || result.level >= 4;

  var row = insert_('reports', {
    kind: 'self',
    reporter_user_id: num_(ctx.user.id),
    reporter_student_id: num_(ctx.student.id),
    subject_student_id: attached ? num_(ctx.student.id) : '',
    anonymous: anonymous ? 1 : 0,
    categories_json: JSON.stringify(answers.sr_what || []),
    answers_json: JSON.stringify(answers),
    body: String(answers.sr_body || ''),
    wants_contact: result.wantsContact === 'yes' ? 1 : 0,
    submitted_at: nowSql(),
  });

  var ing = ingest_({
    sourceType: 'report', sourceId: num_(row.id),
    studentId: attached ? num_(ctx.student.id) : '',
    subjectHint: attached ? '' : 'นักเรียนแจ้งโดยไม่ประสงค์ออกนาม',
    source: 'self_report', result: result, actorUserId: num_(ctx.user.id),
  });
  audit_(ctx, 'report.self', 'report', row.id, { level: result.level, anonymous: anonymous });

  return {
    ok: true,
    message: result.studentMessage,
    identityDisclosed: attached && anonymous,
    identityNotice: (attached && anonymous)
      ? 'เพราะสิ่งที่เธอเล่าเกี่ยวกับความปลอดภัย ครูที่รับผิดชอบจึงจำเป็นต้องรู้ว่าเป็นเธอ เพื่อจะช่วยได้ทัน เราบอกเรื่องนี้ไว้ล่วงหน้าเสมอ'
      : null,
    helplines: result.studentMessage.showHelpline ? helplines : [],
    crisis: result.level === 4 ? crisisScreen : null,
    recommendedModules: recommendModules(result.contextTags, result.domains),
    caseOpened: !!ing.caseId,
  };
}

function reportFriend_(body, ctx) {
  requireUser_(ctx);
  schoolHours_();
  var answers = body.answers || {};
  var hint = String(body.subjectHint || '').trim();
  need_(hint, 'กรุณาระบุอย่างน้อยว่าเพื่อนคนนี้เป็นใคร เพื่อให้ครูตามหาได้');
  var anonymous = !!body.anonymous;

  var result = runEngine({ source: 'friend_report', items: friendConcern.items, answers: answers, history: [] });

  var row = insert_('reports', {
    kind: 'friend',
    reporter_user_id: anonymous ? '' : num_(ctx.user.id),
    reporter_student_id: (anonymous || !ctx.student) ? '' : num_(ctx.student.id),
    subject_student_id: '',
    subject_hint: hint,
    anonymous: anonymous ? 1 : 0,
    categories_json: JSON.stringify(answers.f_what || []),
    answers_json: JSON.stringify(answers),
    body: String(answers.f_detail || ''),
    submitted_at: nowSql(),
  });

  var ing = ingest_({
    sourceType: 'report', sourceId: num_(row.id), studentId: '',
    subjectHint: hint, source: 'friend_report', result: result,
    actorUserId: anonymous ? '' : num_(ctx.user.id),
  });
  audit_(ctx, 'report.friend', 'report', row.id, { level: result.level, anonymous: anonymous });

  var code = null;
  if (anonymous) {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code = '';
    for (var i = 0; i < 8; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return {
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
    referenceCode: code,
    caseOpened: !!ing.caseId,
  };
}

function reportStaffNote_(body, ctx) {
  requireStaff_(ctx);
  schoolHours_();
  var answers = body.answers || {};
  var sid = num_(body.studentId);
  need_(findBy_('students', 'id', sid), 'ไม่พบนักเรียน', 404);

  var result = runEngine({
    source: 'staff_note', items: staffNote.items, answers: answers,
    history: assessmentHistory_(sid),
  });

  var row = insert_('reports', {
    kind: 'staff_note',
    reporter_user_id: num_(ctx.user.id),
    subject_student_id: sid,
    categories_json: JSON.stringify(answers.n_what || []),
    answers_json: JSON.stringify(answers),
    body: String(answers.n_detail || ''),
    submitted_at: nowSql(),
  });

  var ing = ingest_({
    sourceType: 'report', sourceId: num_(row.id), studentId: sid,
    source: 'staff_note', result: result, actorUserId: num_(ctx.user.id),
  });
  audit_(ctx, 'report.staffNote', 'student', sid, { level: result.level });

  return {
    ok: true, level: result.level, levelCode: result.levelCode, levelInfo: result.levelInfo,
    rationale: result.rationale, actions: result.actions, deadlines: result.deadlines,
    caseId: ing.caseId, escalated: ing.escalated, created: ing.created,
  };
}

// ─────────────────────────── ทักษะชีวิต ───────────────────────────

function lifeskillsList_(ctx) {
  requireUser_(ctx);
  var progress = ctx.student ? filterBy_('lifeskill_progress', 'student_id', ctx.student.id) : [];
  var byId = {};
  progress.forEach(function (p) { byId[p.module_id] = p; });
  return {
    modules: lifeskillModules.map(function (m) {
      var p = byId[m.id];
      return {
        id: m.id, title: m.title, emoji: m.emoji, minutes: m.minutes,
        tags: m.tags, goal: m.goal, stepCount: m.steps.length,
        progress: p ? { stepIndex: num_(p.step_index), completed: truthy_(p.completed) } : null,
      };
    }),
  };
}

function lifeskillOne_(id, ctx) {
  requireUser_(ctx);
  var m = getModule(id);
  need_(m, 'ไม่พบกิจกรรมนี้', 404);
  var p = null;
  if (ctx.student) {
    var rows = filterBy_('lifeskill_progress', 'student_id', ctx.student.id)
      .filter(function (r) { return r.module_id === id; });
    if (rows.length) p = { step_index: num_(rows[0].step_index), completed: truthy_(rows[0].completed), reflection: rows[0].reflection };
  }
  return { module: m, progress: p };
}

function upsertProgress_(studentId, moduleId, patch) {
  var rows = filterBy_('lifeskill_progress', 'student_id', studentId)
    .filter(function (r) { return r.module_id === moduleId; });
  if (rows.length) {
    update_('lifeskill_progress', rows[0].id, patch);
  } else {
    var base = { student_id: studentId, module_id: moduleId, step_index: 0, completed: 0, reflection: '', updated_at: nowSql() };
    for (var k in patch) base[k] = patch[k];
    insert_('lifeskill_progress', base);
  }
}

function lifeskillProgress_(id, body, ctx) {
  requireUser_(ctx, ['student']);
  var m = getModule(id);
  need_(m, 'ไม่พบกิจกรรมนี้', 404);
  var stepIndex = num_(body.stepIndex);
  var completed = body.completed === true;
  var rows = filterBy_('lifeskill_progress', 'student_id', ctx.student.id)
    .filter(function (r) { return r.module_id === id; });
  var prevStep = rows.length ? num_(rows[0].step_index) : 0;
  var prevDone = rows.length ? truthy_(rows[0].completed) : false;
  upsertProgress_(num_(ctx.student.id), id, {
    step_index: Math.max(prevStep, stepIndex),
    completed: (prevDone || completed) ? 1 : 0,
    updated_at: nowSql(),
  });
  return { ok: true, completed: completed };
}

/**
 * ข้อความสะท้อนตัวเองจะไม่ถูกส่งให้ครูอ่าน เว้นแต่พบสัญญาณความปลอดภัย
 * เพราะนักเรียนหลายคนเผลอเล่าเรื่องหนักในช่องที่ดูปลอดภัยกว่าแบบสอบถาม
 */
function lifeskillReflection_(id, body, ctx) {
  requireUser_(ctx, ['student']);
  var m = getModule(id);
  need_(m, 'ไม่พบกิจกรรมนี้', 404);
  var text = String(body.text || '');
  need_(text, 'ข้อความว่างเปล่า');
  upsertProgress_(num_(ctx.student.id), id, { reflection: text, updated_at: nowSql() });

  var scan = scanText(text);
  if (!scan.hits.length) return { ok: true, escalated: false };

  schoolHours_();
  var result = runEngine({
    source: 'self_report', history: [],
    items: [{ id: 'ls_reflection', type: 'text', domain: 'freetext', facet: 'context' }],
    answers: { ls_reflection: text },
  });
  var row = insert_('reports', {
    kind: 'self', reporter_user_id: num_(ctx.user.id), reporter_student_id: num_(ctx.student.id),
    subject_student_id: num_(ctx.student.id),
    categories_json: JSON.stringify(scan.categories),
    answers_json: JSON.stringify({ moduleId: id }),
    body: text, submitted_at: nowSql(),
  });
  var ing = ingest_({
    sourceType: 'report', sourceId: num_(row.id), studentId: num_(ctx.student.id),
    source: 'self_report', result: result, actorUserId: num_(ctx.user.id),
  });
  audit_(ctx, 'lifeskill.reflection.escalated', 'student', ctx.student.id, { level: result.level });

  return {
    ok: true, escalated: !!ing.caseId, message: result.studentMessage,
    helplines: result.studentMessage.showHelpline ? helplines : [],
  };
}
