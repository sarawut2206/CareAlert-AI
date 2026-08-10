/**
 * Service Worker ของ CareAlert AI
 *
 * เป้าหมายด้านความปลอดภัย (สำคัญกว่าความเร็ว):
 *  1. หน้าแอปและ "ข้อมูลสายด่วน" ต้องเปิดได้แม้ออฟไลน์ —
 *     นักเรียนที่ต้องการความช่วยเหลือตอนตีสองบนเน็ตที่หลุด ๆ ต้องยังเห็นเบอร์ 1323
 *  2. ห้าม cache ข้อมูลเคสหรือคิวของครูเด็ดขาด —
 *     ครูที่เห็นคิวเก่าค้างอาจพลาดเคสระดับ 4 ที่เพิ่งเข้ามา อันตรายกว่าหน้าโหลดช้า
 *  3. ห้ามแตะคำขอเขียนข้อมูล (POST/PUT/DELETE) ทุกกรณี
 *
 * ทำงานแบบ relative กับ scope จึงใช้ได้ทั้งบนเซิร์ฟเวอร์จริง (/) และ GitHub Pages (/CareAlert-AI/)
 */

const CACHE = 'carealert-v1';

// เส้นทาง API เดียวที่อนุญาตให้ cache — ข้อมูลสายด่วนเปลี่ยนแทบไม่เคยเปลี่ยน และจำเป็นตอนออฟไลน์
const CACHEABLE_API = /\/api\/meta\/help$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // ข้อ 3: อ่านอย่างเดียวเท่านั้น
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // การนำทาง (เปิดหน้า): เอาของสดก่อน ถ้าออฟไลน์ค่อยใช้ shell ที่เก็บไว้
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  // API: ปล่อยผ่านตรงทั้งหมด ยกเว้นข้อมูลสายด่วน (ข้อ 2)
  if (url.pathname.includes('/api/')) {
    if (CACHEABLE_API.test(url.pathname)) {
      event.respondWith(
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => caches.match(request)),
      );
    }
    return;
  }

  // ไฟล์นิ่ง (js/css/รูป/ฟอนต์): ใช้ของใน cache ก่อนเพื่อความเร็ว แล้วอัปเดตเบื้องหลัง
  if (['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const refresh = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached ?? refresh;
      }),
    );
  }
});
