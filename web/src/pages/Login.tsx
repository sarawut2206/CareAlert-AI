import { useState } from 'react';
import { useAuth } from '../auth';
import { HelpButton } from '../components/HelpButton';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="container" style={{ maxWidth: 420, paddingTop: '2.5rem' }}>
        <div className="center" style={{ marginBottom: '1.5rem' }}>
          <img
            src="/logo.png"
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

        <div className="card">
          <p className="small muted" style={{ margin: 0 }}>
            ถ้าเข้าสู่ระบบไม่ได้ ให้ติดต่อครูที่ปรึกษาหรือครูแนะแนว
            <br />
            <strong>ถ้าตอนนี้เธอต้องการความช่วยเหลือด่วน</strong> กดปุ่มสีส้มด้านล่างขวาได้เลย
            โดยไม่ต้องเข้าสู่ระบบ
          </p>
        </div>
      </div>

      <HelpButton />
    </div>
  );
}
