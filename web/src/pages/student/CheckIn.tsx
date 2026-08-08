import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Survey, type Answers, type Template } from '../../components/Survey';
import { ResultScreen, type SubmitResult } from '../../components/ResultScreen';
import { Spinner, Alert } from '../../components/ui';

export default function CheckIn() {
  const [params] = useSearchParams();
  const cadence = params.get('cadence') === 'daily' ? 'daily' : 'weekly';

  const [core, setCore] = useState<Template | null>(null);
  const [followUps, setFollowUps] = useState<Template[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [moduleTitles, setModuleTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    api<{ template: Template }>(`/checkin/templates?cadence=${cadence}`)
      .then((d) => setCore(d.template))
      .catch((e) => setError(e.message));
    api<{ modules: { id: string; title: string; emoji: string }[] }>('/lifeskills')
      .then((d) => setModuleTitles(Object.fromEntries(d.modules.map((m) => [m.id, `${m.emoji} ${m.title}`]))))
      .catch(() => {});
  }, [cadence]);

  /**
   * ถามเซิร์ฟเวอร์ว่าคำตอบชุดนี้ควรเปิดคำถามเชิงลึกชุดไหน
   * เก็บเงื่อนไขไว้ฝั่งเซิร์ฟเวอร์ เพื่อให้แก้เกณฑ์ได้ที่เดียวและตรวจสอบได้
   */
  useEffect(() => {
    if (!core || Object.keys(answers).length === 0) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      api<{ followUps: Template[] }>('/checkin/follow-ups', { method: 'POST', body: { answers } })
        .then((d) => {
          const incoming = d.followUps ?? [];
          setFollowUps((prev) => {
            // เพิ่มได้อย่างเดียว ไม่ถอดออกกลางคัน เพื่อไม่ให้คำถามหายไปต่อหน้าผู้ตอบ
            const seen = new Set(prev.map((t) => t.id));
            return [...prev, ...incoming.filter((t) => !seen.has(t.id))];
          });
        })
        .catch(() => {});
    }, 350);
    return () => window.clearTimeout(debounce.current);
  }, [answers, core]);

  async function submit(payload: { answers: Answers; timings: Record<string, number>; durationMs: number }) {
    if (!core) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<SubmitResult>('/checkin/submit', {
        method: 'POST',
        body: {
          templateId: core.id,
          followUpIds: followUps.map((f) => f.id),
          answers: payload.answers,
          timings: payload.timings,
          durationMs: payload.durationMs,
        },
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
  if (error && !core) return <div className="container"><Alert kind="error">{error}</Alert></div>;
  if (!core) return <div className="container"><Spinner /></div>;

  return (
    <div className="container">
      {error && <Alert kind="error">{error}</Alert>}
      <Survey
        templates={[core, ...followUps]}
        answers={answers}
        onChange={setAnswers}
        onSubmit={submit}
        submitting={busy}
        submitLabel="ส่งเช็กอิน"
      />
    </div>
  );
}
