import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

export default function ChangePassword() {
  const { refresh, logout, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    if (next.length < 8) return setError('รหัสผ่านใหม่ควรยาวอย่างน้อย 8 ตัวอักษร');

    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      await refresh();
    } catch (err: any) {
      setError(err?.message ?? 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="container" style={{ maxWidth: 440, paddingTop: '2rem' }}>
        <h1>ตั้งรหัสผ่านใหม่</h1>
        <p className="muted small">
          บัญชี <strong>{user?.username}</strong> ใช้รหัสผ่านชั่วคราวอยู่
          เพื่อความปลอดภัยของข้อมูลนักเรียน กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน
        </p>

        <form className="card" onSubmit={submit}>
          <div className="field">
            <label>รหัสผ่านปัจจุบัน</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="field">
            <label>รหัสผ่านใหม่</label>
            <div className="hint">อย่างน้อย 8 ตัวอักษร และไม่ควรใช้ร่วมกับผู้อื่น</div>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div className="field">
            <label>ยืนยันรหัสผ่านใหม่</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>

          {error && <div className="alert error">{error}</div>}

          <div className="row between">
            <button type="button" className="btn ghost" onClick={logout}>ออกจากระบบ</button>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
