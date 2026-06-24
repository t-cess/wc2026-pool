/* ===== admin: เพิ่มคู่ / กรอกผล / แชมป์ / ป้าย / คะแนนยกมา / สมาชิก ===== */
import { S, rosterNames } from "./state.js";
import { db, doc, setDoc, updateDoc, deleteDoc, poolDoc } from "./firebase.js";   // matches → doc(db) top-level ใช้ร่วม · config/players/predictions → poolDoc แยกวง
import { TEAMS, fe, CHAMP_TEAMS, POOL_ID, genCode } from "./config.js";
import { $, esc, flag, avatarHTML, silhouetteHTML, bindAvatars, toast, isAdmin, isSuper } from "./utils.js";
import { stateOf } from "./scoring.js";

const TEAM_LIST = Object.keys(TEAMS).sort((a,b)=>a.localeCompare(b,"th"));
const teamOpts = sel => `<option value="">— เลือกทีม —</option>`+TEAM_LIST.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const champOptsC = sel => `<option value="">— เลือกทีม —</option>`+CHAMP_TEAMS.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const groupOpts = `<option value="">— กลุ่ม/รอบ —</option>`
  +["A","B","C","D","E","F","G","H","I","J","K","L"].map(g=>`<option value="กลุ่ม ${g}">กลุ่ม ${g}</option>`).join("")
  +["รอบ 32","รอบ 16","ก่อนรองฯ","รองชนะเลิศ","ชิงที่ 3","ชิงชนะเลิศ"].map(r=>`<option value="${r}">${r}</option>`).join("");
