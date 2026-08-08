import { useEffect, type ReactNode } from 'react';

export function Spinner() {
  return <div className="spinner" aria-label="กำลังโหลด" />;
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'warn' | 'success'; children: ReactNode }) {
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function LevelBadge({ level }: { level: number }) {
  const map: Record<number, string> = {
    1: 'ระดับ 1 · สนับสนุน',
    2: 'ระดับ 2 · ตรวจสอบ',
    3: 'ระดับ 3 · ช่วยเหลือด่วน',
    4: 'ระดับ 4 · ความปลอดภัย',
  };
  return <span className={`level l${level}`}>{map[level] ?? `ระดับ ${level}`}</span>;
}

export function DimBar({ label, value, max = 3 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  const cls = value >= 3 ? 'max' : value >= 2 ? 'hi' : '';
  return (
    <div className="dim-bar">
      <span className="label">{label}</span>
      <span className="track"><span className={`fill ${cls}`} style={{ width: `${pct}%` }} /></span>
      <span className="val">{value}</span>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: '.75rem' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost sm" onClick={onClose}>ปิด</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ emoji, title, body }: { emoji: string; title: string; body?: string }) {
  return (
    <div className="card center" style={{ padding: '2.5rem 1rem' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>{emoji}</div>
      <h3>{title}</h3>
      {body && <p className="muted small">{body}</p>}
    </div>
  );
}
