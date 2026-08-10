import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, thaiDateTime } from '../../api';
import { useAuth } from '../../auth';
import { InstallPrompt } from '../../components/InstallPrompt';

type MineResponse = {
  checkins: { submitted_at: string }[];
  doneToday: boolean;
  streak: number;
  daysDone: string[];
};

export default function StudentHome() {
  const { user } = useAuth();
  const [mine, setMine] = useState<MineResponse | null>(null);
  const [consent, setConsent] = useState<any>(null);
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    api<MineResponse>('/checkin/mine').then(setMine).catch(() => {});
    api<{ consent: any }>('/meta/consent').then((d) => setConsent(d.consent)).catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  const lastCheckin = mine?.checkins?.[0]?.submitted_at ?? null;
  const doneToday = mine?.doneToday ?? false;
  const streak = mine?.streak ?? 0;

  return (
    <div className="container">
      <div className="hero">
        <h1>{greeting} {user?.displayName?.split(' ')[0]}</h1>
        <p>
          {lastCheckin
            ? `เช็กอินล่าสุดเมื่อ ${thaiDateTime(lastCheckin)}`
            : 'ยังไม่เคยเช็กอิน ลองเริ่มจากคำถามสั้น ๆ ดูไหม'}
        </p>
      </div>

      {/* สถานะประจำวัน — ชวนทำทุกวันโดยไม่กดดัน ไม่มีคะแนน ไม่มีการเปรียบเทียบกับใคร */}
      {mine && (
        <div className="card" style={doneToday
          ? { borderColor: '#a8dcc0', background: 'var(--green-100)' }
          : { borderColor: '#f6cdb0', background: 'var(--orange-100)' }}>
          <div className="row between" style={{ gap: '.6rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <strong>{doneToday ? '✅ วันนี้เช็กอินแล้ว ขอบคุณนะ' : '☀️ วันนี้ยังไม่ได้เช็กอิน'}</strong>
              <div className="small muted" style={{ marginTop: '.15rem' }}>
                {streak >= 2
                  ? `ทำต่อเนื่องมา ${streak} วันแล้ว`
                  : doneToday ? 'พรุ่งนี้แวะมาอีกได้นะ' : 'ใช้เวลาแค่ 30 วินาที'}
              </div>
            </div>
            {!doneToday && <Link to="/checkin?cadence=daily" className="btn warm">เช็กอินเลย</Link>}
          </div>
          {mine.daysDone.length > 0 && <WeekDots daysDone={mine.daysDone} />}
        </div>
      )}

      <div className="tiles" style={{ marginBottom: '1rem' }}>
        <Link to="/checkin?cadence=daily" className="tile">
          <span className="emoji">☀️</span>
          <strong>เช็กอินวันนี้</strong>
          <span>30 วินาที บอกเราว่าวันนี้เป็นยังไง</span>
        </Link>

        <Link to="/checkin?cadence=weekly" className="tile">
          <span className="emoji">📋</span>
          <strong>เช็กอินสัปดาห์นี้</strong>
          <span>ประมาณ 2 นาที ถามละเอียดขึ้นอีกนิด</span>
        </Link>

        <Link to="/tell" className="tile accent">
          <span className="emoji">💬</span>
          <strong>เล่าเรื่องของฉัน</strong>
          <span>มีเรื่องอยากบอก เล่าได้เลย</span>
        </Link>

        <Link to="/friend" className="tile accent">
          <span className="emoji">🫂</span>
          <strong>เป็นห่วงเพื่อน</strong>
          <span>แจ้งได้โดยไม่ต้องบอกชื่อตัวเอง</span>
        </Link>

        <Link to="/skills" className="tile">
          <span className="emoji">🌱</span>
          <strong>ทักษะชีวิต</strong>
          <span>กิจกรรมสั้น ๆ ไม่มีคะแนน</span>
        </Link>
      </div>

      <InstallPrompt />

      <div className="card">
        <div className="row between" style={{ marginBottom: '.4rem' }}>
          <h3 style={{ margin: 0 }}>ระบบนี้ทำงานยังไง</h3>
          <button className="btn ghost sm" onClick={() => setShowConsent((v) => !v)}>
            {showConsent ? 'ซ่อน' : 'อ่าน'}
          </button>
        </div>
        {showConsent && consent && (
          <ul className="small" style={{ paddingLeft: '1.1rem', margin: '.5rem 0 0', color: 'var(--ink-soft)' }}>
            {consent.points?.map((p: string, i: number) => (
              <li key={i} style={{ marginBottom: '.4rem' }}>{p}</li>
            ))}
          </ul>
        )}
        {!showConsent && (
          <p className="small muted" style={{ margin: 0 }}>
            ระบบนี้มีไว้ช่วยเหลือ ไม่ได้มีไว้จับผิด ไม่ได้อ่านแชตส่วนตัวของเธอ
            และไม่ได้บอกว่าใครเป็นโรคอะไร
          </p>
        )}
      </div>
    </div>
  );
}

/** 7 วันล่าสุด — แสดงว่าทำวันไหนไปแล้วบ้าง ไม่ใช่การให้คะแนนหรือเทียบกับใคร */
function WeekDots({ daysDone }: { daysDone: string[] }) {
  const done = new Set(daysDone);
  const labels = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return { key: d.toISOString().slice(0, 10), label: labels[d.getDay()] };
  });

  return (
    <div className="row" style={{ gap: '.4rem', marginTop: '.7rem', justifyContent: 'space-between' }}>
      {days.map((d) => (
        <div key={d.key} className="center" style={{ flex: 1 }}>
          <div
            aria-label={done.has(d.key) ? `${d.label} เช็กอินแล้ว` : `${d.label} ยังไม่ได้เช็กอิน`}
            style={{
              width: 26, height: 26, borderRadius: '50%', margin: '0 auto',
              display: 'grid', placeItems: 'center', fontSize: '.75rem', fontWeight: 700,
              background: done.has(d.key) ? 'var(--green-600)' : '#fff',
              color: done.has(d.key) ? '#fff' : 'var(--ink-mute)',
              border: `1.5px solid ${done.has(d.key) ? 'var(--green-600)' : 'var(--line)'}`,
            }}
          >
            {done.has(d.key) ? '✓' : ''}
          </div>
          <div className="small muted" style={{ fontSize: '.7rem', marginTop: '.15rem' }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}
