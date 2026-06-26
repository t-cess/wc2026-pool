/* ===== manage (standalone manage.html): ศูนย์คุมทุกวง · super เท่านั้น · 4 แท็บ =====
   [วง] สมาชิก/ลบ/เปิดปิดสมัคร/แอดมิน/สร้าง-ลบวง · [สกอร์&คนยิง] เลือกคู่→กรอกผล→โพยทุกวง · [แชมป์] ตั้ง/ทายแทน ทุกวง · [การแข่งขัน] เพิ่มคู่+ชุดถัดไป
   data: โหลดทุกวงพร้อมกันลง S.mgPools (one-shot) · ทุก handler เขียนเสร็จ → refetchOne(code) + renderManage · matches ใช้ร่วม top-level (S.allMatches จาก mgmain) */
import { S } from "./state.js";
import { db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, poolColFor, poolDocFor } from "./firebase.js";
import { TEAMS, fe, CHAMP_TEAMS, genCode, MOCK } from "./config.js";
import { $, esc, flag, toast, isSuper, avatarHTML, silhouetteHTML, bindAvatars, confirmModal, promptModal, pickModal, alertModal, openMenu, norm } from "./utils.js";
import { stateOf, scoreMatch } from "./scoring.js";
import { predRowHTML, effPredFromState } from "./predrow.js";
import { renameMember, moveMember } from "./member-ops.js";

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
// แต้มรวมรายคนของวงนี้ (ยกมา + รายคู่ + แชมป์) — ใช้เรียงอันดับในแท็บวง
function poolTotals(p){ const champ=norm((p.tournament&&p.tournament.champion)||""); const t={};
  mgRoster(p).forEach(n=>{
    let mp=0; p.preds.filter(x=>x.player===n).forEach(pr=>{ const m=S.allMatches.find(x=>x.id===pr.matchId); if(m) mp+=scoreMatch(pr,m); });
    const cp=champ?(p.champPicks[n]||[]).map(norm).filter(x=>x===champ).length*10:0;
    t[n]=(p.carry[n]||0)+mp+cp; });
  return t; }

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
    if(key in S.scorerStage){ const st=S.scorerStage[key]; const s1=st[0]==="g",s2=st[1]==="g",ok=s1||s2,s1played=st[0]!=="x",s2played=st[1]!=="x";
      try{ await setDoc(poolDocFor(pool.code,"predictions",pid),{scorerOk:ok,s1hit:s1,s2hit:s2,s1played,s2played,scorerManual:true,s1unsure:false,s2unsure:false},{merge:true}); }catch(e){ toast("คนยิงบันทึกไม่ได้"); }
      delete S.scorerStage[key]; } }
}

// ===== entry =====
export function renderMgBanner(){   // คาดหัวแบบหน้าวง — โชว์เมื่อมีคู่กำลังแข่ง · แตะไปแท็บสกอร์
  const hb=$("#mgBanner"); if(!hb) return;
  const liveN=(S.allMatches||[]).filter(m=>m.live).length;
  if(liveN){ hb.innerHTML=`<div class="k" style="margin:-14px -18px 12px;padding:6px 18px;background:linear-gradient(90deg,#1FB85E,#16a34a);color:#04210F;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#04210F;animation:pulse 1.4s infinite;"></span> กำลังแข่ง ${liveN} คู่ — แตะไปกรอกผล</div>`;
    hb.onclick=()=>{ S.mgTab="scores"; try{localStorage.setItem("mg_tab","scores")}catch(e){}; renderManage(); }; }
  else { hb.innerHTML=""; hb.onclick=null; }
}
export function renderManage(){
  if(!isSuper()){ const b=$("#mgContent"); if(b) b.innerHTML=`<div class="k" style="color:var(--dim);text-align:center;padding:60px 0;">เฉพาะ super</div>`; return; }
  renderMgBanner();
  document.querySelectorAll("[data-mgtab]").forEach(el=>{ const on=el.dataset.mgtab===S.mgTab;
    const ind=el.querySelector(".mgind"); if(ind) ind.style.background=on?"#1FB85E":"transparent";
    const sp=el.querySelector("span"); if(sp){ sp.style.color=on?"#EEF1F4":"#5b626d"; sp.style.fontWeight=on?"700":"500"; } });
  const box=$("#mgContent"); if(!box) return;
  if(S.mgTab==="pools") renderPoolsTab(box);
  else if(S.mgTab==="scores") renderScoresTab(box);
  else if(S.mgTab==="champ") renderChampTab(box);
  else if(S.mgTab==="matches") renderMatchesTab(box);
  bindAvatars(box);
}
const card = (inner,accent) => `<div style="background:#14171D;border:1px solid ${accent||"#232830"};border-radius:16px;padding:15px;margin-bottom:13px;">${inner}</div>`;

