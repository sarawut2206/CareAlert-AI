import { Link } from 'react-router-dom';

type Helpline = { id: string; name: string; phone: string; org: string; hours: string; for: string };
type Crisis = { title: string; body: string; steps: string[]; footer: string };

export type SubmitResult = {
  message: { tone: string; title: string; body: string; showHelpline: boolean };
  helplines?: Helpline[];
  crisis?: Crisis | null;
  recommendedModules?: string[];
  identityNotice?: string | null;
  referenceCode?: string | null;
};

/**
 * หน้าจอหลังส่งข้อมูล
 *
 * สิ่งที่นักเรียน "ไม่เห็น" โดยตั้งใจ: ระดับความเร่งด่วน คะแนน ชื่อกฎที่ทำงาน
 * เพราะการเห็นตัวเลขเหล่านี้ทำให้นักเรียนเรียนรู้ที่จะตอบให้ได้คะแนนที่ต้องการ
 * และทำให้บางคนรู้สึกว่าตัวเองถูกจัดประเภท
 */
export function ResultScreen({ result, moduleTitles }: { result: SubmitResult; moduleTitles?: Record<string, string> }) {
  const urgent = result.message.tone === 'urgent-care';

  return (
    <div>
      <div className="hero" style={urgent ? { background: 'linear-gradient(135deg, #c8281f, #f26a21)' } : undefined}>
        <h1>{result.message.title}</h1>
        <p>{result.message.body}</p>
      </div>

      {result.identityNotice && <div className="alert warn">{result.identityNotice}</div>}

      {result.crisis && (
        <div className="card" style={{ borderColor: '#f3b8b3' }}>
          <h2>{result.crisis.title}</h2>
          <p>{result.crisis.body}</p>
          <ol style={{ paddingLeft: '1.2rem', margin: '0 0 .75rem' }}>
            {result.crisis.steps.map((s, i) => <li key={i} style={{ marginBottom: '.35rem' }}>{s}</li>)}
          </ol>
          <div className="alert info" style={{ marginBottom: 0 }}>{result.crisis.footer}</div>
        </div>
      )}

      {result.helplines && result.helplines.length > 0 && (
        <div className="card">
          <h3>โทรได้ทันที</h3>
          {result.helplines.slice(0, 4).map((l) => (
            <a key={l.id} className="helpline" href={`tel:${l.phone.replace(/-/g, '')}`}>
              <span>
                <strong>{l.name}</strong>
                <br /><span className="small muted">{l.hours}</span>
              </span>
              <span className="num">{l.phone}</span>
            </a>
          ))}
        </div>
      )}

      {result.referenceCode && (
        <div className="card">
          <h3>รหัสอ้างอิงของเธอ</h3>
          <p className="small muted">
            เก็บรหัสนี้ไว้ ถ้าอยากถามความคืบหน้ากับครูแนะแนวโดยไม่ต้องบอกชื่อ
          </p>
          <div className="center" style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '.15em', color: 'var(--blue-700)' }}>
            {result.referenceCode}
          </div>
        </div>
      )}

      {result.recommendedModules && result.recommendedModules.length > 0 && (
        <div className="card">
          <h3>กิจกรรมที่อาจช่วยได้</h3>
          <p className="small muted">ไม่บังคับ ทำเมื่อไหร่ก็ได้ ไม่มีคะแนน</p>
          <div className="stack">
            {result.recommendedModules.map((id) => (
              <Link key={id} to={`/skills/${id}`} className="btn ghost block">
                {moduleTitles?.[id] ?? id}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Link to="/" className="btn block">กลับหน้าหลัก</Link>
    </div>
  );
}
