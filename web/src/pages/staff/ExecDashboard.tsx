import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Spinner, Alert } from '../../components/ui';

/**
 * แดชบอร์ดผู้บริหาร — ภาพรวมทั้งโรงเรียน "ไม่มีชื่อนักเรียน"
 *
 * คำถามที่หน้านี้ต้องตอบผู้บริหารได้ใน 30 วินาที:
 *  1. ตอนนี้มีอะไรที่ต้องสั่งการทันทีไหม (เคสความปลอดภัยค้าง / เกินกำหนด)
 *  2. ระบบดูแลตอบสนองทันเวลาแค่ไหน
 *  3. นักเรียนไว้ใจใช้ระบบมากขึ้นหรือลดลง
 */

const ORIGIN_TH: Record<string, string> = {
  checkin: 'เช็กอิน', self_report: 'นักเรียนเล่าเอง',
  friend_report: 'เพื่อนแจ้ง', staff_note: 'บุคลากรบันทึก',
};

export default function ExecDashboard() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api(`/analytics/executive?days=${days}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [days]);

  if (error) return <div className="container wide"><Alert kind="error">{error}</Alert></div>;
  if (!data) return <div className="container wide"><Spinner /></div>;

  const { kpi, sla, funnel, weekly, byGradeLevel, topCategories, origins, lifeskills } = data;
  const needsAction = kpi.openL4 > 0 || kpi.overdue > 0 || kpi.unacknowledged > 0;

  return (
    <div className="container wide">
      <div className="card">
        <div className="row between">
          <div>
            <h1 style={{ marginBottom: '.15rem' }}>แดชบอร์ดผู้บริหาร</h1>
            <p className="small muted" style={{ margin: 0 }}>
              ภาพรวมระบบดูแลช่วยเหลือนักเรียนทั้งโรงเรียน — ข้อมูลรวม ไม่มีชื่อนักเรียน
            </p>
          </div>
          <div className="row" style={{ gap: '.3rem' }}>
            {[30, 90, 180].map((d) => (
              <button key={d} className={`btn sm ${days === d ? '' : 'ghost'}`} onClick={() => setDays(d)}>
                {d} วัน
              </button>
            ))}
            <button className="btn ghost sm" onClick={() => window.print()}>พิมพ์</button>
          </div>
        </div>
      </div>

      {/* ── 1. ต้องสั่งการวันนี้ ─────────────────────────────── */}
      {needsAction ? (
        <div className="alert error" style={{ fontSize: '1rem' }}>
          <strong>⚠️ มีเรื่องที่ต้องติดตามกับครูแนะแนววันนี้</strong>
          <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.2rem' }}>
            {kpi.openL4 > 0 && (
              <li>เคสระดับ 4 (ความปลอดภัย) ที่ยังเปิดอยู่ <strong>{kpi.openL4} เคส</strong> — ตรวจสอบกับครูแนะแนวว่าดำเนินการถึงขั้นไหนแล้ว</li>
            )}
            {kpi.overdue > 0 && (
              <li>เคสที่เกินกำหนดติดต่อนักเรียน <strong>{kpi.overdue} เคส</strong> — ถามหาสาเหตุ: คนไม่พอ หรือกระบวนการติดขัด</li>
            )}
            {kpi.unacknowledged > 0 && (
              <li>เคสที่ยังไม่มีใครรับเรื่อง <strong>{kpi.unacknowledged} เคส</strong></li>
            )}
          </ul>
          <p className="small" style={{ margin: '.4rem 0 0' }}>
            หน้านี้ไม่แสดงว่าเป็นนักเรียนคนใด — รายละเอียดเคสอยู่กับครูแนะแนวและทีมดูแล
          </p>
        </div>
      ) : (
        <div className="alert success">
          ✅ ไม่มีเคสความปลอดภัยค้าง ไม่มีเคสเกินกำหนด และทุกเคสมีผู้รับเรื่องแล้ว
        </div>
      )}

      {/* ── 2. ตัวเลขหลัก ────────────────────────────────────── */}
      <div className="stat-grid">
        <div className="stat">
          <div className="n">{kpi.participationRate}%</div>
          <div className="l">นักเรียนที่เช็กอิน ({kpi.activeStudents}/{kpi.students} คน)</div>
        </div>
        <div className={`stat ${kpi.openL4 ? 'alarm' : ''}`}>
          <div className="n">{kpi.openL4}</div>
          <div className="l">เคสระดับ 4 ที่เปิดอยู่</div>
        </div>
        <div className={`stat ${kpi.openL3 ? 'warn' : ''}`}>
          <div className="n">{kpi.openL3}</div>
          <div className="l">เคสระดับ 3 ที่เปิดอยู่</div>
        </div>
        <div className="stat">
          <div className="n">{kpi.openL2}</div>
          <div className="l">เคสระดับ 2 ที่เปิดอยู่</div>
        </div>
        <div className={`stat ${kpi.overdue ? 'alarm' : ''}`}>
          <div className="n">{kpi.overdue}</div>
          <div className="l">เกินกำหนดติดต่อ</div>
        </div>
      </div>

      <div className="split">
        <div>
          {/* ── 3. การตอบสนอง ─────────────────────────────── */}
          <div className="card">
            <h2>ความเร็วในการตอบสนอง (ช่วง {data.days} วัน)</h2>
            <p className="small muted">
              ตัวเลขที่สำคัญที่สุดของระบบนี้ — ไม่ใช่ “ตรวจพบกี่คน” แต่คือ “ช่วยได้ทันกี่คน”
            </p>
            <RateBar label="รับเรื่องทันกำหนด" value={sla.ackRate} />
            <RateBar label="ติดต่อนักเรียนทันกำหนด" value={sla.contactRate} />
            <div className="row" style={{ gap: '1.5rem', marginTop: '.8rem' }}>
              <div>
                <div className="small muted">เวลามัธยฐานกว่าจะได้คุยกับนักเรียน</div>
                <strong style={{ fontSize: '1.3rem' }}>
                  {sla.medianContactHours !== null ? `${sla.medianContactHours} ชม.` : '—'}
                </strong>
              </div>
              <div>
                <div className="small muted">เวลามัธยฐานกว่าจะปิดเคส</div>
                <strong style={{ fontSize: '1.3rem' }}>
                  {sla.medianCloseHours !== null ? `${sla.medianCloseHours} ชม.` : '—'}
                </strong>
              </div>
              <div>
                <div className="small muted">เคสทั้งหมดในช่วงนี้</div>
                <strong style={{ fontSize: '1.3rem' }}>{sla.total}</strong>
              </div>
            </div>
          </div>

          {/* ── 4. การไหลของเคส ───────────────────────────── */}
          <div className="card">
            <h2>การไหลของเคส (funnel)</h2>
            <p className="small muted">
              ถ้าตัวเลขหล่นแรงระหว่างขั้น แปลว่ากระบวนการติดที่ขั้นนั้น
            </p>
            <FunnelBar label="เปิดเคส" value={funnel.opened} max={funnel.opened} />
            <FunnelBar label="มีผู้รับเรื่อง" value={funnel.acknowledged} max={funnel.opened} />
            <FunnelBar label="ได้คุยกับนักเรียน" value={funnel.contacted} max={funnel.opened} />
            <FunnelBar label="ส่งต่อผู้เชี่ยวชาญ" value={funnel.referred} max={funnel.opened} />
            <FunnelBar label="ปิดเคสครบวงจร" value={funnel.closed} max={funnel.opened} />
          </div>

          {/* ── 5. แนวโน้มรายสัปดาห์ ──────────────────────── */}
          <div className="card">
            <h2>แนวโน้มรายสัปดาห์</h2>
            <p className="small muted">
              แท่งฟ้า = การเช็กอิน/แจ้งเรื่องทั้งหมด · แท่งส้ม = ที่เป็นระดับ 3–4
            </p>
            {weekly.length >= 2 ? <WeeklyChart weekly={weekly} /> : (
              <p className="muted small">ยังมีข้อมูลไม่พอสำหรับแสดงแนวโน้ม (ต้องมีอย่างน้อย 2 สัปดาห์)</p>
            )}
          </div>
        </div>

        <div>
          {/* ── 6. รายระดับชั้น ───────────────────────────── */}
          <div className="card">
            <h2>การมีส่วนร่วมรายระดับชั้น</h2>
            <table className="data">
              <thead><tr><th>ระดับชั้น</th><th>นักเรียน</th><th>เช็กอินแล้ว</th></tr></thead>
              <tbody>
                {byGradeLevel.map((g: any) => (
                  <tr key={g.grade}>
                    <td>{g.grade}</td>
                    <td>{g.students}</td>
                    <td>{g.rate !== null ? `${g.rate}%` : 'กลุ่มเล็ก (ถูกกลบ)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: '.5rem', marginBottom: 0 }}>
              จงใจไม่แยกรายห้อง — เพื่อไม่ให้ถูกใช้จัดอันดับหรือประเมินครู
            </p>
          </div>

          {/* ── 7. ข้อมูลเข้ามาทางไหน ─────────────────────── */}
          <div className="card">
            <h2>เรื่องเข้ามาจากช่องทางใด</h2>
            <table className="data">
              <tbody>
                {origins.map((o: any) => (
                  <tr key={o.origin}>
                    <td>{ORIGIN_TH[o.origin] ?? o.origin}</td>
                    <td><strong>{o.n ?? 'น้อยกว่า 5'}</strong></td>
                  </tr>
                ))}
                {origins.length === 0 && <tr><td className="muted small" colSpan={2}>ยังไม่มีเคสในช่วงนี้</td></tr>}
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: '.5rem', marginBottom: 0 }}>
              ถ้าช่องทาง “เล่าเอง” และ “เพื่อนแจ้ง” เป็นศูนย์ต่อเนื่อง
              แปลว่านักเรียนยังไม่ไว้ใจระบบ — เป็นเรื่องเชิงนโยบายที่ผู้บริหารช่วยได้
            </p>
          </div>

          <div className="card">
            <h2>เรื่องที่พบบ่อย</h2>
            {topCategories.length === 0 ? (
              <p className="muted small">ยังไม่มีข้อมูลมากพอที่จะแสดงโดยไม่ระบุตัวนักเรียนได้</p>
            ) : (
              <div className="row" style={{ gap: '.4rem' }}>
                {topCategories.map((t: any) => (
                  <span key={t.tag} className="tag">{prettyTag(t.tag)} · {t.n}</span>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>กิจกรรมทักษะชีวิต</h2>
            <div className="row" style={{ gap: '1.5rem' }}>
              <div>
                <div className="small muted">เริ่มทำ</div>
                <strong style={{ fontSize: '1.3rem' }}>{lifeskills.started}</strong>
              </div>
              <div>
                <div className="small muted">ทำจบ</div>
                <strong style={{ fontSize: '1.3rem' }}>{lifeskills.completed}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── กติกาการใช้ข้อมูล ─────────────────────────────── */}
      <div className="card" style={{ background: 'var(--blue-50)' }}>
        <h3>กติกาการใช้ข้อมูลหน้านี้</h3>
        <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0, color: 'var(--ink-soft)' }}>
          {data.governance?.map((g: string, i: number) => (
            <li key={i} style={{ marginBottom: '.3rem' }}>{g}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RateBar({ label, value }: { label: string; value: number | null }) {
  const color = value === null ? 'var(--ink-mute)' : value >= 90 ? 'var(--green-600)' : value >= 70 ? 'var(--amber-600)' : 'var(--red-600)';
  return (
    <div className="dim-bar" style={{ marginBottom: '.5rem' }}>
      <span className="label" style={{ width: 170 }}>{label}</span>
      <span className="track">
        <span className="fill" style={{ width: `${value ?? 0}%`, background: color }} />
      </span>
      <span className="val" style={{ width: 48, color }}>{value !== null ? `${value}%` : '—'}</span>
    </div>
  );
}

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="dim-bar" style={{ marginBottom: '.45rem' }}>
      <span className="label" style={{ width: 150 }}>{label}</span>
      <span className="track" style={{ height: 14 }}>
        <span className="fill" style={{ width: `${pct}%`, background: 'var(--blue-500)' }} />
      </span>
      <span className="val" style={{ width: 34 }}>{value}</span>
    </div>
  );
}

function WeeklyChart({ weekly }: { weekly: { week: string; assessments: number; priority: number }[] }) {
  const W = 560; const H = 150; const PAD = 4;
  const max = Math.max(1, ...weekly.map((w) => w.assessments));
  const bw = (W - PAD * 2) / weekly.length;

  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" style={{ display: 'block' }} role="img"
      aria-label="กราฟแนวโน้มการเช็กอินและเคสเร่งด่วนรายสัปดาห์">
      {weekly.map((w, i) => {
        const x = PAD + i * bw;
        const h1 = (w.assessments / max) * H;
        const h2 = (w.priority / max) * H;
        return (
          <g key={w.week}>
            <rect x={x + bw * 0.12} y={H - h1} width={bw * 0.42} height={h1} rx={3} fill="var(--cyan-500)" />
            <rect x={x + bw * 0.56} y={H - h2} width={bw * 0.32} height={h2} rx={3} fill="var(--orange-500)" />
            {weekly.length <= 16 && (
              <text x={x + bw / 2} y={H + 15} textAnchor="middle" fontSize="9" fill="var(--ink-mute)">
                {w.week.split('-')[1]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function prettyTag(tag: string) {
  const map: Record<string, string> = {
    'context:study': 'การเรียน', 'context:friend': 'เพื่อน', 'context:bullying': 'ถูกแกล้ง',
    'context:family': 'ที่บ้าน', 'context:money': 'เรื่องเงิน', 'context:health': 'สุขภาพ/การนอน',
    'context:safety': 'ไม่ปลอดภัย', 'context:love': 'ความสัมพันธ์', 'context:other': 'อื่น ๆ',
    'context:withdrawn': 'แยกตัว', 'context:grades': 'ผลการเรียนตก', 'context:absent': 'ขาดเรียน',
    'context:sad': 'ดูเศร้า', 'context:saidDeath': 'พูดถึงการตาย',
    'bullying:verbal': 'ล้อเลียน/ด่าทอ', 'bullying:physical': 'ทำร้ายร่างกาย',
    'bullying:social': 'กีดกัน', 'bullying:cyber': 'ไซเบอร์บูลลี่',
    'home:conflict': 'บ้านทะเลาะกัน', 'home:money': 'บ้านมีปัญหาการเงิน',
    'home:violence': 'ความรุนแรงในบ้าน', 'home:alcohol': 'สุรา/สารเสพติดในบ้าน',
    'lexicon:BULLYING': 'ข้อความเรื่องถูกรังแก', 'lexicon:DISTRESS': 'ข้อความแสดงความทุกข์',
    'lexicon:SUICIDE_INTENT': 'ข้อความเรื่องการจบชีวิต', 'lexicon:SELF_HARM': 'ข้อความเรื่องทำร้ายตัวเอง',
    'lexicon:HELP_SEEKING': 'ขอความช่วยเหลือ',
  };
  return map[tag] ?? tag;
}
