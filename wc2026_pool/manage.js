/* ===== manage: "ศูนย์คุมข้ามวง" เฉพาะ super =====
   เปิดมา → รายการวงทั้งหมด (ชื่อ+จำนวนสมาชิก) → เลือกวง → จัดการวงนั้น (ตรวจคะแนน/แชมป์/สมาชิก) สลับวงได้ไม่ reload
   data layer: one-shot getDocs ลง S.mgData (ไม่มี listener) → ทุก handler ต้อง await fetchPool(code) รีเฟรชหลังเขียน
   matches ใช้ร่วม top-level → grade ใช้ S.allMatches (ไม่กรอง visibility ของวง) · เขียน config/players/predictions = poolDocFor(code,...) */
import { S } from "./state.js";
import { db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, poolColFor, poolDocFor } from "./firebase.js";
import { TEAMS, fe, CHAMP_TEAMS, genCode, MOCK } from "./config.js";
import { $, esc, flag, toast, isSuper } from "./utils.js";
import { stateOf, scoreMatch } from "./scoring.js";

const TEAM_LIST = Object.keys(TEAMS).sort((a,b)=>a.localeCompare(b,"th"));
const teamOpts = sel => `<option value="">— เลือกทีม —</option>`+TEAM_LIST.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const champOptsC = sel => `<option value="">— เลือกทีม —</option>`+CHAMP_TEAMS.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
const groupOpts = `<option value="">— กลุ่ม/รอบ —</option>`
  +["A","B","C","D","E","F","G","H","I","J","K","L"].map(g=>`<option value="กลุ่ม ${g}">กลุ่ม ${g}</option>`).join("")
  +["รอบ 32","รอบ 16","ก่อนรองฯ","รองชนะเลิศ","ชิงที่ 3","ชิงชนะเลิศ"].map(r=>`<option value="${r}">${r}</option>`).join("");
const roundOpts = `<option value="">— นัด —</option>`+["นัด 1","นัด 2","นัด 3"].map(r=>`<option value="${r}">${r}</option>`).join("");
const stBtn=`width:40px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:#283042;color:#EEF1F4;font-size:24px;font-weight:700;cursor:pointer;user-select:none;flex:none;`;
const stInp=`width:48px;height:44px;text-align:center;font-family:'Kanit';font-weight:800;font-size:22px;color:#EEF1F4;background:#0E1116;border:1px solid #2A303A;border-radius:10px;flex:none;`;

const poolLabel = code => code ? esc(code) : "วงหลัก";

// ===== data layer (ข้ามวง) =====
function deriveChampPicks(configCP, playersByName){   // = data.js deriveChampPicks: config (legacy) + ผู้เล่นเลือกเอง (champ1/champ2) ทับ
  const cp={...configCP};
  Object.entries(playersByName).forEach(([name,p])=>{ const a=[p.champ1,p.champ2].filter(Boolean); if(a.length) cp[name]=a; });
  return cp;
}
async function loadPoolList(){
  if(MOCK){ S.mgList=[{code:"",name:"วงหลัก (mock)",count:5},{code:"YXL7K",name:"กลุ่มแทงบอลเถื่อนของอาจารย์กุ้ย (mock)",count:2}]; return; }
  let pools=[{code:"",name:"วงหลัก"}];
  try{ const idx=await getDoc(doc(db,"config","poolsIndex")); if(idx.exists()&&Array.isArray(idx.data().pools)) pools=idx.data().pools; }catch(e){}
  const counts=await Promise.all(pools.map(p=>getDoc(poolDocFor(p.code,"config","carry")).then(s=>s.exists()?Object.keys(s.data()).length:0).catch(()=>0)));
  S.mgList=pools.map((p,i)=>({...p,count:counts[i]}));
}
async function fetchPool(code){
  if(MOCK){   // mock ไม่ต่อ DB → ยืมข้อมูลวงปัจจุบันใน S เป็นวงที่เลือก
    S.mgData={ code, carry:{...S.carry}, configChampPicks:{...S.champPicks}, champPicks:{...S.champPicks},
      tournament:{...S.tournament}, admins:[...(S.admins||[])], meta:S.poolMeta, bind:{...(S.bind||{})},
      playersByName:{...S.playersByName}, preds:[...S.allPreds] };
    return;
  }
  const [carryS,champS,tourS,adminsS,metaS,bindS]=await Promise.all([
    getDoc(poolDocFor(code,"config","carry")), getDoc(poolDocFor(code,"config","champPicks")),
    getDoc(poolDocFor(code,"config","tournament")), getDoc(poolDocFor(code,"config","admins")),
    getDoc(poolDocFor(code,"config","meta")), getDoc(poolDocFor(code,"config","bind")) ]);
  const [playersSnap,predsSnap]=await Promise.all([ getDocs(poolColFor(code,"players")), getDocs(poolColFor(code,"predictions")) ]);
  const playersByName={}; playersSnap.forEach(d=>{ const p=d.data(); if(p.name) playersByName[p.name]={photo:p.photo||"",email:p.email||"",uid:p.uid,champ1:p.champ1||"",champ2:p.champ2||""}; });
  const configChampPicks=champS.exists()?champS.data():{};
  S.mgData={ code, carry:carryS.exists()?carryS.data():{}, configChampPicks,
    champPicks:deriveChampPicks(configChampPicks,playersByName),
    tournament:tourS.exists()?tourS.data():{}, admins:adminsS.exists()?(adminsS.data().emails||[]):[],
    meta:metaS.exists()?metaS.data():null, bind:bindS.exists()?bindS.data():{}, playersByName, preds:predsSnap.docs.map(d=>d.data()) };
}
const mgRoster = () => { const d=S.mgData; const s=[...Object.keys(d.carry||{})]; Object.keys(d.playersByName||{}).forEach(n=>{ if(!s.includes(n)) s.push(n); }); return s; };
async function refresh(){ await fetchPool(S.mgPool); renderManage(); }   // เขียนเสร็จ → re-fetch + re-render (ไม่มี listener)

