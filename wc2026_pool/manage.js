/* ===== manage (standalone manage.html): ศูนย์คุมทุกวง · super เท่านั้น · 4 แท็บ =====
   [วง] สมาชิก/ลบ/เปิดปิดสมัคร/แอดมิน/สร้าง-ลบวง · [สกอร์&คนยิง] เลือกคู่→กรอกผล→โพยทุกวง · [แชมป์] ตั้ง/ทายแทน ทุกวง · [การแข่งขัน] เพิ่มคู่+ชุดถัดไป
   data: โหลดทุกวงพร้อมกันลง S.mgPools (one-shot) · ทุก handler เขียนเสร็จ → refetchOne(code) + renderManage · matches ใช้ร่วม top-level (S.allMatches จาก mgmain) */
import { S } from "./state.js";
import { db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, poolColFor, poolDocFor } from "./firebase.js";
import { TEAMS, fe, CHAMP_TEAMS, genCode, MOCK } from "./config.js";
import { $, esc, flag, toast, isSuper, avatarHTML, silhouetteHTML, bindAvatars } from "./utils.js";
import { stateOf, scoreMatch } from "./scoring.js";

const TEAM_LIST = Object.keys(TEAMS).sort((a,b)=>a.localeCompare(b,"th"));
const teamOpts = sel => `<option value="">— เลือกทีม —</option>`+TEAM_LIST.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const champOptsC = sel => `<option value="">— เลือกทีม —</option>`+CHAMP_TEAMS.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const groupOpts = `<option value="">— กลุ่ม/รอบ —</option>`
  +["A","B","C","D","E","F","G","H","I","J","K","L"].map(g=>`<option value="กลุ่ม ${g}">กลุ่ม ${g}</option>`).join("")
  +["รอบ 32","รอบ 16","ก่อนรองฯ","รองชนะเลิศ","ชิงที่ 3","ชิงชนะเลิศ"].map(r=>`<option value="${r}">${r}</option>`).join("");
const roundOpts = `<option value="">— นัด —</option>`+["นัด 1","นัด 2","นัด 3"].map(r=>`<option value="${r}">${r}</option>`).join("");
const stBtn=`width:38px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:#283042;color:#EEF1F4;font-size:22px;font-weight:700;cursor:pointer;user-select:none;flex:none;`;
const stInp=`width:46px;height:42px;text-align:center;font-family:'Kanit';font-weight:800;font-size:20px;color:#EEF1F4;background:#0E1116;border:1px solid #2A303A;border-radius:10px;flex:none;`;

const poolName = p => esc(p.meta&&p.meta.name||p.name||(p.code?p.code:"วงหลัก"));
const poolTag  = p => p.code?esc(p.code):"หลัก";
const thTime = ms => { try{ return new Date(ms).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" น."; }catch(e){ return ""; } };
const mgRoster = p => { const s=[...Object.keys(p.carry||{})]; Object.keys(p.playersByName||{}).forEach(n=>{ if(!s.includes(n)) s.push(n); }); return s; };
function deriveChampPicks(configCP, playersByName){ const cp={...configCP}; Object.entries(playersByName).forEach(([name,pl])=>{ const a=[pl.champ1,pl.champ2].filter(Boolean); if(a.length) cp[name]=a; }); return cp; }

