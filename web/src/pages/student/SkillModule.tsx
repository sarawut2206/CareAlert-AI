import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Spinner, Alert } from '../../components/ui';

type Step = {
  type: 'read' | 'practice' | 'quiz' | 'reflect';
  title: string; body?: string; prompt?: string;
  widget?: string; config?: any;
  options?: { id: string; text: string; correct: boolean; feedback: string }[];
};
type Module = { id: string; title: string; emoji: string; minutes: number; goal: string; steps: Step[] };

export default function SkillModule() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState<Module | null>(null);
  const [index, setIndex] = useState(0);
  const [reflection, setReflection] = useState('');
  const [reflectionSent, setReflectionSent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ module: Module; progress: { step_index: number } | null }>(`/lifeskills/${id}`)
      .then((d) => { setModule(d.module); if (d.progress) setIndex(Math.min(d.progress.step_index, d.module.steps.length - 1)); })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="container"><Alert kind="error">{error}</Alert></div>;
  if (!module) return <div className="container"><Spinner /></div>;

  const step = module.steps[index];
  const isLast = index === module.steps.length - 1;
  const progress = ((index + 1) / module.steps.length) * 100;

  async function next() {
    if (!module) return;
    if (step.type === 'reflect' && reflection.trim()) {
      try {
        const res = await api<any>(`/lifeskills/${module.id}/reflection`, { method: 'POST', body: { text: reflection } });
        if (res.escalated) { setReflectionSent(res); return; }
      } catch { /* บันทึกไม่สำเร็จก็ให้ทำกิจกรรมต่อได้ */ }
    }
    await api(`/lifeskills/${module.id}/progress`, {
      method: 'POST', body: { stepIndex: index, completed: isLast },
    }).catch(() => {});

    if (isLast) navigate('/skills');
    else setIndex((i) => i + 1);
  }

  if (reflectionSent) {
    return (
      <div className="container">
        <div className="hero" style={{ background: 'linear-gradient(135deg, #c8281f, #f26a21)' }}>
          <h1>{reflectionSent.message?.title ?? 'ขอบคุณที่เขียนออกมา'}</h1>
          <p>{reflectionSent.message?.body}</p>
        </div>
        {reflectionSent.helplines?.length > 0 && (
          <div className="card">
            <h3>โทรได้ทันที</h3>
            {reflectionSent.helplines.slice(0, 3).map((l: any) => (
              <a key={l.id} className="helpline" href={`tel:${l.phone.replace(/-/g, '')}`}>
                <span><strong>{l.name}</strong><br /><span className="small muted">{l.hours}</span></span>
                <span className="num">{l.phone}</span>
              </a>
            ))}
          </div>
        )}
        <Link to="/skills" className="btn block">กลับไปหน้ากิจกรรม</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="q-progress"><div style={{ width: `${progress}%` }} /></div>

      <div className="card question">
        <div className="small muted">{module.emoji} {module.title}</div>
        <h2>{step.title}</h2>

        {step.body && <p style={{ whiteSpace: 'pre-wrap' }}>{step.body}</p>}

        {step.type === 'practice' && step.widget === 'breathing' && <Breathing config={step.config} />}
        {step.type === 'practice' && step.widget !== 'breathing' && (
          <textarea
            placeholder="ลองเขียนตรงนี้ก็ได้ (ไม่บันทึกลงระบบ)"
            onChange={() => {}}
          />
        )}

        {step.type === 'quiz' && step.options && <Quiz options={step.options} />}

        {step.type === 'reflect' && (
          <>
            <p className="q-helper">{step.prompt}</p>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="เขียนเท่าที่อยากเขียน ข้ามได้ถ้ายังไม่พร้อม"
              maxLength={4000}
            />
            <p className="small muted" style={{ marginTop: '.4rem' }}>
              ข้อความนี้เป็นของเธอ ครูจะไม่ได้อ่าน เว้นแต่มีสัญญาณว่าเธออาจไม่ปลอดภัย
            </p>
          </>
        )}
      </div>

      <div className="row between">
        <button className="btn ghost" onClick={() => (index === 0 ? navigate('/skills') : setIndex((i) => i - 1))}>
          {index === 0 ? 'ออก' : 'ย้อนกลับ'}
        </button>
        <button className="btn" onClick={next}>{isLast ? 'จบกิจกรรม' : 'ถัดไป'}</button>
      </div>
    </div>
  );
}

function Quiz({ options }: { options: { id: string; text: string; correct: boolean; feedback: string }[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = options.find((o) => o.id === picked);

  return (
    <>
      <div className="choices">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`choice ${picked === o.id ? 'selected' : ''}`}
            onClick={() => setPicked(o.id)}
          >
            <span className="dot" />
            <span>{o.text}</span>
          </button>
        ))}
      </div>
      {chosen && (
        <div className={`alert ${chosen.correct ? 'success' : 'info'}`} style={{ marginTop: '.8rem', marginBottom: 0 }}>
          {chosen.feedback}
        </div>
      )}
    </>
  );
}

function Breathing({ config }: { config: { inhale: number; hold: number; exhale: number; rounds: number } }) {
  const [phase, setPhase] = useState<'idle' | 'inhale' | 'hold' | 'exhale'>('idle');
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (phase === 'idle') return;
    const seconds = phase === 'inhale' ? config.inhale : phase === 'hold' ? config.hold : config.exhale;
    const t = setTimeout(() => {
      if (phase === 'inhale') setPhase('hold');
      else if (phase === 'hold') setPhase('exhale');
      else {
        const nextRound = round + 1;
        if (nextRound >= config.rounds) { setPhase('idle'); setRound(0); }
        else { setRound(nextRound); setPhase('inhale'); }
      }
    }, seconds * 1000);
    return () => clearTimeout(t);
  }, [phase, round, config]);

  const label = phase === 'idle' ? 'เริ่ม' : phase === 'inhale' ? 'หายใจเข้า' : phase === 'hold' ? 'กลั้นไว้' : 'หายใจออก';
  const scale = phase === 'inhale' ? 1.25 : phase === 'hold' ? 1.25 : 0.85;

  return (
    <div className="center">
      <div
        className="breathing-circle"
        style={{ transform: `scale(${phase === 'idle' ? 1 : scale})`, transitionDuration: `${phase === 'inhale' ? config.inhale : phase === 'exhale' ? config.exhale : 0.3}s` }}
      >
        {label}
      </div>
      {phase === 'idle'
        ? <button className="btn" onClick={() => { setRound(0); setPhase('inhale'); }}>เริ่มหายใจตามจังหวะ</button>
        : <p className="small muted">รอบที่ {round + 1} จาก {config.rounds}</p>}
    </div>
  );
}