async function commitScorers(code, matchId){   // เขียนคนยิงที่ติ๊กค้างไว้ ลง DB ของวง code · stage: 0=ไม่ให้ 1=คนแรก 2=คนสอง
  const preds=S.mgData.preds.filter(p=>p.matchId===matchId);
  for(const p of preds){ const pid=`${p.matchId}__${p.uid}`;
    if(pid in S.scorerStage){ const v=S.scorerStage[pid];
      const s1=v===1, s2=v===2, ok=v!==0, s1played=(v!==2);
      try{ await setDoc(poolDocFor(code,"predictions",pid),{scorerOk:ok,s1hit:s1,s2hit:s2,s1played,scorerManual:true,s1unsure:false,s2unsure:false},{merge:true}); }catch(e){ toast("คนยิงบันทึกไม่ได้ (Rules?)"); }
      delete S.scorerStage[pid]; } }
}

export function renderManage(){
  if(!isSuper()) return; const box=$("#tab-manage"); if(!box) return;
  // โหลด lazy: รายการวง / ข้อมูลวงที่เลือก
  if(S.mgPool===null){
    if(S.mgList===null){ box.innerHTML=loadingHTML("กำลังโหลดรายการวง…");
      loadPoolList().catch(e=>{ console.warn("loadPoolList:",e); S.mgList=[{code:"",name:"วงหลัก",count:0}]; }).then(renderManage); return; }
    return renderPoolList(box);
  }
  if(!S.mgData || S.mgData.code!==S.mgPool){ box.innerHTML=loadingHTML("กำลังโหลดข้อมูลวง…");
    fetchPool(S.mgPool).catch(e=>{ console.warn("fetchPool:",e); box.innerHTML=errHTML("โหลดข้อมูลวงไม่ได้: "+(e&&e.code||e&&e.message||e)); S.mgPool=null; }).then(()=>{ if(S.mgData&&S.mgData.code===S.mgPool) renderManage(); }); return; }
  return renderPoolManage(box);
}
const loadingHTML = msg => `<div class="k" style="color:var(--dim);text-align:center;padding:40px 0;font-size:14px;">${esc(msg)}</div>`;
const errHTML = msg => `<div class="k" style="color:#ff9aa0;text-align:center;padding:30px 12px;font-size:13px;line-height:1.5;">${esc(msg)}<br><span style="color:var(--dim);">แตะแท็บ "จัดการ" อีกครั้งเพื่อลองใหม่</span></div>`;