// ===== data layer (ทุกวงพร้อมกัน) =====
async function fetchPoolData(code,name){
  const [carryS,champS,tourS,adminsS,metaS,bindS]=await Promise.all([
    getDoc(poolDocFor(code,"config","carry")), getDoc(poolDocFor(code,"config","champPicks")),
    getDoc(poolDocFor(code,"config","tournament")), getDoc(poolDocFor(code,"config","admins")),
    getDoc(poolDocFor(code,"config","meta")), getDoc(poolDocFor(code,"config","bind")) ]);
  const [playersSnap,predsSnap,emailsSnap]=await Promise.all([ getDocs(poolColFor(code,"players")), getDocs(poolColFor(code,"predictions")), getDocs(poolColFor(code,"emails")).catch(()=>null) ]);
  const playersByName={}; playersSnap.forEach(d=>{ const p=d.data(); if(p.name) playersByName[p.name]={photo:p.photo||"",uid:p.uid,champ1:p.champ1||"",champ2:p.champ2||""}; });
  const emailByUid={}; if(emailsSnap) emailsSnap.forEach(d=>{ const e=d.data(); if(e.uid) emailByUid[e.uid]=e.email||""; });
  const configChampPicks=champS.exists()?champS.data():{};
  return { code, name:(metaS.exists()&&metaS.data().name)||name||(code?code:"วงหลัก"),
    carry:carryS.exists()?carryS.data():{}, configChampPicks, champPicks:deriveChampPicks(configChampPicks,playersByName),
    tournament:tourS.exists()?tourS.data():{}, admins:adminsS.exists()?(adminsS.data().emails||[]):[],
    meta:metaS.exists()?metaS.data():null, bind:bindS.exists()?bindS.data():{}, playersByName, emailByUid, preds:predsSnap.docs.map(d=>d.data()) };
}
export async function loadAllPools(){
  if(MOCK) return;   // mock seed ใน mgmain แล้ว
  let pools=[{code:"",name:"วงหลัก"}];
  try{ const idx=await getDoc(doc(db,"config","poolsIndex")); if(idx.exists()&&Array.isArray(idx.data().pools)) pools=idx.data().pools; }catch(e){}
  S.mgPools = await Promise.all(pools.map(p=>fetchPoolData(p.code,p.name)));
}
async function refetchOne(code){
  if(MOCK){ renderManage(); return; }
  const cur=S.mgPools.find(p=>p.code===code);
  const fresh=await fetchPoolData(code, cur&&cur.name);
  const i=S.mgPools.findIndex(p=>p.code===code);
  if(i>=0) S.mgPools[i]=fresh; else S.mgPools.push(fresh);
  renderManage();
}
export async function loadNextSet(){
  if(MOCK) return;
  try{ const ns=await getDoc(doc(db,"config","nextSet")); S.mgNextSet=ns.exists()?ns.data():null; }catch(e){ S.mgNextSet=null; }
}
async function commitScorers(pool, matchId){   // ติ๊กคนยิงที่ค้างของวงนี้ · stage key = code|pid (กัน uid ซ้ำข้ามวง)
  for(const p of pool.preds.filter(x=>x.matchId===matchId)){ const pid=`${p.matchId}__${p.uid}`, key=`${pool.code}|${pid}`;
    if(key in S.scorerStage){ const v=S.scorerStage[key]; const s1=v===1,s2=v===2,ok=v!==0,s1played=(v!==2);
      try{ await setDoc(poolDocFor(pool.code,"predictions",pid),{scorerOk:ok,s1hit:s1,s2hit:s2,s1played,scorerManual:true,s1unsure:false,s2unsure:false},{merge:true}); }catch(e){ toast("คนยิงบันทึกไม่ได้"); }
      delete S.scorerStage[key]; } }
}

// ===== entry =====
export function renderManage(){
  if(!isSuper()){ const b=$("#mgContent"); if(b) b.innerHTML=`<div class="k" style="color:var(--dim);text-align:center;padding:60px 0;">เฉพาะ super</div>`; return; }
  document.querySelectorAll("[data-mgtab]").forEach(el=>{ const on=el.dataset.mgtab===S.mgTab;
    el.style.color=on?"#EEF1F4":"#5b626d"; el.style.borderBottom="2px solid "+(on?"#1FB85E":"transparent"); el.style.fontWeight=on?"700":"500"; });
  const box=$("#mgContent"); if(!box) return;
  if(S.mgTab==="pools") renderPoolsTab(box);
  else if(S.mgTab==="scores") renderScoresTab(box);
  else if(S.mgTab==="champ") renderChampTab(box);
  else if(S.mgTab==="matches") renderMatchesTab(box);
  bindAvatars(box);
}
const card = (inner,accent) => `<div style="background:#14171D;border:1px solid ${accent||"#232830"};border-radius:16px;padding:15px;margin-bottom:13px;">${inner}</div>`;

