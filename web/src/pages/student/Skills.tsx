import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Spinner } from '../../components/ui';

type Module = {
  id: string; title: string; emoji: string; minutes: number;
  tags: string[]; goal: string; stepCount: number;
  progress: { stepIndex: number; completed: boolean } | null;
};

export default function Skills() {
  const [modules, setModules] = useState<Module[] | null>(null);

  useEffect(() => {
    api<{ modules: Module[] }>('/lifeskills').then((d) => setModules(d.modules)).catch(() => setModules([]));
  }, []);

  if (!modules) return <div className="container"><Spinner /></div>;

  const done = modules.filter((m) => m.progress?.completed).length;

  return (
    <div className="container">
      <div className="hero">
        <h1>ทักษะชีวิต</h1>
        <p>
          กิจกรรมสั้น ๆ ไม่มีคะแนน ไม่มีการจัดอันดับ ทำเมื่อไหร่ก็ได้
          {done > 0 && ` · ทำไปแล้ว ${done} กิจกรรม`}
        </p>
      </div>

      <div className="stack">
        {modules.map((m) => {
          const pct = m.progress ? Math.round(((m.progress.stepIndex + 1) / m.stepCount) * 100) : 0;
          return (
            <Link key={m.id} to={`/skills/${m.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 0 }}>
              <div className="row" style={{ gap: '.8rem', flexWrap: 'nowrap' }}>
                <span style={{ fontSize: '1.9rem', lineHeight: 1 }}>{m.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row between" style={{ gap: '.5rem' }}>
                    <strong>{m.title}</strong>
                    {m.progress?.completed
                      ? <span className="tag" style={{ background: 'var(--green-100)', color: 'var(--green-600)' }}>ทำแล้ว</span>
                      : <span className="tag gray">{m.minutes} นาที</span>}
                  </div>
                  <div className="small muted">{m.goal}</div>
                  {m.progress && !m.progress.completed && (
                    <div className="q-progress" style={{ marginTop: '.5rem', marginBottom: 0, height: 4 }}>
                      <div style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
