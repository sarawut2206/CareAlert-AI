// ลบฐานข้อมูลและ seed ใหม่ (ใช้ตอนพัฒนาเท่านั้น)
import { rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = path.join(root, 'server', 'data', 'carealert.db');

for (const f of [db, db + '-wal', db + '-shm', db + '-journal']) {
  if (existsSync(f)) { rmSync(f); console.log('ลบแล้ว:', f); }
}
spawnSync('node', ['--no-warnings', path.join(root, 'server', 'src', 'seed.js')], { stdio: 'inherit' });