// ===================== รายการวงทั้งหมด =====================
function renderPoolList(box){
  const cards=(S.mgList||[]).map(p=>`
    <div style="display:flex;align-items:center;gap:10px;background:#14171D;border:1px solid #232830;border-radius:14px;padding:13px 14px;margin-bottom:9px;">
      <div data-enter="${esc(p.code)}" style="flex:1;min-width:0;cursor:pointer;">
        <div class="k" style="font-weight:800;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}</div>
        <div class="k" style="font-size:11.5px;color:var(--mut);margin-top:2px;">${p.code?`โค้ด ${esc(p.code)}`:"top-level"} · 🧑 ${p.count} คน</div></div>
      <div data-enter="${esc(p.code)}" class="k btnG" style="width:78px;height:40px;font-size:13px;flex:none;">เข้า ▸</div>
      ${p.code?`<div data-delist="${esc(p.code)}" title="เอาออกจากรายการ" class="k" style="cursor:pointer;color:#EF3E42;font-size:11px;font-weight:700;padding:7px 8px;border:1px solid #5a2227;border-radius:9px;flex:none;">เอาออก</div>`:""}
    </div>`).join("")||`<div class="k" style="color:var(--dim);">— ยังไม่มีวง —</div>`;
  box.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin:0 4px 16px;"><h2 class="k" style="margin:0;font-weight:800;font-size:26px;">จัดการ</h2><span class="k" style="font-weight:600;font-size:10px;letter-spacing:1px;color:#b9a6f0;border:1px solid #34294f;border-radius:6px;padding:3px 7px;">SUPER · ทุกวง</span></div>
    <div style="background:#161226;border:1px solid #2e2546;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;color:#b9a6f0;margin-bottom:11px;">🏟️ วงทั้งหมด <span style="font-size:10px;color:#5b626d;font-weight:600;">· แตะเพื่อเข้าไปจัดการ</span></div>${cards}</div>
    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;margin-bottom:12px;">➕ เพิ่มคู่แข่งขัน <span style="font-size:10px;color:#5b626d;font-weight:600;">· ใช้ร่วมทุกวง</span></div>
      <div style="display:flex;gap:8px;margin-bottom:8px;"><select id="amHome" class="field">${teamOpts()}</select><select id="amAway" class="field">${teamOpts()}</select></div>
      <div style="display:flex;gap:8px;margin-bottom:8px;"><select id="amGroup" class="field">${groupOpts}</select><select id="amRound" class="field">${roundOpts}</select></div>
      <input id="amKick" class="field" placeholder="📅 แตะเลือกวัน-เวลาเตะ" readonly style="margin-bottom:12px;cursor:pointer;">
      <div id="amAdd" class="k btnG" style="height:44px;font-size:14px;">เพิ่มคู่</div></div>
    <div style="background:#161226;border:1px solid #2e2546;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;color:#b9a6f0;margin-bottom:11px;">🆕 สร้างวงใหม่</div>
      <div style="display:flex;gap:8px;margin-bottom:7px;"><input id="npName" class="field" placeholder="ชื่อวงใหม่ (เช่น วงออฟฟิศ)"><div id="npCreate" class="k btnG" style="width:92px;height:44px;font-size:13px;flex:none;">+ สร้างวง</div></div>
      <div id="npResult" class="k" style="font-size:12px;line-height:1.5;color:#5fcf94;word-break:break-all;"></div></div>`;
  box.querySelectorAll("[data-enter]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.enter; S.mgPool=code; S.adminSel=""; S.gameEdit=false; S.mgCarryEdit=false; box.innerHTML=loadingHTML("กำลังโหลดข้อมูลวง…"); await fetchPool(code); renderManage(); });
  box.querySelectorAll("[data-delist]").forEach(el=>el.onclick=async()=>{ const code=el.dataset.delist;
    if(!confirm(`เอาวง "${code}" ออกจากรายการ?\n(ไม่ได้ลบข้อมูลวงจริง — สมาชิก/โพย/คะแนนยังอยู่ และลิงก์ ?pool=${code} ยังเข้าได้ · แค่ซ่อนจากรายการนี้)`))return;
    const pools=(S.mgList||[]).filter(p=>p.code!==code).map(({code,name})=>({code,name}));
    try{ await setDoc(doc(db,"config","poolsIndex"),{pools}); S.mgList=S.mgList.filter(p=>p.code!==code); toast("เอาออกจากรายการแล้ว"); renderManage(); }catch(e){ toast("เอาออกไม่ได้ (Rules?)"); } });
  bindAddMatch(box);
  if($("#npCreate")) $("#npCreate").onclick=async()=>{ const name=$("#npName").value.trim(); if(!name){toast("ใส่ชื่อวง");return;}
    const code=genCode(), created=Date.now();
    try{ await setDoc(doc(db,"pools",code,"config","meta"),{name,owner:S.me.email,createdAt:created});
      await setDoc(doc(db,"pools",code,"config","admins"),{emails:[]});
      await setDoc(doc(db,"pools",code,"config","visibility"),{startFrom:created});
      const pools=[...(S.mgList||[]).map(({code,name})=>({code,name})),{code,name}];
      await setDoc(doc(db,"config","poolsIndex"),{pools});   // เพิ่มเข้า registry
      const link=location.origin+location.pathname+"?pool="+code;
      try{ await navigator.clipboard.writeText(link); }catch(e){}
      if($("#npResult")) $("#npResult").innerHTML=`สร้างวง "<b>${esc(name)}</b>" (${code}) ✓ ก๊อปลิงก์เชิญแล้ว`;
      toast(`สร้างวง ${code} ✓`); S.mgList=null; renderManage();   // reload list
    }catch(e){ toast("สร้างวงไม่ได้ (Rules?)"); } };
}

// ===================== จัดการวงที่เลือก =====================
function renderPoolManage(box){
  const D=S.mgData, code=S.mgPool;
  // ----- ตรวจคะแนน: ใช้ S.allMatches (ไม่กรอง visibility) -----
  const gradeable=S.allMatches.filter(m=>stateOf(m)!=="open");
  const opts=gradeable.map(m=>`<option value="${m.id}" ${m.id===S.adminSel?"selected":""}>${esc(m.home)} vs ${esc(m.away)} ${m.status==="finished"?`(จบ ${m.homeScore}-${m.awayScore})`:"(ปิดรับ)"}</option>`).join("");
  const selM=gradeable.find(m=>m.id===S.adminSel)||gradeable[gradeable.length-1]; S.adminSel=selM?selM.id:"";
  const selIdx=selM?gradeable.findIndex(m=>m.id===selM.id):-1;
  const amArrow=(d,g)=>{ const t=gradeable[selIdx+d], off=selIdx<0||!t;
    return `<div ${off?"":`data-amnav="${t.id}"`} class="k" style="flex:none;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;background:#283042;border:1px solid #2A303A;color:#EEF1F4;font-size:15px;${off?"opacity:.3;":"cursor:pointer;"}">${g}</div>`; };
  const glocked=!!(selM&&selM.status==="finished"&&!S.gameEdit);
  let gradeRows="";
  if(selM){ const preds=D.preds.filter(p=>p.matchId===selM.id);
    gradeRows=preds.length?preds.map(p=>{ const zero=p.homeScore===0&&p.awayScore===0; const pid=`${p.matchId}__${p.uid}`;
      const scored=scoreMatch(p,selM)>0;   // โพยนี้ได้แต้ม → สกอร์เขียว
      const stage=(pid in S.scorerStage)?S.scorerStage[pid]:(p.scorerOk?(p.s1hit?1:2):0);
      const nm=(t,on,u)=>`<span style="color:${on?'#5fcf94':u?'#E0A33E':'var(--mut)'};${on?'font-weight:700;':u?'font-weight:600;':''}"${u&&!on?' title="ระบบอ่านชื่อไม่ออก ยังไม่แน่ใจ — รีวิว/เติมดิก"':''}>${esc(t)}${u&&!on?' ?':''}</span>`;
      const s2active=!p.s1hit&&!p.s1played;
      const scTxt = `${p.scorer1?nm(p.scorer1,stage===1,p.s1unsure):""}${p.scorer1&&p.scorer2?' <span style="color:#3f454e;">/</span> ':""}${p.scorer2?nm(p.scorer2,stage===2,p.s2unsure&&s2active):""}`||"(ไม่ใส่คนยิง)";
      const btn=(n)=>`<div data-pick="${pid}:${n}" class="k" style="cursor:pointer;flex:none;font-weight:800;font-size:13px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:${stage===n?"#10301f":"#23272f"};color:${stage===n?"#5fcf94":"#8A929E"};border:1px solid ${stage===n?"#1f5a39":"#333"};">${n}</div>`;
      const amber=stage===0&&(p.s1unsure||(p.s2unsure&&s2active));
      const rejX=(pid in S.scorerStage)&&S.scorerStage[pid]===0;
      const btnX=`<div data-pick="${pid}:0" title="ไม่ให้คะแนนคนยิง (ยืนยันไม่ได้ยิง · เคลียร์ ?)" class="k" style="cursor:pointer;flex:none;font-weight:800;font-size:13px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:${rejX?"#3a1c1f":"#23272f"};color:${rejX?"#ff6b6b":"#8A929E"};border:1px solid ${rejX?"#5a2227":"#333"};">✕</div>`;
      const tick = zero ? `<span class="k" style="font-size:11px;color:#5b626d;flex:none;">0-0</span>`
        : glocked ? `<span class="k" style="flex:none;font-weight:700;font-size:12px;color:${stage?"#5fcf94":"#5b626d"};">${stage===1?"✓ คน1":stage===2?"✓ คน2":"—"}</span>`
        : `<div style="display:flex;gap:5px;flex:none;">${p.scorer1?btn(1):""}${p.scorer2?btn(2):""}${amber?btnX:""}</div>`;
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #1c2129;"><div class="k" style="width:48px;flex:none;font-weight:600;font-size:13px;">${esc(p.player)}</div><div class="k" style="width:36px;flex:none;font-weight:700;color:${scored?'#5fcf94':'#EEF1F4'};">${p.homeScore}-${p.awayScore}</div><div style="flex:1;min-width:0;font-size:12px;word-break:break-word;line-height:1.3;">${scTxt}</div>${tick}</div>`; }).join(""):`<div class="k" style="color:var(--dim);padding:10px;">ยังไม่มีคนส่งโพยคู่นี้ในวงนี้</div>`;
  }
  // ----- สมาชิก (carry) -----
  const memberRows=mgRoster().map(n=>{ const p=D.playersByName[n]; const claimed=!!p;
    return `<div style="display:flex;align-items:center;gap:8px;background:#14171D;border:1px solid #232830;border-radius:11px;padding:9px 11px;margin-bottom:6px;">
      <div style="flex:1;min-width:0;"><div class="k" style="font-weight:700;font-size:14px;">${esc(n)}</div><div style="font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${claimed?esc(p.email||"เข้าแล้ว"):"ยังไม่ล็อกอิน"}</div></div>
      <input data-mcarry="${esc(n)}" class="field" inputmode="numeric" value="${D.carry[n]||0}" ${S.mgCarryEdit?"":"disabled"} style="width:74px;height:34px;text-align:center;margin:0;${S.mgCarryEdit?"":"opacity:.5;"}">
      <div data-delmem="${esc(n)}" class="k" style="cursor:pointer;color:#EF3E42;font-size:11px;font-weight:700;padding:6px 8px;border:1px solid #5a2227;border-radius:8px;flex:none;">ลบ</div></div>`; }).join("")||`<div class="k" style="color:var(--dim);font-size:13px;">— ยังไม่มีสมาชิก —</div>`;
  const adminRows=(D.admins||[]).map(e=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><div class="k" style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e)}</div><div data-deladmin="${esc(e)}" class="k" style="cursor:pointer;color:#EF3E42;font-size:11px;font-weight:700;padding:4px 9px;border:1px solid #5a2227;border-radius:8px;">ถอด</div></div>`).join("")||`<div class="k" style="color:var(--dim);font-size:12px;margin-bottom:6px;">— ยังไม่มี (super ดูแลได้อยู่แล้ว) —</div>`;

  box.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin:0 4px 6px;"><div id="mgBack" class="k" style="cursor:pointer;font-size:13px;color:#b9a6f0;font-weight:700;padding:5px 9px;border:1px solid #34294f;border-radius:9px;">◀︎ วงทั้งหมด</div></div>
    <div style="display:flex;align-items:center;gap:8px;margin:0 4px 14px;"><h2 class="k" style="margin:0;font-weight:800;font-size:23px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(D.meta&&D.meta.name||poolLabel(code))}</h2><span class="k" style="font-weight:600;font-size:10px;letter-spacing:1px;color:#b9a6f0;border:1px solid #34294f;border-radius:6px;padding:3px 7px;flex:none;">${code?esc(code):"หลัก"}</span></div>

    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:12px;">✅ ตรวจคะแนน (กรอกผล + ให้แต้มคนยิง)${glocked?'<span style="font-size:11px;color:#9cc3f3;font-weight:600;">🔒 จบแล้ว</span>':''}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">${amArrow(-1,"◀︎")}<select id="amSel" class="field" style="flex:1;margin:0;">${opts}</select>${amArrow(1,"▶︎")}</div>
      ${selM?`<div style="${glocked?'opacity:.55;pointer-events:none;':''}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">${flag(selM.home)}<div class="k" style="flex:1;min-width:0;font-weight:600;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(selM.home)} ${fe(selM.home)}</div><div style="display:flex;align-items:center;gap:6px;flex:none;"><div data-step="Hs:-1" class="k" style="${stBtn}">−</div><input id="amHs" inputmode="numeric" value="${selM.homeScore||0}" ${glocked?"disabled":""} style="${stInp}"><div data-step="Hs:1" class="k" style="${stBtn}">+</div></div></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">${flag(selM.away)}<div class="k" style="flex:1;min-width:0;font-weight:600;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(selM.away)} ${fe(selM.away)}</div><div style="display:flex;align-items:center;gap:6px;flex:none;"><div data-step="As:-1" class="k" style="${stBtn}">−</div><input id="amAs" inputmode="numeric" value="${selM.awayScore||0}" ${glocked?"disabled":""} style="${stInp}"><div data-step="As:1" class="k" style="${stBtn}">+</div></div></div></div>
      ${glocked?`<div id="amGameEdit" class="k" style="height:44px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #2A303A;color:#9cc3f3;font-weight:700;font-size:14px;cursor:pointer;">🔓 แก้ไขผล (คู่นี้จบแล้ว)</div>`:`<div style="display:flex;gap:8px;"><div id="amLive" class="k" style="flex:1;height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;background:#3a1c1f;color:#ff6b6b;font-weight:700;font-size:13px;cursor:pointer;">🔴 อัพเดตสด</div><div id="amResult" class="k btnG" style="flex:1;height:42px;font-size:14px;">จบเกม</div></div><div class="k" style="font-size:10.5px;color:#5b626d;margin-top:4px;">อัพเดตสด/จบเกม = แก้ "คู่" (ใช้ร่วมทุกวง) · ติ๊กคนยิง = เฉพาะวงนี้</div>`}
      <div id="amDel" class="k" style="height:36px;margin-top:8px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #5a2227;color:#EF3E42;font-weight:700;font-size:13px;cursor:pointer;">ลบคู่ (ทุกวง)</div>
      <div class="k" style="font-size:12px;color:var(--mut);margin:14px 0 4px;">ติ๊กคนยิงถูก (+1) · โพย/คนยิงที่ได้แต้ม = เขียว${glocked?" — กดแก้ไขผลก่อนถึงติ๊กได้":""}</div>
      <div style="background:#0E1116;border:1px solid #232830;border-radius:11px;overflow:hidden;">${gradeRows}</div>`:`<div class="k" style="color:var(--dim);">— ไม่มีคู่ที่ปิดรับ —</div>`}</div>

    <div style="background:#1a1410;border:1px solid #3a2f1e;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;color:var(--gold);margin-bottom:8px;">🏆 แชมป์ <span style="font-size:10px;color:#caa75a;font-weight:600;">· super ทะลุล็อก${D.tournament.picksLocked?" (วงนี้ล็อกอยู่)":""}</span></div>
      <div class="k" style="font-size:12px;color:var(--gold);margin-bottom:6px;">ตั้งผลแชมป์จริง (+10 ให้คนทายถูก)</div>
      <select id="amChampion" class="field" style="margin-bottom:8px;">${teamOpts(D.tournament.champion||"")}</select>
      <div id="amSetChamp" class="k btnG" style="height:42px;font-size:14px;background:var(--gold);color:#1a1410;">ตั้งแชมป์ (+10)</div>
      <div style="border-top:1px solid #3a2f1e;margin-top:13px;padding-top:13px;">
        <div class="k" style="font-size:12px;color:var(--gold);margin-bottom:8px;">ทายแชมป์ให้สมาชิก (เลือกคน → เลือกทีม · ทะลุล็อกแอดมิน)</div>
        <select id="cpName" class="field" style="margin-bottom:8px;"><option value="">— เลือกสมาชิก —</option>${mgRoster().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>
        <div style="display:flex;gap:8px;margin-bottom:8px;"><select id="cpT0" class="field">${champOptsC("")}</select><select id="cpT1" class="field">${champOptsC("")}</select></div>
        <div id="cpSave" class="k btnG" style="height:42px;font-size:14px;">บันทึกทายแชมป์ให้คนนี้</div></div></div>

    <div style="background:#14171D;border:1px solid #232830;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:12px;">🧑‍🤝‍🧑 สมาชิก (${mgRoster().length})${S.mgCarryEdit?'<span style="font-size:11px;color:#5fcf94;font-weight:600;">แก้คะแนนยกมา</span>':''}</div>${memberRows}
      ${S.mgCarryEdit?`<div id="mcSave" class="k btnG" style="height:40px;font-size:13px;margin-top:6px;">บันทึกคะแนนยกมา</div>`:`<div id="mcEdit" class="k" style="height:38px;display:flex;align-items:center;justify-content:center;font-size:13px;margin-top:6px;border-radius:11px;border:1px solid #2A303A;color:#8A929E;cursor:pointer;">🔓 แก้คะแนนยกมา</div>`}
      <div class="k" style="font-size:11px;color:var(--mut);margin:12px 0 6px;">เพิ่มสมาชิก → เขา login มาเลือกชื่อนี้ได้ + ผูกคะแนนยกมา</div>
      <div style="display:flex;gap:8px;"><input id="amMemName" class="field" placeholder="ชื่อสมาชิกใหม่"><input id="amMemCarry" class="field" inputmode="numeric" placeholder="ยกมา" style="width:84px;"></div>
      <div id="amMemAdd" class="k btnG" style="height:42px;font-size:14px;margin-top:8px;">เพิ่มสมาชิก</div></div>

    <div style="background:#161226;border:1px solid #2e2546;border-radius:16px;padding:15px;margin-bottom:13px;">
      <div class="k" style="font-weight:700;font-size:15px;color:#b9a6f0;margin-bottom:11px;">🛡️ แอดมินของวงนี้ <span style="font-size:10px;color:#5b626d;font-weight:600;">· ดูแลสมาชิก (ตรวจคะแนน/ตารางคู่ = super เท่านั้น)</span></div>${adminRows}
      <input id="npAdminEmail" class="field" inputmode="email" placeholder="อีเมลแอดมินใหม่" style="margin-top:4px;margin-bottom:7px;">
      <div id="npIsPlayer" data-on="0" style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:12.5px;color:#cfc2f5;margin-bottom:8px;user-select:none;"><span id="npIsPlayerBox" style="width:22px;height:22px;border-radius:6px;border:1.5px solid #6b5fa0;background:#0E1116;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;flex:none;"></span> เป็นผู้เล่นด้วย (ลงทายในวง)</div>
      <input id="npPlayerName" class="field" placeholder="ชื่อผู้เล่นในวง (ถ้าติ๊กด้านบน)" style="margin-bottom:8px;">
      <div id="npAddAdmin" class="k btnG" style="height:44px;font-size:14px;">+ เพิ่มแอดมิน</div></div>`;

  // ===== handlers =====
  $("#mgBack").onclick=()=>{ S.mgPool=null; S.mgData=null; S.adminSel=""; S.gameEdit=false; S.mgCarryEdit=false; renderManage(); };

  // --- ตรวจคะแนน ---
  box.querySelectorAll("[data-pick]").forEach(el=>el.onclick=()=>{ const [pid,nStr]=el.dataset.pick.split(":"); const n=+nStr;
    const p=D.preds.find(x=>`${x.matchId}__${x.uid}`===pid);
    const cur=(pid in S.scorerStage)?S.scorerStage[pid]:(p&&p.s1hit?1:(p&&p.s2hit?2:(p&&p.scorerOk?1:0)));
    const nv=(cur===n)?0:n; S.scorerStage[pid]=nv;
    box.querySelectorAll(`[data-pick^="${pid}:"]`).forEach(b=>{ const bn=+b.dataset.pick.split(":")[1]; const on=nv===bn;
      const c=bn===0?["#3a1c1f","#ff6b6b","#5a2227"]:["#10301f","#5fcf94","#1f5a39"];
      b.style.background=on?c[0]:"#23272f"; b.style.color=on?c[1]:"#8A929E"; b.style.border="1px solid "+(on?c[2]:"#333"); }); });
  $("#amSel").onchange=e=>{ S.adminSel=e.target.value; S.gameEdit=false; renderManage(); };
  box.querySelectorAll("[data-amnav]").forEach(el=>el.onclick=()=>{ S.adminSel=el.dataset.amnav; S.gameEdit=false; renderManage(); });
  if($("#amGameEdit")) $("#amGameEdit").onclick=()=>{ S.gameEdit=true; renderManage(); };
  box.querySelectorAll("[data-step]").forEach(el=>el.onclick=()=>{ const [f,d]=el.dataset.step.split(":"); const inp=$("#am"+f); let v=(parseInt(inp.value)||0)+parseInt(d); v=Math.max(0,Math.min(99,v)); inp.value=v; });
  if($("#amLive")) $("#amLive").onclick=async()=>{ if(!S.adminSel){toast("ยังไม่มีคู่");return;} const hs=parseInt($("#amHs").value),as=parseInt($("#amAs").value); if(isNaN(hs)||isNaN(as)){toast("ใส่สกอร์ครบ");return;}
    await updateDoc(doc(db,"matches",S.adminSel),{homeScore:hs,awayScore:as,live:true}); const mo=S.allMatches.find(x=>x.id===S.adminSel); if(mo)Object.assign(mo,{homeScore:hs,awayScore:as,live:true});
    await commitScorers(code,S.adminSel); toast("อัพเดตสด 🔴 บันทึกแล้ว"); refresh(); };
  if($("#amResult")) $("#amResult").onclick=async()=>{ if(!S.adminSel){toast("ยังไม่มีคู่ที่ปิดรับ");return;} const hs=parseInt($("#amHs").value),as=parseInt($("#amAs").value); if(isNaN(hs)||isNaN(as)){toast("ใส่สกอร์ครบ");return;} const mm=S.allMatches.find(x=>x.id===S.adminSel); if(!confirm(`จบเกม ${mm.home} ${hs}-${as} ${mm.away}?\n(ปิด + คิดแต้มถาวร · กระทบทุกวง)`))return;
    await updateDoc(doc(db,"matches",S.adminSel),{homeScore:hs,awayScore:as,status:"finished",autoGraded:true,live:false}); if(mm)Object.assign(mm,{homeScore:hs,awayScore:as,status:"finished",live:false});
    await commitScorers(code,S.adminSel); S.gameEdit=false; toast("จบเกม ✓ บันทึกแล้ว"); refresh(); };
  if($("#amDel")) $("#amDel").onclick=async()=>{ if(!S.adminSel)return; if(!confirm("ลบคู่นี้? (กระทบทุกวง — คู่ใช้ร่วมกัน)"))return; const id=S.adminSel; await deleteDoc(doc(db,"matches",id)); S.allMatches=S.allMatches.filter(m=>m.id!==id); S.matches=S.matches.filter(m=>m.id!==id); S.adminSel=""; S.gameEdit=false; toast("ลบคู่แล้ว"); renderManage(); };

  // --- แชมป์ (super ทะลุล็อก) ---
  if($("#amSetChamp")) $("#amSetChamp").onclick=async()=>{ const c=$("#amChampion").value.trim(); if(c&&!confirm(`ตั้งแชมป์ ${c} ของวงนี้? (+10 ให้คนทายถูก)`))return;
    await setDoc(poolDocFor(code,"config","tournament"),{champion:c,championLocked:!!c},{merge:true}); toast("ตั้งแชมป์แล้ว 🏆"); refresh(); };
  if($("#cpName")){
    $("#cpName").onchange=()=>{ const pk=D.champPicks[$("#cpName").value]||[]; $("#cpT0").value=pk[0]||""; $("#cpT1").value=pk[1]||""; };
    $("#cpSave").onclick=async()=>{ const n=$("#cpName").value; if(!n){ toast("เลือกสมาชิกก่อน"); return; } const t0=$("#cpT0").value,t1=$("#cpT1").value; if(t0&&t1&&t0===t1){ toast("เลือกทีมซ้ำ"); return; }
      await setDoc(poolDocFor(code,"config","champPicks"),{[n]:[t0,t1].filter(Boolean)},{merge:true}); toast("บันทึกแชมป์ให้ "+n+" ✓ (ทะลุล็อก)"); refresh(); };   // super ไม่เช็ก picksLocked
  }

  // --- สมาชิก / carry ---
  if($("#mcEdit")) $("#mcEdit").onclick=()=>{ S.mgCarryEdit=true; renderManage(); };
  if($("#mcSave")) $("#mcSave").onclick=async()=>{ if(!confirm("บันทึกคะแนนยกมาใหม่ของวงนี้? (กระทบยอดรวมทุกคน)"))return; const c2={...(D.carry||{})}; box.querySelectorAll("[data-mcarry]").forEach(i=>{c2[i.dataset.mcarry]=parseInt(i.value)||0;});
    await setDoc(poolDocFor(code,"config","carry"),c2,{merge:true}); S.mgCarryEdit=false; toast("บันทึกคะแนนยกมาแล้ว"); refresh(); };
  if($("#amMemAdd")) $("#amMemAdd").onclick=async()=>{ const n=$("#amMemName").value.trim(); if(!n){toast("ใส่ชื่อ");return;} const v=parseInt($("#amMemCarry").value)||0;
    await setDoc(poolDocFor(code,"config","carry"),{...D.carry,[n]:v},{merge:true}); toast("เพิ่มสมาชิกแล้ว ✓"); refresh(); };
  box.querySelectorAll("[data-delmem]").forEach(el=>el.onclick=async()=>{ const n=el.dataset.delmem; const p=D.playersByName[n];
    const admE=p&&p.email&&(D.admins||[]).includes(p.email)?p.email:(Object.entries(D.bind||{}).find(([e,nm])=>nm===n&&(D.admins||[]).includes(e))||[])[0];
    if(!confirm(`ลบสมาชิก "${n}"?${admE?" (เป็นแอดมินด้วย — จะถอดแอดมิน + ปลดผูกอีเมล)":""} (ลบคะแนนยกมา + ปลดการจับคู่)`))return;
    const c2={...D.carry}; delete c2[n]; await setDoc(poolDocFor(code,"config","carry"),c2);   // ไม่ merge = ลบ key
    if(p&&p.uid){ try{ await deleteDoc(poolDocFor(code,"players",p.uid)); }catch(e){} }
    if(admE){ const emails=(D.admins||[]).filter(e=>e!==admE); await setDoc(poolDocFor(code,"config","admins"),{emails});
      const b2={...(D.bind||{})}; delete b2[admE]; await setDoc(poolDocFor(code,"config","bind"),b2); }
    toast("ลบสมาชิกแล้ว"); refresh(); });

  // --- แอดมินของวง ---
  if($("#npIsPlayer")) $("#npIsPlayer").onclick=()=>{ const el=$("#npIsPlayer"), on=el.dataset.on==="1"; el.dataset.on=on?"0":"1";
    const b=$("#npIsPlayerBox"); if(b){ b.style.background=on?"#0E1116":"#7c6fc0"; b.style.borderColor=on?"#6b5fa0":"#9d8ee8"; b.textContent=on?"":"✓"; } };
  if($("#npAddAdmin")) $("#npAddAdmin").onclick=async()=>{ const em=$("#npAdminEmail").value.trim().toLowerCase(); if(!em||!em.includes("@")){toast("ใส่อีเมลให้ถูก");return;}
    const isPlayer=$("#npIsPlayer")&&$("#npIsPlayer").dataset.on==="1"; const pname=$("#npPlayerName")?$("#npPlayerName").value.trim():"";
    if(isPlayer&&!pname){toast("ติ๊กเป็นผู้เล่น → ใส่ชื่อด้วย");return;}
    const emails=[...new Set([...(D.admins||[]),em])];
    try{ await setDoc(poolDocFor(code,"config","admins"),{emails},{merge:true});
      if(isPlayer&&pname){ const cv=(D.carry&&D.carry[pname])||0; await setDoc(poolDocFor(code,"config","carry"),{[pname]:cv},{merge:true}); await setDoc(poolDocFor(code,"config","bind"),{[em]:pname},{merge:true}); }
      toast(isPlayer?`เพิ่มแอดมิน+ผู้เล่น "${pname}" ✓`:"เพิ่มแอดมินแล้ว ✓"); refresh();
    }catch(e){ toast("เพิ่มไม่ได้ (Rules?)"); } };
  box.querySelectorAll("[data-deladmin]").forEach(el=>el.onclick=async()=>{ const em=el.dataset.deladmin; if(!confirm(`ถอดแอดมิน ${em}?`))return;
    const emails=(D.admins||[]).filter(x=>x!==em);
    try{ await setDoc(poolDocFor(code,"config","admins"),{emails}); toast("ถอดแล้ว"); refresh(); }catch(e){ toast("ถอดไม่ได้ (Rules?)"); } });
}

