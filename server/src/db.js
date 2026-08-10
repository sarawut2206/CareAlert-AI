import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
const schemaText = readFileSync(path.join(here, 'schema.sql'), 'utf8');
db.exec(schemaText);

/**
 * Migration: ฐานข้อมูลที่สร้างก่อนมีบทบาท 'director' จะมี CHECK เก่าฝังอยู่ในตาราง
 * (SQLite แก้ CHECK ตรง ๆ ไม่ได้ ต้องสร้างตารางใหม่แล้วย้ายข้อมูล)
 */
{
  const usersDef = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get();
  if (usersDef && !usersDef.sql.includes("'director'")) {
    const ddl = schemaText
      .match(/CREATE TABLE IF NOT EXISTS users \([\s\S]*?\);/)[0]
      .replace('IF NOT EXISTS users', 'users_migrated');
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    db.exec(ddl);
    db.exec('INSERT INTO users_migrated SELECT * FROM users');
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_migrated RENAME TO users');
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
    console.log('[migration] เพิ่มบทบาท director ในตาราง users แล้ว');
  }
}

/**
 * Migration: คอลัมน์สำหรับ "โหมดทดลอง — กดชื่อตัวเองแล้วตั้งรหัสเอง"
 * self_pin_set = 1 แปลว่านักเรียนตั้งรหัสของตัวเองแล้ว (ไม่ใช่รหัสที่ระบบสุ่มให้ตอนนำเข้า)
 */
{
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('self_pin_set')) {
    db.exec('ALTER TABLE users ADD COLUMN self_pin_set INTEGER NOT NULL DEFAULT 0');
    console.log('[migration] เพิ่มคอลัมน์ self_pin_set แล้ว');
  }
}

/** SELECT หลายแถว */
export function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

/** SELECT แถวเดียว (คืน undefined ถ้าไม่พบ) */
export function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

/** INSERT/UPDATE/DELETE — คืน { changes, lastInsertRowid } */
export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

/** ทำงานเป็น transaction เดียว (node:sqlite ยังไม่มี helper ให้) */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}

/** แปลงคอลัมน์ *_json เป็น object อัตโนมัติ */
export function hydrate(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith('_json') && typeof v === 'string') {
      try { out[k.slice(0, -5)] = JSON.parse(v); } catch { out[k.slice(0, -5)] = null; }
    } else {
      out[k] = v;
    }
  }
  return out;
}