// ===================== แท็บ 1: วง =====================
function renderPoolsTab(box){
  const poolsHTML=S.mgPools.map(p=>{
    const reg=!!(p.tournament&&p.tournament.regLocked); const edit=!!S.mgCarryEdit[p.code];
    const memberRows=mgRoster(p).map(n=>{ const pl=p.playersByName[n], claimed=!!pl, em=claimed?(p.emailByUid[pl.uid]||"เข้าแล้ว"):"";
      return `<div style="display:flex;align-items:center;gap:8px;background:#0E1116;border:1px solid #232830;border-radius:11px;padding:8px 10px;margin-bottom:6px;">
        ${claimed?avatarHTML(pl.photo,30):silhouetteHTML(30)}
        <div style="flex:1;min-width:0;"><div class="k" style="font-weight:700;font-size:14px;">${esc(n)}</div><div style="font-size:10.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${claimed?esc(em):"ยังไม่ล็อกอิน"}</div></div>
        <input data-carry="${p.code}|${esc(n)}" class="field" inputmode="numeric" value="${p.carry[n]||0}" ${edit?"":"disabled"} style="width:64px;height:32px;text-align:center;margin:0;${edit?"":"opacity:.5;"}">
        <div data-delmem="${p.code}|${esc(n)}" class="k" style="cursor:pointer;color:#EF3E42;font-size:11px;font-weight:700;padding:6px 7px;border:1px solid #5a2227;border-radius:8px;flex:none;">ลบ</div></div>`; }).join("")||`<div class="k" style="color:var(--dim);font-size:13px;">— ยังไม่มีสมาชิก —</div>`;
    const adminRows=(p.admins||[]).map(e=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><div class="k" style="flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e)}</div><div data-deladmin="${p.code}|${esc(e)}" class="k" style="cursor:pointer;color:#EF3E42;font-size:11px;font-weight:700;padding:4px 8px;border:1px solid #5a2227;border-radius:8px;">ถอด</div></div>`).join("")||`<div class="k" style="color:var(--dim);font-size:11.5px;margin-bottom:5px;">— ยังไม่มี —</div>`;
    return `<div style="background:#161226;border:1px solid #2e2546;border-radius:16px;padding:15px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><div class="k" style="flex:1;font-weight:800;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${poolName(p)}</div><span class="k" style="font-size:10px;color:#b9a6f0;border:1px solid #34294f;border-radius:6px;padding:2px 7px;flex:none;">${poolTag(p)}</span><div data-delpool="${p.code}" class="k" style="cursor:pointer;color:#EF3E42;font-size:11px;font-weight:700;padding:4px 8px;border:1px solid #5a2227;border-radius:8px;flex:none;">${p.code?"ลบวง":""}</div></div>
      <div id="mgReg|${p.code}" data-reg="${p.code}" class="k" style="height:38px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #2A303A;color:${reg?"#5fcf94":"#f0a3a8"};font-weight:700;font-size:12.5px;cursor:pointer;margin-bottom:11px;">${reg?"🔒 ปิดรับสมัครอยู่ — แตะเปิดรับ":"🚪 เปิดรับสมัครอยู่ — แตะปิดรับ"}</div>
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:13px;color:var(--mut);margin-bottom:7px;">🧑 สมาชิก (${mgRoster(p).length})<span data-carryedit="${p.code}" style="cursor:pointer;font-size:11px;color:${edit?"#5fcf94":"#8A929E"};">${edit?"💾 บันทึกยกมา":"🔓 แก้ยกมา"}</span></div>${memberRows}
      <div style="display:flex;gap:7px;margin-top:7px;"><input id="mgAddMem|${p.code}" class="field" placeholder="เพิ่มชื่อสมาชิก" style="height:38px;"><input id="mgAddCarry|${p.code}" class="field" inputmode="numeric" placeholder="ยกมา" style="width:70px;height:38px;"><div data-addmem="${p.code}" class="k btnG" style="width:54px;height:38px;font-size:12px;flex:none;">เพิ่ม</div></div>
      <div class="k" style="font-weight:700;font-size:13px;color:var(--mut);margin:13px 0 7px;border-top:1px solid #2e2546;padding-top:11px;">🛡️ แอดมินวงนี้</div>${adminRows}
      <input id="mgAdminEmail|${p.code}" class="field" inputmode="email" placeholder="อีเมลแอดมินใหม่" style="height:38px;margin-top:4px;margin-bottom:6px;">
      <div data-isplayer="${p.code}" data-on="0" style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:12px;color:#cfc2f5;margin-bottom:7px;user-select:none;"><span style="width:20px;height:20px;border-radius:6px;border:1.5px solid #6b5fa0;background:#0E1116;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex:none;"></span> เป็นผู้เล่นด้วย</div>
      <input id="mgPlayerName|${p.code}" class="field" placeholder="ชื่อผู้เล่น (ถ้าติ๊ก)" style="height:38px;margin-bottom:7px;">
      <div data-addadmin="${p.code}" class="k btnG" style="height:40px;font-size:13px;">+ เพิ่มแอดมิน</div></div>`;
  }).join("");
  box.innerHTML=`
    ${card(`<div class="k" style="font-weight:700;font-size:15px;color:#b9a6f0;margin-bottom:10px;">🆕 สร้างวงใหม่</div>
      <div style="display:flex;gap:8px;"><input id="npName" class="field" placeholder="ชื่อวงใหม่"><div id="npCreate" class="k btnG" style="width:92px;height:42px;font-size:13px;flex:none;">+ สร้างวง</div></div>
      <div id="npResult" class="k" style="font-size:12px;line-height:1.5;color:#5fcf94;margin-top:8px;word-break:break-all;"></div>`,"#2e2546")}
    ${poolsHTML}`;

  box.querySelectorAll("[data-reg]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.reg; const p=pool(code); const nv=!(p.tournament&&p.tournament.regLocked);
    await setDoc(poolDocFor(code,"config","tournament"),{regLocked:nv},{merge:true}); toast(nv?"ปิดรับสมัครแล้ว":"เปิดรับสมัครแล้ว ✓"); refetchOne(code); });
  box.querySelectorAll("[data-carryedit]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.carryedit;
    if(S.mgCarryEdit[code]){ const c2={...(pool(code).carry||{})}; box.querySelectorAll(`[data-carry^="${code}|"]`).forEach(i=>{ c2[i.dataset.carry.split("|").slice(1).join("|")]=parseInt(i.value)||0; });
      await setDoc(poolDocFor(code,"config","carry"),c2,{merge:true}); S.mgCarryEdit[code]=false; toast("บันทึกคะแนนยกมาแล้ว"); refetchOne(code); }
    else { S.mgCarryEdit[code]=true; renderManage(); } });
  box.querySelectorAll("[data-addmem]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.addmem; const n=byId(`mgAddMem|${code}`).value.trim(); if(!n){toast("ใส่ชื่อ");return;} const v=parseInt(byId(`mgAddCarry|${code}`).value)||0;
    await setDoc(poolDocFor(code,"config","carry"),{...pool(code).carry,[n]:v},{merge:true}); toast("เพิ่มสมาชิกแล้ว ✓"); refetchOne(code); });
  box.querySelectorAll("[data-delmem]").forEach(el=>el.onclick=async()=>{ const [code,n]=splitCode(el.dataset.delmem); const p=pool(code); const pl=p.playersByName[n];
    const pe=pl&&p.emailByUid[pl.uid]; const admE=pe&&(p.admins||[]).includes(pe)?pe:(Object.entries(p.bind||{}).find(([e,nm])=>nm===n&&(p.admins||[]).includes(e))||[])[0];
    if(!confirm(`ลบสมาชิก "${n}" จาก ${poolName(p)}?${admE?" (เป็นแอดมินด้วย)":""}`))return;
    const c2={...p.carry}; delete c2[n]; await setDoc(poolDocFor(code,"config","carry"),c2);
    if(pl&&pl.uid){ try{ await deleteDoc(poolDocFor(code,"players",pl.uid)); }catch(e){} }
    if(admE){ await setDoc(poolDocFor(code,"config","admins"),{emails:(p.admins||[]).filter(e=>e!==admE)}); const b2={...(p.bind||{})}; delete b2[admE]; await setDoc(poolDocFor(code,"config","bind"),b2); }
    toast("ลบสมาชิกแล้ว"); refetchOne(code); });
  box.querySelectorAll("[data-isplayer]").forEach(el=>el.onclick=()=>{ const on=el.dataset.on==="1"; el.dataset.on=on?"0":"1"; const b=el.firstElementChild; b.style.background=on?"#0E1116":"#7c6fc0"; b.textContent=on?"":"✓"; });
  box.querySelectorAll("[data-addadmin]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.addadmin; const em=byId(`mgAdminEmail|${code}`).value.trim().toLowerCase(); if(!em||!em.includes("@")){toast("ใส่อีเมลให้ถูก");return;}
    const wrap=box.querySelector(`[data-isplayer="${code}"]`); const isP=wrap&&wrap.dataset.on==="1"; const pn=byId(`mgPlayerName|${code}`)?byId(`mgPlayerName|${code}`).value.trim():"";
    if(isP&&!pn){toast("ติ๊กผู้เล่น → ใส่ชื่อ");return;} const p=pool(code);
    try{ await setDoc(poolDocFor(code,"config","admins"),{emails:[...new Set([...(p.admins||[]),em])]},{merge:true});
      if(isP&&pn){ await setDoc(poolDocFor(code,"config","carry"),{[pn]:(p.carry&&p.carry[pn])||0},{merge:true}); await setDoc(poolDocFor(code,"config","bind"),{[em]:pn},{merge:true}); }
      toast(isP?`เพิ่มแอดมิน+ผู้เล่น "${pn}" ✓`:"เพิ่มแอดมินแล้ว ✓"); refetchOne(code);
    }catch(e){ toast("เพิ่มไม่ได้"); } });
  box.querySelectorAll("[data-deladmin]").forEach(el=>el.onclick=async()=>{ const [code,em]=splitCode(el.dataset.deladmin); if(!confirm(`ถอดแอดมิน ${em}?`))return;
    await setDoc(poolDocFor(code,"config","admins"),{emails:(pool(code).admins||[]).filter(x=>x!==em)}); toast("ถอดแล้ว"); refetchOne(code); });
  box.querySelectorAll("[data-delpool]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.delpool; if(!code)return;
    if(!confirm(`เอาวง "${code}" ออกจากรายการ?\n(ไม่ลบข้อมูลจริง — สมาชิก/โพยยังอยู่ · ลิงก์ ?pool=${code} ยังเข้าได้ · แค่ซ่อนจากรายการ)`))return;
    const pools=S.mgPools.filter(p=>p.code!==code).map(p=>({code:p.code,name:p.name}));
    try{ await setDoc(doc(db,"config","poolsIndex"),{pools}); S.mgPools=S.mgPools.filter(p=>p.code!==code); toast("เอาออกแล้ว"); renderManage(); }catch(e){ toast("เอาออกไม่ได้"); } });
  if($("#npCreate")) $("#npCreate").onclick=async()=>{ const name=$("#npName").value.trim(); if(!name){toast("ใส่ชื่อวง");return;} const code=genCode(), created=Date.now();
    try{ await setDoc(doc(db,"pools",code,"config","meta"),{name,owner:S.me.email,createdAt:created});
      await setDoc(doc(db,"pools",code,"config","admins"),{emails:[]}); await setDoc(doc(db,"pools",code,"config","visibility"),{startFrom:created});
      await setDoc(doc(db,"config","poolsIndex"),{pools:[...S.mgPools.map(p=>({code:p.code,name:p.name})),{code,name}]});
      const link=location.origin+location.pathname.replace(/manage\.html$/,"index.html")+"?pool="+code;
      try{ await navigator.clipboard.writeText(link); }catch(e){}
      if($("#npResult")) $("#npResult").innerHTML=`สร้าง "<b>${esc(name)}</b>" (${code}) ✓ ก๊อปลิงก์เชิญแล้ว`;
      await refetchOne(code); toast(`สร้างวง ${code} ✓`);
    }catch(e){ toast("สร้างวงไม่ได้"); } };
}

