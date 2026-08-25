/**
 * ═══════════════════════════════════════════════════════════════
 *  CareAlert AI — API หลังบ้านบน Google Apps Script
 * ═══════════════════════════════════════════════════════════════
 *
 *  สถาปัตยกรรม:
 *      หน้าเว็บ (GitHub Pages)  →  ไฟล์นี้ (Apps Script)  →  Google Sheet
 *
 *  หลักการสำคัญ 3 ข้อ:
 *   1. Sheet เป็นของบัญชีโรงเรียนคนเดียว — นักเรียนและครูไม่เคยเห็น Sheet
 *      ทุกคนเข้าผ่านหน้าเว็บ ซึ่งไฟล์นี้เป็นคนตรวจสิทธิ์ให้ทุกครั้ง
 *   2. กฎการประเมินอยู่ใน Engine.gs ซึ่งสร้างจาก server/src อัตโนมัติ
 *      ห้ามเขียนกฎซ้ำในไฟล์นี้เด็ดขาด
 *   3. ทุกการเข้าถึงข้อมูลนักเรียนถูกบันทึกใน audit_log
 *
 *  ตั้งค่าครั้งแรก: เปิดเมนู CareAlert → ติดตั้งครั้งแรก
 *  (หรือรันฟังก์ชัน setup จากตัวแก้ไขสคริปต์)
 */

// ─────────────────────────── ค่าคงที่ ───────────────────────────

var TOKEN_TTL_SECONDS = 8 * 60 * 60;   // อายุ token 8 ชั่วโมง
var HASH_ROUNDS = 250;                 // จำนวนรอบ HMAC ของการแฮชรหัสผ่าน
var MAX_ATTEMPTS = 8;                  // ใส่รหัสผิดกี่ครั้งถึงล็อก
var LOCK_MINUTES = 15;
var MIN_CELL = 5;                      // กลบกลุ่มที่เล็กกว่านี้ในหน้าสรุป

var SHEETS = {
  users: ['id', 'role', 'username', 'pass_hash', 'salt', 'display_name', 'active', 'self_pin_set', 'must_change_password', 'failed_logins', 'locked_until', 'last_login_at', 'created_at'],
  classrooms: ['id', 'name', 'level', 'advisor_user_id', 'created_at'],
  students: ['id', 'user_id', 'student_code', 'display_name', 'classroom_id', 'birth_year', 'guardian_name', 'guardian_phone', 'notes', 'active', 'created_at'],
  checkins: ['id', 'student_id', 'template_id', 'template_version', 'answers_json', 'timings_json', 'duration_ms', 'submitted_at'],
  reports: ['id', 'kind', 'reporter_user_id', 'reporter_student_id', 'subject_student_id', 'subject_hint', 'anonymous', 'categories_json', 'answers_json', 'body', 'wants_contact', 'submitted_at'],
  assessments: ['id', 'source_type', 'source_id', 'student_id', 'engine_version', 'level', 'concern_index', 'data_sufficiency', 'dimensions_json', 'flags_json', 'rationale_json', 'created_at'],
  cases: ['id', 'student_id', 'subject_hint', 'origin', 'level', 'peak_level', 'status', 'owner_user_id', 'acknowledge_due_at', 'contact_due_at', 'next_followup_at', 'opened_at', 'acknowledged_at', 'first_contact_at', 'closed_at', 'close_reason', 'safety_confirmed', 'protection_needed', 'guardian_informed', 'referral_json', 'summary'],
  case_links: ['case_id', 'assessment_id'],
  case_events: ['id', 'case_id', 'type', 'actor_user_id', 'note', 'payload_json', 'created_at'],
  lifeskill_progress: ['id', 'student_id', 'module_id', 'step_index', 'completed', 'reflection', 'updated_at'],
  audit_log: ['id', 'actor_user_id', 'actor_role', 'action', 'entity', 'entity_id', 'detail', 'created_at'],
  settings: ['key', 'value'],
};

// ─────────────────────────── ตัวช่วย Sheet ───────────────────────────
// อ่านทั้งแผ่นครั้งเดียวแล้วจำไว้ตลอดการทำงานหนึ่งครั้ง
// (Apps Script อ่านทีละเซลล์ช้ามาก การอ่านทีเดียวเร็วกว่าหลายสิบเท่า)

var __cache = {};

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) {
    s = ss_().insertSheet(name);
    s.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]);
    s.setFrozenRows(1);
  }
  return s;
}

/** อ่านทุกแถวเป็น object — ผลลัพธ์ถูกจำไว้ในรอบการทำงานเดียวกัน */
function readAll_(name) {
  if (__cache[name]) return __cache[name];
  var s = sheet_(name);
  var last = s.getLastRow();
  if (last < 2) { __cache[name] = []; return __cache[name]; }
  var cols = SHEETS[name];
  var values = s.getRange(2, 1, last - 1, cols.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var o = { __row: i + 2 };
    for (var c = 0; c < cols.length; c++) o[cols[c]] = values[i][c];
    if (cols[0] === 'id' && o.id === '') continue;
    rows.push(o);
  }
  __cache[name] = rows;
  return rows;
}

/** อ่านเฉพาะบางคอลัมน์ — ใช้กับแผ่นที่โตเร็ว เช่น checkins */
function readCols_(name, wanted) {
  var s = sheet_(name);
  var last = s.getLastRow();
  if (last < 2) return [];
  var cols = SHEETS[name];
  var idx = [];
  for (var w = 0; w < wanted.length; w++) idx.push(cols.indexOf(wanted[w]));
  var lo = Math.min.apply(null, idx);
  var hi = Math.max.apply(null, idx);
  var values = s.getRange(2, lo + 1, last - 1, hi - lo + 1).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var o = { __row: i + 2 };
    for (var k = 0; k < wanted.length; k++) o[wanted[k]] = values[i][idx[k] - lo];
    out.push(o);
  }
  return out;
}

