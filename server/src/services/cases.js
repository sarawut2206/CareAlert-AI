/**
 * บริการจัดการเคส — เชื่อมผลจากกลไกประเมิน เข้ากับ "คนที่ต้องรับผิดชอบ"
 *
 * กติกา:
 *  - นักเรียนหนึ่งคนมีเคสที่เปิดอยู่ได้ครั้งละหนึ่งเคส (ข้อมูลใหม่จะเข้าไปเพิ่มในเคสเดิม)
 *    เพื่อไม่ให้ครูเห็นเคสซ้ำซ้อนจนหาของจริงไม่เจอ
 *  - ระดับของเคส "ยกขึ้นได้" เสมอเมื่อมีข้อมูลใหม่ที่รุนแรงกว่า แต่ระบบไม่ลดระดับให้เอง
 *    การลดระดับต้องเป็นการตัดสินใจของมนุษย์และถูกบันทึกไว้
 *  - ทุกการเปลี่ยนแปลงถูกบันทึกใน case_events เพื่อให้ตรวจสอบย้อนหลังได้
 */

import { get, all, run, tx } from '../db.js';
import { computeDeadlines } from '../engine/sla.js';
import { notify } from './notify.js';

const ORIGIN_BY_SOURCE = {
  checkin: 'checkin',
  self_report: 'self_report',
  friend_report: 'friend_report',
  staff_note: 'staff_note',
};

/** เลือกผู้รับผิดชอบตามระดับ */
function pickOwner(level, studentId) {
  if (level >= 3) {
    const counselor = get(
      `SELECT id FROM users WHERE role = 'counselor' AND active = 1 ORDER BY id LIMIT 1`,
    );
    if (counselor) return counselor.id;
  }
  if (studentId) {
    const advisor = get(
      `SELECT c.advisor_user_id AS id FROM students s
         JOIN classrooms c ON c.id = s.classroom_id
        WHERE s.id = ? AND c.advisor_user_id IS NOT NULL`,
      [studentId],
    );
    if (advisor?.id) return advisor.id;
  }
  const fallback = get(
    `SELECT id FROM users WHERE role IN ('counselor','admin') AND active = 1 ORDER BY
       CASE role WHEN 'counselor' THEN 0 ELSE 1 END, id LIMIT 1`,
  );
  return fallback?.id ?? null;
}

/**
 * บันทึกผลประเมิน และเปิด/อัปเดตเคสถ้าจำเป็น
 * @returns {{assessmentId:number, caseId:number|null, escalated:boolean, created:boolean}}
 */
