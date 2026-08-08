import { useEffect, useState } from 'react';
import { api, thaiDateTime } from '../../api';
import { Spinner, Alert } from '../../components/ui';

type Tab = 'users' | 'students' | 'classrooms' | 'settings' | 'audit' | 'retention';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="container wide">
      <div className="card">
        <h1 style={{ marginBottom: '.6rem' }}>ผู้ดูแลระบบ</h1>
        <div className="row" style={{ gap: '.35rem' }}>
          {([
            ['users', 'บุคลากร'], ['students', 'นำเข้านักเรียน'], ['classrooms', 'ห้องเรียน'],
            ['settings', 'ตั้งค่า'], ['audit', 'ร่องรอยการใช้งาน'], ['retention', 'นโยบายเก็บข้อมูล'],
          ] as [Tab, string][]).map(([v, l]) => (
            <button key={v} className={`btn sm ${tab === v ? '' : 'ghost'}`} onClick={() => setTab(v)}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'users' && <Users />}
      {tab === 'students' && <ImportStudents />}
      {tab === 'classrooms' && <Classrooms />}
      {tab === 'settings' && <Settings />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'retention' && <Retention />}
    </div>
  );
}

// ─────────────────────────── บุคลากร ───────────────────────────

function Users() {
  const [users, setUsers] = useState<any[] | null>(null);
  const [form, setForm] = useState({ role: 'teacher', username: '', displayName: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<{ users: any[] }>('/admin/users').then((d) => setUsers(d.users)).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  async function create() {
    setError(null); setMessage(null);
    try {
      const res = await api<{ tempPassword: string }>('/admin/users', { method: 'POST', body: form });
      setMessage(`สร้างบัญชี ${form.username} แล้ว — รหัสผ่านชั่วคราว: ${res.tempPassword} (ให้เจ้าตัวเปลี่ยนทันที)`);
      setForm({ role: 'teacher', username: '', displayName: '' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function reset(id: number, username: string) {
    setError(null); setMessage(null);
    try {
      const res = await api<{ tempPassword: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' });
      setMessage(`ตั้งรหัสผ่านใหม่ให้ ${username} แล้ว — รหัสผ่านชั่วคราว: ${res.tempPassword}`);
    } catch (e: any) { setError(e.message); }
  }

  if (!users) return <Spinner />;

  return (
    <>
      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        <h2>เพิ่มบุคลากร</h2>
        <div className="row">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ flex: 1, minWidth: 140 }}>
            <option value="teacher">ครูที่ปรึกษา</option>
            <option value="counselor">ครูแนะแนว</option>
            <option value="admin">ผู้ดูแลระบบ</option>
          </select>
          <input placeholder="ชื่อผู้ใช้" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
          <input placeholder="ชื่อที่แสดง" value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
          <button className="btn" onClick={create}>สร้าง</button>
        </div>
      </div>

      <div className="card flush">
        <table className="data">
          <thead><tr><th>บทบาท</th><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>เข้าใช้ล่าสุด</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{ROLE_TH[u.role] ?? u.role}</td>
                <td>{u.username}</td>
                <td>{u.display_name}{!u.active && <span className="tag gray"> ปิดใช้งาน</span>}</td>
                <td className="small muted">{u.last_login_at ? thaiDateTime(u.last_login_at) : 'ยังไม่เคย'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn ghost sm" onClick={() => reset(u.id, u.username)}>ตั้งรหัสผ่านใหม่</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const ROLE_TH: Record<string, string> = {
  teacher: 'ครูที่ปรึกษา', counselor: 'ครูแนะแนว', admin: 'ผู้ดูแลระบบ',
};

// ─────────────────────────── นำเข้านักเรียน ───────────────────────────

function ImportStudents() {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true); setError(null);
    try {
      setResult(await api('/admin/students/import', { method: 'POST', body: { csv } }));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>นำเข้ารายชื่อนักเรียน</h2>
      <p className="small muted">
        วางข้อมูลบรรทัดละคน คั่นด้วยจุลภาค: <code>รหัสประจำตัว,ชื่อ-สกุล,ห้อง,ปีเกิด</code>
        <br />ระบบจะสร้างบัญชีให้อัตโนมัติ พร้อม PIN 6 หลักที่สุ่มให้ — ต้องส่งมอบให้นักเรียนอย่างปลอดภัย
      </p>
      <textarea
        value={csv} onChange={(e) => setCsv(e.target.value)} style={{ minHeight: 180, fontFamily: 'monospace' }}
        placeholder={'30101,เด็กชายตัวอย่าง หนึ่ง,ม.3/1,2554\n30102,เด็กหญิงตัวอย่าง สอง,ม.3/1,2554'}
      />
      <div className="row between" style={{ marginTop: '.6rem' }}>
        <span className="small muted">{csv.split('\n').filter((l) => l.trim()).length} บรรทัด</span>
        <button className="btn" onClick={run} disabled={busy || !csv.trim()}>
          {busy ? 'กำลังนำเข้า…' : 'นำเข้า'}
        </button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {result && (
        <>
          <Alert kind="success">นำเข้าสำเร็จ {result.created.length} คน · ผิดพลาด {result.errors.length} รายการ</Alert>
          {result.created.length > 0 && (
            <>
              <h3>รหัสผ่านเริ่มต้น (พิมพ์เก็บไว้ครั้งเดียว — ระบบไม่แสดงซ้ำ)</h3>
              <table className="data">
                <thead><tr><th>รหัส</th><th>ชื่อ</th><th>ห้อง</th><th>PIN</th></tr></thead>
                <tbody>
                  {result.created.map((c: any) => (
                    <tr key={c.code}>
                      <td>{c.code}</td><td>{c.name}</td><td>{c.classroom ?? '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.pin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn ghost sm" onClick={() => window.print()} style={{ marginTop: '.5rem' }}>พิมพ์</button>
            </>
          )}
          {result.errors.length > 0 && (
            <ul className="small" style={{ color: 'var(--red-600)' }}>
              {result.errors.map((e: any, i: number) => <li key={i}>บรรทัด {e.line}: {e.message}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────── ห้องเรียน ───────────────────────────

function Classrooms() {
  const [classrooms, setClassrooms] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', level: '' });
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api<{ classrooms: any[] }>('/students/meta/classrooms').then((d) => setClassrooms(d.classrooms)).catch(() => setClassrooms([]));
    api<{ users: any[] }>('/admin/users').then((d) => setUsers(d.users)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function create() {
    setError(null);
    try {
      await api('/admin/classrooms', { method: 'POST', body: form });
      setForm({ name: '', level: '' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function setAdvisor(id: number, advisorUserId: string) {
    await api(`/admin/classrooms/${id}`, { method: 'PUT', body: { advisorUserId: advisorUserId || null } }).catch(() => {});
    load();
  }

  if (!classrooms) return <Spinner />;

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="card">
        <h2>เพิ่มห้องเรียน</h2>
        <div className="row">
          <input placeholder="ชื่อห้อง เช่น ม.3/1" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ flex: 1 }} />
          <input placeholder="ระดับชั้น เช่น ม.3" value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })} style={{ flex: 1 }} />
          <button className="btn" onClick={create}>เพิ่ม</button>
        </div>
      </div>

      <div className="card flush">
        <table className="data">
          <thead><tr><th>ห้อง</th><th>จำนวนนักเรียน</th><th>ครูที่ปรึกษา</th></tr></thead>
          <tbody>
            {classrooms.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.student_count}</td>
                <td>
                  <select
                    defaultValue={users.find((u) => u.display_name === c.advisor)?.id ?? ''}
                    onChange={(e) => setAdvisor(c.id, e.target.value)}
                  >
                    <option value="">— ยังไม่กำหนด —</option>
                    {users.filter((u) => u.role !== 'admin' || true).map((u) => (
                      <option key={u.id} value={u.id}>{u.display_name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────── ตั้งค่า ───────────────────────────

function Settings() {
  const [data, setData] = useState<any>(null);
  const [schoolName, setSchoolName] = useState('');
  const [contacts, setContacts] = useState('');
  const [webhook, setWebhook] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/admin/settings').then((d: any) => {
      setData(d);
      setSchoolName(d.school?.name ?? '');
      setContacts((d.school?.contacts ?? []).map((c: any) => `${c.label}|${c.detail}`).join('\n'));
      setWebhook(d.notify ?? '');
    }).catch(() => setData({}));
  }, []);

  async function save() {
    setSaved(false);
    await api('/admin/settings', {
      method: 'PUT',
      body: {
        school: {
          name: schoolName,
          contacts: contacts.split('\n').filter(Boolean).map((l) => {
            const [label, ...rest] = l.split('|');
            return { label: label.trim(), detail: rest.join('|').trim() };
          }),
        },
        notifyWebhookUrl: webhook.trim(),
      },
    }).catch(() => {});
    setSaved(true);
  }

  if (!data) return <Spinner />;

  return (
    <div className="card">
      <h2>ตั้งค่าโรงเรียน</h2>

      <div className="field">
        <label>ชื่อโรงเรียน</label>
        <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
      </div>

      <div className="field">
        <label>ช่องทางติดต่อในโรงเรียน (แสดงในหน้าขอความช่วยเหลือ)</label>
        <div className="hint">บรรทัดละหนึ่งรายการ รูปแบบ: ชื่อ|รายละเอียด</div>
        <textarea value={contacts} onChange={(e) => setContacts(e.target.value)}
          placeholder={'ห้องแนะแนว|อาคาร 1 ชั้น 2 เวลา 08.00–16.00 น.'} />
      </div>

      <div className="field">
        <label>Webhook แจ้งเตือนเคสระดับ 3–4 (ไม่บังคับ)</label>
        <div className="hint">
          ส่งเฉพาะหมายเลขเคสและระดับ — <strong>ไม่ส่งชื่อนักเรียนหรือข้อความที่นักเรียนเขียน</strong>
          เพราะแชตกลุ่มไม่ใช่ที่ปลอดภัยสำหรับข้อมูลอ่อนไหวของเด็ก
        </div>
        <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://..." />
      </div>

      <div className="alert info">
        ตัวช่วยภาษา (LLM): <strong>{data.llmEnabled ? 'เปิดใช้งาน' : 'ปิด'}</strong> —
        เปลี่ยนได้ที่ไฟล์ <code>server/.env</code> เท่านั้น เพื่อไม่ให้เปิดใช้โดยไม่ตั้งใจจากหน้าเว็บ
      </div>

      <div className="row between">
        {saved ? <span className="small" style={{ color: 'var(--green-600)' }}>บันทึกแล้ว</span> : <span />}
        <button className="btn" onClick={save}>บันทึก</button>
      </div>
    </div>
  );
}

// ─────────────────────────── ร่องรอยการใช้งาน ───────────────────────────

function AuditLog() {
  const [entries, setEntries] = useState<any[] | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams({ limit: '150', ...(filter ? { action: filter } : {}) });
      api<{ entries: any[] }>(`/admin/audit?${q}`).then((d) => setEntries(d.entries)).catch(() => setEntries([]));
    }, 250);
    return () => clearTimeout(t);
  }, [filter]);

  return (
    <>
      <div className="card">
        <h2>ร่องรอยการใช้งาน</h2>
        <p className="small muted">
          บันทึกไว้เพื่อให้ตรวจสอบได้ว่าใครเข้าถึงข้อมูลนักเรียนคนไหนเมื่อไหร่ (PDPA)
          — ควรสุ่มตรวจอย่างน้อยภาคเรียนละครั้ง
        </p>
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="กรองด้วยชื่อการกระทำ เช่น case.view, student.view, login" />
      </div>

      {!entries ? <Spinner /> : (
        <div className="card flush">
          <table className="data">
            <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>เป้าหมาย</th><th>IP</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="small">{thaiDateTime(e.created_at)}</td>
                  <td className="small">{e.actor_name ?? e.actor_role}</td>
                  <td className="small"><code>{e.action}</code></td>
                  <td className="small">{e.entity ? `${e.entity} #${e.entity_id}` : '—'}</td>
                  <td className="small muted">{e.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────── นโยบายเก็บข้อมูล ───────────────────────────

function Retention() {
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function check(dryRun: boolean) {
    setBusy(true);
    try {
      setReport(await api('/admin/retention/purge', { method: 'POST', body: { dryRun } }));
    } finally { setBusy(false); }
  }

  useEffect(() => { check(true); }, []);

  return (
    <div className="card">
      <h2>นโยบายการเก็บข้อมูล</h2>
      <p className="small muted">
        เก็บข้อมูลเท่าที่จำเป็นและนานเท่าที่จำเป็น เป็นหลักการพื้นฐานของ PDPA
        การลบต้องกดโดยผู้ดูแล เพื่อให้มีคนรับผิดชอบการตัดสินใจเสมอ
      </p>

      {report && (
        <>
          <table className="data">
            <thead><tr><th>ประเภทข้อมูล</th><th>เก็บไว้</th><th>เกินกำหนดแล้ว</th></tr></thead>
            <tbody>
              <tr><td>บันทึกการเช็กอิน</td><td>{report.policy?.checkinDays} วัน</td><td><strong>{report.report?.checkins}</strong></td></tr>
              <tr><td>เคสที่ปิดแล้ว</td><td>{report.policy?.closedCaseDays} วัน</td><td><strong>{report.report?.closedCases}</strong></td></tr>
              <tr><td>ร่องรอยการใช้งาน</td><td>{report.policy?.auditDays} วัน</td><td><strong>{report.report?.auditLog}</strong></td></tr>
            </tbody>
          </table>

          <div className="alert warn" style={{ marginTop: '.8rem' }}>
            การลบทำย้อนกลับไม่ได้ ควรสำรองไฟล์ <code>server/data/carealert.db</code> ก่อนเสมอ
          </div>

          <div className="row">
            <button className="btn ghost" onClick={() => check(true)} disabled={busy}>ตรวจสอบใหม่</button>
            <button className="btn danger" onClick={() => check(false)} disabled={busy}>ลบข้อมูลที่เกินกำหนด</button>
          </div>
        </>
      )}
    </div>
  );
}
