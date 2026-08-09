import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, thaiDateTime } from '../../api';
import { useAuth } from '../../auth';
import { InstallPrompt } from '../../components/InstallPrompt';

export default function StudentHome() {
  const { user } = useAuth();
  const [lastCheckin, setLastCheckin] = useState<string | null>(null);
  const [consent, setConsent] = useState<any>(null);
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    api<{ checkins: { submitted_at: string }[] }>('/checkin/mine')
      .then((d) => setLastCheckin(d.checkins?.[0]?.submitted_at ?? null))
      .catch(() => {});
    api<{ consent: any }>('/meta/consent').then((d) => setConsent(d.consent)).catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

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
