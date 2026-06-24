/* ===== admin: เพิ่มคู่ / กรอกผล / แชมป์ / ป้าย / คะแนนยกมา / สมาชิก ===== */
import { S, rosterNames } from "./state.js";
import { db, doc, setDoc, updateDoc, deleteDoc, poolDoc } from "./firebase.js";   // matches → doc(db) top-level ใช้ร่วม · config/players/predictions → poolDoc แยกวง
import { TEAMS, fe, CHAMP_TEAMS, POOL_ID, genCode } from "./config.js";
import { $, esc, flag, avatarHTML, silhouetteHTML, bindAvatars, toast, isAdmin, isSuper, confirmModal, promptModal, openMenu } from "./utils.js";
import { stateOf } from "./scoring.js";

const TEAM_LIST = Object.keys(TEAMS).sort((a,b)=>a.localeCompare(b,"th"));
const teamOpts = sel => `<option value="">— เลือกทีม —</option>`+TEAM_LIST.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const champOptsC = sel => `<option value="">— เลือกทีม —</option>`+CHAMP_TEAMS.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const groupOpts = `<option value="">— กลุ่ม/รอบ —</option>`
  +["A","B","C","D","E","F","G","H","I","J","K","L"].map(g=>`<option value="กลุ่ม ${g}">กลุ่ม ${g}</option>`).join("")
  +["รอบ 32","รอบ 16","ก่อนรองฯ","รองชนะเลิศ","ชิงที่ 3","ชิงชนะเลิศ"].map(r=>`<option value="${r}">${r}</option>`).join("");
const roundOpts = `<option value="">— นัด —</option>`+["นัด 1","นัด 2","นัด 3"].map(r=>`<option value="${r}">${r}</option>`).join("");
const adminEmailOf=n=>{ const be=Object.entries(S.bind||{}).find(([e,nm])=>nm===n&&(S.admins||[]).includes(e)); if(be)return be[0];
  const pe=S.emailByUid[(S.playersByName[n]||{}).uid]; return (pe&&(S.admins||[]).includes(pe))?pe:null; };   // อีเมลแอดมินของสมาชิกชื่อนี้ (null=ไม่ใช่แอดมิน)
