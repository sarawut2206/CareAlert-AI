import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, thaiDateTime } from '../../api';
import { LevelBadge, Spinner, Alert } from '../../components/ui';

export default function StudentProfile() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api(`/students/${id}`)
      .then((d: any) => { setData(d); setNotes(d.student?.notes ?? ''); })
      .catch((e) => setError(e.message));
  }, [id]);

  async function saveNotes() {
    setSaved(false);
    try {
      await api(`/students/${id}/notes`, { method: 'PUT', body: { notes } });
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (error) return <div className="container"><Alert kind="error">{error}</Alert></div>;
  if (!data) return <div className="container"><Spinner /></div>;

  const s = data.student;

  return (
    <div className="container wide">
      <Link to="/students" className="small">← กลับไปรายชื่อนักเรียน</Link>

      <div className="card" style={{ marginTop: '.5rem' }}>
        <h1 style={{ marginBottom: '.2rem' }}>{s.display_name}</h1>
        <div className="small muted">
          {s.student_code} · {s.classroom ?? 'ไม่ระบุห้อง'} · ครูที่ปรึกษา {s.advisor ?? '—'}
        </div>
        <p className="small muted" style={{ marginTop: '.6rem', marginBottom: 0 }}>
          หน้านี้คือ “ประวัติการดูแล” ไม่ใช่ “แฟ้มความเสี่ยง” —
          ระบบไม่จัดอันดับนักเรียน และไม่ติดป้ายกำกับตัวบุคคล
        </p>
      </div>

      <div className="split">
        <div>
          <div className="card">
            <h2>เคสที่เคยเปิด</h2>
            {data.cases?.length === 0 ? (
              <p className="muted small">ยังไม่เคยมีเคส</p>
            ) : (
              data.cases.map((c: any) => (
                <Link key={c.id} to={`/cases/${c.id}`} className="case-row">
                  <span className={`level-bar l${c.level}`} />
                  <div className="body">
                    <div className="row between">
                      <strong>เคส #{c.id}</strong>
                      <LevelBadge level={c.level} />
                    </div>
                    <div className="small muted">
                      เปิด {thaiDateTime(c.opened_at)}
                      {c.closed_at ? ` · ปิด ${thaiDateTime(c.closed_at)}` : ' · ยังเปิดอยู่'}
                    </div>
                    {c.close_reason && <div className="small">{c.close_reason}</div>}
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="card">
            <h2>แนวโน้มจากการเช็กอิน</h2>
            <p className="small muted">
              เช็กอินทั้งหมด {data.checkinCount} ครั้ง
              {data.consent && ` · ให้ความยินยอมเมื่อ ${thaiDateTime(data.consent.granted_at, false)}`}
            </p>
            {data.trend?.length > 1 ? (
              <TrendTable trend={data.trend} />
            ) : (
              <p className="muted small">ยังมีข้อมูลไม่พอสำหรับดูแนวโน้ม</p>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <h3>บันทึกบริบทที่ช่วยการดูแล</h3>
            <p className="small muted">
              บันทึกเฉพาะข้อเท็จจริงที่จำเป็นต่อการช่วยเหลือ เช่น ต้องติดต่อผ่านใคร หรือมีข้อจำกัดอะไร
              — ไม่ใช่ที่เก็บความเห็นเรื่องนิสัยหรือการวินิจฉัย
            </p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={3000} />
            <div className="row between" style={{ marginTop: '.5rem' }}>
              {saved ? <span className="small" style={{ color: 'var(--green-600)' }}>บันทึกแล้ว</span> : <span />}
              <button className="btn sm" onClick={saveNotes}>บันทึก</button>
            </div>
          </div>

          <div className="card">
            <h3>นักเรียนลืมรหัส</h3>
            <p className="small muted">
              ล้างรหัสที่นักเรียนตั้งไว้ เพื่อให้ตั้งใหม่ได้ในการกดชื่อครั้งถัดไป
              (ใช้ในโหมดทดลองที่เข้าด้วยการกดชื่อ)
            </p>
            <ResetPinButton studentId={id!} />
          </div>

          {(s.guardian_name || s.guardian_phone) && (
            <div className="card">
              <h3>ผู้ปกครอง</h3>
              <p className="small" style={{ margin: 0 }}>
                {s.guardian_name ?? '—'}<br />{s.guardian_phone ?? '—'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResetPinButton({ studentId }: { studentId: string }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'done'>('idle');
  const [msg, setMsg] = useState('');

  async function reset() {
    try {
      const r = await api<{ message: string }>(`/admin/students/${studentId}/reset-pin`, { method: 'POST' });
      setMsg(r.message);
      setState('done');
    } catch (e: any) {
      setMsg(e.message);
      setState('done');
    }
  }

  if (state === 'done') return <Alert kind="success">{msg}</Alert>;
  if (state === 'confirm') {
    return (
      <div className="row" style={{ gap: '.4rem' }}>
        <button className="btn danger sm" onClick={reset}>ยืนยันล้างรหัส</button>
        <button className="btn ghost sm" onClick={() => setState('idle')}>ยกเลิก</button>
      </div>
    );
  }
  return <button className="btn ghost sm" onClick={() => setState('confirm')}>ล้างรหัสให้ตั้งใหม่</button>;
}

function TrendTable({ trend }: { trend: any[] }) {
  return (
    <table className="data">
      <thead>
        <tr><th>วันที่</th><th>ระดับ</th><th>ดัชนี</th><th>ความเพียงพอของข้อมูล</th></tr>
      </thead>
      <tbody>
        {[...trend].reverse().slice(0, 15).map((t, i) => (
          <tr key={i}>
            <td>{thaiDateTime(t.created_at, false)}</td>
            <td><span className={`level l${t.level}`}>L{t.level}</span></td>
            <td>{t.concern_index}</td>
            <td className="small muted">
              {t.data_sufficiency === 'INSUFFICIENT' ? 'ยังสรุปไม่ได้'
                : t.data_sufficiency === 'LIMITED' ? 'มีข้อจำกัด' : 'ครบพอ'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
