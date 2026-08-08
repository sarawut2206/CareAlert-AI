import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, thaiDateTime, timeLeft } from '../../api';
import { useAuth } from '../../auth';
import { LevelBadge, DimBar, Modal, Spinner, Alert } from '../../components/ui';

const DIM_LABELS: Record<string, string> = {
  severity: 'ความรุนแรง', impact: 'ผลกระทบต่อชีวิต', frequency: 'ความถี่',
  duration: 'ระยะเวลา', isolation: 'การขาดคนช่วย', trajectory: 'แนวโน้มแย่ลง',
  safety: 'ความปลอดภัย', protective: 'ปัจจัยปกป้อง',
};

const SUFFICIENCY_TH: Record<string, string> = {
  SUFFICIENT: 'ข้อมูลครบพอสำหรับพิจารณาเบื้องต้น',
  LIMITED: 'ข้อมูลพอใช้ได้ แต่มีข้อจำกัด',
  INSUFFICIENT: 'ข้อมูลยังไม่เพียงพอสำหรับการสรุป',
};

const EVENT_TH: Record<string, string> = {
  opened: 'เปิดเคส', acknowledged: 'รับเรื่อง', contacted: 'พูดคุยกับนักเรียน',
  action: 'ดำเนินการ', referral: 'ส่งต่อ', escalate: 'ยกระดับ',
  followup: 'ติดตามผล', closed: 'ปิดเคส', reopened: 'เปิดเคสใหม่', note: 'บันทึก',
};

