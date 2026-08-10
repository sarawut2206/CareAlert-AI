/**
 * สร้างข้อมูลตั้งต้นสำหรับทดลองใช้งาน
 * รันซ้ำได้ (idempotent) — ถ้ามีข้อมูลอยู่แล้วจะไม่สร้างซ้ำ
 *
 * ⚠️ ข้อมูลนักเรียนในไฟล์นี้เป็นข้อมูลสมมติทั้งหมด ห้ามใช้ในระบบจริง
 */

import { get, run, tx, setSetting } from './db.js';
import { hashPassword } from './lib/crypto.js';

const STAFF = [
  { role: 'admin',     username: 'admin',    password: 'admin1234',    name: 'ผู้ดูแลระบบ' },
  { role: 'director',  username: 'director', password: 'director1234', name: 'ผู้อำนวยการ วิชัย' },
  { role: 'counselor', username: 'counselor', password: 'counsel1234', name: 'ครูแนะแนว สมฤดี' },
  { role: 'teacher',   username: 'teacher1', password: 'teacher1234',  name: 'ครูที่ปรึกษา อนุชา' },
  { role: 'teacher',   username: 'teacher2', password: 'teacher1234',  name: 'ครูที่ปรึกษา ปิยะดา' },
];

const CLASSROOMS = [
  { name: 'ม.3/1', level: 'ม.3', advisor: 'teacher1' },
  { name: 'ม.3/2', level: 'ม.3', advisor: 'teacher2' },
];

const STUDENTS = [
  { code: '30101', name: 'นักเรียนตัวอย่าง ก', classroom: 'ม.3/1' },
  { code: '30102', name: 'นักเรียนตัวอย่าง ข', classroom: 'ม.3/1' },
  { code: '30103', name: 'นักเรียนตัวอย่าง ค', classroom: 'ม.3/1' },
  { code: '30201', name: 'นักเรียนตัวอย่าง ง', classroom: 'ม.3/2' },
  { code: '30202', name: 'นักเรียนตัวอย่าง จ', classroom: 'ม.3/2' },
];

const STUDENT_PIN = '123456';

function seed() {
  const already = get('SELECT COUNT(*) AS n FROM users');
  if (already.n > 0) {
    console.log('มีข้อมูลอยู่แล้ว — ข้ามการสร้างข้อมูลตั้งต้น');
    console.log('ถ้าต้องการเริ่มใหม่ทั้งหมด ให้รัน: npm run reset');
    return;
  }

  tx(() => {
    const userIds = {};
    for (const s of STAFF) {
      const ins = run(
        `INSERT INTO users (role, username, password_hash, display_name, must_change_password)
         VALUES (?,?,?,?,1)`,
        [s.role, s.username, hashPassword(s.password), s.name],
      );
      userIds[s.username] = Number(ins.lastInsertRowid);
    }

    const classroomIds = {};
    for (const c of CLASSROOMS) {
      const ins = run('INSERT INTO classrooms (name, level, advisor_user_id) VALUES (?,?,?)',
        [c.name, c.level, userIds[c.advisor] ?? null]);
      classroomIds[c.name] = Number(ins.lastInsertRowid);
    }

    for (const st of STUDENTS) {
      const userIns = run(
        `INSERT INTO users (role, username, password_hash, display_name) VALUES ('student', ?, ?, ?)`,
        [st.code, hashPassword(STUDENT_PIN), st.name],
      );
      run(
        'INSERT INTO students (user_id, student_code, display_name, classroom_id) VALUES (?,?,?,?)',
        [Number(userIns.lastInsertRowid), st.code, st.name, classroomIds[st.classroom]],
      );
    }

    setSetting('school', {
      name: 'โรงเรียนตัวอย่าง',
      contacts: [
        { label: 'ห้องแนะแนว', detail: 'อาคาร 1 ชั้น 2 (เวลา 08.00–16.00 น.)' },
        { label: 'ครูเวรประจำวัน', detail: 'ติดต่อที่ห้องธุรการ' },
      ],
    });
  });

  console.log('\n  สร้างข้อมูลตั้งต้นเรียบร้อย\n');
  console.log('  บัญชีบุคลากร (ต้องเปลี่ยนรหัสผ่านเมื่อเข้าใช้ครั้งแรก):');
  for (const s of STAFF) console.log(`    ${s.role.padEnd(10)} ${s.username.padEnd(11)} / ${s.password}`);
  console.log('\n  บัญชีนักเรียน (ใช้รหัสประจำตัวเป็นชื่อผู้ใช้):');
  for (const s of STUDENTS) console.log(`    ${s.code} / ${STUDENT_PIN}  (${s.name} — ${s.classroom})`);
  console.log('\n  ⚠️  เปลี่ยนรหัสผ่านทั้งหมดก่อนใช้งานจริง\n');
}

seed();
