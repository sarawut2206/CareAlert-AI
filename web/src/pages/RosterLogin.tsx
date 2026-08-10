import { useEffect, useState } from 'react';
import { api, setToken } from '../api';
import { useAuth } from '../auth';
import { Alert, Spinner } from '../components/ui';

/**
 * โหมดทดลอง — เข้าระบบด้วยการกดชื่อตัวเอง
 *
 * ขั้นตอน: รหัสเข้าโรงเรียน → เลือกห้อง → กดชื่อตัวเอง → ตั้ง/ใส่ PIN
 *
 * เหตุผลของแต่ละด่าน:
 *  - รหัสเข้าโรงเรียน: กันไม่ให้รายชื่อนักเรียนจริงเปิดสู่อินเทอร์เน็ต (จำไว้ในเครื่อง กรอกครั้งเดียว)
 *  - PIN ที่ตั้งเอง: กันเพื่อนกดชื่อเราแล้วอ่านสิ่งที่เราเขียน หรือส่งเรื่องปลอมในชื่อเรา
 */

const CODE_KEY = 'carealert.schoolCode';

type Classroom = { id: number; name: string; student_count: number };
type RosterStudent = { id: number; displayName: string; claimed: boolean };

export default function RosterLogin({ onBack }: { onBack: () => void }) {
  const { refresh } = useAuth();

  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) ?? '');
  const [classrooms, setClassrooms] = useState<Classroom[] | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<RosterStudent[] | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<RosterStudent | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // มีรหัสจำไว้แล้ว → ข้ามด่านแรกไปเลย
  useEffect(() => {
    if (code && !classrooms) void loadClassrooms(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadClassrooms(accessCode: string) {
    setError(null);
    setBusy(true);
    try {
      const d = await api<{ classrooms: Classroom[] }>('/auth/roster/classrooms', {
        method: 'POST', body: { accessCode },
      });
      localStorage.setItem(CODE_KEY, accessCode);
      setClassrooms(d.classrooms);
    } catch (e: any) {
      localStorage.removeItem(CODE_KEY);
      setClassrooms(null);
      setError(e?.message ?? 'เข้าไม่ได้');
    } finally {
      setBusy(false);
    }
  }

  async function loadStudents(c: Classroom) {
    setError(null);
    setBusy(true);
    setSearch('');
    try {
      const d = await api<{ students: RosterStudent[] }>('/auth/roster/students', {
        method: 'POST', body: { accessCode: code, classroomId: c.id },
      });
      setClassroom(c);
      setStudents(d.students);
    } catch (e: any) {
      setError(e?.message ?? 'โหลดรายชื่อไม่ได้');
    } finally {
      setBusy(false);
    }
  }

  async function enter() {
    if (!picked) return;
    setError(null);
    setBusy(true);
    try {
      const d = await api<{ token: string }>('/auth/roster/enter', {
        method: 'POST',
        body: {
          accessCode: code,
          studentId: picked.id,
          pin,
          ...(picked.claimed ? {} : { confirmPin }),
        },
      });
      setToken(d.token);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'เข้าระบบไม่สำเร็จ');
      setBusy(false);
    }
  }

  // ── ด่าน 1: รหัสเข้าโรงเรียน ────────────────────────────
  if (!classrooms) {
    return (
      <Shell onBack={onBack} title="เข้าด้วยการกดชื่อตัวเอง" step="1 จาก 3">
        <div className="card">
          <div className="field" style={{ marginBottom: '.6rem' }}>
            <label htmlFor="sc">รหัสเข้าโรงเรียน</label>
            <div className="hint">ครูจะบอกรหัสนี้ในห้อง — กรอกครั้งเดียว เครื่องนี้จะจำไว้ให้</div>
            <input
              id="sc" type="text" value={code} autoCapitalize="characters" autoComplete="off"
              placeholder="เช่น NK2569"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) void loadClassrooms(code.trim()); }}
            />
          </div>
          {error && <Alert kind="error">{error}</Alert>}
          <button className="btn block" disabled={busy || !code.trim()} onClick={() => loadClassrooms(code.trim())}>
            {busy ? 'กำลังตรวจสอบ…' : 'ถัดไป'}
          </button>
        </div>
      </Shell>
    );
  }

  // ── ด่าน 2: เลือกห้อง ───────────────────────────────────
  if (!classroom || !students) {
    return (
      <Shell onBack={onBack} title="เธออยู่ห้องไหน" step="2 จาก 3">
        {error && <Alert kind="error">{error}</Alert>}
        {busy && <Spinner />}
        <div className="tiles">
          {classrooms.map((c) => (
            <button key={c.id} className="tile" onClick={() => loadStudents(c)} disabled={busy}>
              <span className="emoji">🏫</span>
              <strong>{c.name}</strong>
              <span>{c.student_count} คน</span>
            </button>
          ))}
        </div>
        {classrooms.length === 0 && (
          <Alert kind="warn">ยังไม่มีห้องที่เปิดให้ทดลอง — บอกครูให้เปิดห้องของเธอในระบบก่อน</Alert>
        )}
        <button
          className="btn ghost block" style={{ marginTop: '1rem' }}
          onClick={() => { localStorage.removeItem(CODE_KEY); setClassrooms(null); }}
        >
          ใส่รหัสโรงเรียนใหม่
        </button>
      </Shell>
    );
  }

  // ── ด่าน 4: ตั้ง/ใส่ PIN ────────────────────────────────
  if (picked) {
    const isNew = !picked.claimed;
    return (
      <Shell onBack={() => { setPicked(null); setPin(''); setConfirmPin(''); setError(null); }}
        title={picked.displayName} step="3 จาก 3">
        <div className="card">
          {isNew ? (
            <>
              <h3>ตั้งรหัสของเธอ</h3>
              <p className="small muted">
                ตัวเลข 4–6 หลักที่เธอจำได้ <strong>อย่าบอกใคร</strong> —
                รหัสนี้กันไม่ให้เพื่อนกดชื่อเธอแล้วอ่านสิ่งที่เธอเขียน
              </p>
              <div className="field">
                <label>ตั้งรหัส</label>
                <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6}
                  value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div className="field">
                <label>ใส่อีกครั้งให้ตรงกัน</label>
                <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6}
                  value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void enter(); }} />
              </div>
            </>
          ) : (
            <>
              <h3>ใส่รหัสของเธอ</h3>
              <p className="small muted">ถ้าลืมรหัส บอกครูที่ปรึกษาหรือครูแนะแนวให้ตั้งใหม่ให้ได้</p>
              <div className="field">
                <label>รหัส</label>
                <input type="password" inputMode="numeric" autoComplete="current-password" maxLength={6}
                  autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void enter(); }} />
              </div>
            </>
          )}

          {error && <Alert kind="error">{error}</Alert>}

          <button className="btn block" disabled={busy || pin.length < 4 || (isNew && confirmPin.length < 4)}
            onClick={enter}>
            {busy ? 'กำลังเข้า…' : isNew ? 'ตั้งรหัสและเริ่มใช้งาน' : 'เข้าใช้งาน'}
          </button>
        </div>
      </Shell>
    );
  }

  // ── ด่าน 3: กดชื่อตัวเอง ────────────────────────────────
  const filtered = search.trim()
    ? students.filter((s) => s.displayName.includes(search.trim()))
    : students;

  return (
    <Shell onBack={() => { setClassroom(null); setStudents(null); }} title={`${classroom.name} — กดชื่อของเธอ`} step="3 จาก 3">
      <div className="card" style={{ marginBottom: '.6rem' }}>
        <input type="text" value={search} placeholder="พิมพ์ชื่อเพื่อค้นหาเร็วขึ้น"
          onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="stack">
        {filtered.map((s) => (
          <button key={s.id} className="choice" onClick={() => { setPicked(s); setPin(''); setConfirmPin(''); setError(null); }}>
            <span className="dot" />
            <span style={{ flex: 1 }}>{s.displayName}</span>
            {!s.claimed && <span className="tag">ยังไม่ตั้งรหัส</span>}
          </button>
        ))}
        {filtered.length === 0 && <p className="muted small center">ไม่พบชื่อนี้ ลองพิมพ์สั้นลง</p>}
      </div>
    </Shell>
  );
}

function Shell({ title, step, onBack, children }: {
  title: string; step: string; onBack: () => void; children: React.ReactNode;
}) {
  return (
    <div className="container" style={{ maxWidth: 480, paddingTop: '1.2rem' }}>
      <div className="row between" style={{ marginBottom: '.6rem' }}>
        <button className="btn ghost sm" onClick={onBack}>← ย้อนกลับ</button>
        <span className="small muted">{step}</span>
      </div>
      <h1 style={{ fontSize: '1.25rem' }}>{title}</h1>
      {children}
    </div>
  );
}