function findBy_(name, field, value) {
  var rows = readAll_(name);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][field]) === String(value)) return rows[i];
  }
  return null;
}

function filterBy_(name, field, value) {
  return readAll_(name).filter(function (r) { return String(r[field]) === String(value); });
}

function nextId_(name) {
  var rows = readAll_(name);
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    var n = Number(rows[i].id);
    if (n > max) max = n;
  }
  return max + 1;
}

/** เพิ่มแถวใหม่ — ใช้ล็อกกันชนกันเมื่อมีนักเรียนส่งพร้อมกันหลายคน */
function insert_(name, obj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    delete __cache[name];
    if (SHEETS[name][0] === 'id' && !obj.id) obj.id = nextId_(name);
    var cols = SHEETS[name];
    var row = [];
    for (var i = 0; i < cols.length; i++) {
      var v = obj[cols[i]];
      if (v === undefined || v === null) v = '';
      else if (typeof v === 'boolean') v = v ? 1 : 0;
      row.push(v);
    }
    sheet_(name).appendRow(row);
    delete __cache[name];
    return obj;
  } finally {
    lock.releaseLock();
  }
}

/** แก้ไขบางคอลัมน์ของแถวที่มี id ตรงกัน */
function update_(name, id, patch) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    delete __cache[name];
    var row = findBy_(name, 'id', id);
    if (!row) return false;
    var cols = SHEETS[name];
    var s = sheet_(name);
    for (var key in patch) {
      var ci = cols.indexOf(key);
      if (ci < 0) continue;
      var v = patch[key];
      if (v === undefined || v === null) v = '';
      else if (typeof v === 'boolean') v = v ? 1 : 0;
      s.getRange(row.__row, ci + 1).setValue(v);
    }
    delete __cache[name];
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getSetting_(key, fallback) {
  var row = findBy_('settings', 'key', key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch (e) { return fallback; }
}

function setSetting_(key, value) {
  var json = JSON.stringify(value);
  var row = findBy_('settings', 'key', key);
  if (row) {
    sheet_('settings').getRange(row.__row, 2).setValue(json);
    delete __cache.settings;
  } else {
    insert_('settings', { key: key, value: json });
  }
}

function parseJson_(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

/** ค่าจาก Sheet อาจกลับมาเป็น Date — แปลงเป็นข้อความรูปแบบเดียวกับที่กลไกใช้ */
function sqlStr_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return toSqlDate(v);
  return String(v);
}

function num_(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function truthy_(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE';
}

// ─────────────────────────── รหัสผ่านและ token ───────────────────────────
// Apps Script ไม่มี scrypt/bcrypt จึงใช้ HMAC-SHA256 ซ้ำหลายรอบ + salt รายคน
// อ่อนกว่า scrypt ของฉบับ Node แต่เมื่อรวมกับการล็อกบัญชี 8 ครั้ง/15 นาที
// การเดารหัสจากภายนอกไม่คุ้มค่าในทางปฏิบัติ (บันทึกข้อจำกัดนี้ไว้ในเอกสาร)

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('APP_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('APP_SECRET', s);
  }
  return s;
}

function b64_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function hashPin_(pin, salt) {
  var v = String(pin) + '|' + salt + '|' + secret_();
  var bytes = Utilities.computeHmacSha256Signature(v, secret_());
  for (var i = 0; i < HASH_ROUNDS; i++) {
    bytes = Utilities.computeHmacSha256Signature(bytes, Utilities.newBlob(salt).getBytes());
  }
  return b64_(bytes);
}

function makeHash_(pin) {
  var salt = Utilities.getUuid();
  return { salt: salt, hash: hashPin_(pin, salt) };
}

function verifyPin_(pin, salt, hash) {
  if (!salt || !hash) return false;
  return hashPin_(pin, salt) === String(hash);
}

function signToken_(userId, role) {
  var payload = { sub: userId, role: role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  var body = b64_(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  var sig = b64_(Utilities.computeHmacSha256Signature(body, secret_()));
  return body + '.' + sig;
}

function verifyToken_(token) {
  if (!token || String(token).indexOf('.') < 0) return null;
  var parts = String(token).split('.');
  var expected = b64_(Utilities.computeHmacSha256Signature(parts[0], secret_()));
  if (parts[1] !== expected) return null;
  try {
    var json = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    var payload = JSON.parse(json);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────── ข้อผิดพลาด ───────────────────────────

function fail_(status, message, code) {
  var e = new Error(message);
  e.__status = status;
  e.__code = code || 'ERROR';
  return e;
}

function need_(cond, message, status) {
  if (!cond) throw fail_(status || 400, message);
}

// ─────────────────────────── บันทึกร่องรอย ───────────────────────────

function audit_(ctx, action, entity, entityId, detail) {
  try {
    insert_('audit_log', {
      actor_user_id: ctx && ctx.user ? ctx.user.id : '',
      actor_role: ctx && ctx.user ? ctx.user.role : 'anonymous',
      action: action,
      entity: entity || '',
      entity_id: entityId === undefined || entityId === null ? '' : String(entityId),
      detail: detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '',
      created_at: nowSql(),
    });
  } catch (e) {
    // บันทึกร่องรอยล้มเหลวต้องไม่ทำให้คำขอหลักพัง
  }
}