export function ingestAssessment({ sourceType, sourceId, studentId, subjectHint, source, result, actorUserId }) {
  return tx(() => {
    const ins = run(
      `INSERT INTO assessments
         (source_type, source_id, student_id, engine_version, level, concern_index,
          data_sufficiency, dimensions_json, flags_json, rationale_json, llm_used)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        sourceType, sourceId, studentId ?? null, result.engineVersion, result.level,
        result.concernIndex, result.dataSufficiency,
        JSON.stringify(result.dimensions),
        JSON.stringify({
          validation: result.validation.flags,
          lexicon: result.lexicon.categories,
          contextTags: result.contextTags,
          wantsContact: result.wantsContact,
          needsHumanRead: result.needsHumanRead,
        }),
        JSON.stringify(result.rationale),
        result.llm ? 1 : 0,
      ],
    );
    const assessmentId = Number(ins.lastInsertRowid);

    if (result.level < 2) {
      return { assessmentId, caseId: null, escalated: false, created: false };
    }

    // หาเคสที่เปิดอยู่ของนักเรียนคนนี้
    const existing = studentId
      ? get(`SELECT * FROM cases WHERE student_id = ? AND status != 'closed' ORDER BY id DESC LIMIT 1`, [studentId])
      : null;

    const origin = ORIGIN_BY_SOURCE[source] ?? 'checkin';

    if (existing) {
      const escalated = result.level > existing.level;
      if (escalated) {
        const d = computeDeadlines(result.level, result.actions);
        run(
          `UPDATE cases SET level = ?, peak_level = MAX(peak_level, ?),
                            acknowledge_due_at = ?, contact_due_at = ?,
                            owner_user_id = COALESCE(owner_user_id, ?),
                            status = CASE WHEN status = 'closed' THEN 'new' ELSE status END
             WHERE id = ?`,
          [result.level, result.level, d.acknowledgeDueAt, d.contactDueAt, pickOwner(result.level, studentId), existing.id],
        );
        addEvent(existing.id, 'escalate', actorUserId, `ยกระดับเป็น ${result.levelCode}`, {
          from: existing.level, to: result.level, decidingRules: result.rationale.decidingRules,
        });
      } else {
        addEvent(existing.id, 'note', actorUserId, 'มีข้อมูลใหม่เข้ามาในเคสนี้', {
          level: result.level, concernIndex: result.concernIndex, source,
        });
      }
      run('INSERT OR IGNORE INTO case_links (case_id, assessment_id) VALUES (?, ?)', [existing.id, assessmentId]);
      if (escalated) notify({ caseId: existing.id, level: result.level, kind: 'escalated', studentId });
      return { assessmentId, caseId: existing.id, escalated, created: false };
    }

    const d = computeDeadlines(result.level, result.actions);
    const owner = pickOwner(result.level, studentId);
    const caseIns = run(
      `INSERT INTO cases
         (student_id, subject_hint, origin, level, peak_level, status, owner_user_id,
          acknowledge_due_at, contact_due_at, next_followup_at, summary)
       VALUES (?,?,?,?,?, 'new', ?, ?,?,?,?)`,
      [
        studentId ?? null, subjectHint ?? null, origin, result.level, result.level, owner,
        d.acknowledgeDueAt, d.contactDueAt, d.nextFollowUpAt,
        result.rationale.matched.slice(0, 3).map((m) => m.label).join(' • '),
      ],
    );
    const caseId = Number(caseIns.lastInsertRowid);
    run('INSERT INTO case_links (case_id, assessment_id) VALUES (?, ?)', [caseId, assessmentId]);
    addEvent(caseId, 'opened', actorUserId, `เปิดเคสระดับ ${result.levelCode}`, {
      decidingRules: result.rationale.decidingRules,
      dataSufficiency: result.dataSufficiency,
    });

    notify({ caseId, level: result.level, kind: 'opened', studentId });
    return { assessmentId, caseId, escalated: false, created: true };
  });
}

export function addEvent(caseId, type, actorUserId, note, payload = {}) {
  run(
    `INSERT INTO case_events (case_id, type, actor_user_id, note, payload_json)
     VALUES (?,?,?,?,?)`,
    [caseId, type, actorUserId ?? null, note ?? null, JSON.stringify(payload)],
  );
}

/** ประวัติผลประเมินของนักเรียน (ใหม่→เก่า) ใช้เป็น baseline ให้กลไกประเมิน */
export function assessmentHistory(studentId, limit = 8) {
  if (!studentId) return [];
  return all(
    `SELECT id, level, concern_index, dimensions_json, data_sufficiency, created_at
       FROM assessments WHERE student_id = ? ORDER BY created_at DESC LIMIT ?`,
    [studentId, limit],
  );
}

/** ตรวจว่าเคสปิดได้หรือยัง — บังคับให้ครบตามวงจร Follow-up */
export function closeBlockers(row) {
  const blockers = [];
  if (!row.first_contact_at) blockers.push('ยังไม่ได้บันทึกว่าได้พูดคุยกับนักเรียนแล้ว');
  if (!row.safety_confirmed) blockers.push('ยังไม่ได้ยืนยันความปลอดภัยของนักเรียน');
  const actions = get(
    `SELECT COUNT(*) AS n FROM case_events WHERE case_id = ? AND type IN ('action','referral')`,
    [row.id],
  );
  if (!actions?.n) blockers.push('ยังไม่มีบันทึกการดำเนินการหรือการส่งต่อ');
  if (row.peak_level >= 4 && !row.guardian_informed) {
    blockers.push('เคยเป็นระดับ 4 — ต้องระบุผลการแจ้งผู้ปกครองหรือเหตุผลที่ไม่แจ้ง');
  }
  return blockers;
}
