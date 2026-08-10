-- CareAlert AI — โครงสร้างฐานข้อมูล
-- หลักการ: เก็บเท่าที่จำเป็น (data minimization), ตรวจสอบย้อนหลังได้ทุกการเข้าถึง (audit),
-- และแยก "ข้อมูลดิบที่นักเรียนบอก" ออกจาก "การประเมินของระบบ" อย่างชัดเจน

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ───────────────────────── ผู้ใช้ / โครงสร้างโรงเรียน ─────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('student','teacher','counselor','admin','director')),
  username      TEXT NOT NULL UNIQUE,     -- นักเรียนใช้รหัสประจำตัว, บุคลากรใช้ username
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classrooms (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,    -- เช่น "ม.3/2"
  level          TEXT NOT NULL,           -- เช่น "ม.3"
  advisor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_code   TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  classroom_id   INTEGER REFERENCES classrooms(id) ON DELETE SET NULL,
  birth_year     INTEGER,
  guardian_name  TEXT,
  guardian_phone TEXT,
  notes          TEXT,                    -- ข้อมูลบริบทที่จำเป็นต่อการช่วยเหลือเท่านั้น
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_classroom ON students(classroom_id);

-- ความยินยอม (PDPA) — บันทึกว่านักเรียน/ผู้ปกครองรับทราบขอบเขตและข้อจำกัดความลับ
CREATE TABLE IF NOT EXISTS consents (
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  version     TEXT NOT NULL,
  granted_by  TEXT NOT NULL CHECK (granted_by IN ('student','guardian')),
  granted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  withdrawn_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_consents_student ON consents(student_id);

-- ───────────────────────── ชั้นที่ 1: Detect / Disclose ─────────────────────────

-- การเช็กอิน (แบบสอบถามสั้น) — ใช้ได้กับนักเรียนทุกคน
CREATE TABLE IF NOT EXISTS checkins (
  id            INTEGER PRIMARY KEY,
  student_id    INTEGER REFERENCES students(id) ON DELETE CASCADE, -- NULL = ไม่ระบุตัวตน
  template_id   TEXT NOT NULL,
  template_version TEXT NOT NULL,
  answers_json  TEXT NOT NULL,            -- { itemId: value }
  item_timings_json TEXT,                 -- { itemId: ms } ใช้ตรวจคุณภาพข้อมูล ไม่ใช่จับโกหก
  duration_ms   INTEGER,
  anonymous     INTEGER NOT NULL DEFAULT 0,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checkins_student_time ON checkins(student_id, submitted_at DESC);

-- การแจ้งเรื่อง: ตนเอง / เป็นห่วงเพื่อน / บุคลากรบันทึกข้อสังเกต
CREATE TABLE IF NOT EXISTS reports (
  id                 INTEGER PRIMARY KEY,
  kind               TEXT NOT NULL CHECK (kind IN ('self','friend','staff_note')),
  reporter_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  subject_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL, -- ผู้ที่ถูกห่วงใย
  subject_hint       TEXT,                -- เมื่อผู้แจ้งระบุชื่อไม่ได้/ไม่อยากระบุ
  anonymous          INTEGER NOT NULL DEFAULT 0,
  categories_json    TEXT NOT NULL DEFAULT '[]',
  answers_json       TEXT NOT NULL DEFAULT '{}',  -- คำตอบตามชุดคำถามติดตาม
  body               TEXT,                -- ข้อความอิสระ
  wants_contact      INTEGER NOT NULL DEFAULT 0,
  contact_preference TEXT,
  submitted_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_subject ON reports(subject_student_id, submitted_at DESC);

-- ───────────────────────── ชั้นที่ 2: Validate / Assess / Alert ─────────────────────────

CREATE TABLE IF NOT EXISTS assessments (
  id             INTEGER PRIMARY KEY,
  source_type    TEXT NOT NULL CHECK (source_type IN ('checkin','report')),
  source_id      INTEGER NOT NULL,
  student_id     INTEGER REFERENCES students(id) ON DELETE CASCADE,
  engine_version TEXT NOT NULL,
  level          INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  concern_index  INTEGER NOT NULL DEFAULT 0,          -- 0..100 (ประกอบการพิจารณา ไม่ใช่คำตัดสิน)
  data_sufficiency TEXT NOT NULL CHECK (data_sufficiency IN ('SUFFICIENT','LIMITED','INSUFFICIENT')),
  dimensions_json TEXT NOT NULL,           -- คะแนนรายมิติ 0..3
  flags_json     TEXT NOT NULL,            -- ธงคุณภาพข้อมูล + ธงความปลอดภัย
  rationale_json TEXT NOT NULL,            -- กฎที่ทำงาน (อธิบายได้ว่าทำไมถึงระดับนี้)
  llm_used       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assessments_student ON assessments(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_source ON assessments(source_type, source_id);

-- ───────────────────────── Intervene / Follow-up ─────────────────────────

CREATE TABLE IF NOT EXISTS cases (
  id             INTEGER PRIMARY KEY,
  student_id     INTEGER REFERENCES students(id) ON DELETE SET NULL,
  subject_hint   TEXT,                     -- กรณีไม่ทราบตัวตน
  origin         TEXT NOT NULL CHECK (origin IN ('checkin','self_report','friend_report','staff_note')),
  level          INTEGER NOT NULL CHECK (level BETWEEN 2 AND 4),
  peak_level     INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','acknowledged','in_progress','referred','monitoring','closed')),
  owner_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledge_due_at TEXT NOT NULL,        -- SLA: ต้องรับเรื่องภายใน
  contact_due_at TEXT NOT NULL,            -- SLA: ต้องติดต่อนักเรียนภายใน
  next_followup_at TEXT,
  opened_at      TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  first_contact_at TEXT,
  closed_at      TEXT,
  close_reason   TEXT,
  safety_confirmed INTEGER NOT NULL DEFAULT 0,
  protection_needed INTEGER NOT NULL DEFAULT 0,  -- ต้องคุ้มครองจากการแก้แค้น
  guardian_informed INTEGER NOT NULL DEFAULT 0,
  referral_json  TEXT NOT NULL DEFAULT '[]',
  summary        TEXT
);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status, level DESC, contact_due_at);
CREATE INDEX IF NOT EXISTS idx_cases_student ON cases(student_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS case_links (
  case_id       INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  PRIMARY KEY (case_id, assessment_id)
);

CREATE TABLE IF NOT EXISTS case_events (
  id            INTEGER PRIMARY KEY,
  case_id       INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,            -- opened|acknowledged|contacted|action|referral|escalate|followup|closed|reopened|note
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note          TEXT,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_events_case ON case_events(case_id, created_at);

-- ───────────────────────── ชั้นที่ 1: ทักษะชีวิต ─────────────────────────

CREATE TABLE IF NOT EXISTS lifeskill_progress (
  id           INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  module_id    TEXT NOT NULL,
  step_index   INTEGER NOT NULL DEFAULT 0,
  completed    INTEGER NOT NULL DEFAULT 0,
  reflection   TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, module_id)
);

-- ───────────────────────── ระบบ ─────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  actor_user_id INTEGER,
  actor_role TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
