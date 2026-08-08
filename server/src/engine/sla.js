/**
 * ขั้นที่ 6: Intervene — คำนวณกำหนดเวลาที่ต้องดำเนินการ
 *
 * ระดับ 4 ใช้เวลานาฬิกาจริง (ความปลอดภัยรอเวลาราชการไม่ได้)
 * ระดับ 2–3 ใช้ "เวลาเรียน" (ข้ามเสาร์-อาทิตย์และนอกเวลาเรียน) เพื่อให้ SLA เป็นจริงได้
 */

import { config } from '../config.js';

const MS_MIN = 60 * 1000;
const OFFSET_MS = config.timezone * MS_MIN;

/** แปลง Date → รูปแบบเดียวกับ datetime('now') ของ SQLite (UTC) */
export function toSqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function nowSql() {
  return toSqlDate(new Date());
}

export function parseSql(value) {
  if (!value) return null;
  return new Date(`${String(value).replace(' ', 'T')}Z`);
}

/** เวลาท้องถิ่นของโรงเรียน (ใช้ตัดสินว่าอยู่ในเวลาเรียนไหม) */
function local(date) {
  return new Date(date.getTime() + OFFSET_MS);
}
function fromLocal(date) {
  return new Date(date.getTime() - OFFSET_MS);
}

function isSchoolDay(localDate) {
  const day = localDate.getUTCDay(); // 0 = อาทิตย์, 6 = เสาร์
  return day !== 0 && day !== 6;
}

function startOfSchoolDay(localDate) {
  const d = new Date(localDate);
  d.setUTCHours(config.schoolDayStartHour, 0, 0, 0);
  return d;
}
function endOfSchoolDay(localDate) {
  const d = new Date(localDate);
  d.setUTCHours(config.schoolDayEndHour, 0, 0, 0);
  return d;
}
function nextSchoolDayStart(localDate) {
  const d = new Date(localDate);
  d.setUTCDate(d.getUTCDate() + 1);
  let candidate = startOfSchoolDay(d);
  let guard = 0;
  while (!isSchoolDay(candidate) && guard++ < 14) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate = startOfSchoolDay(candidate);
  }
  return candidate;
}

/**
 * บวกเวลาโดยนับเฉพาะเวลาเรียน
 * @param {Date} from
 * @param {number} minutes
 */
export function addSchoolMinutes(from, minutes) {
  let cursor = local(from);

  if (!isSchoolDay(cursor)) cursor = nextSchoolDayStart(cursor);
  else if (cursor < startOfSchoolDay(cursor)) cursor = startOfSchoolDay(cursor);
  else if (cursor >= endOfSchoolDay(cursor)) cursor = nextSchoolDayStart(cursor);

  let remaining = minutes;
  let guard = 0;
  while (remaining > 0 && guard++ < 200) {
    const availableToday = (endOfSchoolDay(cursor) - cursor) / MS_MIN;
    if (remaining <= availableToday) {
      cursor = new Date(cursor.getTime() + remaining * MS_MIN);
      remaining = 0;
    } else {
      remaining -= availableToday;
      cursor = nextSchoolDayStart(cursor);
    }
  }
  return fromLocal(cursor);
}

/**
 * คำนวณกำหนดเวลาของเคสตามระดับ
 * @returns {{acknowledgeDueAt: string, contactDueAt: string, nextFollowUpAt: string|null}}
 */
export function computeDeadlines(level, actions, from = new Date()) {
  const ackMin = actions.acknowledgeWithinMinutes;
  const contactMin = actions.contactWithinMinutes;

  const wallClock = level === 4;
  const add = (minutes) =>
    wallClock ? new Date(from.getTime() + minutes * MS_MIN) : addSchoolMinutes(from, minutes);

  const firstFollowUpDays = actions.followUpDays?.[0] ?? null;

  return {
    acknowledgeDueAt: toSqlDate(add(ackMin ?? 24 * 60)),
    contactDueAt: toSqlDate(add(contactMin ?? 3 * 24 * 60)),
    nextFollowUpAt: firstFollowUpDays
      ? toSqlDate(new Date(from.getTime() + firstFollowUpDays * 24 * 60 * MS_MIN))
      : null,
  };
}

/** สถานะกำหนดเวลา ใช้ระบายสีในคิวของบุคลากร */
export function slaStatus(dueAtSql, doneAtSql) {
  const due = parseSql(dueAtSql);
  if (!due) return 'none';
  const done = parseSql(doneAtSql);
  if (done) return done <= due ? 'met' : 'late';
  const now = Date.now();
  if (now > due.getTime()) return 'overdue';
  if (due.getTime() - now < 60 * MS_MIN) return 'due-soon';
  return 'on-track';
}
