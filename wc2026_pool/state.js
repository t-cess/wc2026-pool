/* ===== state: app state ทั้งหมดในออบเจ็กต์เดียว =====
   เก็บใน object เดียวเพราะ ES module reassign ตัวแปร let ข้ามไฟล์ไม่ได้
   (อ่าน live ได้ แต่แก้ค่าได้เฉพาะโมดูลเจ้าของ) → ใช้ S.x แทน */
import { ROSTER } from "./config.js";

export const S = {
  me: null,                                   // {uid,email,name,photo}
  matches: [], allPreds: [], myPreds: {},
  carry: {}, champPicks: {}, tournament: {}, playersByName: {}, prev: {},
  tab: "fixtures", filter: "open", pickName: "",
  expanded: {}, editing: {}, scorerStage: {},
  nowTs: Date.now(),
  adminSel: "", carryEdit: false, gameEdit: false, fp: null,
};

export function rosterNames(){
  const s=[...Object.keys(S.carry)];
  Object.keys(S.playersByName).forEach(n=>{ if(!s.includes(n)) s.push(n); });
  return s.length?s:ROSTER;
}