// ===================== แท็บ 2: สกอร์ & คนยิง =====================
function renderScoresTab(box){
  const gradeable=S.allMatches.filter(m=>stateOf(m)!=="open");
  const opts=gradeable.map(m=>`<option value="${m.id}" ${m.id===S.mgMatchSel?"selected":""}>${esc(m.home)} vs ${esc(m.away)} ${m.status==="finished"?`(จบ ${m.homeScore}-${m.awayScore})`:"(ปิดรับ)"}</option>`).join("");
  const selM=gradeable.find(m=>m.id===S.mgMatchSel)||gradeable[gradeable.length-1]; S.mgMatchSel=selM?selM.id:"";
  if(!selM){ box.innerHTML=card(`<div class="k" style="color:var(--dim);">— ยังไม่มีคู่ที่ปิดรับ/จบ —</div>`); return; }
  const glocked=selM.status==="finished"&&!S.gameEdit;
  const poolGrade=p=>{ const preds=p.preds.filter(x=>x.matchId===selM.id);
    const rows=preds.length?preds.map(pr=>{ const zero=pr.homeScore===0&&pr.awayScore===0, pid=`${pr.matchId}__${pr.uid}`, key=`${p.code}|${pid}`;
      const scored=scoreMatch(pr,selM)>0;
      const stage=(key in S.scorerStage)?S.scorerStage[key]:(pr.scorerOk?(pr.s1hit?1:2):0);
      const nm=(t,on,u)=>`<span style="color:${on?'#5fcf94':u?'#E0A33E':'var(--mut)'};${on?'font-weight:700;':u?'font-weight:600;':''}">${esc(t)}${u&&!on?' ?':''}</span>`;
      const s2active=!pr.s1hit&&!pr.s1played;
      const scTxt=`${pr.scorer1?nm(pr.scorer1,stage===1,pr.s1unsure):""}${pr.scorer1&&pr.scorer2?' <span style="color:#3f454e;">/</span> ':""}${pr.scorer2?nm(pr.scorer2,stage===2,pr.s2unsure&&s2active):""}`||"(ไม่ใส่คนยิง)";
      const btn=n=>`<div data-pick="${p.code}|${pid}|${n}" class="k" style="cursor:pointer;flex:none;font-weight:800;font-size:13px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:${stage===n?"#10301f":"#23272f"};color:${stage===n?"#5fcf94":"#8A929E"};border:1px solid ${stage===n?"#1f5a39":"#333"};">${n}</div>`;
      const amber=stage===0&&(pr.s1unsure||(pr.s2unsure&&s2active));
      const rejX=(key in S.scorerStage)&&S.scorerStage[key]===0;
      const btnX=`<div data-pick="${p.code}|${pid}|0" title="ไม่ให้คะแนนคนยิง" class="k" style="cursor:pointer;flex:none;font-weight:800;font-size:13px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:${rejX?"#3a1c1f":"#23272f"};color:${rejX?"#ff6b6b":"#8A929E"};border:1px solid ${rejX?"#5a2227":"#333"};">✕</div>`;
      const tick=zero?`<span class="k" style="font-size:11px;color:#5b626d;flex:none;">0-0</span>`:glocked?`<span class="k" style="flex:none;font-weight:700;font-size:11px;color:${stage?"#5fcf94":"#5b626d"};">${stage===1?"✓คน1":stage===2?"✓คน2":"—"}</span>`:`<div style="display:flex;gap:4px;flex:none;">${pr.scorer1?btn(1):""}${pr.scorer2?btn(2):""}${amber?btnX:""}</div>`;
      return `<div style="display:flex;align-items:center;gap:7px;padding:7px 9px;border-bottom:1px solid #1c2129;"><div class="k" style="width:46px;flex:none;font-weight:600;font-size:12.5px;">${esc(pr.player)}</div><div class="k" style="width:34px;flex:none;font-weight:700;color:${scored?'#5fcf94':'#EEF1F4'};">${pr.homeScore}-${pr.awayScore}</div><div style="flex:1;min-width:0;font-size:11.5px;word-break:break-word;line-height:1.3;">${scTxt}</div>${tick}</div>`; }).join(""):`<div class="k" style="color:var(--dim);padding:8px;font-size:12px;">ไม่มีโพยคู่นี้</div>`;
    return `<div style="margin-bottom:11px;"><div class="k" style="font-weight:700;font-size:13px;color:#b9a6f0;margin-bottom:5px;">${poolName(p)} <span style="font-size:10px;color:#5b626d;">${poolTag(p)}</span></div><div style="background:#0E1116;border:1px solid #232830;border-radius:11px;overflow:hidden;">${rows}</div></div>`; };
  box.innerHTML=`
    ${card(`<div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:10px;">✅ กรอกผล (ใช้ร่วมทุกวง)${glocked?'<span style="font-size:11px;color:#9cc3f3;">🔒 จบแล้ว</span>':''}</div>
      <select id="mgSel" class="field" style="margin-bottom:10px;">${opts}</select>
      <div style="${glocked?'opacity:.55;pointer-events:none;':''}">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;">${flag(selM.home)}<div class="k" style="flex:1;min-width:0;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(selM.home)} ${fe(selM.home)}</div><div style="display:flex;gap:5px;flex:none;"><div data-step="Hs:-1" class="k" style="${stBtn}">−</div><input id="mgHs" inputmode="numeric" value="${selM.homeScore||0}" ${glocked?"disabled":""} style="${stInp}"><div data-step="Hs:1" class="k" style="${stBtn}">+</div></div></div>
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;">${flag(selM.away)}<div class="k" style="flex:1;min-width:0;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(selM.away)} ${fe(selM.away)}</div><div style="display:flex;gap:5px;flex:none;"><div data-step="As:-1" class="k" style="${stBtn}">−</div><input id="mgAs" inputmode="numeric" value="${selM.awayScore||0}" ${glocked?"disabled":""} style="${stInp}"><div data-step="As:1" class="k" style="${stBtn}">+</div></div></div></div>
      ${glocked?`<div id="mgGameEdit" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #2A303A;color:#9cc3f3;font-weight:700;font-size:13px;cursor:pointer;">🔓 แก้ไขผล (จบแล้ว)</div>`:`<div style="display:flex;gap:8px;"><div id="mgLive" class="k" style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;border-radius:11px;background:#3a1c1f;color:#ff6b6b;font-weight:700;font-size:12.5px;cursor:pointer;">🔴 อัพเดตสด</div><div id="mgResult" class="k btnG" style="flex:1;height:40px;font-size:13px;">จบเกม</div></div>`}
      <div class="k" style="font-size:11px;color:var(--mut);margin-top:9px;">ติ๊กคนยิงถูก (+1) แต่ละวงด้านล่าง · สกอร์ได้แต้ม = เขียว</div>`)}
    <div class="k" style="font-weight:700;font-size:14px;margin:0 2px 9px;">โพย & คนยิง — ทุกวง</div>
    ${S.mgPools.map(poolGrade).join("")}`;

  box.querySelectorAll("[data-pick]").forEach(el=>el.onclick=()=>{ const parts=el.dataset.pick.split("|"); const n=+parts.pop(); const key=parts.join("|");
    const code=parts[0], pid=parts[1]; const pr=pool(code).preds.find(x=>`${x.matchId}__${x.uid}`===pid);   // cur ต้องตรงกับ stage ตอน render (เผื่อ scorerOk เดิม)
    const cur=(key in S.scorerStage)?S.scorerStage[key]:(pr&&pr.scorerOk?(pr.s1hit?1:2):0); const nv=(cur===n)?0:n; S.scorerStage[key]=nv;
    box.querySelectorAll(`[data-pick^="${key}|"]`).forEach(b=>{ const bn=+b.dataset.pick.split("|").pop(); const on=nv===bn; const c=bn===0?["#3a1c1f","#ff6b6b","#5a2227"]:["#10301f","#5fcf94","#1f5a39"];
      b.style.background=on?c[0]:"#23272f"; b.style.color=on?c[1]:"#8A929E"; b.style.border="1px solid "+(on?c[2]:"#333"); }); });
  $("#mgSel").onchange=e=>{ S.mgMatchSel=e.target.value; S.gameEdit=false; renderManage(); };
  if($("#mgGameEdit")) $("#mgGameEdit").onclick=()=>{ S.gameEdit=true; renderManage(); };
  box.querySelectorAll("[data-step]").forEach(el=>el.onclick=()=>{ const [f,d]=el.dataset.step.split(":"); const inp=$("#mg"+f); let v=(parseInt(inp.value)||0)+parseInt(d); inp.value=Math.max(0,Math.min(99,v)); });
  const writeScore=async fin=>{ const hs=parseInt($("#mgHs").value),as=parseInt($("#mgAs").value); if(isNaN(hs)||isNaN(as)){toast("ใส่สกอร์ครบ");return;}
    if(fin&&!confirm(`จบเกม ${selM.home} ${hs}-${as} ${selM.away}? (คิดแต้มถาวร ทุกวง)`))return;
    await updateDoc(doc(db,"matches",selM.id), fin?{homeScore:hs,awayScore:as,status:"finished",autoGraded:true,live:false}:{homeScore:hs,awayScore:as,live:true});
    const mo=S.allMatches.find(x=>x.id===selM.id); if(mo)Object.assign(mo,fin?{homeScore:hs,awayScore:as,status:"finished",live:false}:{homeScore:hs,awayScore:as,live:true});
    for(const p of S.mgPools) await commitScorers(p,selM.id);
    if(fin)S.gameEdit=false; toast(fin?"จบเกม ✓":"อัพเดตสด 🔴"); if(!MOCK){ for(const p of S.mgPools) await refetchOne0(p.code); } renderManage(); };
  if($("#mgLive")) $("#mgLive").onclick=()=>writeScore(false);
  if($("#mgResult")) $("#mgResult").onclick=()=>writeScore(true);
}
async function refetchOne0(code){ if(MOCK)return; const cur=S.mgPools.find(p=>p.code===code); const fresh=await fetchPoolData(code,cur&&cur.name); const i=S.mgPools.findIndex(p=>p.code===code); if(i>=0)S.mgPools[i]=fresh; }

