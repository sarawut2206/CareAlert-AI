// รันเซิร์ฟเวอร์ (API) และ Vite dev server พร้อมกัน โดยไม่ต้องพึ่ง dependency เพิ่ม
import { spawn } from 'node:child_process';
import process from 'node:process';

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

const procs = [];

function run(name, cmd, args, color) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: isWin });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) out.write(tag + l + '\n');
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    process.stdout.write(tag + `exited with code ${code}\n`);
    shutdown();
  });
  procs.push(p);
  return p;
}

function shutdown() {
  for (const p of procs) {
    if (!p.killed) try { p.kill(); } catch { /* noop */ }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('api', 'node', ['--no-warnings', '--watch', 'server/src/index.js'], '36');
run('web', npm, ['-w', 'web', 'run', 'dev'], '35');

console.log('\n  CareAlert AI (dev)\n  → เปิดเบราว์เซอร์ที่ http://localhost:5173\n  → API อยู่ที่ http://localhost:8787\n');
