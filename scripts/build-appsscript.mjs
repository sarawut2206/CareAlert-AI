/**
 * แปลง rule engine + เนื้อหา (ES modules) → ไฟล์เดียวที่ Google Apps Script รันได้
 *
 * ทำไมต้องแปลง ไม่เขียนใหม่:
 *   กฎการประเมินต้องมีชุดเดียวในโลก ถ้าเขียนซ้ำสองที่ วันหนึ่งจะแก้ที่เดียวแล้วลืมอีกที่
 *   สคริปต์นี้จึงอ่านไฟล์ต้นฉบับใน server/src แล้วสร้าง appsscript/Engine.gs ให้อัตโนมัติ
 *
 * สิ่งที่แปลง:
 *   1. ตัดบรรทัด import ทิ้ง (Apps Script ไม่มีระบบโมดูล ทุกอย่างเป็น global)
 *   2. ตัดคำว่า export ออก
 *   3. ตัด async/await ใน runEngine (ตัวช่วยภาษาปิดอยู่เสมอบน Apps Script
 *      จึงไม่มีอะไรทำงานแบบไม่ประสานเวลาจริง ๆ — และ Apps Script จัดการ Promise ได้ไม่ดี)
 *
 * รัน: node scripts/build-appsscript.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'server', 'src');
const out = path.join(root, 'appsscript');
mkdirSync(out, { recursive: true });

// เรียงตามลำดับการพึ่งพา — ตัวที่ถูกเรียกใช้ต้องมาก่อน
const FILES = [
  'content/templates.js',
  'content/lifeskills.js',
  'content/help.js',
  'engine/version.js',
  'engine/lexicon.js',
  'engine/assess.js',
  'engine/validate.js',
  'engine/triage.js',
  'engine/sla.js',
  'engine/followups.js',
  'engine/index.js',
];

function transform(code, file) {
  let s = code;

  // 1. ตัด import ทุกรูปแบบ (บรรทัดเดียวและหลายบรรทัด)
  s = s.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  s = s.replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '');

  // 2. ตัด re-export (export { A } from './x.js') — ทุกอย่างเป็น global อยู่แล้ว
  s = s.replace(/^export\s*\{[^}]*\}\s*from\s+['"][^'"]+['"];?\s*$/gm, '');

  // 3. export { A, B };  → ตัดทิ้ง
  s = s.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

  // 4. export const/function/class → const/function/class
  s = s.replace(/^export\s+(const|let|var|function|class|async)\b/gm, '$1');

  // 5. engine/index.js: ตัด async/await (ดูเหตุผลด้านบน)
  if (file === 'engine/index.js') {
    s = s.replace(/async function runEngine/g, 'function runEngine');
    s = s.replace(/await analyzeText\(/g, 'analyzeText(');
  }

  return s.trimEnd();
}

const parts = [];

parts.push(`/**
 * ═══════════════════════════════════════════════════════════════
 *  Engine.gs — สร้างอัตโนมัติ ห้ามแก้ไขไฟล์นี้ด้วยมือ
 * ═══════════════════════════════════════════════════════════════
 *
 *  สร้างจาก server/src/ ด้วยคำสั่ง:  node scripts/build-appsscript.mjs
 *  ถ้าต้องการแก้กฎ ให้แก้ที่ server/src/engine/ แล้วสร้างไฟล์นี้ใหม่
 *
 *  เวอร์ชันกฎจะปรากฏในทุกการประเมิน ตรวจย้อนหลังได้เสมอ
 */

// ค่าตั้งต้นแทน server/src/config.js (Apps Script ไม่มี node:fs)
// เขตเวลาไทยคงที่ ส่วนเวลาเรียนปรับได้จาก Script Properties ผ่าน applySchoolHours()
var config = {
  timezone: 420,
  schoolDayStartHour: 8,
  schoolDayEndHour: 16,
  llm: { enabled: false, apiKey: '', model: '', baseUrl: '' },
};

function applySchoolHours(startHour, endHour) {
  if (startHour) config.schoolDayStartHour = Number(startHour);
  if (endHour) config.schoolDayEndHour = Number(endHour);
}

// ตัวช่วยภาษา (LLM) ปิดถาวรบน Apps Script — การประเมินใช้กฎล้วน
function llmEnabled() { return false; }
function analyzeText(_text) { return null; }
`);

for (const file of FILES) {
  const code = readFileSync(path.join(src, file), 'utf-8');
  parts.push(`\n// ─────────────────────────────────────────────────────────────\n// ที่มา: server/src/${file}\n// ─────────────────────────────────────────────────────────────\n`);
  parts.push(transform(code, file));
}

const result = parts.join('\n');
writeFileSync(path.join(out, 'Engine.gs'), result, 'utf-8');

const lines = result.split('\n').length;
console.log(`สร้าง appsscript/Engine.gs แล้ว (${lines} บรรทัด, ${(result.length / 1024).toFixed(0)} KB)`);

// ตรวจว่าไม่มี import/export หลงเหลือ
const leftover = result.split('\n')
  .map((l, i) => ({ l, i: i + 1 }))
  .filter(({ l }) => /^\s*(import|export)\s/.test(l));
if (leftover.length) {
  console.error('⚠️ ยังมี import/export หลงเหลือ:');
  for (const { l, i } of leftover) console.error(`  บรรทัด ${i}: ${l.trim()}`);
  process.exit(1);
}
console.log('ตรวจแล้ว: ไม่มี import/export หลงเหลือ');
