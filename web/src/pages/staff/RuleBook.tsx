import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Spinner } from '../../components/ui';

/**
 * หน้าความโปร่งใส — ครูต้องเปิดดูได้ว่าระบบใช้กฎอะไรตัดสิน
 * ถ้าอธิบายให้ครูฟังไม่ได้ ครูก็ไม่ควรเชื่อผลของระบบ
 */
export default function RuleBook() {
  const [data, setData] = useState<any>(null);

  useEffect(() => { api('/meta/engine').then(setData).catch(() => setData({ error: true })); }, []);

  if (!data) return <div className="container wide"><Spinner /></div>;

  const byLevel: Record<number, any[]> = { 4: [], 3: [], 2: [] };
  for (const r of data.rules ?? []) byLevel[r.level]?.push(r);

  return (
    <div className="container wide">
      <div className="card">
        <h1>กฎที่ระบบใช้</h1>
        <p className="small muted">
          เวอร์ชันกลไก: <code>{data.engineVersion}</code>
          {' · '}ตัวช่วยภาษา (LLM): {data.llmEnabled ? 'เปิดใช้งาน' : 'ปิด — ใช้กฎอย่างเดียว'}
        </p>
        <ul className="small" style={{ paddingLeft: '1.1rem' }}>
          {data.principles?.map((p: string, i: number) => <li key={i} style={{ marginBottom: '.3rem' }}>{p}</li>)}
        </ul>
      </div>

      {[4, 3, 2].map((lv) => (
        <div key={lv} className="card">
          <h2>
            <span className={`level l${lv}`}>ระดับ {lv}</span>{' '}
            {data.levels?.[lv]?.th}
          </h2>
          <p className="small muted">
            ถ้ากฎข้อใดข้อหนึ่งด้านล่างเป็นจริง เคสจะได้ระดับอย่างน้อยเท่านี้
            (ระบบใช้ระดับสูงสุดที่ตรงเงื่อนไข)
          </p>
          {byLevel[lv].map((r: any) => (
            <div key={r.id} className="rule-item">
              <code>{r.id}</code>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="card">
        <h2>ตัวปรับที่บันทึกไว้ (ไม่เปลี่ยนระดับ)</h2>
        {data.modifiers?.map((m: any) => (
          <div key={m.id} className="rule-item" style={{ background: 'var(--amber-100)' }}>
            <span>
              <strong>{m.label}</strong>
              <div className="small">{m.effect}</div>
              <code>{m.id}</code>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>มิติที่ใช้ประกอบการพิจารณา</h2>
        <table className="data">
          <thead><tr><th>มิติ</th><th>น้ำหนักในดัชนีรวม</th></tr></thead>
          <tbody>
            {data.dimensions?.map((d: any) => (
              <tr key={d.key}><td>{d.label}</td><td>{Math.round(d.weight * 100)}%</td></tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: '.5rem', marginBottom: 0 }}>
          ดัชนีรวมใช้จัดลำดับคิวเท่านั้น การตัดสินระดับมาจากกฎข้างต้น ไม่ใช่จากดัชนี
        </p>
      </div>

      <div className="card">
        <h2>หมวดคำที่ระบบใช้สะกิดให้คนอ่าน</h2>
        <p className="small muted">
          คลังคำนี้ไม่ได้ตัดสินอะไรด้วยตัวเอง หน้าที่เดียวคือทำให้มนุษย์ได้อ่านข้อความนั้นเร็วขึ้น
          ระบบยอมให้เตือนเกิน แต่ไม่ยอมให้พลาด
        </p>
        <div className="row" style={{ gap: '.4rem' }}>
          {data.lexiconCategories?.map((c: any) => (
            <span key={c.code} className={`tag ${c.severity === 'CRITICAL' ? '' : 'gray'}`}>
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
