import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Survey, type Answers, type Template } from '../../components/Survey';
import { ResultScreen, type SubmitResult } from '../../components/ResultScreen';
import { Spinner, Alert } from '../../components/ui';

export default function FriendConcern() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [anonymous, setAnonymous] = useState(true);
  const [subjectHint, setSubjectHint] = useState('');
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ friend: Template }>('/reports/templates')
      .then((d) => setTemplate(d.friend))
      .catch((e) => setError(e.message));
  }, []);

  async function submit(payload: { answers: Answers }) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<SubmitResult>('/reports/friend', {
        method: 'POST',
        body: { answers: payload.answers, anonymous, subjectHint: subjectHint.trim() },
      });
      setResult(res);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setError(e?.message ?? 'ส่งข้อมูลไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (result) return <div className="container"><ResultScreen result={result} /></div>;
  if (error && !template) return <div className="container"><Alert kind="error">{error}</Alert></div>;
  if (!template) return <div className="container"><Spinner /></div>;

  if (!started) {
    return (
      <div className="container">
        <div className="hero">
          <h1>เป็นห่วงเพื่อน</h1>
          <p>การบอกครูเพราะเป็นห่วงเพื่อน ไม่ใช่การฟ้อง</p>
        </div>

        <div className="card">
          <p className="small">
            บางเรื่องหนักเกินกว่าที่เพื่อนคนเดียวจะแบกไหว
            การบอกผู้ใหญ่ไม่ได้แปลว่าเราหักหลังเพื่อน แต่แปลว่าเราอยากให้เพื่อนยังอยู่
          </p>

          <div className="field">
            <label>เพื่อนคนนี้คือใคร</label>
            <div className="hint">
              บอกเท่าที่รู้ก็พอ เช่น ชื่อเล่น ห้อง หรือลักษณะที่ครูพอจะตามหาได้
            </div>
            <input
              type="text" value={subjectHint} maxLength={300}
              placeholder="เช่น ชื่อเล่นว่ามิ้นท์ ห้อง ม.3/2"
              onChange={(e) => setSubjectHint(e.target.value)}
            />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>เธออยากให้ครูรู้ไหมว่าใครแจ้ง</label>
            <div className="choices">
              <button type="button" className={`choice ${anonymous ? 'selected' : ''}`} onClick={() => setAnonymous(true)}>
                <span className="dot" />
                <span>ไม่ต้องบอกชื่อฉัน</span>
              </button>
              <button type="button" className={`choice ${!anonymous ? 'selected' : ''}`} onClick={() => setAnonymous(false)}>
                <span className="dot" />
                <span>
                  บอกชื่อฉันได้
                  <br /><span className="small muted">ครูจะถามรายละเอียดเพิ่มจากเธอได้</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        <button className="btn block" onClick={() => setStarted(true)} disabled={!subjectHint.trim()}>
          เริ่มแจ้ง
        </button>
        {!subjectHint.trim() && (
          <p className="small muted center" style={{ marginTop: '.5rem' }}>
            กรอกข้อมูลของเพื่อนก่อน เพื่อให้ครูตามหาถูกคน
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      {error && <Alert kind="error">{error}</Alert>}
      <Survey
        templates={[template]}
        answers={answers}
        onChange={setAnswers}
        onSubmit={submit}
        submitting={busy}
        submitLabel="ส่งให้ครู"
      />
    </div>
  );
}
