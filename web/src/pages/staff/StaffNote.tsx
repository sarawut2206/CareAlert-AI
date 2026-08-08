import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Survey, type Answers, type Template } from '../../components/Survey';
import { LevelBadge, Spinner, Alert } from '../../components/ui';

type Student = { id: number; student_code: string; display_name: string; classroom: string | null };

export default function StaffNote() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ staffNote: Template }>('/reports/templates')
      .then((d) => setTemplate(d.staffNote))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!q.trim()) return setStudents([]);
    const t = setTimeout(() => {
      api<{ students: Student[] }>(`/students?q=${encodeURIComponent(q)}`)
        .then((d) => setStudents(d.students.slice(0, 8))).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function submit(payload: { answers: Answers }) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api('/reports/staff-note', {
        method: 'POST', body: { studentId: selected.id, answers: payload.answers },
      });
      setResult(res);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setError(e?.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (error && !template) return <div className="container"><Alert kind="error">{error}</Alert></div>;
  if (!template) return <div className="container"><Spinner /></div>;

  if (result) {
    return (
      <div className="container">
        <div className="card">
          <div className="row between">
            <h1 style={{ margin: 0 }}>บันทึกเรียบร้อย</h1>
            <LevelBadge level={result.level} />
          </div>
          <p className="small muted">
            ระบบประเมินว่าเรื่องนี้อยู่ในระดับ {result.level} — {result.levelInfo?.th}
          </p>

          <h3>เหตุผล</h3>
          {result.rationale?.matched?.map((m: any, i: number) => (
            <div key={i} className="rule-item">
              <span className={`level l${m.level}`}>L{m.level}</span>
              <span>{m.label}</span>
            </div>
          ))}

          <h3 style={{ marginTop: '.8rem' }}>สิ่งที่ต้องทำต่อ</h3>
          <p className="small"><strong>{result.actions?.headline}</strong> · ผู้รับผิดชอบ: {result.actions?.owner}</p>
          <ol className="small" style={{ paddingLeft: '1.1rem' }}>
            {result.actions?.steps?.map((s: string, i: number) => <li key={i}>{s}</li>)}
            {result.actions?.extraSteps?.map((s: string, i: number) => (
              <li key={`x${i}`} style={{ color: 'var(--orange-600)' }}>{s}</li>
            ))}
          </ol>

          <div className="row">
            {result.caseId && <Link to={`/cases/${result.caseId}`} className="btn">ไปที่เคส</Link>}
            <button className="btn ghost" onClick={() => { setResult(null); setAnswers({}); setSelected(null); setQ(''); }}>
              บันทึกรายการใหม่
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="container">
        <div className="card">
          <h1>บันทึกข้อสังเกต</h1>
          <p className="small muted">
            บันทึกสิ่งที่ <strong>สังเกตเห็นจริง</strong> เป็นข้อเท็จจริง
            หลีกเลี่ยงการตีความ การวินิจฉัย หรือการคาดเดาสาเหตุ
          </p>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>เลือกนักเรียน</label>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อหรือรหัสประจำตัว" />
          </div>

          <div className="stack" style={{ marginTop: '.6rem' }}>
            {students.map((s) => (
              <button key={s.id} className="choice" onClick={() => setSelected(s)}>
                <span className="dot" />
                <span>{s.display_name} <span className="muted small">· {s.student_code} · {s.classroom ?? '—'}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="row between">
          <span>
            <strong>{selected.display_name}</strong>
            <span className="muted small"> · {selected.classroom ?? '—'}</span>
          </span>
          <button className="btn ghost sm" onClick={() => setSelected(null)}>เปลี่ยนนักเรียน</button>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <Survey
        templates={[template]}
        answers={answers}
        onChange={setAnswers}
        onSubmit={submit}
        submitting={busy}
        submitLabel="บันทึก"
      />
    </div>
  );
}
