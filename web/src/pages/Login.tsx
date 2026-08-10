import { useState } from 'react';
import { useAuth } from '../auth';
import { DEMO_MODE } from '../api';
import { HelpButton } from '../components/HelpButton';
import { InstallPrompt } from '../components/InstallPrompt';

const DEMO_ACCOUNTS = [
  { label: 'นักเรียน', username: '30101', password: '123456', hint: 'ลองเช็กอิน เล่าเรื่อง แจ้งเป็นห่วงเพื่อน' },
  { label: 'ครูที่ปรึกษา', username: 'teacher1', password: 'teacher1234', hint: 'เห็นเฉพาะห้อง ม.3/1 ที่รับผิดชอบ' },
  { label: 'ครูแนะแนว', username: 'counselor', password: 'counsel1234', hint: 'เห็นคิวเคสทั้งโรงเรียน และปิดเคสระดับ 4 ได้' },
  { label: 'ผู้อำนวยการ', username: 'director', password: 'director1234', hint: 'แดชบอร์ดภาพรวมทั้งโรงเรียน — ไม่เห็นชื่อนักเรียนรายคน' },
  { label: 'ผู้ดูแลระบบ', username: 'admin', password: 'admin1234', hint: 'ดูร่องรอยการใช้งานและการตั้งค่า' },
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function quickLogin(u: string, p: string) {
    setError(null);
    setBusy(true);
    try {
      await login(u.trim(), p);
    } catch (err: any) {
      setError(err?.message ?? 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await quickLogin(username, password);
  }

  return (
    <div className="app">
      <div className="container" style={{ maxWidth: 420, paddingTop: '2.5rem' }}>
        <div className="center" style={{ marginBottom: '1.5rem' }}>
          <img
            src={`${import.meta.env.BASE_URL}logo-sm.png`}
            alt="CareAlert AI"
            style={{ width: '100%', maxWidth: 300, height: 'auto', display: 'block', margin: '0 auto' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <p className="muted small" style={{ marginTop: '-.5rem' }}>ระบบสนับสนุนการดูแลช่วยเหลือนักเรียน</p>
        </div>

        <form className="card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="u">ชื่อผู้ใช้ / รหัสประจำตัวนักเรียน</label>
            <input
              id="u" type="text" value={username} autoComplete="username"
              inputMode="text" autoCapitalize="none"
              onChange={(e) => setUsername(e.target.value)} required
            />
          </div>
          <div className="field">
            <label htmlFor="p">รหัสผ่าน</label>
            <input
              id="p" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} required
            />
          </div>

          {error && <div className="alert error">{error}</div>}

          <button className="btn block" type="submit" disabled={busy}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        {DEMO_MODE ? (
          <div className="card">
            <h3>เลือกบทบาทเพื่อทดลอง</h3>
            <p className="small muted">กดปุ่มเพื่อเข้าสู่ระบบทันที — ทุกบัญชีเป็นบัญชีสมมติ</p>
            <div className="stack">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  className="choice"
                  disabled={busy}
                  onClick={() => { setUsername(a.username); setPassword(a.password); void quickLogin(a.username, a.password); }}
                >
                  <span className="dot" />
                  <span>
                    <strong>{a.label}</strong> <span className="muted small">({a.username})</span>
                    <br /><span className="small muted">{a.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              ถ้าเข้าสู่ระบบไม่ได้ ให้ติดต่อครูที่ปรึกษาหรือครูแนะแนว
              <br />
              <strong>ถ้าตอนนี้เธอต้องการความช่วยเหลือด่วน</strong> กดปุ่มสีส้มด้านล่างขวาได้เลย
              โดยไม่ต้องเข้าสู่ระบบ
            </p>
          </div>
        )}

        <InstallPrompt />
      </div>

      <HelpButton />
    </div>
  );
}