// ===================== แท็บ 1: วง =====================
const poolLink = code => location.origin+location.pathname.replace(/manage\.html$/,"index.html")+(code?"?pool="+code:"");
function renderPoolsTab(box){
  const poolHTML=p=>{ const code=p.code; const reg=!!(p.tournament&&p.tournament.regLocked);
    const tot=poolTotals(p); const roster=mgRoster(p).slice().sort((a,b)=>(tot[b]||0)-(tot[a]||0) || a.localeCompare(b,"th"));   // เรียงคนนำ (แต้มมาก→น้อย · เท่ากันเรียงตัวอักษร)
    const memberRows=roster.map((n,i)=>{ const pl=p.playersByName[n], claimed=!!pl; const pe=claimed&&p.emailByUid[pl.uid]; const isAdm=pe&&(p.admins||[]).includes(pe);
      const rankCol=i===0?"#FFD23F":i<3?"#9cc3f3":"#5b626d";
      return `<div data-menu="${code}|${esc(n)}" style="display:flex;align-items:center;gap:9px;background:#0E1116;border:1px solid #232830;border-radius:11px;padding:9px 11px;margin-bottom:6px;cursor:pointer;">
        <div class="k" style="width:18px;flex:none;text-align:center;font-weight:800;font-size:13px;color:${rankCol};">${i+1}</div>
        ${claimed?avatarHTML(pl.photo,32):silhouetteHTML(32)}
        <div style="flex:1;min-width:0;"><div class="k" style="font-weight:700;font-size:14px;">${esc(n)}${isAdm?' <span style="font-size:9px;color:#b9a6f0;border:1px solid #34294f;border-radius:5px;padding:1px 5px;vertical-align:middle;">แอดมิน</span>':""}</div>
        <div style="font-size:10.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${claimed?esc(pe||"—"):"ยังไม่ล็อกอิน"} · ยกมา ${p.carry[n]||0}</div></div>
        <div class="k" style="flex:none;text-align:right;"><div style="font-weight:800;font-size:18px;color:#EEF1F4;line-height:1;">${tot[n]||0}</div><div style="font-size:9px;color:#5b626d;font-weight:600;">แต้ม</div></div></div>`; }).join("")||`<div class="k" style="color:var(--dim);font-size:13px;">— ยังไม่มีสมาชิก (รอคนสมัครเอง) —</div>`;
    return `<div style="background:#161226;border:1px solid #2e2546;border-radius:16px;padding:15px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div class="k" style="flex:1;min-width:0;font-weight:800;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${poolName(p)}</div><span class="k" style="font-size:10px;color:#b9a6f0;border:1px solid #34294f;border-radius:6px;padding:2px 7px;flex:none;">${poolTag(p)}</span></div>
      <div class="k" style="font-size:11.5px;color:var(--mut);margin-bottom:11px;">🧑 ${mgRoster(p).length} คน · ${reg?"🔒 ปิดรับสมัคร":"🚪 เปิดรับสมัคร"}</div>
      <div style="display:flex;gap:8px;margin-bottom:11px;"><div data-enterlink="${code}" class="k btnG" style="flex:1;height:40px;font-size:13px;">เข้าวง ▸</div><div data-copylink="${code}" class="k" style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid #2A303A;color:#cfc2f5;font-weight:700;font-size:13px;cursor:pointer;">📋 คัดลอกลิงก์</div></div>
      <div data-reg="${code}" class="k" style="height:38px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #2A303A;color:${reg?"#5fcf94":"#f0a3a8"};font-weight:700;font-size:12.5px;cursor:pointer;margin-bottom:11px;">${reg?"🔒 ปิดรับสมัครอยู่ — แตะเปิดรับ":"🚪 เปิดรับสมัครอยู่ — แตะปิดรับ"}</div>
      <div class="k" style="font-weight:700;font-size:13px;color:var(--mut);margin-bottom:7px;">สมาชิก (${mgRoster(p).length}) <span style="font-size:11px;color:#5b626d;">· แตะเพื่อจัดการ</span></div>${memberRows}
      ${code?`<div data-delpool="${code}" class="k" style="cursor:pointer;color:#EF3E42;font-size:12px;font-weight:700;padding:9px;border:1px solid #5a2227;border-radius:11px;text-align:center;margin-top:11px;">เอาวงออกจากรายการ</div>`
            :`<div class="k" style="color:#5b626d;font-size:12px;padding:9px;border:1px solid #2A303A;border-radius:11px;text-align:center;margin-top:11px;">วงหลัก — ลบไม่ได้</div>`}</div>`; };
  box.innerHTML=`
    ${card(`<div class="k" style="font-weight:700;font-size:15px;color:#b9a6f0;margin-bottom:10px;">🆕 สร้างวงใหม่</div>
      <div style="display:flex;gap:8px;"><input id="npName" class="field" placeholder="ชื่อวงใหม่"><div id="npCreate" class="k btnG" style="width:92px;height:42px;font-size:13px;flex:none;">+ สร้างวง</div></div>
      <div id="npResult" class="k" style="font-size:12px;line-height:1.5;color:#5fcf94;margin-top:8px;word-break:break-all;"></div>`,"#2e2546")}
    ${S.mgPools.map(poolHTML).join("")}`;
  if($("#npCreate")) $("#npCreate").onclick=async()=>{ const name=$("#npName").value.trim(); if(!name){toast("ใส่ชื่อวง");return;} const code=genCode(), created=Date.now();
    try{ await setDoc(doc(db,"pools",code,"config","meta"),{name,owner:S.me.email,createdAt:created});
      await setDoc(doc(db,"pools",code,"config","admins"),{emails:[]}); await setDoc(doc(db,"pools",code,"config","visibility"),{startFrom:created});
      await setDoc(doc(db,"config","poolsIndex"),{pools:[...S.mgPools.map(p=>({code:p.code,name:p.name})),{code,name}]});
      try{ await navigator.clipboard.writeText(poolLink(code)); }catch(e){}
      toast(`สร้างวง ${code} ✓ ก๊อปลิงก์แล้ว`); await refetchOne(code);
    }catch(e){ toast("สร้างวงไม่ได้"); } };
  box.querySelectorAll("[data-enterlink]").forEach(el=>el.onclick=()=>{ location.href=poolLink(el.dataset.enterlink); });
  box.querySelectorAll("[data-copylink]").forEach(el=>el.onclick=async()=>{ try{ await navigator.clipboard.writeText(poolLink(el.dataset.copylink)); toast("คัดลอกลิงก์แล้ว ✓"); }catch(e){ toast("คัดลอกไม่ได้"); } });
  box.querySelectorAll("[data-reg]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.reg; const nv=!(pool(code).tournament&&pool(code).tournament.regLocked); await setDoc(poolDocFor(code,"config","tournament"),{regLocked:nv},{merge:true}); toast(nv?"ปิดรับสมัครแล้ว":"เปิดรับสมัครแล้ว ✓"); refetchOne(code); });
  box.querySelectorAll("[data-menu]").forEach(el=>el.onclick=()=>{ const [c,n]=splitCode(el.dataset.menu); memberMenu(el,c,n); });
  box.querySelectorAll("[data-delpool]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.delpool; if(!await confirmModal(`เอาวง "${code}" ออกจากรายการ?\nไม่ลบข้อมูลจริง — สมาชิก/โพยยังอยู่ · ลิงก์ ?pool=${code} ยังเข้าได้ · แค่ซ่อนจากรายการ`))return;
    try{ await setDoc(doc(db,"config","poolsIndex"),{pools:S.mgPools.filter(x=>x.code!==code).map(x=>({code:x.code,name:x.name}))}); S.mgPools=S.mgPools.filter(x=>x.code!==code); toast("เอาออกแล้ว"); renderManage(); }catch(e){ toast("เอาออกไม่ได้"); } });
}

