import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Spinner, EmptyState } from '../../components/ui';

type Student = { id: number; student_code: string; display_name: string; classroom: string | null };
type Classroom = { id: number; name: string; level: string; student_count: number; advisor?: string };

export default function StudentsPage() {
  const [q, setQ] = useState('');
  const [classroomId, setClassroomId] = useState<string>('');
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);

  useEffect(() => {
    api<{ classrooms: Classroom[] }>('/students/meta/classrooms')
      .then((d) => setClassrooms(d.classrooms)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (classroomId) p.set('classroomId', classroomId);
      api<{ students: Student[] }>(`/students?${p}`).then((d) => setStudents(d.students)).catch(() => setStudents([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, classroomId]);

  return (
    <div className="container wide">
      <div className="card">
        <div className="row">
          <input
            type="text" value={q} placeholder="ค้นหาชื่อหรือรหัสประจำตัว"
            onChange={(e) => setQ(e.target.value)} style={{ flex: 2, minWidth: 200 }}
          />
          <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
            <option value="">ทุกห้อง</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.student_count})</option>)}
          </select>
        </div>
        <p className="small muted" style={{ margin: '.6rem 0 0' }}>
          การเปิดดูข้อมูลนักเรียนทุกครั้งถูกบันทึกไว้ในระบบตรวจสอบ — เปิดดูเมื่อจำเป็นต่อการช่วยเหลือเท่านั้น
        </p>
      </div>

      {!students ? <Spinner /> : students.length === 0 ? (
        <EmptyState emoji="🔍" title="ไม่พบนักเรียน" />
      ) : (
        <div className="card flush">
          <table className="data">
            <thead>
              <tr><th>รหัส</th><th>ชื่อ</th><th>ห้อง</th><th /></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.student_code}</td>
                  <td>{s.display_name}</td>
                  <td>{s.classroom ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/students/${s.id}`} className="btn ghost sm">ดูข้อมูล</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
