import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Survey, type Answers, type Template } from '../../components/Survey';
import { ResultScreen, type SubmitResult } from '../../components/ResultScreen';
import { Spinner, Alert } from '../../components/ui';

export default function TellUs() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [anonymous, setAnonymous] = useState(false);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [moduleTitles, setModuleTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ self: Template }>('/reports/templates')
      .then((d) => setTemplate(d.self))
      .catch((e) => setError(e.message));
    api<{ modules: { id: string; title: string; emoji: string }[] }>('/lifeskills')
      .then((d) => setModuleTitles(Object.fromEntries(d.modules.map((m) => [m.id, `${m.emoji} ${m.title}`]))))
      .catch(() => {});
  }, []);

  async function submit(payload: { answers: Answers }) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<SubmitResult>('/reports/self', {
        method: 'POST', body: { answers: payload.answers, anonymous },
      });
      setResult(res);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setError(e?.message ?? 'ส่งข้อมูลไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <div className="container"><ResultScreen result={result} moduleTitles={moduleTitles} /></div>;
  }
  if (error && !template) return <div className="container"><Alert kind="error">{error}</Alert></div>;
  if (!template) return <div className="container"><Spinner /></div>;

  if (!started) {
    return (
      <div className="container">
        <div className="hero">
          <h1>เล่าเรื่องของเธอ</h1>
          <p>ไม่ต้องเรียบเรียงให้สวย เล่าเท่าที่ไหวก็พอ</p>
        </div>

        <div className="card">
          <h3>ก่อนเริ่ม — เธอเลือกได้</h3>
          <div className="choices">
            <button
              type="button"
              className={`choice ${!anonymous ? 'selected' : ''}`}
              onClick={() => setAnonymous(false)}
            >
              <span className="dot" />
              <span>
                <strong>บอกชื่อ</strong>
                <br /><span className="small muted">ครูจะติดต่อกลับได้ตรงตัว และช่วยได้เร็วกว่า</span>
              </span>
            </button>
            <button
              type="button"
              className={`choice ${anonymous ? 'selected' : ''}`}
              onClick={() => setAnonymous(true)}
            >
              <span className="dot" />
              <span>
                <strong>ยังไม่อยากบอกชื่อ</strong>
                <br /><span className="small muted">เล่าได้เหมือนกัน แต่ครูอาจตามหาเธอได้ช้ากว่า</span>
              </span>
            </button>
          </div>

          {anonymous && (
            <div className="alert warn" style={{ marginTop: '.8rem', marginBottom: 0 }}>
              <strong>สิ่งที่เธอควรรู้ล่วงหน้า:</strong> ถ้าสิ่งที่เธอเล่ามีสัญญาณว่าเธออาจไม่ปลอดภัย
              ครูที่รับผิดชอบจำเป็นต้องรู้ว่าเป็นเธอ เพื่อจะช่วยได้ทัน
              เราบอกเรื่องนี้ไว้ตั้งแต่ต้นเสมอ ไม่มีการแอบทำ
            </div>
          )}
        </div>

        <button className="btn block" onClick={() => setStarted(true)}>เริ่มเล่า</button>
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