export function renderAdmin(){
  if(!isAdmin()) return; const box=$("#tab-admin");
  const regLocked=!!(S.tournament&&S.tournament.regLocked);
  const memberRows=rosterNames().map(n=>{ const p=S.playersByName[n]; const claimed=!!p; const admE=adminEmailOf(n);
    const admBadge=admE?` <span class="k" style="font-size:9px;color:#b9a6f0;border:1px solid #34294f;border-radius:5px;padding:1px 5px;vertical-align:middle;">แอดมิน</span>`:"";
    return `<div data-menu="${esc(n)}" style="display:flex;align-items:center;gap:9px;background:#14171D;border:1px solid #232830;border-radius:12px;padding:10px 12px;margin-bottom:7px;cursor:pointer;">${claimed?avatarHTML(p.photo,34):silhouetteHTML(34)}<div style="flex:1;min-width:0;"><div class="k" style="font-weight:700;">${esc(n)}${admBadge}</div><div style="font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${claimed?esc(S.emailByUid[p.uid]||"—"):"ยังไม่ล็อกอิน"} · ยกมา ${S.carry[n]||0}</div></div></div>`; }).join("")||`<div class="k" style="color:var(--dim);">ยังไม่มีสมาชิก</div>`;
  box.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin:0 4px 16px;"><h2 class="k" style="margin:0;font-weight:800;font-size:26px;">แอดมิน</h2><span class="k" style="font-weight:600;font-size:10px;letter-spacing:1px;color:#EF3E42;border:1px solid #5a2227;border-radius:6px;padding:3px 7px;">STAFF</span></div>
    ${isSuper()?`<div id="amManage" class="k" style="height:46px;display:flex;align-items:center;justify-content:center;border-radius:13px;border:1px solid #34294f;background:#161226;color:#cfc2f5;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:13px;">จัดการ (ทุกวง) ▸</div>`:""}
    <div style="background:#1a1410;border:1px solid #3a2f1e;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;color:var(--gold);margin-bottom:8px;">🏆 ทายแชมป์${S.tournament.picksLocked?'<span style="font-size:11px;color:#caa75a;font-weight:600;">🔒 ล็อก</span>':'<span style="font-size:11px;color:#5fcf94;font-weight:600;">เปิดให้ทาย</span>'}</div>
      <div class="k" style="font-size:12px;color:var(--mut);margin-bottom:10px;">ล็อก = สมาชิกแก้ทีมแชมป์ตัวเองไม่ได้ · (ตั้งผลแชมป์ / ทายแทนสมาชิก = หน้าจัดการ ของ super)</div>
      <div id="amLockPicks" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #3a2f1e;color:${S.tournament.picksLocked?'#5fcf94':'#caa75a'};font-weight:700;font-size:13px;cursor:pointer;">${S.tournament.picksLocked?'🔓 ปลดล็อกให้ทายแชมป์':'🔒 ล็อกการทายแชมป์'}</div></div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:8px;">🚪 รับสมัครสมาชิก${regLocked?'<span style="font-size:11px;color:#f0a3a8;font-weight:600;">🔒 ปิดรับ</span>':'<span style="font-size:11px;color:#5fcf94;font-weight:600;">เปิดรับ</span>'}</div>
      <div class="k" style="font-size:12px;color:var(--mut);margin-bottom:10px;">ปิดรับ = คนใหม่ login แล้วตั้งชื่อเองไม่ได้ (เฉพาะคนที่มีชื่ออยู่แล้วเข้าได้)</div>
      <div id="amLockReg" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #2A303A;color:${regLocked?'#5fcf94':'#f0a3a8'};font-weight:700;font-size:13px;cursor:pointer;">${regLocked?'🔓 เปิดรับสมัครอีกครั้ง':'🔒 ปิดรับสมัคร'}</div></div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;">
      <div class="k" style="font-weight:700;font-size:15px;margin-bottom:12px;">🧑‍🤝‍🧑 สมาชิก (${rosterNames().length}) <span style="font-size:11px;color:#5b626d;">· แตะเพื่อจัดการ</span></div>${memberRows}
      <div class="k" style="font-size:11px;color:var(--mut);margin:10px 0 0;">สมาชิกใหม่ login แล้วตั้งชื่อเองได้ (ตอนนี้${regLocked?'<b style="color:#f0a3a8;">ปิดรับ</b>':'<b style="color:#5fcf94;">เปิดรับ</b>'})</div></div>`;
  if($("#amManage")) $("#amManage").onclick=()=>{ location.href="manage.html"; };
  box.querySelectorAll("[data-menu]").forEach(el=>el.onclick=()=>adminMemberMenu(el, el.dataset.menu));
  if($("#amLockReg")) $("#amLockReg").onclick=async()=>{ const nv=!regLocked; await setDoc(poolDoc("config","tournament"),{regLocked:nv},{merge:true}); S.tournament.regLocked=nv; toast(nv?"ปิดรับสมัครแล้ว":"เปิดรับสมัครแล้ว ✓"); renderAdmin(); };
  $("#amLockPicks").onclick=async()=>{ const nv=!S.tournament.picksLocked; S.tournament.picksLocked=nv; await setDoc(poolDoc("config","tournament"),{picksLocked:nv},{merge:true}); toast(nv?"ล็อกแล้ว":"ปลดล็อกแล้ว"); renderAdmin(); };
  bindAvatars(box);
}

// เมนู ⋮ ของสมาชิก (admin · วงปัจจุบัน): เปลี่ยนชื่อ / แก้ยกมา / เตะ · admin ไม่auto-refresh → patch S เอง
function adminMemberMenu(anchor, n){
  const p=S.playersByName[n]; const uid=p&&p.uid; const admE=adminEmailOf(n);
  openMenu(anchor, [
    {label:"แก้คะแนนยกมา", onClick:async()=>{ const v=await promptModal(`คะแนนยกมาของ "${n}"`,{value:String(S.carry[n]||0),numeric:true}); if(v===null)return;
      const num=parseInt(v)||0; await setDoc(poolDoc("config","carry"),{[n]:num},{merge:true}); S.carry[n]=num; toast("บันทึกแล้ว ✓"); renderAdmin(); }},
    {label:"เตะออกจากวง", danger:true, onClick:async()=>{ if(admE&&!isSuper()){ toast("คนนี้เป็นแอดมิน — เฉพาะ super เตะได้"); return; }
      if(!await confirmModal(`เตะ "${n}" ออกจากวง?${admE?"\n(เป็นแอดมินด้วย — จะถอดแอดมินด้วย)":""}\nลบคะแนนยกมา + ปลดการจับคู่`))return;
      const c2={...S.carry}; delete c2[n]; await setDoc(poolDoc("config","carry"),c2);
      if(uid){ try{ await deleteDoc(poolDoc("players",uid)); }catch(e){} }
      if(admE){ const emails=(S.admins||[]).filter(e=>e!==admE); await setDoc(poolDoc("config","admins"),{emails}); S.admins=emails; const b2={...(S.bind||{})}; delete b2[admE]; await setDoc(poolDoc("config","bind"),b2); S.bind=b2; }
      delete S.carry[n]; delete S.playersByName[n]; toast("เตะแล้ว"); renderAdmin(); }},
  ], n);
}
