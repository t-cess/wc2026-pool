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
  // ----- หน้า "จัดการ" standalone (manage.html · super · ทุกวงพร้อมกัน) -----
  mgPools: [],     // ทุกวง: [{code,name,carry,admins,champPicks,configChampPicks,tournament,bind,playersByName,emailByUid,preds,meta}]
  mgTab: "pools",  // แท็บปัจจุบัน: pools | scores | champ | matches
  mgMatchSel: "",  // คู่ที่เลือกในแท็บสกอร์ (matchId)
  mgChampPool: "", mgChampName: "",   // แท็บแชมป์: วง + สมาชิกที่เลือก
  mgCarryEdit: {}, // {code:true} โหมดแก้คะแนนยกมาของวงนั้น
  mgNextSet: null, // พรีวิวคู่ชุดถัดไป (config/nextSet · auto-grade เขียนจาก ESPN) {key,fixtures:[{home,away,group,kickoff}]}
};

export function rosterNames(){
  const s=[...Object.keys(S.carry)];
  Object.keys(S.playersByName).forEach(n=>{ if(!s.includes(n)) s.push(n); });
  return s.length ? s : (POOL_ID ? [] : ROSTER);   // วงรอง carry ว่าง → [] (ไม่ยืมชื่อวงหลัก) · วงหลักเท่านั้น fallback ROSTER
}
