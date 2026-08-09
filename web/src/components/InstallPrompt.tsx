import { useEffect, useState } from 'react';

/**
 * ชวนติดตั้งเป็นแอปบนมือถือ
 *
 * - Android/Chrome: ใช้ beforeinstallprompt → กดปุ่มเดียวติดตั้งได้เลย
 * - iPhone/iPad: Safari ไม่มี event นี้ → แสดงวิธีทำ 2 ขั้นแทน
 * - ถ้าเปิดจากแอปที่ติดตั้งแล้ว (standalone) ไม่แสดงอะไรเลย
 * - ผู้ใช้กดปิดแล้วจะไม่ถามซ้ำอีก (จำไว้ใน localStorage)
 */

const DISMISS_KEY = 'carealert.installDismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [showIos, setShowIos] = useState(false);
  const [hidden, setHidden] = useState(
    () => isStandalone() || localStorage.getItem(DISMISS_KEY) === '1',
  );

  useEffect(() => {
    if (hidden) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if (isIos() && !isStandalone()) setShowIos(true);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [hidden]);

  if (hidden || (!deferred && !showIos)) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') setHidden(true);
    setDeferred(null);
  }

  return (
    <div className="card" style={{ borderColor: '#c9dcf5', background: 'var(--blue-50)' }}>
      <div className="row between" style={{ gap: '.6rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <strong>📱 ติดตั้งเป็นแอปบนมือถือได้</strong>
          <p className="small muted" style={{ margin: '.2rem 0 0' }}>
            {deferred
              ? 'เปิดเร็วขึ้น มีไอคอนบนหน้าจอ และหน้าสายด่วนใช้ได้แม้เน็ตหลุด'
              : 'บน iPhone: กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศร) แล้วเลือก “เพิ่มลงไปยังหน้าจอโฮม”'}
          </p>
        </div>
        <div className="row" style={{ gap: '.4rem', flex: 'none' }}>
          {deferred && <button className="btn sm" onClick={install}>ติดตั้ง</button>}
          <button className="btn ghost sm" onClick={dismiss}>ไม่เป็นไร</button>
        </div>
      </div>
    </div>
  );
}