// เมนู ⋮ ของสมาชิก (manage · super): เปลี่ยนชื่อ/แก้ยกมา/ย้ายวง/แต่งตั้ง-ปลดแอดมิน/เตะ
function memberMenu(anchor, code, name){
  const p=pool(code); const pl=p.playersByName[name]; const uid=pl&&pl.uid; const pe=uid&&p.emailByUid[uid]; const isAdm=pe&&(p.admins||[]).includes(pe);
  openMenu(anchor, [
    {label:"เปลี่ยนชื่อ", onClick:async()=>{ const nn=await promptModal(`เปลี่ยนชื่อ "${name}"`,{value:name}); if(nn&&nn.trim()&&nn.trim()!==name){ await renameMember(code,name,nn.trim(),uid); toast("เปลี่ยนชื่อแล้ว ✓"); refetchOne(code); } }},
    {label:"แก้คะแนนยกมา", onClick:async()=>{ const v=await promptModal(`คะแนนยกมาของ "${name}"`,{value:String(p.carry[name]||0),numeric:true}); if(v!==null){ await setDoc(poolDocFor(code,"config","carry"),{[name]:parseInt(v)||0},{merge:true}); toast("บันทึกแล้ว ✓"); refetchOne(code); } }},
    {label:"ย้ายวง", onClick:async()=>{ const others=S.mgPools.filter(x=>x.code!==code).map(x=>({label:poolName(x),value:x.code})); if(!others.length){ toast("ไม่มีวงอื่น"); return; }
      const to=await pickModal(`ย้าย "${name}" ไปวงไหน?`,others); if(to===null)return;
      if(!await confirmModal(`ย้าย "${name}" ไป ${poolName(pool(to))}?\nยกคะแนนยกมา + โพยเก่าไปด้วย (โพยในวงเดิมจะถูกซ่อน)`))return;
      await moveMember(code,to,name,uid); toast("ย้ายวงแล้ว ✓"); await refetchOne0(code); await refetchOne0(to); renderManage(); }},
    {label:isAdm?"ปลดแอดมิน":"แต่งตั้งเป็นแอดมิน", onClick:async()=>{ if(!pe){ toast("สมาชิกต้อง login ก่อนถึงตั้งแอดมินได้"); return; }
      if(!await confirmModal(isAdm?`ปลดแอดมิน "${name}"?`:`แต่งตั้ง "${name}" เป็นแอดมินวงนี้?`))return;
      const emails=isAdm?(p.admins||[]).filter(e=>e!==pe):[...new Set([...(p.admins||[]),pe])];
      await setDoc(poolDocFor(code,"config","admins"),{emails}); toast(isAdm?"ปลดแอดมินแล้ว":"แต่งตั้งแล้ว ✓"); refetchOne(code); }},
    {label:"เตะออกจากวง", danger:true, onClick:async()=>{ if(!await confirmModal(`เตะ "${name}" ออกจาก ${poolName(p)}?\nลบคะแนนยกมา + ปลดการจับคู่`))return;
      const c2={...p.carry}; delete c2[name]; await setDoc(poolDocFor(code,"config","carry"),c2);
      if(uid){ try{ await deleteDoc(poolDocFor(code,"players",uid)); }catch(e){} }
      if(pe&&(p.admins||[]).includes(pe)){ await setDoc(poolDocFor(code,"config","admins"),{emails:(p.admins||[]).filter(e=>e!==pe)}); const b2={...(p.bind||{})}; delete b2[pe]; await setDoc(poolDocFor(code,"config","bind"),b2); }
      toast("เตะแล้ว"); refetchOne(code); }},
  ], name);
}