// ===================== แท็บ 3: แชมป์ =====================
function renderChampTab(box){
  box.innerHTML=S.mgPools.map(p=>{ const reg=p.tournament&&p.tournament.picksLocked;
    return `<div style="background:#1a1410;border:1px solid #3a2f1e;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:16px;color:var(--gold);margin-bottom:3px;">${poolName(p)} <span style="font-size:10px;color:#caa75a;">${poolTag(p)}${reg?" · 🔒ล็อก":""}</span></div>
      <div class="k" style="font-size:11.5px;color:var(--gold);margin:7px 0 5px;">ตั้งผลแชมป์จริง (+10)</div>
      <select id="mgChamp|${p.code}" class="field" style="margin-bottom:7px;">${teamOpts(p.tournament.champion||"")}</select>
      <div data-setchamp="${p.code}" class="k btnG" style="height:40px;font-size:13px;background:var(--gold);color:#1a1410;">ตั้งแชมป์ (+10)</div>
      <div style="border-top:1px solid #3a2f1e;margin-top:11px;padding-top:11px;">
        <div class="k" style="font-size:11.5px;color:var(--gold);margin-bottom:6px;">ทายแชมป์ให้สมาชิก (ทะลุล็อก)</div>
        <select id="mgCpName|${p.code}" class="field" style="margin-bottom:6px;"><option value="">— เลือกสมาชิก —</option>${mgRoster(p).map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>
        <div style="display:flex;gap:7px;margin-bottom:7px;"><select id="mgCp0|${p.code}" class="field">${champOptsC("")}</select><select id="mgCp1|${p.code}" class="field">${champOptsC("")}</select></div>
        <div data-cpsave="${p.code}" class="k btnG" style="height:40px;font-size:13px;">บันทึกทายแชมป์ให้คนนี้</div></div></div>`;
  }).join("");
  box.querySelectorAll("[data-setchamp]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.setchamp; const c=byId(`mgChamp|${code}`).value.trim();
    if(c&&!confirm(`ตั้งแชมป์ ${c} ของ ${poolName(pool(code))}? (+10)`))return;
    await setDoc(poolDocFor(code,"config","tournament"),{champion:c,championLocked:!!c},{merge:true}); toast("ตั้งแชมป์แล้ว 🏆"); refetchOne(code); });
  box.querySelectorAll("[data-cpsave]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.cpsave; const n=byId(`mgCpName|${code}`).value; if(!n){toast("เลือกสมาชิกก่อน");return;}
    const t0=byId(`mgCp0|${code}`).value,t1=byId(`mgCp1|${code}`).value; if(t0&&t1&&t0===t1){toast("เลือกทีมซ้ำ");return;}
    await setDoc(poolDocFor(code,"config","champPicks"),{[n]:[t0,t1].filter(Boolean)},{merge:true}); toast("บันทึกแชมป์ให้ "+n+" ✓"); refetchOne(code); });
  box.querySelectorAll("[id^='mgCpName|']").forEach(sel=>sel.onchange=()=>{ const code=sel.id.split("|").slice(1).join("|"); const pk=(pool(code).champPicks[sel.value])||[]; byId(`mgCp0|${code}`).value=pk[0]||""; byId(`mgCp1|${code}`).value=pk[1]||""; });
}

