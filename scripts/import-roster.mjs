/**
 * นำเข้ารายชื่อนักเรียนจากไฟล์ Excel (.xls/.xlsx) เข้าระบบ
 *
 * ใช้:
 *   node scripts/import-roster.mjs "ม.4.xls" --level ม.4
 *   node scripts/import-roster.mjs "ม.4.xls" --level ม.4 --dry-run
 *
 * ต้องรันเซิร์ฟเวอร์ไว้ก่อน (npm start) และมีบัญชีผู้ดูแลระบบ
 *
 * ⚠️ ไฟล์รายชื่อจริงและไฟล์รหัสผ่านที่สร้างขึ้น อยู่ใน .gitignore แล้ว
 *    ห้าม commit ขึ้น git และห้ามส่งไฟล์รหัสผ่านในกลุ่มแชตเด็ดขาด
 *
 * หมายเหตุ: ขั้นแปลง .xls → CSV ต้องใช้ Python (xlrd/pandas) เพราะไฟล์ .xls รุ่นเก่า
 * มักเข้ารหัสภาษาไทยแบบ TIS-620 ซึ่ง JavaScript อ่านตรง ๆ ไม่ได้
 * ถ้ามีไฟล์ CSV อยู่แล้ว (รหัส,ชื่อ,ห้อง) ส่งไฟล์นั้นเข้ามาได้เลย
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
const level = args[args.indexOf('--level') + 1] ?? 'ม.4';
const dryRun = args.includes('--dry-run');
const BASE = process.env.BASE_URL || 'http://localhost:8787';

if (!src || !existsSync(src)) {
  console.error('ไม่พบไฟล์ต้นทาง\nใช้: node scripts/import-roster.mjs "ม.4.xls" --level ม.4');
  process.exit(1);
}

// ── 1. แปลงเป็น CSV ────────────────────────────────────────────
let csv;
if (src.toLowerCase().endsWith('.csv')) {
  csv = readFileSync(src, 'utf-8');
} else {
  const py = `
import re, sys, xlrd
THAI = re.compile(r'[\\u0E00-\\u0E7F]')
def read(enc=None):
    sh = xlrd.open_workbook(sys.argv[1], encoding_override=enc).sheet_by_index(0)
    header = [str(sh.cell_value(0, c)).strip().lower() for c in range(sh.ncols)]
    def col(*names):
        for n in names:
            if n in header: return header.index(n)
        return None
    ci, ni, ri = col('id','code','รหัส'), col('names','name','ชื่อ'), col('room','ห้อง')
    if ci is None or ni is None:
        sys.exit('ไม่พบคอลัมน์รหัส/ชื่อ — หัวตารางที่เจอ: ' + str(header))
    out = []
    for i in range(1, sh.nrows):
        code = str(sh.cell_value(i, ci)).strip().removesuffix('.0')
        name = re.sub(r'\\s+', ' ', str(sh.cell_value(i, ni)).strip())
        room = sh.cell_value(i, ri) if ri is not None else ''
        out.append((code, name, room))
    return out
rows = read()
if sum(1 for _, n, _ in rows if THAI.search(n)) < len(rows) * 0.9:
    rows = read('cp874')   # .xls ไทยรุ่นเก่าใช้ TIS-620
lines = []
for code, name, room in rows:
    if not code.isdigit() or not THAI.search(name): continue
    room_txt = f"{sys.argv[2]}/{int(float(room))}" if room != '' else ''
    lines.append(f"{code},{name},{room_txt}")
sys.stdout.reconfigure(encoding='utf-8')
print('\\n'.join(lines))
`;
  const r = spawnSync('python', ['-c', py, path.resolve(src), level], { encoding: 'utf-8' });
  if (r.status !== 0) {
    console.error('แปลงไฟล์ไม่สำเร็จ:', r.stderr || r.stdout);
    console.error('ถ้าขาดไลบรารี ให้ติดตั้ง: pip install xlrd');
    process.exit(1);
  }
  csv = r.stdout;
}

const lines = csv.split('\n').filter((l) => l.trim());
console.log(`อ่านรายชื่อได้ ${lines.length} คน`);
console.log('ตัวอย่าง 3 แถวแรก:');
for (const l of lines.slice(0, 3)) console.log('  ', l);

if (dryRun) {
  console.log('\n(โหมด --dry-run: ยังไม่นำเข้าจริง)');
  process.exit(0);
}

// ── 2. นำเข้าผ่าน API ──────────────────────────────────────────
const username = process.env.ADMIN_USER || 'admin';
const password = process.env.ADMIN_PASS || 'admin1234';

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
}).then((r) => r.json()).catch(() => ({}));

if (!login.token) {
  console.error(`เข้าสู่ระบบผู้ดูแลไม่สำเร็จ — ตรวจว่าเซิร์ฟเวอร์รันอยู่ที่ ${BASE}`);
  console.error('ตั้งบัญชีเองได้ด้วย ADMIN_USER / ADMIN_PASS');
  process.exit(1);
}

const res = await fetch(`${BASE}/api/admin/students/import`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
  body: JSON.stringify({ csv }),
}).then((r) => r.json());

if (!res.ok) {
  console.error('นำเข้าไม่สำเร็จ:', res.error ?? JSON.stringify(res).slice(0, 300));
  process.exit(1);
}

console.log(`\nนำเข้าสำเร็จ ${res.created.length} คน · ข้าม/ผิดพลาด ${res.errors.length} รายการ`);
for (const e of res.errors.slice(0, 10)) console.log(`  บรรทัด ${e.line}: ${e.message}`);

// ── 3. บันทึกรหัสผ่านเริ่มต้นสำหรับพิมพ์แจก ───────────────────
if (res.created.length === 0) process.exit(0);

const byRoom = {};
for (const c of res.created) (byRoom[c.classroom ?? '(ไม่ระบุห้อง)'] ??= []).push(c);

let out = `รหัสผ่านเริ่มต้นนักเรียน ${level} — CareAlert AI\n`;
out += 'พิมพ์แล้วตัดแจกรายคน — ห้ามส่งในกลุ่มแชต ห้ามติดประกาศ\n';
out += `สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}\n`;
out += `${'='.repeat(60)}\n\n`;

const sortRooms = (a, b) => a.localeCompare(b, 'th', { numeric: true });
for (const room of Object.keys(byRoom).sort(sortRooms)) {
  out += `───────── ${room} (${byRoom[room].length} คน) ─────────\n`;
  for (const c of byRoom[room]) {
    out += `${c.code}  ${c.name}\n    ชื่อผู้ใช้: ${c.code}   รหัสผ่าน: ${c.pin}\n\n`;
  }
  out += '\n';
}

const outFile = path.join(root, `รหัสผ่านนักเรียน-${level}.txt`);
writeFileSync(outFile, out, 'utf-8');
console.log(`\nไฟล์รหัสผ่าน: ${outFile}`);
console.log('⚠️ ระบบไม่แสดงรหัสผ่านนี้ซ้ำอีก — เก็บให้ปลอดภัย แจกรายคน แล้วลบทิ้งเมื่อแจกครบ');