// ===================== แท็บ 2: สกอร์ & คนยิง =====================
function renderScoresTab(box){
  const gradeable=S.allMatches.filter(m=>stateOf(m)!=="open");
  const opts=gradeable.map(m=>`<option value="${m.id}" ${m.id===S.mgMatchSel?"selected":""}>${esc(m.home)} vs ${esc(m.away)} ${m.status==="finished"?`(จบ ${m.homeScore}-${m.awayScore})`:"(ปิดรับ)"}</option>`).join("");
  const selM=gradeable.find(m=>m.id===S.mgMatchSel)||gradeable[gradeable.length-1]; S.mgMatchSel=selM?selM.id:"";
  if(!selM){ box.innerHTML=card(`<div class="k" style="color:var(--dim);">— ยังไม่มีคู่ที่ปิดรับ/จบ —</div>`); return; }
  const glocked=selM.status==="finished"&&!S.gameEdit;
  const selIdx=gradeable.findIndex(m=>m.id===selM.id);
  const navBtn=(d,g)=>{ const tgt=gradeable[selIdx+d], off=!tgt; return `<div ${off?"":`data-nav="${tgt.id}"`} class="k" style="flex:none;display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:11px;background:#283042;border:1px solid #2A303A;color:#EEF1F4;font-size:15px;${off?"opacity:.3;":"cursor:pointer;"}">${g}</div>`; };
  // แตะชื่อ = วนสถานะ (ตรวจคนยิง+คนลงสนามด้วยมือ ได้ทุกสถานะ) · state = 2 ตัวอักษร [คนแรก][คนสอง]
  //   คนแรก n=ปกติ g=ยิง x=ไม่ลง · คนสอง n=ปกติ g=ยิง d=ขีดฆ่า(ไม่ได้ใช้)
  //   แตะคนแรก: nn→gd→xn→nn · แตะคนสอง: nn→xg→nd→nn · ยิงได้คนเดียว (อีกคนเป็น g อยู่ → เตือน)
  const showPts = selM.status==="finished" || selM.live;   // มีผล/สด = โชว์แต้ม+สถานะคนยิง (เป๊ะเท่าหน้าวง)
  const defSt=pr=> pr.s1hit?"gd" : (pr.s2hit||(pr.scorerOk&&pr.scorer2))?"xg" : (pr.s1played===false?(pr.s2played===false?"xx":"xn"):"nd");   // สถานะตั้งต้นของวงล้อ (จาก flag ที่บันทึกไว้)
  // แถว = หน้าวงเป๊ะ (predRowHTML) · ยังไม่แตะ = แสดง pred จริง (รวม amber "?") · แตะแล้ว = effective ตามสถานะที่เลือก
  const rowHTML=(pr,code)=>{ const key=`${code}|${pr.matchId}__${pr.uid}`;
    const pred=(key in S.scorerStage)?effPredFromState(pr,S.scorerStage[key]):pr;
    return predRowHTML(pred, selM, {showPts, tapKey:key}); };
  const poolGrade=p=>{ const preds=p.preds.filter(x=>x.matchId===selM.id);
    const rows=preds.length?preds.map(pr=>rowHTML(pr,p.code)).join(""):`<div class="k" style="color:var(--dim);padding:8px;font-size:12px;">ไม่มีโพยคู่นี้</div>`;
    return `<div style="margin-bottom:11px;"><div class="k" style="font-weight:700;font-size:13px;color:#b9a6f0;margin-bottom:5px;">${poolName(p)} <span style="font-size:10px;color:#5b626d;">${poolTag(p)}</span></div><div style="background:#0E1116;border:1px solid #232830;border-radius:11px;padding:5px 7px;">${rows}</div></div>`; };
  box.innerHTML=`
    ${card(`<div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:10px;">✅ กรอกผล (ใช้ร่วมทุกวง)${glocked?'<span style="font-size:11px;color:#9cc3f3;">🔒 จบแล้ว</span>':''}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">${navBtn(-1,"◀︎")}<select id="mgSel" class="field" style="flex:1;margin:0;">${opts}</select>${navBtn(1,"▶︎")}</div>
      <div style="${glocked?'opacity:.55;pointer-events:none;':''}">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;">${flag(selM.home)}<div class="k" style="flex:1;min-width:0;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(selM.home)} ${fe(selM.home)}</div><div style="display:flex;gap:5px;flex:none;"><div data-step="Hs:-1" class="k" style="${stBtn}">−</div><input id="mgHs" inputmode="numeric" value="${selM.homeScore||0}" ${glocked?"disabled":""} style="${stInp}"><div data-step="Hs:1" class="k" style="${stBtn}">+</div></div></div>
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;">${flag(selM.away)}<div class="k" style="flex:1;min-width:0;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(selM.away)} ${fe(selM.away)}</div><div style="display:flex;gap:5px;flex:none;"><div data-step="As:-1" class="k" style="${stBtn}">−</div><input id="mgAs" inputmode="numeric" value="${selM.awayScore||0}" ${glocked?"disabled":""} style="${stInp}"><div data-step="As:1" class="k" style="${stBtn}">+</div></div></div></div>
      ${((selM.goals&&selM.goals.length)||(selM.scorers&&selM.scorers.length))?`<div class="k" style="font-size:11.5px;color:#9cc3f3;background:#11202e;border:1px solid #1c3347;border-radius:9px;padding:7px 10px;margin-bottom:10px;line-height:1.5;">⚽ คนยิงจริง: ${selM.goals&&selM.goals.length?selM.goals.map(g=>esc(g.name)+(g.time?` <span style="color:#5b8db5;">${esc(g.time)}</span>`:"")).join(" · "):selM.scorers.map(s=>esc(s)).join(" · ")}</div>`:""}
      ${glocked?`<div id="mgGameEdit" class="k" style="height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #2A303A;color:#9cc3f3;font-weight:700;font-size:13px;cursor:pointer;">🔓 แก้ไขผล (จบแล้ว)</div>`:`<div style="display:flex;gap:8px;"><div id="mgLive" class="k" style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:11px;background:#10301f;color:#5fcf94;border:1px solid #1f5a39;font-weight:700;font-size:12.5px;cursor:pointer;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#1FB85E;animation:pulse 1.4s infinite;"></span>อัพเดตสด</div><div id="mgResult" class="k" style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;border-radius:11px;background:#2D7DF6;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">จบเกม</div></div>`}
      <div class="k" style="font-size:11px;color:var(--mut);margin-top:9px;">สกอร์ (สด/จบเกม) กับ คนยิง แยกกัน · ติ๊กคนยิงแต่ละวงด้านล่าง → กดปุ่ม "บันทึกคนยิง" ท้ายสุด · ได้แต้ม = เขียว</div>`)}
    <div class="k" style="font-weight:700;font-size:14px;margin:0 2px 4px;">โพย & คนยิง — ทุกวง</div>
    <div style="background:#0E1116;border:1px solid #232830;border-radius:11px;padding:9px 9px;margin:0 2px 11px;">
      <div class="k" style="font-size:11px;color:var(--mut);margin-bottom:7px;padding:0 2px;">วนสถานะ — แตะชื่อในแถว → ถัดไป · <span style="color:#7fa8d8;">ไฮไลท์</span> = สถานะล่าสุดที่แตะ</div>
      <div class="k" style="display:flex;align-items:center;gap:8px;padding:0 7px 3px;font-size:9.5px;color:var(--dim);"><div style="width:13px;flex:none;"></div><div style="flex:1;">คนแรก</div><div style="flex:1;">คนสอง</div><div style="width:20px;flex:none;text-align:center;">แต้ม</div></div>
      <div class="k" style="font-size:11.5px;line-height:1.25;">${[
        {st:"gd",n:"1",at:"ยิง",ac:"#5fcf94",ad:0,bt:"ขีดฆ่า",bc:"var(--dim)",bd:1,pt:1},
        {st:"nd",n:"2",at:"ลงไม่ยิง",ac:"var(--mut)",ad:0,bt:"ขีดฆ่า",bc:"var(--dim)",bd:1,pt:0},
        {st:"xn",n:"3",at:"ไม่ลง",ac:"#ff6b6b",ad:0,bt:"ลงไม่ยิง",bc:"var(--mut)",bd:0,pt:0},
        {st:"xg",n:"4",at:"ไม่ลง",ac:"#ff6b6b",ad:0,bt:"ยิง",bc:"#5fcf94",bd:0,pt:1},
        {st:"xx",n:"5",at:"ไม่ลง",ac:"#ff6b6b",ad:0,bt:"ไม่ลง",bc:"#ff6b6b",bd:0,pt:0},
      ].map(r=>`<div data-cyc="${r.st}" style="display:flex;align-items:center;gap:8px;padding:3px 7px;border-radius:6px;${S.mgCycHi===r.st?"background:#16202e;box-shadow:inset 2px 0 0 #2D7DF6;":""}"><div style="width:13px;flex:none;color:var(--dim);">${r.n}</div><div style="flex:1;color:${r.ac};${r.ad?"text-decoration:line-through;":""}">${r.at}</div><div style="flex:1;color:${r.bc};${r.bd?"text-decoration:line-through;":""}">${r.bt}</div><div style="width:20px;flex:none;text-align:center;color:${r.pt?"#5fcf94":"#5b626d"};font-weight:${r.pt?"700":"400"};">${r.pt?"✓":"—"}</div></div>`).join("")}</div>
    </div>
    ${S.mgPools.map(poolGrade).join("")}
    <div id="mgSaveScorers" class="k btnG" style="height:48px;font-size:15px;margin-top:8px;">💾 บันทึกคนยิงที่ติ๊ก (ทุกวง)</div>`;

  const findByKey=key=>{ const ci=key.indexOf("|"); const code=key.slice(0,ci), pid=key.slice(ci+1); const p=S.mgPools.find(x=>x.code===code); const pr=p&&p.preds.find(x=>`${x.matchId}__${x.uid}`===pid); return {p,pr}; };
  const CYCLE=["gd","nd","xn","xg","xx"];   // แตะชื่อไหนก็ได้ = วน 5 สถานะนี้ (valid ทั้งหมด ไม่ต้อง lock)
  const bindTaps=scope=>{ if(!scope) return; scope.querySelectorAll("[data-tap]").forEach(el=>el.onclick=()=>{
    const key=el.dataset.tap; const {p,pr}=findByKey(key); if(!pr) return;
    const cur=(key in S.scorerStage)?S.scorerStage[key]:defSt(pr); const next=CYCLE[(CYCLE.indexOf(cur)+1)%CYCLE.length];
    S.scorerStage[key]=next; S.mgCycHi=next;   // ไฮไลท์ตารางตามสถานะที่เพิ่งแตะ
    const row=box.querySelector(`[data-prow="${key}"]`); if(row){ row.outerHTML=rowHTML(pr,p.code); bindTaps(box.querySelector(`[data-prow="${key}"]`)); }
    box.querySelectorAll("[data-cyc]").forEach(c=>{ const on=c.dataset.cyc===next; c.style.background=on?"#16202e":""; c.style.boxShadow=on?"inset 2px 0 0 #2D7DF6":""; });
  }); };
  bindTaps(box);
  $("#mgSel").onchange=e=>{ S.mgMatchSel=e.target.value; S.gameEdit=false; renderManage(); };
  box.querySelectorAll("[data-nav]").forEach(el=>el.onclick=()=>{ S.mgMatchSel=el.dataset.nav; S.gameEdit=false; renderManage(); });
  if($("#mgGameEdit")) $("#mgGameEdit").onclick=()=>{ S.gameEdit=true; renderManage(); };
  box.querySelectorAll("[data-step]").forEach(el=>el.onclick=()=>{ const [f,d]=el.dataset.step.split(":"); const inp=$("#mg"+f); let v=(parseInt(inp.value)||0)+parseInt(d); inp.value=Math.max(0,Math.min(99,v)); });
  // snapshot แต้มรายคน (ทุกวง) ของคู่นี้ → diff ก่อน/หลังบันทึก → popup เมื่อมีแต้มเปลี่ยน
  const multi=S.mgPools.length>1;
  const snapPts=()=>{ const o={}; const m=S.allMatches.find(x=>x.id===selM.id);
    for(const p of S.mgPools) for(const pr of p.preds.filter(x=>x.matchId===selM.id)) o[`${p.code}|${pr.player}`]=scoreMatch(pr,m); return o; };
  const fmtPt=v=>v>0?"+"+v:String(v);
  const diffLines=(before,after)=>Object.keys({...before,...after}).filter(k=>(before[k]||0)!==(after[k]||0)).map(k=>{
    const ci=k.indexOf("|"), code=k.slice(0,ci), name=k.slice(ci+1), pl=S.mgPools.find(x=>x.code===code), from=before[k]||0, to=after[k]||0;
    return {name:multi?`${name} · ${poolTag(pl||{})}`:name, from:fmtPt(from), to:fmtPt(to), up:to>from, down:to<from}; });
  const writeScore=async fin=>{ const hs=parseInt($("#mgHs").value),as=parseInt($("#mgAs").value); if(isNaN(hs)||isNaN(as)){toast("ใส่สกอร์ครบ");return;}
    if(fin&&!(await confirmModal(`จบเกม ${selM.home} ${hs}-${as} ${selM.away}?\nคิดแต้มถาวร ทุกวง`)))return;
    await updateDoc(doc(db,"matches",selM.id), fin?{homeScore:hs,awayScore:as,status:"finished",autoGraded:true,live:false}:{homeScore:hs,awayScore:as,live:true});
    const mo=S.allMatches.find(x=>x.id===selM.id); if(mo)Object.assign(mo,fin?{homeScore:hs,awayScore:as,status:"finished",live:false}:{homeScore:hs,awayScore:as,live:true});
    if(fin)S.gameEdit=false; toast(fin?"จบเกม ✓ (สกอร์)":"อัพเดตสด 🔴 (สกอร์)"); if(!MOCK){ for(const p of S.mgPools) await refetchOne0(p.code); } renderManage(); };
  if($("#mgLive")) $("#mgLive").onclick=()=>writeScore(false);
  if($("#mgResult")) $("#mgResult").onclick=()=>writeScore(true);
  if($("#mgSaveScorers")) $("#mgSaveScorers").onclick=async()=>{
    const before=snapPts();
    for(const p of S.mgPools) await commitScorers(p,selM.id);
    if(!MOCK){ for(const p of S.mgPools) await refetchOne0(p.code); }
    const lines=diffLines(before,snapPts()); renderManage();
    if(lines.length) await alertModal("บันทึกคนยิง ✓ — แต้มที่เปลี่ยน", lines);
    else toast("บันทึกคนยิงแล้ว ✓"); };
}
async function refetchOne0(code){ if(MOCK)return; const cur=S.mgPools.find(p=>p.code===code); const fresh=await fetchPoolData(code,cur&&cur.name); const i=S.mgPools.findIndex(p=>p.code===code); if(i>=0)S.mgPools[i]=fresh; }

// ===================== แท็บ 3: แชมป์ (เลือกวง → เลือกคน → เลือกทีม) =====================
function renderChampTab(box){
  if(!S.mgChampPool && S.mgPools[0]) S.mgChampPool=S.mgPools[0].code;
  const p=pool(S.mgChampPool); const name=S.mgChampName; const pk=(name&&p.champPicks[name])||[];
  const goldCard=inner=>`<div style="background:#1a1410;border:1px solid #3a2f1e;border-radius:16px;padding:15px;margin-bottom:13px;">${inner}</div>`;
  box.innerHTML=`
    ${card(`<div class="k" style="font-weight:700;font-size:14px;margin-bottom:9px;">🏟️ เลือกวง</div>
      <select id="mgChampPoolSel" class="field">${S.mgPools.map(x=>`<option value="${x.code}" ${x.code===S.mgChampPool?"selected":""}>${esc(poolName(x))}</option>`).join("")}</select>`)}
    ${goldCard(`<div class="k" style="font-weight:700;font-size:14px;color:var(--gold);margin-bottom:8px;">🏆 ตั้งผลแชมป์จริง (+10)${p.tournament.picksLocked?' <span style="font-size:10px;color:#caa75a;">· 🔒ล็อกทาย</span>':""}</div>
      <select id="mgSetChampSel" class="field" style="margin-bottom:8px;">${teamOpts(p.tournament.champion||"")}</select>
      <div id="mgSetChampBtn" class="k btnG" style="height:42px;font-size:14px;background:var(--gold);color:#1a1410;">ตั้งแชมป์ (+10)</div>`)}
    ${goldCard(`<div class="k" style="font-weight:700;font-size:14px;color:var(--gold);margin-bottom:8px;">✍️ ทายแชมป์ให้สมาชิก <span style="font-size:10px;color:#caa75a;">· ทะลุล็อก</span></div>
      <select id="mgCpNameSel" class="field" style="margin-bottom:8px;"><option value="">— เลือกสมาชิก —</option>${mgRoster(p).map(n=>`<option value="${esc(n)}" ${n===name?"selected":""}>${esc(n)}</option>`).join("")}</select>
      ${name?`<div style="display:flex;gap:8px;margin-bottom:8px;"><select id="mgCp0" class="field">${champOptsC(pk[0]||"")}</select><select id="mgCp1" class="field">${champOptsC(pk[1]||"")}</select></div>
      <div id="mgCpSaveBtn" class="k btnG" style="height:42px;font-size:14px;">บันทึกทายแชมป์ให้ ${esc(name)}</div>`:`<div class="k" style="color:var(--dim);font-size:12.5px;">— เลือกสมาชิกก่อน —</div>`}`)}`;
  $("#mgChampPoolSel").onchange=e=>{ S.mgChampPool=e.target.value; S.mgChampName=""; renderManage(); };
  $("#mgCpNameSel").onchange=e=>{ S.mgChampName=e.target.value; renderManage(); };
  $("#mgSetChampBtn").onclick=async()=>{ const c=$("#mgSetChampSel").value.trim();
    if(c&&!(await confirmModal(`ตั้งแชมป์ ${c} ของ ${poolName(p)}? (+10 ให้คนทายถูก)`,{danger:false})))return;
    await setDoc(poolDocFor(p.code,"config","tournament"),{champion:c,championLocked:!!c},{merge:true}); toast("ตั้งแชมป์แล้ว 🏆"); refetchOne(p.code); };
  if($("#mgCpSaveBtn")) $("#mgCpSaveBtn").onclick=async()=>{ const t0=$("#mgCp0").value,t1=$("#mgCp1").value; if(t0&&t1&&t0===t1){toast("เลือกทีมซ้ำ");return;}
    const uid=(p.playersByName[name]||{}).uid;   // login → เขียน player doc (deriveChampPicks ให้ player ทับ config → ทะลุ self-pick จริง · admin/super bypass champ-lock ได้) · carry-only → config
    if(uid) await setDoc(poolDocFor(p.code,"players",uid),{name,uid,champ1:t0,champ2:t1},{merge:true});   // ใส่ name+uid — ถ้า player ถูกลบระหว่าง fetch→save merge จะสร้าง doc ครบฟิลด์ (เหมือน auth.js) ไม่ใช่ junk doc ไร้ name/uid
    else await setDoc(poolDocFor(p.code,"config","champPicks"),{[name]:[t0,t1].filter(Boolean)},{merge:true});
    toast("บันทึกแชมป์ให้ "+name+" ✓"); refetchOne(p.code); };
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