export default function CaseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<string | null>(null);

  const load = useCallback(() => {
    api(`/cases/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(path: string, body: any) {
    setError(null);
    try {
      await api(`/cases/${id}/${path}`, { method: 'POST', body });
      setDialog(null);
      load();
    } catch (e: any) {
      setError(e?.message ?? 'ดำเนินการไม่สำเร็จ');
    }
  }

  if (error && !data) return <div className="container"><Alert kind="error">{error}</Alert></div>;
  if (!data) return <div className="container"><Spinner /></div>;

  const c = data.case;
  const latest = data.assessments?.[0];
  const canOverride = user?.role === 'counselor' || user?.role === 'admin';

  return (
    <div className="container wide">
      <Link to="/" className="small" style={{ display: 'inline-block', marginBottom: '.5rem' }}>← กลับไปคิวเคส</Link>

      {error && <Alert kind="error">{error}</Alert>}

      {/* ── หัวเคส ─────────────────────────────────────── */}
      <div className="card">
        <div className="row between" style={{ marginBottom: '.5rem' }}>
          <div>
            <h1 style={{ marginBottom: '.15rem' }}>
              {data.student?.display_name ?? c.subject_hint ?? 'ไม่ระบุตัวตน'}
            </h1>
            <div className="small muted">
              {data.student
                ? `${data.student.student_code} · ${data.student.classroom ?? 'ไม่ระบุห้อง'} · ครูที่ปรึกษา ${data.student.advisor ?? '—'}`
                : 'ยังไม่ทราบว่าเป็นนักเรียนคนใด — ต้องสืบหาจากข้อมูลที่ผู้แจ้งให้ไว้'}
            </div>
          </div>
          <LevelBadge level={c.level} />
        </div>

        <div className="row" style={{ gap: '1.2rem', fontSize: '.88rem' }}>
          <span>เปิดเคส {thaiDateTime(c.opened_at)}</span>
          <span className={`sla ${c.acknowledgeSla}`}>
            รับเรื่อง: {c.acknowledged_at ? thaiDateTime(c.acknowledged_at) : timeLeft(c.acknowledge_due_at)}
          </span>
          <span className={`sla ${c.contactSla}`}>
            ติดต่อ: {c.first_contact_at ? thaiDateTime(c.first_contact_at) : timeLeft(c.contact_due_at)}
          </span>
          {c.next_followup_at && <span>ติดตามครั้งถัดไป {thaiDateTime(c.next_followup_at, false)}</span>}
        </div>

        {data.student && (data.student.guardian_phone || data.student.guardian_name) && (
          <p className="small muted" style={{ marginTop: '.5rem', marginBottom: 0 }}>
            ผู้ปกครอง: {data.student.guardian_name ?? '—'} {data.student.guardian_phone ?? ''}
          </p>
        )}
      </div>

      <div className="split">
        <div>
          {/* ── ทำไมถึงเป็นระดับนี้ ────────────────────── */}
          {latest && (
            <div className="card">
              <h2>ทำไมระบบถึงเสนอระดับนี้</h2>
              <p className="small muted">
                ระดับนี้บอกว่า “ต้องทำอะไรต่อ” ไม่ได้บอกว่านักเรียนเป็นโรคอะไร
                และไม่ใช่การทำนายพฤติกรรม — การตัดสินใจสุดท้ายเป็นของคุณ
              </p>

              <div className={`alert ${latest.data_sufficiency === 'INSUFFICIENT' ? 'warn' : 'info'}`}>
                <strong>{SUFFICIENCY_TH[latest.data_sufficiency]}</strong>
                {latest.data_sufficiency === 'INSUFFICIENT' && (
                  <div className="small" style={{ marginTop: '.25rem' }}>
                    ห้ามบันทึกว่า “ไม่พบปัญหา” จากข้อมูลชุดนี้ — ต้องยืนยันด้วยการพูดคุยโดยตรง
                  </div>
                )}
              </div>

              <h3>กฎที่ทำงาน</h3>
              {latest.rationale?.matched?.map((m: any, i: number) => (
                <div key={i} className="rule-item">
                  <span className={`level l${m.level}`}>L{m.level}</span>
                  <span style={{ flex: 1 }}>
                    {m.label}
                    {m.detail && <div className="small muted">{m.detail}</div>}
                    <div><code>{m.id}</code></div>
                  </span>
                </div>
              ))}

              {latest.rationale?.modifiers?.length > 0 && (
                <>
                  <h3 style={{ marginTop: '.8rem' }}>ข้อควรระวังเพิ่มเติม</h3>
                  {latest.rationale.modifiers.map((m: any, i: number) => (
                    <div key={i} className="rule-item" style={{ background: 'var(--amber-100)' }}>
                      <span style={{ flex: 1 }}>
                        <strong>{m.label}</strong>
                        <div className="small">{m.effect}</div>
                      </span>
                    </div>
                  ))}
                </>
              )}

              <h3 style={{ marginTop: '.8rem' }}>มิติที่ใช้พิจารณา</h3>
              {Object.entries(latest.dimensions ?? {}).map(([k, v]) => (
                <DimBar key={k} label={DIM_LABELS[k] ?? k} value={Number(v)} />
              ))}
              <p className="small muted" style={{ marginTop: '.5rem', marginBottom: 0 }}>
                ดัชนีความห่วงใยรวม {latest.concern_index}/100 — ใช้จัดลำดับคิวเท่านั้น ไม่ใช่คะแนนของนักเรียน
              </p>
            </div>
          )}

          {/* ── สิ่งที่นักเรียนตอบมาจริง ──────────────── */}
          <div className="card">
            <h2>สิ่งที่ได้รับมา</h2>
            <p className="small muted">
              อ่านข้อความต้นฉบับเสมอ อย่าตัดสินจากสรุปของระบบอย่างเดียว
            </p>

            {data.sources?.map((s: any) => (
              <div key={`${s.kind}-${s.id}`} style={{ marginBottom: '1.2rem' }}>
                <div className="row between">
                  <strong>{SOURCE_TH[s.kind] ?? s.kind}</strong>
                  <span className="small muted">{thaiDateTime(s.at)}</span>
                </div>
                {s.anonymous && <span className="tag gray">ผู้แจ้งไม่ประสงค์ออกนาม</span>}
                {s.subjectHint && <p className="small">ข้อมูลที่ผู้แจ้งให้ไว้: {s.subjectHint}</p>}

                {s.body && <div className="quote" style={{ margin: '.5rem 0' }}>{s.body}</div>}

                <div style={{ marginTop: '.5rem' }}>
                  {Object.entries(s.answers ?? {}).map(([itemId, value]) => {
                    const def = data.itemDefs?.[itemId];
                    if (!def || def.type === 'text') return null;
                    return (
                      <div key={itemId} className={`answer-item ${def.critical ? 'flagged' : ''}`}>
                        <div className="q">{def.text}</div>
                        <div className="a">{formatAnswer(value, def)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── ประวัติการดำเนินการ ────────────────────── */}
          <div className="card">
            <h2>บันทึกการดำเนินการ</h2>
            <div className="timeline">
              {data.events?.map((e: any) => (
                <div key={e.id} className="item">
                  <div className="when">{thaiDateTime(e.created_at)} · {e.actor_name ?? 'ระบบ'}</div>
                  <strong>{EVENT_TH[e.type] ?? e.type}</strong>
                  {e.note && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── แผงการดำเนินการ ──────────────────────────── */}
        <div>
          <div className="card">
            <h2>สิ่งที่ต้องทำ</h2>

            {data.closeBlockers?.length > 0 && (
              <div className="alert warn">
                <strong>ยังปิดเคสไม่ได้จนกว่าจะ:</strong>
                <ul style={{ margin: '.35rem 0 0', paddingLeft: '1.1rem' }} className="small">
                  {data.closeBlockers.map((b: string, i: number) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            )}

            <div className="stack">
              {!c.acknowledged_at && (
                <button className="btn warm block" onClick={() => act('acknowledge', {})}>รับเรื่องนี้</button>
              )}
              <button className="btn block" onClick={() => setDialog('contact')}>บันทึกการพูดคุย</button>
              <button className="btn ghost block" onClick={() => setDialog('action')}>บันทึกการดำเนินการ</button>
              <button className="btn ghost block" onClick={() => setDialog('referral')}>ส่งต่อ</button>
              <button className="btn ghost block" onClick={() => setDialog('guardian')}>บันทึกการแจ้งผู้ปกครอง</button>
              <button className="btn ghost block" onClick={() => setDialog('followup')}>บันทึกการติดตาม</button>
              <button className="btn ghost block" onClick={() => setDialog('level')}>เปลี่ยนระดับ</button>
              {c.status !== 'closed'
                ? <button className="btn ghost block" onClick={() => setDialog('close')}>ปิดเคส</button>
                : canOverride && <button className="btn ghost block" onClick={() => setDialog('reopen')}>เปิดเคสใหม่</button>}
            </div>
          </div>

          {latest?.rationale && (
            <div className="card">
              <h3>แนวปฏิบัติสำหรับระดับ {c.level}</h3>
              <ActionGuide level={c.level} />
            </div>
          )}

          {data.trend?.length > 1 && (
            <div className="card">
              <h3>แนวโน้มของนักเรียน</h3>
              <Sparkline points={data.trend.map((t: any) => t.concern_index)} />
              <p className="small muted" style={{ marginBottom: 0 }}>
                จาก {data.trend.length} ครั้งที่ผ่านมา (ค่าสูง = ควรใส่ใจมากขึ้น)
              </p>
            </div>
          )}
        </div>
      </div>

      {dialog && (
        <ActionDialog
          kind={dialog}
          currentLevel={c.level}
          onClose={() => setDialog(null)}
          onSubmit={act}
        />
      )}
    </div>
  );
}

const SOURCE_TH: Record<string, string> = {
  checkin: 'จากการเช็กอิน', self: 'นักเรียนเล่าเอง', friend: 'เพื่อนแจ้ง', staff_note: 'บุคลากรบันทึก',
};

function formatAnswer(value: any, def: any) {
  if (Array.isArray(value)) {
    return value.map((v) => def.options?.find((o: any) => o.value === v)?.label ?? v).join(', ') || '—';
  }
  const opt = def.options?.find((o: any) => String(o.value) === String(value));
  return opt?.label ?? String(value ?? '—');
}

function ActionGuide({ level }: { level: number }) {
  const guides: Record<number, string[]> = {
    4: [
      'ตรวจสอบว่านักเรียนอยู่ที่ไหนและอยู่กับใครในขณะนี้',
      'พบนักเรียนในที่ปลอดภัย โดยมีผู้ใหญ่รับรู้อย่างน้อย 2 คน',
      'อย่าปล่อยให้อยู่คนเดียวจนกว่าจะยืนยันความปลอดภัย',
      'ติดต่อผู้ปกครอง เว้นแต่ผู้ปกครองคือแหล่งที่มาของอันตราย',
      'ประสาน 1323 / 1669 เมื่อจำเป็น และบันทึกทุกขั้นตอนพร้อมเวลา',
    ],
    3: [
      'นัดคุยภายใน 24 ชั่วโมง ในที่ที่เป็นส่วนตัว',
      'ใช้การฟังเชิงลึก ไม่ซักถามแบบสอบสวน',
      'ถามเรื่องความปลอดภัยตรง ๆ อย่างสุภาพ',
      'ระบุปัจจัยปกป้องและคนที่นักเรียนไว้ใจ',
      'ตกลงแผนช่วยเหลือร่วมกัน และนัดติดตาม',
    ],
    2: [
      'ทบทวนข้อมูลย้อนหลังของนักเรียน',
      'หาโอกาสพูดคุยแบบไม่เป็นทางการภายใน 3 วันเรียน',
      'ยืนยันว่าข้อมูลตรงกับที่สังเกตเห็นจริงหรือไม่',
      'ถ้าข้อมูลยังไม่พอ ให้ชวนเช็กอินซ้ำ — ห้ามสรุปว่า “ไม่มีปัญหา”',
    ],
  };
  return (
    <ol className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
      {(guides[level] ?? []).map((s, i) => <li key={i} style={{ marginBottom: '.3rem' }}>{s}</li>)}
    </ol>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 260; const hgt = 60;
  const max = Math.max(100, ...points);
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = hgt - (p / max) * hgt;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${hgt}`} width="100%" height={hgt} style={{ display: 'block', marginBottom: '.5rem' }}>
      <path d={d} fill="none" stroke="var(--blue-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={(i / (points.length - 1)) * w}
          cy={hgt - (p / max) * hgt}
          r="3"
          fill={p >= 65 ? 'var(--red-500)' : p >= 35 ? 'var(--orange-500)' : 'var(--green-600)'}
        />
      ))}
    </svg>
  );
}

