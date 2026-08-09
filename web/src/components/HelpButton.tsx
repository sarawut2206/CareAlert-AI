import { useEffect, useState } from 'react';
import { api } from '../api';
import { Modal } from './ui';

type Helpline = {
  id: string; name: string; phone: string; org: string; hours: string; for: string; priority: number;
};
type SchoolContact = { label: string; detail: string };

/**
 * ปุ่มขอความช่วยเหลือ — ต้องเข้าถึงได้จากทุกหน้าจอของนักเรียนภายในหนึ่งการกด
 * และต้องใช้งานได้แม้ยังไม่ล็อกอิน
 */
export function HelpButton() {
  // shortcut "ขอความช่วยเหลือ" จากไอคอนแอปเปิดมาพร้อม ?help=1 — ให้เด้งหน้าช่วยเหลือทันที
  const [open, setOpen] = useState(
    () => new URLSearchParams(window.location.search).get('help') === '1',
  );
  const [lines, setLines] = useState<Helpline[]>([]);
  const [school, setSchool] = useState<SchoolContact[]>([]);

  useEffect(() => {
    if (!open || lines.length) return;
    api<{ helplines: Helpline[]; school: SchoolContact[] }>('/meta/help')
      .then((d) => { setLines(d.helplines ?? []); setSchool(d.school ?? []); })
      .catch(() => { /* ถ้าโหลดไม่ได้ ยังแสดงเบอร์สำรองด้านล่างได้ */ });
  }, [open, lines.length]);

  return (
    <>
      <button className="help-fab" onClick={() => setOpen(true)}>
        <span aria-hidden>🆘</span> ขอความช่วยเหลือ
      </button>

      {open && (
        <Modal title="ขอความช่วยเหลือ" onClose={() => setOpen(false)}>
          <p className="small muted">
            โทรได้ทันที ฟรี และไม่ต้องบอกชื่อก็ได้ ถ้าตอนนี้มีอันตรายเฉพาะหน้า ให้โทร 1669 หรือ 191 ก่อน
          </p>

          {(lines.length ? lines : FALLBACK).map((l) => (
            <a key={l.id} className="helpline" href={`tel:${l.phone.replace(/-/g, '')}`}>
              <span>
                <strong>{l.name}</strong>
                <br />
                <span className="small muted">{l.org} · {l.hours}</span>
                <br />
                <span className="small">{l.for}</span>
              </span>
              <span className="num">{l.phone}</span>
            </a>
          ))}

          {school.length > 0 && (
            <>
              <h3 style={{ marginTop: '1rem' }}>ในโรงเรียน</h3>
              {school.map((c, i) => (
                <div key={i} className="card" style={{ marginBottom: '.5rem', padding: '.7rem' }}>
                  <strong>{c.label}</strong>
                  <div className="small muted">{c.detail}</div>
                </div>
              ))}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

// เบอร์สำรอง เผื่อเรียก API ไม่ได้ (เช่น เน็ตโรงเรียนล่ม) — ห้ามให้หน้านี้ว่างเปล่าเด็ดขาด
const FALLBACK: Helpline[] = [
  { id: 'f1', name: 'สายด่วนสุขภาพจิต', phone: '1323', org: 'กรมสุขภาพจิต', hours: 'ตลอด 24 ชั่วโมง', for: 'เครียด เศร้า อยากปรึกษา', priority: 1 },
  { id: 'f2', name: 'การแพทย์ฉุกเฉิน', phone: '1669', org: 'สพฉ.', hours: 'ตลอด 24 ชั่วโมง', for: 'มีอันตรายต่อชีวิต', priority: 1 },
  { id: 'f3', name: 'ตำรวจ', phone: '191', org: 'สำนักงานตำรวจแห่งชาติ', hours: 'ตลอด 24 ชั่วโมง', for: 'มีอันตรายเฉพาะหน้า', priority: 1 },
  { id: 'f4', name: 'ศูนย์ช่วยเหลือสังคม', phone: '1300', org: 'กระทรวง พม.', hours: 'ตลอด 24 ชั่วโมง', for: 'ถูกทำร้าย คุ้มครองเด็ก', priority: 2 },
];