// ===================== แท็บ 4: การแข่งขัน =====================
function renderMatchesTab(box){
  const ns=S.mgNextSet;
  box.innerHTML=`
    ${card(`<div class="k" style="font-weight:700;font-size:15px;margin-bottom:11px;">➕ เพิ่มคู่แข่งขัน <span style="font-size:10px;color:#5b626d;">· ใช้ร่วมทุกวง</span></div>
      <div style="display:flex;gap:8px;margin-bottom:8px;"><select id="amHome" class="field">${teamOpts()}</select><select id="amAway" class="field">${teamOpts()}</select></div>
      <div style="display:flex;gap:8px;margin-bottom:8px;"><select id="amGroup" class="field">${groupOpts}</select><select id="amRound" class="field">${roundOpts}</select></div>
      <input id="amKick" class="field" placeholder="📅 แตะเลือกวัน-เวลาเตะ" readonly style="margin-bottom:11px;cursor:pointer;">
      <div id="amAdd" class="k btnG" style="height:42px;font-size:14px;">เพิ่มคู่</div>`)}
    ${(ns&&ns.fixtures&&ns.fixtures.length)?card(`<div class="k" style="font-weight:700;font-size:15px;color:#7fd6a0;margin-bottom:3px;">🔮 คู่ชุดถัดไป <span style="font-size:10px;color:#5b626d;">· เปิดอัตโนมัติเมื่อชุดนี้จบ</span></div>
      <div class="k" style="font-size:11.5px;color:var(--mut);margin-bottom:9px;">ดึงล่วงหน้าจาก ESPN — ${ns.fixtures.length} คู่ (auto เพิ่มเอง)</div>
      ${ns.fixtures.map(f=>`<div style="padding:7px 0;border-top:1px solid #15261c;"><div class="k" style="font-weight:600;font-size:14px;">${fe(f.home)} ${esc(f.home)} <span style="color:#5b626d;">vs</span> ${esc(f.away)} ${fe(f.away)}</div><div style="font-size:11px;color:var(--mut);margin-top:1px;">${esc(f.group||"")} · ${thTime(f.kickoff)}</div></div>`).join("")}`,"#1e3a2a"):""}`;
  if($("#amAdd")) $("#amAdd").onclick=async()=>{ const h=$("#amHome").value,a=$("#amAway").value; const sel=S.fp&&S.fp.selectedDates[0]; const k=sel?sel.getTime():0;
    const g=[$("#amGroup").value,$("#amRound").value].filter(Boolean).join(" · ");
    if(!h||!a||!k){toast("เลือกทีม 2 + วัน-เวลา");return;} if(h===a){toast("เลือกทีมซ้ำ");return;}
    const id="m_"+Date.now(); const m={home:h,away:a,group:g,kickoff:k,homeScore:0,awayScore:0,scorers:[],status:"upcoming"};
    if(!MOCK) await setDoc(doc(db,"matches",id),m); S.allMatches.push({id,...m}); toast("เพิ่มคู่แล้ว ✓"); $("#amHome").value=""; $("#amAway").value=""; };
  if(window.flatpickr && $("#amKick")) S.fp=flatpickr("#amKick",{enableTime:true,time_24hr:true,minuteIncrement:30,disableMobile:true,formatDate:d=>d.toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" น."});
  if($("#amGroup")){ const lr=()=>{ const g=$("#amGroup").value; const ko=g&&!g.startsWith("กลุ่ม"); const r=$("#amRound"); r.disabled=ko; if(ko)r.value=""; r.style.opacity=ko?".5":"1"; }; $("#amGroup").onchange=lr; lr(); }
}

// ===== utils =====
const pool = code => S.mgPools.find(p=>p.code===code) || {carry:{},admins:[],bind:{},playersByName:{},emailByUid:{},tournament:{},champPicks:{}};
const splitCode = s => { const i=s.indexOf("|"); return [s.slice(0,i), s.slice(i+1)]; };   // "code|rest" · code อาจว่าง
const byId = id => document.getElementById(id);   // id มี "|" → querySelector parse ไม่ได้ (CSS namespace) ต้องใช้ getElementById
