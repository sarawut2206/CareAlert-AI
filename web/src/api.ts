const TOKEN_KEY = 'carealert.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Options = { method?: string; body?: unknown };

export async function api<T = any>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data: any = null;
  try { data = await res.json(); } catch { /* ตอบกลับไม่ใช่ JSON */ }

  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data?.error ?? 'เชื่อมต่อระบบไม่สำเร็จ', data?.code);
  }
  return data as T;
}

/** แปลงวันเวลาจากฐานข้อมูล (UTC) เป็นข้อความภาษาไทย */
export function thaiDateTime(sql?: string | null, withTime = true) {
  if (!sql) return '—';
  const d = new Date(`${sql.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** เวลาที่เหลือก่อนถึงกำหนด เช่น "เหลือ 3 ชม." หรือ "เกินกำหนด 2 ชม." */
export function timeLeft(sql?: string | null) {
  if (!sql) return '';
  const due = new Date(`${sql.replace(' ', 'T')}Z`).getTime();
  const diff = due - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const text = mins < 60 ? `${mins} นาที`
    : mins < 60 * 24 ? `${Math.round(mins / 60)} ชม.`
    : `${Math.round(mins / 1440)} วัน`;
  return diff >= 0 ? `เหลือ ${text}` : `เกินกำหนด ${text}`;
}
