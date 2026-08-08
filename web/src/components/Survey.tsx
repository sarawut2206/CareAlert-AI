import { useEffect, useMemo, useRef, useState } from 'react';

export type Option = { value: any; label: string; emoji?: string };

export type Item = {
  id: string;
  text: string;
  type: 'scale' | 'choice' | 'multi' | 'text';
  domain?: string;
  options?: Option[];
  required?: boolean;
  helper?: string;
  placeholder?: string;
  maxLength?: number;
  critical?: boolean;
};

export type Template = {
  id: string;
  title: string;
  subtitle?: string;
  intro?: string;
  notice?: string;
  timeframe?: string;
  items: Item[];
  alwaysShowHelpline?: boolean;
};

export type Answers = Record<string, any>;

type Props = {
  templates: Template[];
  answers: Answers;
  onChange: (answers: Answers) => void;
  onSubmit: (payload: { answers: Answers; timings: Record<string, number>; durationMs: number }) => void;
  submitting?: boolean;
  submitLabel?: string;
};

type Step =
  | { kind: 'intro'; template: Template }
  | { kind: 'item'; item: Item; template: Template };

/**
 * แบบสอบถามทีละข้อ
 *
 * เหตุผลที่แสดงทีละข้อ (ไม่ใช่รายการยาว):
 *  - นักเรียนตอบบนมือถือเป็นหลัก การเลื่อนหน้ายาวทำให้กดผ่านโดยไม่อ่าน
 *  - ทำให้จับเวลาต่อข้อได้ ซึ่งใช้ตรวจ "คุณภาพข้อมูล" ไม่ใช่จับผิด
 *  - ลดความรู้สึกว่ากำลังทำข้อสอบ
 */
export function Survey({
  templates, answers, onChange, onSubmit, submitting, submitLabel = 'ส่ง',
}: Props) {
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    for (const [ti, t] of templates.entries()) {
      if (t.intro || t.notice || ti > 0) out.push({ kind: 'intro', template: t });
      // ข้อที่ถามว่า "อยากให้ติดต่อกลับไหม" ต้องอยู่ท้ายสุดเสมอ
      const normal = t.items.filter((i) => i.domain !== 'help');
      for (const item of normal) out.push({ kind: 'item', item, template: t });
    }
    const helpItems = templates.flatMap((t) => t.items.filter((i) => i.domain === 'help').map((item) => ({ item, template: t })));
    for (const { item, template } of helpItems.slice(0, 1)) out.push({ kind: 'item', item, template });
    return out;
  }, [templates]);

  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const itemShownAt = useRef(Date.now());
  const timings = useRef<Record<string, number>>({});

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const progress = steps.length ? ((index + 1) / steps.length) * 100 : 0;

  useEffect(() => { itemShownAt.current = Date.now(); setError(null); }, [index]);

  function recordTiming(itemId: string) {
    const spent = Date.now() - itemShownAt.current;
    timings.current[itemId] = (timings.current[itemId] ?? 0) + spent;
  }

  function setValue(itemId: string, value: any) {
    onChange({ ...answers, [itemId]: value });
  }

  function next() {
    if (step?.kind === 'item') {
      const { item } = step;
      const v = answers[item.id];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (item.required && empty) {
        setError('ข้อนี้จำเป็นต้องตอบ เพื่อให้เราช่วยได้ถูกทาง');
        return;
      }
      recordTiming(item.id);
    }

    if (isLast) {
      onSubmit({
        answers,
        timings: timings.current,
        durationMs: Date.now() - startedAt.current,
      });
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    if (index === 0) return;
    setIndex((i) => i - 1);
  }

  if (!step) return null;

  return (
    <div>
      <div className="q-progress"><div style={{ width: `${progress}%` }} /></div>

      {step.kind === 'intro' ? (
        <div className="question card">
          <h2>{step.template.title}</h2>
          {step.template.subtitle && <p className="muted small">{step.template.subtitle}</p>}
          {step.template.intro && <p>{step.template.intro}</p>}
          {step.template.notice && <div className="alert info">{step.template.notice}</div>}
        </div>
      ) : (
        <div className="question card">
          {step.template.timeframe && <div className="q-timeframe">{step.template.timeframe}</div>}
          <div className="q-text">{step.item.text}</div>
          {step.item.helper && <div className="q-helper">{step.item.helper}</div>}
          {renderInput(step.item, answers[step.item.id], setValue)}
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      <div className="row between">
        <button className="btn ghost" onClick={back} disabled={index === 0 || submitting}>ย้อนกลับ</button>
        <div className="row" style={{ gap: '.5rem' }}>
          {step.kind === 'item' && !step.item.required && (
            <button className="btn ghost" onClick={next} disabled={submitting}>ข้ามข้อนี้</button>
          )}
          <button className="btn" onClick={next} disabled={submitting}>
            {submitting ? 'กำลังส่ง…' : isLast ? submitLabel : 'ถัดไป'}
          </button>
        </div>
      </div>

      <p className="small muted center" style={{ marginTop: '.75rem' }}>
        {index + 1} / {steps.length}
      </p>
    </div>
  );
}

function renderInput(item: Item, value: any, setValue: (id: string, v: any) => void) {
  if (item.type === 'text') {
    return (
      <textarea
        value={value ?? ''}
        maxLength={item.maxLength ?? 2000}
        placeholder={item.placeholder ?? 'เขียนได้ตามสบาย'}
        onChange={(e) => setValue(item.id, e.target.value)}
      />
    );
  }

  if (item.type === 'multi') {
    const selected: any[] = Array.isArray(value) ? value : [];
    return (
      <div className="choices">
        {(item.options ?? []).map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={String(o.value)}
              type="button"
              className={`choice multi ${on ? 'selected' : ''}`}
              onClick={() => {
                // เลือก "ไม่มี" แล้วให้ล้างตัวเลือกอื่นทิ้ง
                if (o.value === 'none') return setValue(item.id, on ? [] : ['none']);
                const base = selected.filter((v) => v !== 'none');
                setValue(item.id, on ? base.filter((v) => v !== o.value) : [...base, o.value]);
              }}
            >
              <span className="dot" />
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="choices">
      {(item.options ?? []).map((o) => {
        const on = value === o.value || (value !== undefined && String(value) === String(o.value));
        return (
          <button
            key={String(o.value)}
            type="button"
            className={`choice ${on ? 'selected' : ''}`}
            onClick={() => setValue(item.id, o.value)}
          >
            <span className="dot" />
            {o.emoji && <span className="big-emoji">{o.emoji}</span>}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
