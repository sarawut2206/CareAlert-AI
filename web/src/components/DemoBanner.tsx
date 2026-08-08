import { useState } from 'react';

/**
 * แถบเตือนโหมดสาธิต
 *
 * ต้องมองเห็นตลอดเวลาและปิดถาวรไม่ได้ (ย่อได้อย่างเดียว) เพราะหน้านี้หน้าตาเหมือน
 * ช่องทางขอความช่วยเหลือจริง ถ้ามีนักเรียนที่กำลังลำบากจริงหลงเข้ามา
 * เขาต้องรู้ทันทีว่าไม่มีใครได้รับข้อความของเขา และต้องเห็นเบอร์ที่โทรได้จริง
 */
export function DemoBanner() {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{ ...bar, cursor: 'pointer', border: 0, width: '100%', textAlign: 'left', padding: '.35rem 1rem' }}
      >
        <strong>โหมดสาธิต</strong> — ข้อมูลไม่ถูกส่งถึงใคร · แตะเพื่ออ่านเพิ่ม
      </button>
    );
  }

  return (
    <div style={bar}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.2rem', lineHeight: 1.2 }} aria-hidden>⚠️</span>
        <div style={{ flex: 1 }}>
          <strong>นี่คือหน้าสาธิต ไม่ใช่ระบบจริงของโรงเรียนใด</strong>
          <div style={{ fontSize: '.85rem', lineHeight: 1.55, marginTop: '.15rem' }}>
            ข้อมูลทั้งหมดเป็นข้อมูลสมมติ ทำงานอยู่ในเบราว์เซอร์ของคุณเท่านั้น
            ไม่ถูกส่งออกไปที่ใด และ<strong>ไม่มีครูคนใดได้รับข้อความที่กรอกที่นี่</strong>
            <br />
            <strong>ถ้าคุณต้องการความช่วยเหลือจริง</strong> — โทร{' '}
            <a href="tel:1323" style={link}>1323</a> สายด่วนสุขภาพจิต (24 ชม.) ·{' '}
            <a href="tel:1669" style={link}>1669</a> ฉุกเฉิน ·{' '}
            <a href="tel:1300" style={link}>1300</a> ศูนย์ช่วยเหลือสังคม
          </div>
        </div>
        <button onClick={() => setCollapsed(true)} style={closeBtn} aria-label="ย่อแถบเตือน">ย่อ</button>
      </div>
    </div>
  );
}

const bar: React.CSSProperties = {
  background: '#7a1410',
  color: '#fff',
  padding: '.6rem 1rem',
  fontSize: '.92rem',
  position: 'sticky',
  top: 0,
  zIndex: 60,
};

const link: React.CSSProperties = { color: '#ffd9a0', fontWeight: 700, textDecoration: 'underline' };

const closeBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,.18)', border: 0, color: '#fff',
  borderRadius: 999, padding: '.2rem .7rem', fontSize: '.8rem', flex: 'none',
};