// ===== เพิ่มคู่ (global · ใช้ใน pool-list view) =====
function bindAddMatch(box){
  if($("#amAdd")) $("#amAdd").onclick=async()=>{ const h=$("#amHome").value,a=$("#amAway").value;
    const sel=S.fp&&S.fp.selectedDates[0]; const k=sel?sel.getTime():0;
    const g=[$("#amGroup").value,$("#amRound").value].filter(Boolean).join(" · ");
    if(!h||!a||!k){toast("เลือกทีม 2 ทีม + วัน-เวลา");return;} if(h===a){toast("เลือกทีมซ้ำ");return;}
    const id="m_"+Date.now(); const m={home:h,away:a,group:g,kickoff:k,homeScore:0,awayScore:0,scorers:[],status:"upcoming"};
    await setDoc(doc(db,"matches",id),m); S.allMatches.push({id,...m}); toast("เพิ่มคู่แล้ว ✓ (ทุกวง)");
    if($("#amHome"))$("#amHome").value=""; if($("#amAway"))$("#amAway").value=""; };
  if(window.flatpickr && $("#amKick")) S.fp=flatpickr("#amKick",{enableTime:true,time_24hr:true,minuteIncrement:30,disableMobile:true,
    formatDate:d=>d.toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" น."});
  if($("#amGroup")){ const lockRound=()=>{ const g=$("#amGroup").value; const ko=g && !g.startsWith("กลุ่ม"); const r=$("#amRound"); r.disabled=ko; if(ko)r.value=""; r.style.opacity=ko?".5":"1"; };
    $("#amGroup").onchange=lockRound; lockRound(); }
}
