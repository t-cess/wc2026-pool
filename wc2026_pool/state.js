/* ===== state: app state ทั้งหมดในออบเจ็กต์เดียว =====
   เก็บใน object เดียวเพราะ ES module reassign ตัวแปร let ข้ามไฟล์ไม่ได้
   (อ่าน live ได้ แต่แก้ค่าได้เฉพาะโมดูลเจ้าของ) → ใช้ S.x แทน */
import { ROSTER, POOL_ID } from "./config.js";

export const S = {
  me: null,                                   // {uid,email,name,photo}
  matches: [], allMatches: [], allPreds: [], myPreds: {},
  visibility: { startFrom:0, hidden:[] },     // ต่อวง: เริ่มจากวันที่ + ซ่อนคู่ (matches=allMatches กรองแล้ว)
  carry: {}, champPicks: {}, configChampPicks: {}, tournament: {}, playersByName: {}, prev: {},
  emailByUid: {},                              // uid→email (PII · โหลดเฉพาะแอดมิน จาก emails/{uid} · non-admin ว่าง)
  admins: [], poolMeta: null, bind: {},        // admins ของวงนี้ · meta (ชื่อวง) · bind {email:ชื่อ} (แอดมินที่เป็นผู้เล่น)
  tab: "fixtures", filter: "open", filterTouched: false, dayKey: null, pickName: "", pickIsNew: false,   // dayKey = คืนแข่งที่เลือกอยู่ · pickIsNew = ผู้เล่นพิมพ์ชื่อใหม่เอง (self-register)
  expanded: {}, editing: {}, scorerStage: {},
  nowTs: Date.now(),
  adminSel: "", carryEdit: false, gameEdit: false, fp: null,
  // ----- หน้า "จัดการ" ข้ามวง (super) -----
  mgPool: null,    // code วงที่กำลังจัดการ (null = แสดงรายการวงทั้งหมด)
  mgList: null,    // [{code,name,count}] รายการวงจาก registry (null = ยังไม่โหลด)
  mgData: null,    // ข้อมูลวงที่เลือก {code,carry,configChampPicks,champPicks,tournament,admins,meta,bind,playersByName,preds}
  mgCarryEdit: false,
  mgNextSet: null, // พรีวิวคู่ชุดถัดไป (config/nextSet · auto-grade เขียนจาก ESPN) {key,fixtures:[{home,away,group,kickoff}]}
};

export function rosterNames(){
  const s=[...Object.keys(S.carry)];
  Object.keys(S.playersByName).forEach(n=>{ if(!s.includes(n)) s.push(n); });
  return s.length ? s : (POOL_ID ? [] : ROSTER);   // วงรอง carry ว่าง → [] (ไม่ยืมชื่อวงหลัก) · วงหลักเท่านั้น fallback ROSTER
}
