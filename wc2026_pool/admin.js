/* ===== admin: เพิ่มคู่ / กรอกผล / แชมป์ / ป้าย / คะแนนยกมา / สมาชิก ===== */
import { S, rosterNames } from "./state.js";
import { db, doc, setDoc, updateDoc, deleteDoc, poolDoc } from "./firebase.js";   // matches → doc(db) top-level ใช้ร่วม · config/players/predictions → poolDoc แยกวง
import { TEAMS, fe, CHAMP_TEAMS, POOL_ID, genCode } from "./config.js";
import { $, esc, flag, avatarHTML, silhouetteHTML, bindAvatars, toast, isAdmin, isSuper } from "./utils.js";
import { stateOf } from "./scoring.js";

async function commitScorers(matchId){   // เขียนคนยิงที่ติ๊กค้างไว้ ลง DB · stage: 0=ไม่มี 1=คนแรก 2=คนสอง
  const preds=S.allPreds.filter(p=>p.matchId===matchId);
  for(const p of preds){ const pid=`${p.matchId}__${p.uid}`;
    if(pid in S.scorerStage){ const v=S.scorerStage[pid];
      const s1=v===1, s2=v===2, ok=v!==0, s1played=(v!==2);   // คนสองได้ = คนแรกไม่ได้ลง
      try{ await setDoc(poolDoc("predictions",pid),{scorerOk:ok,s1hit:s1,s2hit:s2,s1played,scorerManual:true},{merge:true}); }catch(e){ toast("คนยิงบันทึกไม่ได้ (Rules?)"); }   // scorerManual = auto จะไม่ทับ
      delete S.scorerStage[pid]; } }
}
const TEAM_LIST = Object.keys(TEAMS).sort((a,b)=>a.localeCompare(b,"th"));
const teamOpts = sel => `<option value="">— เลือกทีม —</option>`+TEAM_LIST.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const champOptsC = sel => `<option value="">— เลือกทีม —</option>`+CHAMP_TEAMS.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const groupOpts = `<option value="">— กลุ่ม/รอบ —</option>`
  +["A","B","C","D","E","F","G","H","I","J","K","L"].map(g=>`<option value="กลุ่ม ${g}">กลุ่ม ${g}</option>`).join("")
  +["รอบ 32","รอบ 16","ก่อนรองฯ","รองชนะเลิศ","ชิงที่ 3","ชิงชนะเลิศ"].map(r=>`<option value="${r}">${r}</option>`).join("");
