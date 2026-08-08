import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec(readFileSync(path.join(here, 'schema.sql'), 'utf8'));

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
