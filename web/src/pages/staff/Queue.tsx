import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, thaiDateTime, timeLeft } from '../../api';
import { LevelBadge, Spinner, EmptyState } from '../../components/ui';

type CaseRow = {
  id: number; level: number; status: string; origin: string;
  student_name: string | null; student_code: string | null; classroom: string | null;
  subject_hint: string | null; owner_name: string | null; summary: string | null;
  opened_at: string; contact_due_at: string; first_contact_at: string | null;
  acknowledgeSla: string; contactSla: string;
};

const STATUS_TH: Record<string, string> = {
  new: 'ยังไม่รับเรื่อง', acknowledged: 'รับเรื่องแล้ว', in_progress: 'กำลังช่วยเหลือ',
  referred: 'ส่งต่อแล้ว', monitoring: 'ติดตามอยู่', closed: 'ปิดแล้ว',
};

const ORIGIN_TH: Record<string, string> = {
  checkin: 'เช็กอิน', self_report: 'นักเรียนเล่าเอง',
  friend_report: 'เพื่อนแจ้ง', staff_note: 'บุคลากรบันทึก',
};

export default function Queue() {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [status, setStatus] = useState('open');
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    setCases(null);
    const q = new URLSearchParams({ status, ...(level ? { level: String(level) } : {}) });
    api<{ cases: CaseRow[] }>(`/cases?${q}`).then((d) => setCases(d.cases)).catch(() => setCases([]));
    api<{ summary: any }>('/cases/summary').then((d) => setSummary(d.summary)).catch(() => {});
  }, [status, level]);

  return (
    <div className="container wide">
      {summary && (
        <div className="stat-grid">
          <div className={`stat ${summary.l4 ? 'alarm' : ''}`}>
            <div className="n">{summary.l4}</div>
            <div className="l">ระดับ 4 · ความปลอดภัย</div>
          </div>
          <div className={`stat ${summary.l3 ? 'warn' : ''}`}>
            <div className="n">{summary.l3}</div>
            <div className="l">ระดับ 3 · ช่วยเหลือด่วน</div>
          </div>
          <div className="stat">
            <div className="n">{summary.l2}</div>
            <div className="l">ระดับ 2 · ตรวจสอบ</div>
          </div>
          <div className={`stat ${summary.overdue ? 'alarm' : ''}`}>
            <div className="n">{summary.overdue}</div>
            <div className="l">เกินกำหนดติดต่อ</div>
          </div>
          <div className={`stat ${summary.unacknowledged ? 'warn' : ''}`}>
            <div className="n">{summary.unacknowledged}</div>
            <div className="l">ยังไม่มีใครรับเรื่อง</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ gap: '.4rem' }}>
          {[
            { v: 'open', l: 'ที่ยังเปิดอยู่' },
            { v: 'all', l: 'ทั้งหมด' },
            { v: 'closed', l: 'ปิดแล้ว' },
          ].map((s) => (
            <button
              key={s.v}
              className={`btn sm ${status === s.v ? '' : 'ghost'}`}
              onClick={() => setStatus(s.v)}
            >
              {s.l}
            </button>
          ))}
          <span style={{ width: 1, background: 'var(--line)', margin: '0 .3rem' }} />
          {[4, 3, 2].map((l) => (
            <button
              key={l}
              className={`btn sm ${level === l ? '' : 'ghost'}`}
              onClick={() => setLevel(level === l ? null : l)}
            >
              ระดับ {l}
            </button>
          ))}
        </div>
      </div>

      {!cases ? <Spinner /> : cases.length === 0 ? (
        <EmptyState
          emoji="🌤️"
          title="ไม่มีเคสในคิวตอนนี้"
          body="ไม่มีเคสค้างไม่ได้แปลว่าไม่มีนักเรียนที่ต้องการความช่วยเหลือ — ลองดูหน้าภาพรวมว่ามีนักเรียนเช็กอินสม่ำเสมอหรือไม่"
        />
      ) : (
        cases.map((c) => (
          <Link key={c.id} to={`/cases/${c.id}`} className="case-row">
            <span className={`level-bar l${c.level}`} />
            <div className="body">
              <div className="row between" style={{ gap: '.5rem', marginBottom: '.2rem' }}>
                <span className="name">
                  {c.student_name ?? c.subject_hint ?? 'ไม่ระบุตัวตน'}
                  {c.classroom && <span className="muted small"> · {c.classroom}</span>}
                </span>
                <LevelBadge level={c.level} />
              </div>
              <div className="why">{c.summary ?? '—'}</div>
              <div className="row small muted" style={{ gap: '.7rem', marginTop: '.35rem' }}>
                <span className="tag gray">{STATUS_TH[c.status] ?? c.status}</span>
                <span>{ORIGIN_TH[c.origin] ?? c.origin}</span>
                <span>เปิด {thaiDateTime(c.opened_at)}</span>
                {!c.first_contact_at && (
                  <span className={`sla ${c.contactSla}`}>ติดต่อ: {timeLeft(c.contact_due_at)}</span>
                )}
                {c.owner_name && <span>ผู้รับผิดชอบ: {c.owner_name}</span>}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