const roundOpts = `<option value="">— นัด —</option>`+["นัด 1","นัด 2","นัด 3"].map(r=>`<option value="${r}">${r}</option>`).join("");
export function renderAdmin(){
  if(!isAdmin()) return; const box=$("#tab-admin");
  const regLocked=!!(S.tournament&&S.tournament.regLocked);
  const carryRows=rosterNames().map(n=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><div class="k" style="flex:1;font-weight:600;">${esc(n)}</div><input data-carry="${esc(n)}" class="field" inputmode="numeric" value="${S.carry[n]||0}" ${S.carryEdit?"":"disabled"} style="width:90px;height:36px;text-align:center;${S.carryEdit?"":"opacity:.5;"}"></div>`).join("");
  const adminEmailOf=n=>{ const be=Object.entries(S.bind||{}).find(([e,nm])=>nm===n&&(S.admins||[]).includes(e)); if(be)return be[0];
    const pe=S.playersByName[n]&&S.playersByName[n].email; return (pe&&(S.admins||[]).includes(pe))?pe:null; };   // อีเมลแอดมินของสมาชิกชื่อนี้ (null=ไม่ใช่แอดมิน)
  const memberRows=rosterNames().map(n=>{ const p=S.playersByName[n]; const claimed=!!p; const admE=adminEmailOf(n);
    const admBadge=admE?`<span class="k" style="font-size:10px;color:#b9a6f0;background:#1c1733;border:1px solid #34294f;padding:3px 8px;border-radius:99px;">แอดมิน</span>`:"";
    const delBtn=(!admE||isSuper())?`<div data-delmem="${esc(n)}" class="k" style="cursor:pointer;color:#EF3E42;font-size:12px;font-weight:700;padding:5px 9px;border:1px solid #5a2227;border-radius:8px;">ลบ</div>`:`<span class="k" style="font-size:14px;color:#5b626d;padding:5px 4px;" title="ถอดแอดมินก่อน (เฉพาะ super)">🔒</span>`;
    return `<div style="display:flex;align-items:center;gap:8px;background:#14171D;border:1px solid #232830;border-radius:12px;padding:10px 12px;margin-bottom:7px;">${claimed?avatarHTML(p.photo,34):silhouetteHTML(34)}<div style="flex:1;min-width:0;"><div class="k" style="font-weight:700;">${esc(n)}</div><div style="font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${claimed?esc(p.email||""):"ยังไม่ล็อกอิน"}</div></div>${admBadge}${claimed?`<span class="k" style="font-size:10px;color:#5fcf94;background:#10301f;padding:3px 8px;border-radius:99px;">เข้าแล้ว</span>`:`<span class="k" style="font-size:10px;color:#5b626d;">รอเข้า</span>`}${delBtn}</div>`; }).join("")||`<div class="k" style="color:var(--dim);">ยังไม่มีสมาชิก</div>`;
  box.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin:0 4px 16px;"><h2 class="k" style="margin:0;font-weight:800;font-size:26px;">แอดมิน</h2><span class="k" style="font-weight:600;font-size:10px;letter-spacing:1px;color:#EF3E42;border:1px solid #5a2227;border-radius:6px;padding:3px 7px;">STAFF</span></div>
    <div style="background:#1a1410;border:1px solid #3a2f1e;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;color:var(--gold);margin-bottom:8px;">🏆 ทายแชมป์${S.tournament.picksLocked?'<span style="font-size:11px;color:#caa75a;font-weight:600;">🔒 ล็อก</span>':'<span style="font-size:11px;color:#5fcf94;font-weight:600;">เปิดให้ทาย</span>'}</div>
      <div class="k" style="font-size:12px;color:var(--mut);margin-bottom:10px;">ล็อก = สมาชิกแก้ทีมแชมป์ตัวเองไม่ได้ · (ตั้งผลแชมป์ / ทายแทนสมาชิก = หน้าจัดการ ของ super)</div>
      <div id="amLockPicks" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #3a2f1e;color:${S.tournament.picksLocked?'#5fcf94':'#caa75a'};font-weight:700;font-size:13px;cursor:pointer;">${S.tournament.picksLocked?'🔓 ปลดล็อกให้ทายแชมป์':'🔒 ล็อกการทายแชมป์'}</div></div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;margin-bottom:10px;">🏷️ ป้ายชุด (คืน→เช้า)</div>
      <input id="amBatch" class="field" placeholder="เช่น ชุดล่าสุด · คืน 24 → เช้า 25 มิ.ย." value="${esc(S.tournament.batchLabel||"")}" style="margin-bottom:8px;">
      <div id="amSaveBatch" class="k btnG" style="height:42px;font-size:14px;">บันทึกป้าย</div></div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:12px;">⭐ คะแนนยกมา (ฐานตั้งต้น)${S.carryEdit?'<span style="font-size:11px;color:#5fcf94;font-weight:600;">โหมดแก้ไข</span>':'<span style="font-size:11px;color:#5b626d;font-weight:600;">🔒 ล็อก</span>'}</div>${carryRows}
      ${S.carryEdit?`<div id="acSave" class="k btnG" style="height:42px;font-size:14px;margin-top:6px;">บันทึกคะแนนยกมา</div>`:`<div id="acEdit" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;font-size:13px;margin-top:6px;border-radius:11px;border:1px solid #2A303A;color:#8A929E;cursor:pointer;">🔓 แตะเพื่อแก้ไข</div>`}</div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:8px;">🚪 รับสมัครสมาชิก${regLocked?'<span style="font-size:11px;color:#f0a3a8;font-weight:600;">🔒 ปิดรับ</span>':'<span style="font-size:11px;color:#5fcf94;font-weight:600;">เปิดรับ</span>'}</div>
      <div class="k" style="font-size:12px;color:var(--mut);margin-bottom:10px;">ปิดรับ = คนใหม่ login แล้วตั้งชื่อเองไม่ได้ (เฉพาะคนที่มีชื่ออยู่แล้วเข้าได้)</div>
      <div id="amLockReg" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #2A303A;color:${regLocked?'#5fcf94':'#f0a3a8'};font-weight:700;font-size:13px;cursor:pointer;">${regLocked?'🔓 เปิดรับสมัครอีกครั้ง':'🔒 ปิดรับสมัคร'}</div></div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;">
      <div class="k" style="font-weight:700;font-size:15px;margin-bottom:12px;">🧑‍🤝‍🧑 สมาชิก (${rosterNames().length})</div>${memberRows}
      <div class="k" style="font-size:11px;color:var(--mut);margin:10px 0 0;">สมาชิกใหม่ login แล้วตั้งชื่อเองได้ (ตอนนี้${regLocked?'<b style="color:#f0a3a8;">ปิดรับ</b>':'<b style="color:#5fcf94;">เปิดรับ</b>'}) · แก้คะแนนยกมาที่ช่องด้านบน · ลบสมาชิกที่ปุ่มลบ</div></div>`;
  box.querySelectorAll("[data-delmem]").forEach(el=>el.onclick=async()=>{ const n=el.dataset.delmem; const admE=adminEmailOf(n);
    if(admE&&!isSuper()){ toast("คนนี้เป็นแอดมิน — เฉพาะ super ลบได้"); return; }   // แอดมินลบกันเองไม่ได้
    if(!confirm(`ลบสมาชิก "${n}"?${admE?" (เป็นแอดมินด้วย — จะถอดแอดมิน + ปลดผูกอีเมล)":""} (ลบคะแนนยกมา + ปลดการจับคู่)`))return;
    const c2={...S.carry}; delete c2[n]; await setDoc(poolDoc("config","carry"),c2);  // ไม่ merge = ลบ key
    const p=S.playersByName[n]; if(p&&p.uid){ try{ await deleteDoc(poolDoc("players",p.uid)); }catch(e){} }
    if(admE){   // เป็นแอดมิน → ถอด admins + ลบ bind (ไม่งั้น login แล้ว auto-claim กลับมา)
      const emails=(S.admins||[]).filter(e=>e!==admE); await setDoc(poolDoc("config","admins"),{emails}); S.admins=emails;
      const b2={...(S.bind||{})}; delete b2[admE]; await setDoc(poolDoc("config","bind"),b2); S.bind=b2;
    }
    delete S.carry[n]; delete S.playersByName[n];
    toast("ลบสมาชิกแล้ว"); renderAdmin(); });
  if($("#amLockReg")) $("#amLockReg").onclick=async()=>{ const nv=!regLocked; await setDoc(poolDoc("config","tournament"),{regLocked:nv},{merge:true}); S.tournament.regLocked=nv; toast(nv?"ปิดรับสมัครแล้ว":"เปิดรับสมัครแล้ว ✓"); renderAdmin(); };
  if($("#acEdit")) $("#acEdit").onclick=()=>{ S.carryEdit=true; renderAdmin(); };
  if($("#acSave")) $("#acSave").onclick=async()=>{ if(!confirm("บันทึกคะแนนยกมาใหม่? (กระทบยอดรวมทุกคน)"))return; const c2={...(S.carry||{})}; box.querySelectorAll("[data-carry]").forEach(i=>{c2[i.dataset.carry]=parseInt(i.value)||0;}); await setDoc(poolDoc("config","carry"),c2,{merge:true}); Object.assign(S.carry,c2); S.carryEdit=false; toast("บันทึกคะแนนยกมาแล้ว"); renderAdmin(); };
  $("#amLockPicks").onclick=async()=>{ const nv=!S.tournament.picksLocked; S.tournament.picksLocked=nv; await setDoc(poolDoc("config","tournament"),{picksLocked:nv},{merge:true}); toast(nv?"ล็อกแล้ว":"ปลดล็อกแล้ว"); renderAdmin(); };
  $("#amSaveBatch").onclick=async()=>{ await setDoc(poolDoc("config","tournament"),{batchLabel:$("#amBatch").value.trim()},{merge:true}); toast("บันทึกป้ายแล้ว"); };
  bindAvatars(box);
}
