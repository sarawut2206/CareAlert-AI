/**
 * Build โหมดสาธิตแล้ว push ขึ้น branch gh-pages ของ GitHub
 * ใช้: npm run deploy:pages
 *
 * ใช้วิธี push branch แทน GitHub Actions เพราะไม่ต้องพึ่ง workflow scope ของ token
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'web', 'dist-demo');

// ไม่ใช้ shell เลย — path ที่มีช่องว่าง (เช่น "CareAlert AI") จะพังเมื่อผ่าน shell บน Windows
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`ล้มเหลว: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

console.log('1/3 กำลัง build โหมดสาธิต…');
run(process.execPath, [path.join(root, 'scripts', 'build-demo.mjs')]);

// กัน GitHub Pages ประมวลผลด้วย Jekyll
writeFileSync(path.join(dist, '.nojekyll'), '');

console.log('2/3 กำลังเตรียม branch gh-pages…');
const gitDir = path.join(dist, '.git');
if (existsSync(gitDir)) rmSync(gitDir, { recursive: true, force: true });

run('git', ['init', '-q'], { cwd: dist });
run('git', ['checkout', '-qb', 'gh-pages'], { cwd: dist });
run('git', ['add', '-A'], { cwd: dist });
run('git', ['commit', '-qm', 'deploy demo to GitHub Pages'], { cwd: dist });

console.log('3/3 กำลัง push…');
run('git', ['push', '-f', 'https://github.com/sarawut2206/CareAlert-AI.git', 'gh-pages'], { cwd: dist });

rmSync(gitDir, { recursive: true, force: true });
console.log('\nเสร็จแล้ว → https://sarawut2206.github.io/CareAlert-AI/ (รอ 1-2 นาทีให้ Pages อัพเดต)\n');
