import { useState } from 'react';
import { api, setToken } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/ui';

/**
 * หน้าตั้งค่าครั้งแรก
 *
 * แสดงเฉพาะตอนที่ยังไม่เคยมีใครเข้าระบบสำเร็จเลย
 * พอตั้งค่าเสร็จ หน้านี้จะหายไปถาวร เปิดซ้ำไม่ได้อีก
 *
 * ออกแบบมาแทนการตั้งรหัสผ่านผ่านตัวแปรบนโฮสต์ ซึ่งพิมพ์ผิดหนึ่งตัว
 * ก็เข้าระบบไม่ได้เลยและไม่มีทางกู้
 */
export default function FirstRunSetup({ onDone }: { onDone: () => void }) {
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const weak = password.length > 0 && password.toLowerCase() === username.toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const d = await api<{ token: string }>('/auth/setup', {
        method: 'POST',
        body: { username: username.trim(), displayName: displayName.trim(), password, confirmPassword },
      });
      setToken(d.token);
      await refresh();
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'ตั้งค่าไม่สำเร็จ');
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="container" style={{ maxWidth: 460, paddingTop: '2rem' }}>
        <div className="center" style={{ marginBottom: '1.2rem' }}>
          <img
            src={`${import.meta.env.BASE_URL}logo-sm.png`}
            alt="CareAlert AI"
            style={{ width: '100%', maxWidth: 260, height: 'auto', display: 'block', margin: '0 auto' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        <div className="hero">
          <h1>ตั้งค่าครั้งแรก</h1>
          <p>สร้างบัญชีผู้ดูแลระบบของโรงเรียน — ทำครั้งเดียว หน้านี้จะไม่ขึ้นอีก</p>
        </div>

        <form className="card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="su">ชื่อผู้ใช้</label>
            <div className="hint">ใช้เข้าระบบ ตัวพิมพ์ใหญ่เล็กไม่มีผล</div>
            <input
              id="su" type="text" value={username} autoComplete="username"
              autoCapitalize="none" placeholder="เช่น SaM2569" required minLength={3}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="sd">ชื่อที่แสดงในระบบ</label>
            <input
              id="sd" type="text" value={displayName} placeholder="เช่น ครูสรวุฒิ (ผู้ดูแลระบบ)"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="sp">รหัสผ่าน</label>
            <div className="hint">อย่างน้อย 8 ตัวอักษร และต้องมีตัวเลขหรือสัญลักษณ์อย่างน้อยหนึ่งตัว</div>
            <input
              id="sp" type="password" value={password} autoComplete="new-password"
              required minLength={8}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="sc">ยืนยันรหัสผ่าน</label>
            <input
              id="sc" type="password" value={confirmPassword} autoComplete="new-password"
              required minLength={8}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {weak && (
            <Alert kind="warn">
              รหัสผ่านเหมือนชื่อผู้ใช้ — บัญชีนี้เปิดดูเรื่องที่นักเรียนเขียนได้ทั้งโรงเรียน
              ควรตั้งให้ต่างกัน
            </Alert>
          )}
          {error && <Alert kind="error">{error}</Alert>}

          <button className="btn block" type="submit" disabled={busy}>
            {busy ? 'กำลังตั้งค่า…' : 'สร้างบัญชีและเริ่มใช้งาน'}
          </button>
        </form>

        <div className="card">
          <p className="small muted" style={{ margin: 0 }}>
            <strong>ทำไมต้องมีรหัสผ่าน:</strong> ระบบนี้เก็บเรื่องที่นักเรียนเล่าเมื่อไม่สบายใจ
            รวมถึงเรื่องความปลอดภัย ถ้าไม่มีรหัส ใครที่เจอลิงก์นี้ก็อ่านได้ทั้งหมด
            <br /><br />
            หลังตั้งค่าเสร็จ หน้านี้จะปิดถาวร และบัญชีผู้ดูแลอื่นที่ยังไม่เคยถูกใช้จะถูกปิดไปด้วย
          </p>
        </div>
      </div>
    </div>
  );
}
