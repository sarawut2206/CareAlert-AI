// สร้างไฟล์นิ่งสำหรับ GitHub Pages (โหมดสาธิต)
// เรียก vite ตรง ๆ ผ่าน node เพื่อเลี่ยงปัญหา shell + path ที่มีช่องว่าง บน Windows
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const web = path.join(root, 'web');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const result = spawnSync(process.execPath, [viteBin, 'build'], {
  cwd: web,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEMO: '1' },
});

process.exit(result.status ?? 1);
