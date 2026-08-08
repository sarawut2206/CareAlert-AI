import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Spinner } from '../../components/ui';

const ORIGIN_TH: Record<string, string> = {
  checkin: 'เช็กอิน', self_report: 'นักเรียนเล่าเอง',
  friend_report: 'เพื่อนแจ้ง', staff_note: 'บุคลากรบันทึก',
};

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    setData(null);
    api(`/analytics/overview?days=${days}`).then(setData).catch(() => setData({ error: true }));
  }, [days]);

  if (!data) return <div className="container wide"><Spinner /></div>;

  const levelCounts: Record<number, number> = {};
  for (const r of data.byLevel ?? []) levelCounts[r.level] = r.n;

  return (
    <div className="container wide">
      <div className="card">
        <div className="row between">
          <h1 style={{ margin: 0 }}>ภาพรวมระบบดูแล</h1>
          <div className="row" style={{ gap: '.3rem' }}>
            {[7, 30, 90].map((d) => (
              <button key={d} className={`btn sm ${days === d ? '' : 'ghost'}`} onClick={() => setDays(d)}>
                {d} วัน
              </button>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ margin: '.5rem 0 0' }}>{data.note}</p>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="n">{data.participation?.rate}%</div>
          <div className="l">นักเรียนที่เช็กอินอย่างน้อย 1 ครั้ง ({data.participation?.active}/{data.participation?.total})</div>
        </div>
        <div className="stat alarm">
          <div className="n">{levelCounts[4] ?? 0}</div>
          <div className="l">การประเมินที่เป็นระดับ 4</div>
        </div>
        <div className="stat warn">
          <div className="n">{levelCounts[3] ?? 0}</div>
          <div className="l">การประเมินที่เป็นระดับ 3</div>
        </div>
        <div className="stat">
          <div className="n">{data.sla?.total ?? 0}</div>
          <div className="l">เคสที่เปิดในช่วงนี้</div>
        </div>
        <div className="stat">
          <div className="n">{data.sla?.medianCloseHours ?? '—'}</div>
          <div className="l">ชั่วโมง (มัธยฐาน) กว่าจะปิดเคส</div>
        </div>
        <div className="stat">
          <div className="n">{data.lifeskills?.completed ?? 0}</div>
          <div className="l">กิจกรรมทักษะชีวิตที่ทำจบ</div>
        </div>
      </div>

      <div className="split">
        <div>
          <div className="card">
            <h2>คุณภาพการดำเนินการ</h2>
            <p className="small muted">
              ตัวเลขสำคัญที่สุดของระบบนี้ไม่ใช่ “ตรวจพบกี่คน” แต่คือ “ช่วยได้ทันกี่คน”
            </p>
            <table className="data">
              <tbody>
                <tr><td>รับเรื่องทันกำหนด</td><td><strong>{data.sla?.ackMet}</strong> / {data.sla?.total}</td></tr>
                <tr><td>รับเรื่องช้ากว่ากำหนด</td><td style={{ color: 'var(--orange-600)' }}><strong>{data.sla?.ackLate}</strong></td></tr>
                <tr><td>ติดต่อนักเรียนทันกำหนด</td><td><strong>{data.sla?.contactMet}</strong> / {data.sla?.total}</td></tr>
                <tr><td>ติดต่อช้ากว่ากำหนด</td><td style={{ color: 'var(--red-600)' }}><strong>{data.sla?.contactLate}</strong></td></tr>
                <tr><td>ยังเปิดค้างอยู่</td><td><strong>{data.sla?.stillOpen}</strong></td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>ข้อมูลมาจากทางไหน</h2>
            <p className="small muted">
              ถ้าเรื่องเกือบทั้งหมดมาจากเช็กอินอย่างเดียว แปลว่าช่องทาง “เล่าเอง” และ “เป็นห่วงเพื่อน”
              ยังไม่ถูกใช้ — ควรทบทวนว่านักเรียนไว้ใจระบบพอหรือยัง
            </p>
            <table className="data">
              <tbody>
                {(data.byOrigin ?? []).map((o: any) => (
                  <tr key={o.origin}>
                    <td>{ORIGIN_TH[o.origin] ?? o.origin}</td>
                    <td><strong>{o.n ?? 'น้อยกว่า 5'}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>คุณภาพของข้อมูลที่ได้รับ</h2>
            <table className="data">
              <tbody>
                {(data.sufficiency ?? []).map((s: any) => (
                  <tr key={s.data_sufficiency}>
                    <td>
                      {s.data_sufficiency === 'INSUFFICIENT' ? 'ยังสรุปไม่ได้'
                        : s.data_sufficiency === 'LIMITED' ? 'มีข้อจำกัด' : 'ครบพอ'}
                    </td>
                    <td><strong>{s.n}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: '.5rem', marginBottom: 0 }}>
              ถ้าสัดส่วน “ยังสรุปไม่ได้” สูง มักแปลว่าแบบเช็กอินยาวเกินไป
              หรือนักเรียนยังไม่เชื่อว่าตอบไปแล้วจะมีอะไรเปลี่ยน
            </p>
          </div>

          <div className="card">
            <h2>เรื่องที่พบบ่อย</h2>
            {(data.topTags ?? []).length === 0 ? (
              <p className="muted small">ยังไม่มีข้อมูลมากพอที่จะแสดงโดยไม่ระบุตัวนักเรียนได้</p>
            ) : (
              <div className="row" style={{ gap: '.4rem' }}>
                {data.topTags.map((t: any) => (
                  <span key={t.tag} className="tag">{prettyTag(t.tag)} · {t.n}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function prettyTag(tag: string) {
  const map: Record<string, string> = {
    'context:study': 'การเรียน', 'context:friend': 'เพื่อน', 'context:bullying': 'ถูกแกล้ง',
    'context:family': 'ที่บ้าน', 'context:money': 'เรื่องเงิน', 'context:health': 'สุขภาพ/การนอน',
    'context:safety': 'ไม่ปลอดภัย', 'context:love': 'ความสัมพันธ์', 'context:other': 'อื่น ๆ',
    'bullying:verbal': 'ล้อเลียน/ด่าทอ', 'bullying:physical': 'ทำร้ายร่างกาย',
    'bullying:social': 'กีดกัน', 'bullying:cyber': 'ไซเบอร์บูลลี่',
    'home:conflict': 'บ้านทะเลาะกัน', 'home:money': 'บ้านมีปัญหาการเงิน',
    'home:violence': 'ความรุนแรงในบ้าน', 'home:alcohol': 'สุรา/สารเสพติดในบ้าน',
    'lexicon:BULLYING': 'ข้อความเรื่องถูกรังแก', 'lexicon:DISTRESS': 'ข้อความแสดงความทุกข์',
    'lexicon:SUICIDE_INTENT': 'ข้อความเรื่องการจบชีวิต', 'lexicon:SELF_HARM': 'ข้อความเรื่องทำร้ายตัวเอง',
  };
  return map[tag] ?? tag;
}
