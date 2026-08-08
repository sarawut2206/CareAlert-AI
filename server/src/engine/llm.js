/**
 * ตัวช่วยภาษา (ไม่บังคับ / ปิดโดยค่าเริ่มต้น)
 *
 * ขอบเขตที่อนุญาต — มีแค่ 2 อย่าง:
 *   1. สรุปข้อความอิสระของนักเรียนเป็นข้อเท็จจริงสั้น ๆ ให้ครูอ่านเร็วขึ้น
 *   2. ชี้ว่าอาจมีสัญญาณความปลอดภัยที่คลังคำ (lexicon) จับไม่ได้ เช่น การเปรียบเปรย
 *
 * ขอบเขตที่ห้ามเด็ดขาด:
 *   ✗ ห้ามวินิจฉัยโรค
 *   ✗ ห้ามทำนายว่าใครจะก่อเหตุ
 *   ✗ ห้ามลดระดับที่กฎกำหนดไว้ (ใช้ค่า max เท่านั้น)
 *   ✗ ห้ามให้ผลของมันเป็นเหตุผลเดียวในการปิดเคส
 *
 * ถ้าเรียกไม่สำเร็จ ระบบต้องทำงานต่อได้ตามปกติ (fail-open ไปที่กฎ)
 */

import { config } from '../config.js';

const TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยของระบบดูแลช่วยเหลือนักเรียนในโรงเรียนไทย

หน้าที่ของคุณมีเพียง 2 อย่าง:
1. สรุปสิ่งที่นักเรียนเขียน เป็นข้อเท็จจริงสั้น ๆ ไม่เกิน 3 บรรทัด สำหรับให้ครูอ่านเร็วขึ้น
2. ระบุว่าข้อความมีสัญญาณด้านความปลอดภัยหรือไม่

ข้อห้ามเด็ดขาด:
- ห้ามวินิจฉัยโรคหรือระบุชื่อโรคจิตเวช
- ห้ามคาดเดาว่านักเรียนจะทำอะไรในอนาคต
- ห้ามตัดสินว่านักเรียนพูดจริงหรือโกหก
- ห้ามเพิ่มข้อมูลที่ไม่ได้อยู่ในข้อความ
- ถ้าไม่แน่ใจ ให้เลือกค่าที่ระมัดระวังกว่า (แจ้งเตือนเกินดีกว่าพลาด)

ตอบเป็น JSON เท่านั้น ตามรูปแบบนี้:
{
  "summary": "สรุปเชิงข้อเท็จจริง ไม่ตีความ",
  "signals": ["SUICIDE_INTENT" | "SELF_HARM" | "VIOLENCE_THREAT" | "ABUSE" | "BULLYING" | "SUBSTANCE" | "RUNAWAY" | "DISTRESS" | "HELP_SEEKING"],
  "suggestedMinLevel": 1 | 2 | 3 | 4,
  "uncertain": true | false,
  "quotesNeedingHumanRead": ["ข้อความต้นฉบับที่ครูควรอ่านเอง"]
}

เกณฑ์ suggestedMinLevel:
4 = มีสัญญาณอันตรายต่อชีวิตหรือความปลอดภัยเฉพาะหน้า
3 = มีความทุกข์ชัดเจนที่ควรได้พบผู้ใหญ่โดยเร็ว
2 = มีเรื่องที่ควรให้ครูตรวจสอบ
1 = ไม่พบสัญญาณในข้อความ`;

export function llmEnabled() {
  return config.llm.enabled && !!config.llm.apiKey;
}

/**
 * @param {string} text ข้อความอิสระที่นักเรียนเขียน
 * @returns {Promise<null | {summary:string, signals:string[], suggestedMinLevel:number, uncertain:boolean, quotesNeedingHumanRead:string[]}>}
 */
export async function analyzeText(text) {
  if (!llmEnabled()) return null;
  if (!text || text.trim().length < 10) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${config.llm.baseUrl}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.llm.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.llm.model,
        max_tokens: 700,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `ข้อความจากนักเรียน:\n"""\n${text.slice(0, 4000)}\n"""` }],
      }),
    });

    if (!res.ok) {
      console.warn('[llm] เรียกไม่สำเร็จ:', res.status);
      return null;
    }

    const data = await res.json();
    const raw = data?.content?.find((c) => c.type === 'text')?.text ?? '';
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;

    const parsed = JSON.parse(json);
    return {
      summary: String(parsed.summary ?? '').slice(0, 600),
      signals: Array.isArray(parsed.signals) ? parsed.signals.slice(0, 10) : [],
      // จำกัดช่วงและบังคับให้เป็นจำนวนเต็ม 1..4
      suggestedMinLevel: Math.min(4, Math.max(1, Math.round(Number(parsed.suggestedMinLevel) || 1))),
      uncertain: parsed.uncertain !== false,
      quotesNeedingHumanRead: Array.isArray(parsed.quotesNeedingHumanRead)
        ? parsed.quotesNeedingHumanRead.slice(0, 5).map((q) => String(q).slice(0, 300))
        : [],
    };
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[llm] ข้อผิดพลาด:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