const roundOpts = `<option value="">— นัด —</option>`+["นัด 1","นัด 2","นัด 3"].map(r=>`<option value="${r}">${r}</option>`).join("");
export function renderAdmin(){
  if(!isAdmin()) return; const box=$("#tab-admin");
  const gradeable=S.matches.filter(m=>stateOf(m)!=="open");   // เฉพาะคู่ที่ปิดรับ/จบ
  const opts=gradeable.map(m=>`<option value="${m.id}" ${m.id===S.adminSel?"selected":""}>${esc(m.home)} vs ${esc(m.away)} ${m.status==="finished"?`(จบ ${m.homeScore}-${m.awayScore})`:"(ปิดรับ)"}</option>`).join("");
  const selM=gradeable.find(m=>m.id===S.adminSel)||gradeable[0]; S.adminSel=selM?selM.id:"";
  const glocked=!!(selM&&selM.status==="finished"&&!S.gameEdit);   // จบเกมแล้ว = ล็อก จนกว่ากดแก้ไข
  let gradeRows="";
  if(selM){ const preds=S.allPreds.filter(p=>p.matchId===selM.id);
    gradeRows=preds.length?preds.map(p=>{ const zero=p.homeScore===0&&p.awayScore===0; const pid=`${p.matchId}__${p.uid}`;
      const stage=(pid in S.scorerStage)?S.scorerStage[pid]:(p.scorerOk?(p.s1hit?1:2):0);   // 0/1/2 — ตามที่ได้แต้มจริง (scorerOk) ไม่ใช่ s2hit ดิบ
      const nm=(t,on)=>`<span style="color:${on?'#5fcf94':'var(--mut)'};${on?'font-weight:700;':''}">${esc(t)}</span>`;
      const scTxt = `${p.scorer1?nm(p.scorer1,stage===1):""}${p.scorer1&&p.scorer2?' <span style="color:#3f454e;">/</span> ':""}${p.scorer2?nm(p.scorer2,stage===2):""}`||"(ไม่ใส่คนยิง)";
      const btn=(n)=>`<div data-pick="${pid}:${n}" class="k" style="cursor:pointer;flex:none;font-weight:800;font-size:13px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:${stage===n?"#10301f":"#23272f"};color:${stage===n?"#5fcf94":"#8A929E"};border:1px solid ${stage===n?"#1f5a39":"#333"};">${n}</div>`;
      const tick = zero ? `<span class="k" style="font-size:11px;color:#5b626d;flex:none;">0-0</span>`
        : glocked ? `<span class="k" style="flex:none;font-weight:700;font-size:12px;color:${stage?"#5fcf94":"#5b626d"};">${stage===1?"✓ คน1":stage===2?"✓ คน2":"—"}</span>`
        : `<div style="display:flex;gap:5px;flex:none;">${p.scorer1?btn(1):""}${p.scorer2?btn(2):""}</div>`;
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #1c2129;"><div class="k" style="width:48px;flex:none;font-weight:600;font-size:13px;">${esc(p.player)}</div><div class="k" style="width:36px;flex:none;font-weight:700;">${p.homeScore}-${p.awayScore}</div><div style="flex:1;min-width:0;font-size:12px;word-break:break-word;line-height:1.3;">${scTxt}</div>${tick}</div>`; }).join(""):`<div class="k" style="color:var(--dim);padding:10px;">ยังไม่มีคนส่งโพยคู่นี้</div>`;
  }
  const stBtn=`width:40px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:#283042;color:#EEF1F4;font-size:24px;font-weight:700;cursor:pointer;user-select:none;flex:none;`;
  const stInp=`width:48px;height:44px;text-align:center;font-family:'Kanit';font-weight:800;font-size:22px;color:#EEF1F4;background:#0E1116;border:1px solid #2A303A;border-radius:10px;flex:none;`;
  const carryRows=rosterNames().map(n=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><div class="k" style="flex:1;font-weight:600;">${esc(n)}</div><input data-carry="${esc(n)}" class="field" inputmode="numeric" value="${S.carry[n]||0}" ${S.carryEdit?"":"disabled"} style="width:90px;height:36px;text-align:center;${S.carryEdit?"":"opacity:.5;"}"></div>`).join("");
  const adminEmailOf=n=>{ const be=Object.entries(S.bind||{}).find(([e,nm])=>nm===n&&(S.admins||[]).includes(e)); if(be)return be[0];
    const pe=S.playersByName[n]&&S.playersByName[n].email; return (pe&&(S.admins||[]).includes(pe))?pe:null; };   // อีเมลแอดมินของสมาชิกชื่อนี้ (null=ไม่ใช่แอดมิน)
  const memberRows=rosterNames().map(n=>{ const p=S.playersByName[n]; const claimed=!!p; const admE=adminEmailOf(n);
    const admBadge=admE?`<span class="k" style="font-size:10px;color:#b9a6f0;background:#1c1733;border:1px solid #34294f;padding:3px 8px;border-radius:99px;">แอดมิน</span>`:"";
    const delBtn=(!admE||isSuper())?`<div data-delmem="${esc(n)}" class="k" style="cursor:pointer;color:#EF3E42;font-size:12px;font-weight:700;padding:5px 9px;border:1px solid #5a2227;border-radius:8px;">ลบ</div>`:`<span class="k" style="font-size:14px;color:#5b626d;padding:5px 4px;" title="ถอดแอดมินก่อน (เฉพาะ super)">🔒</span>`;
    return `<div style="display:flex;align-items:center;gap:8px;background:#14171D;border:1px solid #232830;border-radius:12px;padding:10px 12px;margin-bottom:7px;">${claimed?avatarHTML(p.photo,34):silhouetteHTML(34)}<div style="flex:1;min-width:0;"><div class="k" style="font-weight:700;">${esc(n)}</div><div style="font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${claimed?esc(p.email||""):"ยังไม่ล็อกอิน"}</div></div>${admBadge}${claimed?`<span class="k" style="font-size:10px;color:#5fcf94;background:#10301f;padding:3px 8px;border-radius:99px;">เข้าแล้ว</span>`:`<span class="k" style="font-size:10px;color:#5b626d;">รอเข้า</span>`}${delBtn}</div>`; }).join("")||`<div class="k" style="color:var(--dim);">ยังไม่มีสมาชิก</div>`;
  box.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin:0 4px 16px;"><h2 class="k" style="margin:0;font-weight:800;font-size:26px;">แอดมิน</h2><span class="k" style="font-weight:600;font-size:10px;letter-spacing:1px;color:#EF3E42;border:1px solid #5a2227;border-radius:6px;padding:3px 7px;">STAFF</span></div>
    ${isSuper()?`<div style="background:#161226;border:1px solid #2e2546;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;color:#b9a6f0;margin-bottom:4px;">🏟️ จัดการวง <span style="font-size:10px;color:#6b5fa0;font-weight:600;">· เฉพาะ super</span></div>
      <div class="k" style="font-size:12px;color:var(--mut);margin-bottom:12px;">วงปัจจุบัน: <b style="color:#cfc2f5;">${POOL_ID?esc(POOL_ID):"วงหลัก"}</b></div>
      <div style="display:flex;gap:8px;margin-bottom:7px;"><input id="npName" class="field" placeholder="ชื่อวงใหม่ (เช่น วงออฟฟิศ)"><div id="npCreate" class="k btnG" style="width:92px;height:44px;font-size:13px;flex:none;">+ สร้างวง</div></div>
      <div id="npResult" class="k" style="font-size:12px;line-height:1.5;color:#5fcf94;margin-bottom:12px;word-break:break-all;"></div>
      <div class="k" style="font-size:12px;color:var(--mut);margin-bottom:7px;border-top:1px solid #2e2546;padding-top:12px;">แอดมินของวงนี้ — ดูแลสมาชิก/ตรวจคนยิงได้ (แต่แตะตารางคู่ไม่ได้)</div>
      ${(S.admins||[]).map(e=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><div class="k" style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e)}</div><div data-deladmin="${esc(e)}" class="k" style="cursor:pointer;color:#EF3E42;font-size:11px;font-weight:700;padding:4px 9px;border:1px solid #5a2227;border-radius:8px;">ถอด</div></div>`).join("")||`<div class="k" style="color:var(--dim);font-size:12px;margin-bottom:6px;">— ยังไม่มี (ต้น = super ดูแลได้อยู่แล้ว) —</div>`}
      <input id="npAdminEmail" class="field" inputmode="email" placeholder="อีเมลแอดมินใหม่" style="margin-top:4px;margin-bottom:7px;">
      <div id="npIsPlayer" data-on="0" style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:12.5px;color:#cfc2f5;margin-bottom:8px;user-select:none;"><span id="npIsPlayerBox" style="width:22px;height:22px;border-radius:6px;border:1.5px solid #6b5fa0;background:#0E1116;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;flex:none;"></span> เป็นผู้เล่นด้วย (ลงทายในวง)</div>
      <input id="npPlayerName" class="field" placeholder="ชื่อผู้เล่นในวง (ถ้าติ๊กด้านบน)" style="margin-bottom:8px;">
      <div id="npAddAdmin" class="k btnG" style="height:44px;font-size:14px;">+ เพิ่มแอดมิน</div></div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;margin-bottom:12px;">➕ เพิ่มคู่แข่งขัน <span style="font-size:10px;color:#5b626d;font-weight:600;">· ใช้ร่วมทุกวง</span></div>
      <div style="display:flex;gap:8px;margin-bottom:8px;"><select id="amHome" class="field">${teamOpts()}</select><select id="amAway" class="field">${teamOpts()}</select></div>
      <div style="display:flex;gap:8px;margin-bottom:8px;"><select id="amGroup" class="field">${groupOpts}</select><select id="amRound" class="field">${roundOpts}</select></div>
      <input id="amKick" class="field" placeholder="📅 แตะเลือกวัน-เวลาเตะ" readonly style="margin-bottom:12px;cursor:pointer;">
      <div id="amAdd" class="k btnG" style="height:44px;font-size:14px;">เพิ่มคู่</div></div>`:""}
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:12px;">✅ กรอกผล + ให้แต้มคนยิง${glocked?'<span style="font-size:11px;color:#9cc3f3;font-weight:600;">🔒 จบแล้ว</span>':''}</div>
      <select id="amSel" class="field" style="margin-bottom:8px;">${opts}</select>
      ${selM?`${isSuper()?`<div style="${glocked?'opacity:.55;pointer-events:none;':''}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">${flag(selM.home)}<div class="k" style="flex:1;min-width:0;font-weight:600;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(selM.home)} ${fe(selM.home)}</div><div style="display:flex;align-items:center;gap:6px;flex:none;"><div data-step="Hs:-1" class="k" style="${stBtn}">−</div><input id="amHs" inputmode="numeric" value="${selM.homeScore||0}" ${glocked?"disabled":""} style="${stInp}"><div data-step="Hs:1" class="k" style="${stBtn}">+</div></div></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">${flag(selM.away)}<div class="k" style="flex:1;min-width:0;font-weight:600;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(selM.away)} ${fe(selM.away)}</div><div style="display:flex;align-items:center;gap:6px;flex:none;"><div data-step="As:-1" class="k" style="${stBtn}">−</div><input id="amAs" inputmode="numeric" value="${selM.awayScore||0}" ${glocked?"disabled":""} style="${stInp}"><div data-step="As:1" class="k" style="${stBtn}">+</div></div></div></div>
      ${glocked?`<div id="amGameEdit" class="k" style="height:44px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #2A303A;color:#9cc3f3;font-weight:700;font-size:14px;cursor:pointer;">🔓 แก้ไขผล (คู่นี้จบแล้ว)</div>`:`<div style="display:flex;gap:8px;"><div id="amLive" class="k" style="flex:1;height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;background:#3a1c1f;color:#ff6b6b;font-weight:700;font-size:13px;cursor:pointer;">🔴 อัพเดตสด</div><div id="amResult" class="k btnG" style="flex:1;height:42px;font-size:14px;">จบเกม</div></div><div class="k" style="font-size:10.5px;color:#5b626d;margin-top:4px;">อัพเดตสด = สกอร์ realtime + คิดแต้มทันที · จบเกม = ปิดผลถาวร</div>`}`
      :`<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;padding:11px;background:#0E1116;border:1px solid #232830;border-radius:11px;">${flag(selM.home)}<span class="k" style="font-weight:800;font-size:21px;color:#EEF1F4;">${selM.homeScore||0} - ${selM.awayScore||0}</span>${flag(selM.away)}<span class="k" style="font-size:11px;color:${selM.status==='finished'?'#9cc3f3':'#5b626d'};margin-left:4px;">${selM.status==='finished'?'🔒 จบแล้ว':'รอผล'}</span></div><div class="k" style="font-size:11px;color:var(--mut);text-align:center;margin-bottom:4px;">สกอร์อัปเดตอัตโนมัติ — ติ๊กได้แค่คนยิงของวงนี้ (กัน AI อ่านชื่อพลาด)</div>`}
      ${isSuper()?`<div id="amDel" class="k" style="height:36px;margin-top:8px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #5a2227;color:#EF3E42;font-weight:700;font-size:13px;cursor:pointer;">ลบคู่</div>`:""}
      <div class="k" style="font-size:12px;color:var(--mut);margin:14px 0 4px;">ติ๊กคนยิงถูก (+1)${glocked?" — กดแก้ไขผลก่อนถึงติ๊กได้":" — ติ๊กแล้วกดอัพเดต/จบเกม ถึงบันทึก"}</div>
      <div style="background:#0E1116;border:1px solid #232830;border-radius:11px;overflow:hidden;">${gradeRows}</div>`:`<div class="k" style="color:var(--dim);">— ไม่มีคู่ที่ปิดรับ —</div>`}</div>
    <div style="background:#1a1410;border:1px solid #3a2f1e;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;color:var(--gold);margin-bottom:12px;">🏆 แชมป์ + ล็อก${S.tournament.picksLocked?'<span style="font-size:11px;color:#5b626d;font-weight:600;">🔒 ล็อก</span>':'<span style="font-size:11px;color:#5fcf94;font-weight:600;">โหมดแก้ไข</span>'}</div>
      <select id="amChampion" class="field" style="margin-bottom:8px;">${teamOpts(S.tournament.champion||"")}</select>
      <div id="amSetChamp" class="k btnG" style="height:42px;font-size:14px;background:var(--gold);color:#1a1410;">ตั้งแชมป์ (+10)</div>
      <div style="border-top:1px solid #3a2f1e;margin-top:13px;padding-top:13px;">
        <div class="k" style="font-size:12px;color:var(--gold);margin-bottom:8px;">ทายแชมป์ของสมาชิก</div>
        ${S.tournament.picksLocked
          ? `<div id="amLockPicks" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #3a2f1e;color:#caa75a;font-weight:700;font-size:13px;cursor:pointer;">🔓 แตะเพื่อแก้ไข</div>`
          : `<select id="cpName" class="field" style="margin-bottom:8px;"><option value="">— เลือกสมาชิก —</option>${rosterNames().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>
        <div style="display:flex;gap:8px;margin-bottom:8px;"><select id="cpT0" class="field">${champOptsC("")}</select><select id="cpT1" class="field">${champOptsC("")}</select></div>
        <div id="cpSave" class="k btnG" style="height:42px;font-size:14px;margin-bottom:8px;">บันทึกทายแชมป์ให้คนนี้</div>
        <div id="amLockPicks" class="k" style="height:40px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #3a2f1e;color:#5fcf94;font-weight:700;font-size:13px;cursor:pointer;">🔒 ล็อก (เสร็จแล้ว)</div>`}
      </div></div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;margin-bottom:10px;">🏷️ ป้ายชุด (คืน→เช้า)</div>
      <input id="amBatch" class="field" placeholder="เช่น ชุดล่าสุด · คืน 24 → เช้า 25 มิ.ย." value="${esc(S.tournament.batchLabel||"")}" style="margin-bottom:8px;">
      <div id="amSaveBatch" class="k btnG" style="height:42px;font-size:14px;">บันทึกป้าย</div></div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:12px;">⭐ คะแนนยกมา (ฐานตั้งต้น)${S.carryEdit?'<span style="font-size:11px;color:#5fcf94;font-weight:600;">โหมดแก้ไข</span>':'<span style="font-size:11px;color:#5b626d;font-weight:600;">🔒 ล็อก</span>'}</div>${carryRows}
      ${S.carryEdit?`<div id="acSave" class="k btnG" style="height:42px;font-size:14px;margin-top:6px;">บันทึกคะแนนยกมา</div>`:`<div id="acEdit" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;font-size:13px;margin-top:6px;border-radius:11px;border:1px solid #2A303A;color:#8A929E;cursor:pointer;">🔓 แตะเพื่อแก้ไข</div>`}</div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;">
      <div class="k" style="font-weight:700;font-size:15px;margin-bottom:12px;">🧑‍🤝‍🧑 สมาชิก (${rosterNames().length})</div>${memberRows}
      <div class="k" style="font-size:11px;color:var(--mut);margin:10px 0 6px;">เพิ่มสมาชิก → เขา login มาเลือกชื่อนี้ได้ + ผูกคะแนนยกมา</div>
      <div style="display:flex;gap:8px;"><input id="amMemName" class="field" placeholder="ชื่อสมาชิกใหม่"><input id="amMemCarry" class="field" inputmode="numeric" placeholder="ยกมา" style="width:90px;"></div>
      <div id="amMemAdd" class="k btnG" style="height:42px;font-size:14px;margin-top:8px;">เพิ่มสมาชิก</div></div>`;
  box.querySelectorAll("[data-pick]").forEach(el=>el.onclick=()=>{ const [pid,nStr]=el.dataset.pick.split(":"); const n=+nStr;
    const p=S.allPreds.find(x=>`${x.matchId}__${x.uid}`===pid);
    const cur=(pid in S.scorerStage)?S.scorerStage[pid]:(p&&p.s1hit?1:(p&&p.s2hit?2:(p&&p.scorerOk?1:0)));
    const nv=(cur===n)?0:n; S.scorerStage[pid]=nv;   // กดซ้ำปุ่มที่จม=ยกเลิก · กดอีกปุ่ม=สลับ (ปุ่มเดียว)
    box.querySelectorAll(`[data-pick^="${pid}:"]`).forEach(b=>{ const bn=+b.dataset.pick.split(":")[1]; const on=nv===bn;
      b.style.background=on?"#10301f":"#23272f"; b.style.color=on?"#5fcf94":"#8A929E"; b.style.border="1px solid "+(on?"#1f5a39":"#333"); }); });
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
  if($("#amMemAdd")) $("#amMemAdd").onclick=async()=>{ const n=$("#amMemName").value.trim(); if(!n){toast("ใส่ชื่อ");return;} const v=parseInt($("#amMemCarry").value)||0; await setDoc(poolDoc("config","carry"),{...S.carry,[n]:v},{merge:true}); S.carry[n]=v; toast("เพิ่มสมาชิกแล้ว ✓"); renderAdmin(); };
  if($("#acEdit")) $("#acEdit").onclick=()=>{ S.carryEdit=true; renderAdmin(); };
  if($("#acSave")) $("#acSave").onclick=async()=>{ if(!confirm("บันทึกคะแนนยกมาใหม่? (กระทบยอดรวมทุกคน)"))return; const c2={...(S.carry||{})}; box.querySelectorAll("[data-carry]").forEach(i=>{c2[i.dataset.carry]=parseInt(i.value)||0;}); await setDoc(poolDoc("config","carry"),c2,{merge:true}); Object.assign(S.carry,c2); S.carryEdit=false; toast("บันทึกคะแนนยกมาแล้ว"); renderAdmin(); };
  if($("#amAdd")) $("#amAdd").onclick=async()=>{ const h=$("#amHome").value,a=$("#amAway").value;
    const sel=S.fp&&S.fp.selectedDates[0]; const k=sel?sel.getTime():0;
    const g=[$("#amGroup").value,$("#amRound").value].filter(Boolean).join(" · ");
    if(!h||!a||!k){toast("เลือกทีม 2 ทีม + วัน-เวลา");return;} if(h===a){toast("เลือกทีมซ้ำ");return;}
    await setDoc(doc(db,"matches","m_"+Date.now()),{home:h,away:a,group:g,kickoff:k,homeScore:0,awayScore:0,scorers:[],status:"upcoming"}); toast("เพิ่มคู่แล้ว ✓"); renderAdmin(); };
  if(window.flatpickr && $("#amKick")) S.fp=flatpickr("#amKick",{enableTime:true,time_24hr:true,minuteIncrement:30,disableMobile:true,
    formatDate:d=>d.toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" น."});
  if($("#amGroup")){ const lockRound=()=>{ const g=$("#amGroup").value; const ko=g && !g.startsWith("กลุ่ม"); const r=$("#amRound"); r.disabled=ko; if(ko)r.value=""; r.style.opacity=ko?".5":"1"; };
    $("#amGroup").onchange=lockRound; lockRound(); }
  if($("#npCreate")) $("#npCreate").onclick=async()=>{ const name=$("#npName").value.trim(); if(!name){toast("ใส่ชื่อวง");return;}
    const code=genCode(); const created=Date.now();
    try{ await setDoc(doc(db,"pools",code,"config","meta"),{name,owner:S.me.email,createdAt:created});
      await setDoc(doc(db,"pools",code,"config","admins"),{emails:[]});
      await setDoc(doc(db,"pools",code,"config","visibility"),{startFrom:created});   // คู่ก่อนสร้างวง = ซ่อน (วงเล่นแมนนวลมาก่อน carry รับช่วง)
      const link=location.origin+location.pathname+"?pool="+code;
      try{ await navigator.clipboard.writeText(link); }catch(e){}   // ก๊อปลิงก์ไว้แชร์ ก่อนเด้ง
      if($("#npResult")) $("#npResult").innerHTML=`สร้างวง "<b>${esc(name)}</b>" (${code}) ✓ ก๊อปลิงก์แล้ว — กำลังเข้าไปตั้งค่า…`;
      toast(`สร้างวง ${code} ✓ เข้าไปตั้งค่า…`);
      setTimeout(()=>{ location.href=link; }, 600);   // A: เด้งเข้าวงใหม่อัตโนมัติ → ตั้งแอดมิน/สมาชิกต่อได้เลย
    }catch(e){ toast("สร้างวงไม่ได้ (Rules?)"); }
  };
  if($("#npIsPlayer")) $("#npIsPlayer").onclick=()=>{ const el=$("#npIsPlayer"), on=el.dataset.on==="1"; el.dataset.on=on?"0":"1";
    const b=$("#npIsPlayerBox"); if(b){ b.style.background=on?"#0E1116":"#7c6fc0"; b.style.borderColor=on?"#6b5fa0":"#9d8ee8"; b.textContent=on?"":"✓"; } };
  if($("#npAddAdmin")) $("#npAddAdmin").onclick=async()=>{ const em=$("#npAdminEmail").value.trim().toLowerCase(); if(!em||!em.includes("@")){toast("ใส่อีเมลให้ถูก");return;}
    const isPlayer=$("#npIsPlayer")&&$("#npIsPlayer").dataset.on==="1"; const pname=$("#npPlayerName")?$("#npPlayerName").value.trim():"";
    if(isPlayer&&!pname){toast("ติ๊กเป็นผู้เล่น → ใส่ชื่อด้วย");return;}
    const emails=[...new Set([...(S.admins||[]),em])];
    try{ await setDoc(poolDoc("config","admins"),{emails},{merge:true}); S.admins=emails;
      if(isPlayer&&pname){ const cv=(S.carry&&S.carry[pname])||0;
        await setDoc(poolDoc("config","carry"),{[pname]:cv},{merge:true}); S.carry[pname]=cv;       // เป็นสมาชิก roster
        await setDoc(poolDoc("config","bind"),{[em]:pname},{merge:true}); }                          // login ด้วยอีเมลนี้ → ได้ชื่อนี้อัตโนมัติ
      toast(isPlayer?`เพิ่มแอดมิน+ผู้เล่น "${pname}" ✓`:"เพิ่มแอดมินแล้ว ✓"); renderAdmin();
    }catch(e){ toast("เพิ่มไม่ได้ (Rules?)"); }
  };
  box.querySelectorAll("[data-deladmin]").forEach(el=>el.onclick=async()=>{ const em=el.dataset.deladmin; if(!confirm(`ถอดแอดมิน ${em}?`))return;
    const emails=(S.admins||[]).filter(x=>x!==em);
    try{ await setDoc(poolDoc("config","admins"),{emails}); S.admins=emails; toast("ถอดแล้ว"); renderAdmin(); }catch(e){ toast("ถอดไม่ได้ (Rules?)"); }
  });
  $("#amSel").onchange=e=>{ S.adminSel=e.target.value; S.gameEdit=false; renderAdmin(); };
  if($("#amGameEdit")) $("#amGameEdit").onclick=()=>{ S.gameEdit=true; renderAdmin(); };
  box.querySelectorAll("[data-step]").forEach(el=>el.onclick=()=>{ const [f,d]=el.dataset.step.split(":"); const inp=$("#am"+f); let v=(parseInt(inp.value)||0)+parseInt(d); v=Math.max(0,Math.min(99,v)); inp.value=v; });
  if($("#amLive")) $("#amLive").onclick=async()=>{ if(!S.adminSel){toast("ยังไม่มีคู่");return;} const hs=parseInt($("#amHs").value),as=parseInt($("#amAs").value); if(isNaN(hs)||isNaN(as)){toast("ใส่สกอร์ครบ");return;} await updateDoc(doc(db,"matches",S.adminSel),{homeScore:hs,awayScore:as,live:true}); await commitScorers(S.adminSel); const mo=S.matches.find(x=>x.id===S.adminSel); if(mo)Object.assign(mo,{homeScore:hs,awayScore:as,live:true}); toast("อัพเดตสด 🔴 บันทึกแล้ว"); renderAdmin(); };
  if($("#amResult")) $("#amResult").onclick=async()=>{ if(!S.adminSel){toast("ยังไม่มีคู่ที่ปิดรับ");return;} const hs=parseInt($("#amHs").value),as=parseInt($("#amAs").value); if(isNaN(hs)||isNaN(as)){toast("ใส่สกอร์ครบ");return;} const mm=S.matches.find(x=>x.id===S.adminSel); if(!confirm(`จบเกม ${mm.home} ${hs}-${as} ${mm.away}?\n(ปิด + คิดแต้มถาวร)`))return; await updateDoc(doc(db,"matches",S.adminSel),{homeScore:hs,awayScore:as,status:"finished",autoGraded:true,live:false}); await commitScorers(S.adminSel); if(mm)Object.assign(mm,{homeScore:hs,awayScore:as,status:"finished",live:false}); S.gameEdit=false; toast("จบเกม ✓ บันทึกแล้ว"); renderAdmin(); };
  if($("#amDel")) $("#amDel").onclick=async()=>{ if(!S.adminSel)return; if(!confirm("ลบคู่นี้?"))return; const id=S.adminSel; await deleteDoc(doc(db,"matches",id)); S.matches=S.matches.filter(m=>m.id!==id); S.adminSel=""; S.gameEdit=false; toast("ลบคู่แล้ว"); renderAdmin(); };
  $("#amSetChamp").onclick=async()=>{ const c=$("#amChampion").value.trim(); if(c&&!confirm(`ตั้งแชมป์ ${c}? (+10 ให้คนทายถูก)`))return; S.tournament.champion=c; S.tournament.championLocked=!!c; await setDoc(poolDoc("config","tournament"),{champion:c,championLocked:!!c},{merge:true}); toast("ตั้งแชมป์แล้ว 🏆"); renderAdmin(); };
  $("#amLockPicks").onclick=async()=>{ const nv=!S.tournament.picksLocked; S.tournament.picksLocked=nv; await setDoc(poolDoc("config","tournament"),{picksLocked:nv},{merge:true}); toast(nv?"ล็อกแล้ว":"ปลดล็อกแล้ว"); renderAdmin(); };
  if($("#cpName")){
    $("#cpName").onchange=()=>{ const pk=S.champPicks[$("#cpName").value]||[]; $("#cpT0").value=pk[0]||""; $("#cpT1").value=pk[1]||""; };   // เลือกคน → เติมทีมเดิม
    $("#cpSave").onclick=async()=>{ if(S.tournament.picksLocked){ toast("ปลดล็อกทายแชมป์ก่อน"); return; } const n=$("#cpName").value; if(!n){ toast("เลือกสมาชิกก่อน"); return; } const t0=$("#cpT0").value,t1=$("#cpT1").value; if(t0&&t1&&t0===t1){ toast("เลือกทีมซ้ำ"); return; } await setDoc(poolDoc("config","champPicks"),{[n]:[t0,t1].filter(Boolean)},{merge:true}); toast("บันทึกแชมป์ให้ "+n+" ✓"); };
  }
  $("#amSaveBatch").onclick=async()=>{ await setDoc(poolDoc("config","tournament"),{batchLabel:$("#amBatch").value.trim()},{merge:true}); toast("บันทึกป้ายแล้ว"); };
  bindAvatars(box);
}