function ActionDialog({
  kind, currentLevel, onClose, onSubmit,
}: {
  kind: string; currentLevel: number;
  onClose: () => void; onSubmit: (path: string, body: any) => void;
}) {
  const [note, setNote] = useState('');
  const [safety, setSafety] = useState(false);
  const [protection, setProtection] = useState(false);
  const [to, setTo] = useState('');
  const [informed, setInformed] = useState(true);
  const [level, setLevel] = useState(currentLevel);
  const [days, setDays] = useState(7);
  const [studentStatus, setStudentStatus] = useState('unknown');
  const [override, setOverride] = useState(false);

  const config: Record<string, { title: string; path: string; body: () => any }> = {
    contact: {
      title: 'บันทึกการพูดคุยกับนักเรียน', path: 'contact',
      body: () => ({ note, safetyConfirmed: safety, protectionNeeded: protection }),
    },
    action: { title: 'บันทึกการดำเนินการ', path: 'action', body: () => ({ note }) },
    referral: { title: 'ส่งต่อ', path: 'referral', body: () => ({ to, note }) },
    guardian: { title: 'การแจ้งผู้ปกครอง', path: 'guardian', body: () => ({ informed, note }) },
    followup: { title: 'บันทึกการติดตาม', path: 'followup', body: () => ({ note, studentStatus, nextInDays: days }) },
    level: { title: 'เปลี่ยนระดับ', path: 'level', body: () => ({ level, reason: note }) },
    close: { title: 'ปิดเคส', path: 'close', body: () => ({ reason: note, override }) },
    reopen: { title: 'เปิดเคสใหม่', path: 'reopen', body: () => ({ reason: note }) },
  };
  const cfg = config[kind];
  if (!cfg) return null;

  return (
    <Modal title={cfg.title} onClose={onClose}>
      {kind === 'referral' && (
        <div className="field">
          <label>ส่งต่อไปที่ไหน</label>
          <input
            type="text" value={to} onChange={(e) => setTo(e.target.value)}
            placeholder="เช่น ครูแนะแนว / นักจิตวิทยาโรงเรียน / รพ.สต. / รพ.จิตเวชเด็ก"
          />
        </div>
      )}

      {kind === 'level' && (
        <div className="field">
          <label>ระดับใหม่</label>
          <div className="hint">
            การลดระดับต้องทำโดยครูแนะแนวหรือผู้ดูแลระบบ และต้องระบุเหตุผลเสมอ
          </div>
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
            <option value={2}>ระดับ 2 · ตรวจสอบ</option>
            <option value={3}>ระดับ 3 · ช่วยเหลือด่วน</option>
            <option value={4}>ระดับ 4 · ความปลอดภัย</option>
          </select>
        </div>
      )}

      {kind === 'guardian' && (
        <div className="field">
          <label>ผลการแจ้ง</label>
          <select value={informed ? 'yes' : 'no'} onChange={(e) => setInformed(e.target.value === 'yes')}>
            <option value="yes">แจ้งผู้ปกครองแล้ว</option>
            <option value="no">ยังไม่แจ้ง (ระบุเหตุผล)</option>
          </select>
        </div>
      )}

      {kind === 'followup' && (
        <>
          <div className="field">
            <label>สถานะของนักเรียนตอนนี้</label>
            <select value={studentStatus} onChange={(e) => setStudentStatus(e.target.value)}>
              <option value="better">ดีขึ้น</option>
              <option value="same">เท่าเดิม</option>
              <option value="worse">แย่ลง</option>
              <option value="unknown">ยังไม่ทราบ</option>
            </select>
          </div>
          <div className="field">
            <label>นัดติดตามครั้งถัดไปในอีกกี่วัน</label>
            <input type="number" min={0} max={180} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
        </>
      )}

      <div className="field">
        <label>
          {kind === 'close' ? 'เหตุผลในการปิดเคส'
            : kind === 'level' ? 'เหตุผล'
            : kind === 'guardian' ? 'รายละเอียด'
            : 'บันทึก'}
        </label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="บันทึกเชิงข้อเท็จจริง ระบุสิ่งที่ทำและผลที่ได้" />
      </div>

      {kind === 'contact' && (
        <div className="stack" style={{ marginBottom: '1rem' }}>
          <label className="row" style={{ gap: '.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} style={{ width: 'auto' }} />
            <span>ยืนยันแล้วว่าขณะนี้นักเรียนปลอดภัย</span>
          </label>
          <label className="row" style={{ gap: '.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={protection} onChange={(e) => setProtection(e.target.checked)} style={{ width: 'auto' }} />
            <span>ต้องมีแผนคุ้มครองจากการถูกเอาคืน</span>
          </label>
        </div>
      )}

      {kind === 'close' && (
        <label className="row" style={{ gap: '.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} style={{ width: 'auto' }} />
          <span className="small">ปิดทั้งที่ยังมีข้อค้าง (ต้องเป็นครูแนะแนวขึ้นไป และจะถูกบันทึกไว้)</span>
        </label>
      )}

      <div className="row between">
        <button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button
          className={`btn ${kind === 'close' ? 'danger' : ''}`}
          onClick={() => onSubmit(cfg.path, cfg.body())}
        >
          บันทึก
        </button>
      </div>
    </Modal>
  );
}
