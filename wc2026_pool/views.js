/* ===== views: header / nav / fixtures / champion / board ===== */
import { S, rosterNames } from "./state.js";
import { poolDoc, setDoc } from "./firebase.js";
import { fe, CHAMP_TEAMS } from "./config.js";
import { $, esc, flag, avatarHTML, bindAvatars, toast, countdown, fmtKo, isAdmin } from "./utils.js";
import { stateOf, lockTs, scoreMatch, computeBoard } from "./scoring.js";
import { renderAdmin } from "./admin.js";

/* ===== header ===== */
export function renderHeader(){
  const rows=computeBoard(); const mine=rows.find(r=>r.name===S.me.name);
  $("#meRank").textContent = mine?("อันดับ "+mine.rank):"—";
  $("#meTotal").innerHTML = (mine?mine.total:0)+`<span style="font-size:11px;color:var(--mut);font-weight:500;margin-left:2px;">แต้ม</span>`;
}

/* ===== nav ===== */
export function renderNav(){
  const tabs=[["fixtures","ทายผล"],["champion","แชมป์"],["board","คะแนน"]];
  if(isAdmin()) tabs.push(["admin","แอดมิน"]);
  const nav=$("#bottomNav"); nav.innerHTML="";
  tabs.forEach(([k,label])=>{
    const active=S.tab===k;
    const d=document.createElement("div");
    d.style.cssText="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:7px 0;cursor:pointer;";
    d.innerHTML=`<div style="width:22px;height:3px;border-radius:99px;background:${active?"#1FB85E":"transparent"};"></div>
      <div class="k" style="font-weight:${active?700:500};font-size:12px;color:${active?"#EEF1F4":"#5b626d"};">${label}</div>`;
    d.onclick=()=>{ S.tab=k; ["fixtures","champion","board","admin"].forEach(t=>$("#tab-"+t).classList.toggle("hidden",t!==k)); renderNav(); if(k==="admin")renderAdmin(); };
    nav.appendChild(d);
  });
}

/* ===== fixtures ===== */
export function renderFixtures(){
  const box=$("#tab-fixtures");
  const openCount=S.matches.filter(m=>stateOf(m)==="open").length;
  const liveCount=S.matches.filter(m=>m.live).length;
  const filters=[["all","ทั้งหมด"],["open","เปิดทาย"],["locked","ปิดรับ"],["done","จบแล้ว"]];
  let html=`<div style="display:flex;align-items:baseline;justify-content:space-between;margin:0 4px 14px;">
      <h2 class="k" style="margin:0;font-weight:800;font-size:26px;">โปรแกรมทาย</h2>
      ${liveCount?`<span class="k" style="font-weight:700;font-size:12px;color:#ff6b6b;background:#3a1c1f;border:1px solid #5a2227;padding:3px 10px;border-radius:99px;white-space:nowrap;"><span style="animation:pulse 1.4s infinite;">🔴</span> ${liveCount} คู่กำลังเตะ</span>`:`<span class="k" style="font-size:12px;color:var(--mut);">${openCount} คู่เปิดทาย</span>`}</div>
    <div style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;padding:0 4px 2px;">`;
  filters.forEach(([k,label])=>{ const a=S.filter===k;
    html+=`<div data-f="${k}" class="k flt" style="flex:none;font-weight:600;font-size:13px;padding:8px 16px;border-radius:99px;cursor:pointer;white-space:nowrap;background:${a?"#EEF1F4":"#14171D"};color:${a?"#0B0D11":"#8A929E"};border:1px solid ${a?"#EEF1F4":"#262b33"};">${label}</div>`; });
  html+=`</div>`;

  let list=S.matches.map(m=>({m,st:stateOf(m)}));
  if(S.filter!=="all") list=list.filter(x=>x.st===S.filter);
  if(S.filter==="done"||S.filter==="all") list.sort((a,b)=>(b.m.kickoff||0)-(a.m.kickoff||0));   // จบแล้ว/ทั้งหมด: คู่ล่าสุดไว้บน
  if(!list.length) html+=`<p class="k" style="color:var(--dim);text-align:center;margin-top:30px;">ไม่มีคู่ในหมวดนี้</p>`;

  list.forEach(({m,st})=>{
    const rowBase="display:flex;align-items:center;gap:12px;padding:7px 0;";
    const pill = st==="done" ? `<div class="k" style="font-weight:700;font-size:11px;padding:4px 10px;border-radius:99px;background:#16243a;color:#9cc3f3;">จบ</div>`
      : (st==="locked" && m.live) ? `<div class="k" style="font-weight:700;font-size:11px;padding:4px 10px;border-radius:99px;background:#3a1c1f;color:#ff6b6b;"><span style="animation:pulse 1.4s infinite;">🔴</span> สด${m.clock?` · ${esc(m.clock)}`:""}</div>`
      : st==="locked" ? `<div class="k" style="font-weight:700;font-size:11px;padding:4px 10px;border-radius:99px;background:#3a1c1f;color:#f0a3a8;">ปิดรับ</div>`
      : `<div class="k" style="font-weight:700;font-size:11px;padding:4px 10px;border-radius:99px;background:#10301f;color:#5fcf94;">เปิดทาย</div>`;
    let inner=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
        <div class="k" style="font-size:12px;color:var(--mut);">${esc(m.group||"")} · ${fmtKo(m)}</div>${pill}</div>`;

    if(st==="open"){
      const saved=S.myPreds[m.id];
      const editMode=!saved||S.editing[m.id];
      const subs=S.allPreds.filter(x=>x.matchId===m.id).map(x=>x.player);
      const subLine=`<div class="k" style="margin-top:10px;font-size:11.5px;color:#8A929E;">📨 ${subs.length}/${rosterNames().length} ส่งแล้ว${subs.length?` <span style="color:#5fcf94;">(${subs.map(esc).join(", ")})</span>`:""}</div>`;
      const cdRow=lbl=>`<div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;"><span class="k" id="cd_${m.id}" style="font-size:11.5px;color:#5b626d;">⏱ ${countdown(lockTs(m)-S.nowTs)}</span>${lbl}</div>`;
      if(editMode){
        const p=saved||{};
        const sBox=`width:52px;height:46px;text-align:center;font-family:'Kanit';font-weight:700;font-size:25px;color:#EEF1F4;background:#0E1116;border:1px solid #2A303A;border-radius:11px;`;
        inner+=`<div style="${rowBase}">${flag(m.home)}<div class="k" style="flex:1;font-weight:600;font-size:18px;">${esc(m.home)} ${fe(m.home)}</div><input id="hs_${m.id}" inputmode="numeric" maxlength="2" value="${p.homeScore??""}" placeholder="0" style="${sBox}"></div>
          <div style="${rowBase}">${flag(m.away)}<div class="k" style="flex:1;font-weight:600;font-size:18px;">${esc(m.away)} ${fe(m.away)}</div><input id="as_${m.id}" inputmode="numeric" maxlength="2" value="${p.awayScore??""}" placeholder="0" style="${sBox}"></div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;"><input id="s1_${m.id}" class="field" value="${esc(p.scorer1||"")}" placeholder="คนยิง ตัวจบสกอร์"><input id="s2_${m.id}" class="field" value="${esc(p.scorer2||"")}" placeholder="คนยิง สำรอง"></div>
          ${subLine}${cdRow(`<div id="save_${m.id}" class="k btnG" style="font-weight:700;font-size:14px;padding:9px 18px;">บันทึกโพย</div>`)}`;
      } else {
        const sc=w=>`font-family:'Kanit';font-weight:800;font-size:26px;width:52px;text-align:center;color:${w?"#1FB85E":"#EEF1F4"};`;
        const zero=saved.homeScore===0&&saved.awayScore===0;
        const sclist=zero?"ไม่มีคนยิง":(esc([saved.scorer1,saved.scorer2].filter(Boolean).join(" / "))||"—");
        inner+=`<div class="k" style="display:inline-block;font-weight:700;font-size:11px;color:#5fcf94;background:#10301f;border:1px solid #1f5a39;padding:3px 10px;border-radius:99px;margin-bottom:8px;">✓ บันทึกโพยแล้ว</div>
          <div style="${rowBase}">${flag(m.home)}<div class="k" style="flex:1;font-weight:600;font-size:18px;">${esc(m.home)} ${fe(m.home)}</div><div style="${sc(saved.homeScore>saved.awayScore)}">${saved.homeScore}</div></div>
          <div style="${rowBase}">${flag(m.away)}<div class="k" style="flex:1;font-weight:600;font-size:18px;">${esc(m.away)} ${fe(m.away)}</div><div style="${sc(saved.awayScore>saved.homeScore)}">${saved.awayScore}</div></div>
          <div class="k" style="margin-top:8px;font-size:12.5px;color:var(--mut);">คนยิง: <span style="color:#cfd4db;">${sclist}</span></div>
          ${subLine}${cdRow(`<div id="edit_${m.id}" class="k" style="font-weight:700;font-size:14px;padding:9px 18px;border-radius:12px;background:#283042;color:#EEF1F4;cursor:pointer;">แก้โพย</div>`)}`;
      }
    } else {
      const done=st==="done";
      const showScore = done || m.live;
      const scStyle=w=>`font-family:'Kanit';font-weight:800;font-size:26px;width:52px;text-align:center;color:${w?"#1FB85E":"#EEF1F4"};`;
      inner+=`<div style="${rowBase}">${flag(m.home)}<div class="k" style="flex:1;font-weight:600;font-size:18px;">${esc(m.home)} ${fe(m.home)}</div>
          <div style="${scStyle(showScore&&m.homeScore>m.awayScore)}">${showScore?m.homeScore:"–"}</div></div>
        <div style="${rowBase}">${flag(m.away)}<div class="k" style="flex:1;font-weight:600;font-size:18px;">${esc(m.away)} ${fe(m.away)}</div>
          <div style="${scStyle(showScore&&m.awayScore>m.homeScore)}">${showScore?m.awayScore:"–"}</div></div>`;
      if(showScore && (m.goals||[]).length){   // ⚽ คนยิง + นาที (เหย้าเขียว/เยือนเทา)
        const byp={}; m.goals.forEach(g=>{ const k=g.name+"|"+g.side; (byp[k]=byp[k]||{name:g.name,side:g.side,times:[]}); byp[k].times.push((g.time||"")+(g.og?" OG":g.pen?" (จุดโทษ)":"")); });
        const items=Object.values(byp).map(s=>`<span style="color:${s.side==='h'?'#9fe0b6':'#cdd6e0'};font-weight:600;">${esc(s.name)} <span style="color:#5b626d;font-weight:500;">${s.times.join(", ")}</span></span>`).join(` <span style="color:#3f454e;">·</span> `);
        inner+=`<div class="k" style="margin-top:7px;font-size:12px;line-height:1.55;display:flex;gap:6px;"><span>⚽</span><span style="flex:1;">${items}</span></div>`;
      }
      const showPts = done || m.live;   // สด = คิดแต้ม real-time ด้วย
      const raw=S.allPreds.filter(x=>x.matchId===m.id).map(p=>({...p,pts:showPts?scoreMatch(p,m):null}));
      if(done) raw.sort((a,b)=>b.pts-a.pts);   // live ไม่เรียง (กันแถวกระโดด)
      const mine=raw.find(r=>r.uid===S.me.uid);
      const note=done?("คุณได้ "+(mine?mine.pts:0)+" แต้มจากคู่นี้")
        :(m.live?("🔴 ตอนนี้คุณได้ "+(mine?mine.pts:0)+" แต้ม (สด)"):("ปิดรับแล้ว · "+raw.length+" คนส่งโพย"));
      const exp=!!S.expanded[m.id];
      inner+=`<div style="margin-top:13px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #232830;padding-top:12px;">
          <span class="k" style="font-size:12.5px;color:var(--mut);">${note}</span>
          <div data-toggle="${m.id}" class="k" style="font-weight:600;font-size:12.5px;color:#2D7DF6;cursor:pointer;">${exp?"ซ่อนโพย ▴":"ดูโพยทั้งหมด ("+raw.length+") ▾"}</div></div>`;
      if(exp){ inner+=`<div style="margin-top:10px;">`;
        if(!raw.length) inner+=`<div class="k" style="color:var(--dim);padding:8px 10px;">ไม่มีคนส่งโพย</div>`;
        raw.forEach(p=>{ const isMe=p.uid===S.me.uid; const zero=p.homeScore===0&&p.awayScore===0;
          const sgn=(a,b)=>(a>b)-(a<b);
          const resG=showPts && sgn(p.homeScore,p.awayScore)===sgn(m.homeScore,m.awayScore);   // ผลทาย (แพ้/ชนะ/เสมอ) ถูก
          const exact=showPts && p.homeScore===m.homeScore && p.awayScore===m.awayScore;        // สกอร์เป๊ะ → มงกุฎ
          const nm=(t,g)=>g?`<span style="color:#1FB85E;font-weight:700;">${esc(t)} ✓</span>`:`<span style="color:var(--mut);">${esc(t)}</span>`;
          let scH;
          if(zero) scH=`<span style="color:var(--mut);">ไม่มีคนยิง</span>`;
          else { const ps=[]; if(p.scorer1)ps.push(nm(p.scorer1, showPts&&p.s1hit)); if(p.scorer2)ps.push(nm(p.scorer2, showPts&&p.s2hit&&!p.s1played)); scH=ps.join(` <span style="color:#3f454e;">/</span> `)||"—"; }
          inner+=`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;margin-bottom:4px;background:${isMe?"#16241a":"transparent"};border:1px solid ${isMe?"#1f5a39":"transparent"};">
            <div class="k" style="width:46px;flex:none;font-weight:600;font-size:13.5px;">${esc(p.player)}</div>
            <div class="k" style="width:58px;flex:none;font-weight:700;font-size:14px;color:${resG?'#1FB85E':'#cfd4db'};">${p.homeScore}-${p.awayScore}${exact?' ⭐':resG?' ✓':''}</div>
            <div style="flex:1;min-width:0;font-size:12px;word-break:break-word;line-height:1.3;">${scH}</div>
            <div class="k" style="width:30px;flex:none;text-align:right;font-weight:800;font-size:15px;color:${showPts?(p.pts>0?"#1FB85E":"#5b626d"):"transparent"};">${showPts?(p.pts>0?"+"+p.pts:p.pts):""}</div></div>`; });
        inner+=`</div>`; }
    }
    html+=`<div style="background:#14171D;border:1px solid #232830;border-radius:18px;padding:15px;margin-bottom:13px;">${inner}</div>`;
  });
  box.innerHTML=html;

  // handlers
  box.querySelectorAll(".flt").forEach(el=> el.onclick=()=>{ S.filter=el.dataset.f; renderFixtures(); });
  box.querySelectorAll("[data-toggle]").forEach(el=> el.onclick=()=>{ const id=el.dataset.toggle; S.expanded[id]=!S.expanded[id]; renderFixtures(); });
  list.forEach(({m,st})=>{ if(st!=="open") return;
    const saved=S.myPreds[m.id]; const editMode=!saved||S.editing[m.id];
    if(editMode){
      const hs=$("#hs_"+m.id), as=$("#as_"+m.id), s1=$("#s1_"+m.id), s2=$("#s2_"+m.id);
      if(hs){
        const upd=()=>{ const z=parseInt(hs.value)===0&&parseInt(as.value)===0; s1.disabled=s2.disabled=z;
          if(z){ s1.value="";s2.value=""; s1.placeholder="0-0 = ไม่มีคนยิง"; } else s1.placeholder="คนยิง ตัวจบสกอร์"; };
        hs.oninput=e=>{ e.target.value=e.target.value.replace(/\D/g,"").slice(0,2); upd(); };
        as.oninput=e=>{ e.target.value=e.target.value.replace(/\D/g,"").slice(0,2); upd(); };
        upd(); $("#save_"+m.id).onclick=()=>savePred(m);
      }
    } else {
      const e=$("#edit_"+m.id); if(e) e.onclick=()=>{ S.editing[m.id]=true; renderFixtures(); };
    }
  });
}
async function savePred(m){
  if(!S.me.name){ toast("เข้าแบบแอดมิน ไม่ได้ร่วมทาย"); return; }
  if(S.nowTs>=lockTs(m)){ toast("ปิดรับแล้ว"); renderFixtures(); return; }
  const hs=parseInt($("#hs_"+m.id).value), as=parseInt($("#as_"+m.id).value);
  if(isNaN(hs)||isNaN(as)){ toast("ใส่สกอร์ให้ครบ"); return; }
  const zero=hs===0&&as===0;
  const pred={uid:S.me.uid,player:S.me.name,matchId:m.id,homeScore:hs,awayScore:as,
    scorer1:zero?"":$("#s1_"+m.id).value.trim(), scorer2:zero?"":$("#s2_"+m.id).value.trim()};
  try{ await setDoc(poolDoc("predictions",`${m.id}__${S.me.uid}`),pred); S.editing[m.id]=false; toast("บันทึกโพยแล้ว ✓"); renderFixtures(); }
  catch(e){ toast("บันทึกไม่ได้ (อาจปิดรับ)"); }
}

/* ===== champion ===== */
export function renderChampion(){
  const box=$("#tab-champion");
  const locked = !!(S.tournament.picksLocked||S.tournament.championLocked);
  let html=`<div style="display:flex;align-items:baseline;justify-content:space-between;margin:0 4px 14px;">
      <h2 class="k" style="margin:0;font-weight:800;font-size:26px;">ทายแชมป์</h2>
      <span class="k" style="font-size:12px;color:var(--green);">ทีมละ +10</span></div>`;
  const mine = S.champPicks[S.me.name]||[];
  const canPick = !locked && !!S.me.name;   // ผู้เล่นเลือกแชมป์เองได้เมื่อยังไม่ล็อก
  html+=`<div style="background:linear-gradient(135deg,#1a1410,#14171D);border:1px solid #3a2f1e;border-radius:18px;padding:16px;margin-bottom:14px;">
      <div class="k" style="font-size:12px;color:var(--gold);letter-spacing:.5px;margin-bottom:12px;">โพยแชมป์ของคุณ · ${locked?"🔒 ปิดรับแล้ว":"เลือกได้เลย · ทีมละ +10"}</div>`;
  if(canPick){
    const opt = sel => `<option value="">— เลือกทีม —</option>`+CHAMP_TEAMS.map(n=>`<option value="${esc(n)}" ${n===sel?"selected":""}>${fe(n)} ${esc(n)}</option>`).join("");
    html+=`<div style="display:flex;gap:11px;"><select id="myChamp0" class="field">${opt(mine[0])}</select><select id="myChamp1" class="field">${opt(mine[1])}</select></div>
      <div id="myChampSave" class="k btnG" style="height:42px;margin-top:11px;font-size:14px;background:var(--gold);color:#1a1410;">บันทึกทายแชมป์</div></div>`;
  } else {
    html+=`<div style="display:flex;gap:11px;">`;
    [0,1].forEach(i=>{ const n=mine[i];
      html+=`<div style="flex:1;background:#0E1116;border:1px solid #2a2418;border-radius:13px;padding:13px;display:flex;align-items:center;gap:11px;">
          ${n?flag(n):`<div class="k" style="width:42px;height:30px;border-radius:6px;background:#222730;color:#5b626d;display:flex;align-items:center;justify-content:center;font-weight:700;">–</div>`}
          <div><div class="k" style="font-size:10px;color:var(--mut);">แชมป์ ${i+1}</div>
          <div class="k" style="font-weight:700;font-size:15px;">${n?esc(n)+" "+fe(n):"ยังไม่เลือก"}</div></div></div>`; });
    html+=`</div></div>`;
  }

  html+=`<div class="k" style="font-weight:700;font-size:14px;margin:4px 4px 11px;">โพยแชมป์ของเพื่อน</div>`;
  const others=Object.keys(S.champPicks).filter(n=>n!==S.me.name);
  if(!others.length) html+=`<p class="k" style="color:var(--dim);margin:0 4px;">ยังไม่มีข้อมูล</p>`;
  others.forEach(n=>{ const tms=S.champPicks[n]||[]; const ph=(S.playersByName[n]||{}).photo||"";
    html+=`<div style="display:flex;align-items:center;gap:12px;background:#14171D;border:1px solid #232830;border-radius:13px;padding:12px 14px;margin-bottom:9px;">
        ${avatarHTML(ph,38)}
        <div class="k" style="width:48px;flex:none;font-weight:700;font-size:15px;">${esc(n)}</div>
        <div style="flex:1;display:flex;flex-direction:column;gap:7px;">`;
    tms.forEach(t=>{ html+=`<div style="display:flex;align-items:center;gap:9px;">${flag(t,true)}<span class="k" style="font-weight:600;font-size:14px;color:#cfd4db;">${esc(t)} ${fe(t)}</span></div>`; });
    html+=`</div></div>`; });
  box.innerHTML=html; bindAvatars(box);
  if($("#myChampSave")) $("#myChampSave").onclick=async()=>{
    const c1=$("#myChamp0").value, c2=$("#myChamp1").value;
    if(c1&&c2&&c1===c2){ toast("เลือกทีมซ้ำ"); return; }
    try{ await setDoc(poolDoc("players",S.me.uid),{champ1:c1,champ2:c2},{merge:true}); toast("บันทึกทายแชมป์แล้ว ✓"); }
    catch(e){ toast("บันทึกไม่ได้: "+(e.code||e.message)); }
  };
}

/* ===== board ===== */
export function renderBoard(){
  const box=$("#tab-board");
  const rows=computeBoard();
  const champion=S.tournament.champion||"";
  const todayChip=t=> t>0
    ? `<div class="k" style="font-weight:700;font-size:12px;padding:3px 9px;border-radius:99px;background:#10301f;color:#5fcf94;white-space:nowrap;">+${t}</div>`
    : `<div class="k" style="font-weight:700;font-size:12px;padding:3px 9px;border-radius:99px;background:#1a1e25;color:#5b626d;white-space:nowrap;">+0</div>`;
  let html=`<div style="display:flex;align-items:baseline;justify-content:space-between;margin:0 4px 14px;">
      <h2 class="k" style="margin:0;font-weight:800;font-size:26px;">ตารางคะแนน</h2>
      <span class="k" style="font-size:11px;color:var(--mut);display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:50%;background:#1FB85E;animation:pulse 1.6s infinite;"></span>สด</span></div>`;
  if(S.tournament.batchLabel) html+=`<div style="display:flex;align-items:center;gap:8px;margin:0 4px 14px;padding:9px 13px;background:#14171D;border:1px solid #232830;border-radius:12px;">
      <span class="k" style="font-weight:700;font-size:10px;letter-spacing:1px;color:#5fcf94;background:#10301f;padding:3px 8px;border-radius:6px;">อัพเดต</span>
      <span style="font-size:12px;color:var(--mut);">${esc(S.tournament.batchLabel)}</span></div>`;
  const moveHTML=mv=> mv>0?`<span class="k" style="font-size:11px;color:#1FB85E;">▲</span>`:mv<0?`<span class="k" style="font-size:11px;color:#EF3E42;">▼</span>`:`<span class="k" style="font-size:11px;color:#5b626d;">–</span>`;
  if(rows.length){
    const L=rows[0]; const isMe=L.name===S.me.name;
    html+=`<div style="position:relative;background:linear-gradient(135deg,#113322 0%,#0f1f17 50%,#14171D 100%);border:1px solid #2a7a4e;border-radius:22px;padding:20px;margin-bottom:18px;overflow:hidden;box-shadow:0 0 0 1px rgba(31,184,94,.12),0 20px 44px -20px rgba(31,184,94,.5);">
        <div style="position:absolute;top:-25px;bottom:-85px;right:-12px;width:200px;background:url('assets/trophy.png') right center/contain no-repeat;opacity:.07;pointer-events:none;"></div>
        <div style="position:absolute;top:0;left:0;width:55%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.16),transparent);animation:shine 4.6s ease-in-out infinite;pointer-events:none;"></div>
        <div style="position:relative;display:flex;align-items:center;gap:9px;">
          <span class="k" style="font-weight:700;font-size:12px;letter-spacing:3px;color:#5fcf94;text-transform:uppercase;">★ จ่าฝูง</span>
          <span style="font-size:14px;">${moveHTML(L.move)}</span>
          ${isMe?`<span class="k" style="font-weight:700;font-size:10px;letter-spacing:1px;color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);padding:2px 8px;border-radius:99px;">คุณ</span>`:""}</div>
        <div style="display:flex;align-items:center;gap:15px;margin-top:14px;position:relative;">
          <div style="position:relative;flex:none;animation:floatY 3.4s ease-in-out infinite;">
            <div style="box-shadow:0 8px 20px -4px rgba(31,184,94,.7);border-radius:50%;">${avatarHTML(L.photo,54)}</div>
            <div style="position:absolute;top:-13px;right:-8px;transform:rotate(26deg);filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45));pointer-events:none;"><svg width="27" height="21" viewBox="0 0 26 20" fill="none"><path d="M2 6 L6.5 12 L13 3 L19.5 12 L24 6 L24 16 L2 16 Z" fill="#FFD23F" stroke="#b8860b" stroke-width="1" stroke-linejoin="round"/><rect x="2.5" y="14.6" width="21" height="3.6" rx="1.2" fill="#FFC107" stroke="#b8860b" stroke-width=".8"/><circle cx="2" cy="6" r="1.7" fill="#fff3b0" stroke="#b8860b" stroke-width=".6"/><circle cx="13" cy="3" r="1.9" fill="#ff5b6e" stroke="#b8860b" stroke-width=".6"/><circle cx="24" cy="6" r="1.7" fill="#fff3b0" stroke="#b8860b" stroke-width=".6"/></svg></div>
          </div>
          <div style="flex:1;min-width:0;">
            <div class="k" style="font-weight:800;font-size:32px;color:#fff;line-height:1;">${esc(L.name)}</div>
            <div class="k" style="display:inline-block;margin-top:9px;font-weight:700;font-size:12px;color:#04210F;background:#1FB85E;padding:4px 12px;border-radius:99px;white-space:nowrap;box-shadow:0 0 16px -2px rgba(31,184,94,.85);">+${L.todayPts} วันนี้</div></div>
          <div style="flex:none;text-align:right;line-height:.82;position:relative;">
            <div style="position:absolute;inset:-22px;background:radial-gradient(circle,rgba(31,184,94,.38),transparent 70%);animation:glowPulse 2.6s ease-in-out infinite;pointer-events:none;"></div>
            <div class="k" style="position:relative;font-weight:800;font-size:56px;color:#27d26e;text-shadow:0 0 24px rgba(31,184,94,.65);">${L.total}</div>
            <div class="k" style="position:relative;font-size:11px;color:#5fcf94;letter-spacing:1px;">แต้มรวม</div></div></div></div>`;
    html+=`<div style="display:flex;align-items:center;padding:0 14px 8px;" class="k"><div style="width:30px;font-size:11px;color:#5b626d;">#</div><div style="flex:1;font-size:11px;color:#5b626d;">ผู้เล่น</div><div style="margin-right:10px;font-size:11px;color:#5b626d;">วันนี้</div><div style="width:42px;text-align:right;font-size:11px;color:#5b626d;">รวม</div></div>`;
    rows.slice(1).forEach(r=>{ const m_=r.name===S.me.name;
      html+=`<div style="display:flex;align-items:center;gap:8px;padding:13px 14px;border-radius:14px;margin-bottom:8px;background:${m_?"#16241a":"#14171D"};border:1px solid ${m_?"#1f5a39":"#232830"};">
          <div class="k" style="width:24px;font-weight:800;font-size:18px;color:#5b626d;">${String(r.rank).padStart(2,"0")}</div>
          ${avatarHTML(r.photo,34)}
          <div style="flex:1;min-width:0;display:flex;align-items:center;gap:7px;"><span class="k" style="font-weight:700;font-size:16px;">${esc(r.name)}</span>${moveHTML(r.move)}${m_?`<span class="k" style="font-weight:700;font-size:10px;color:#5fcf94;background:#10301f;padding:2px 8px;border-radius:99px;">คุณ</span>`:""}</div>
          ${todayChip(r.todayPts)}
          <div class="k" style="width:42px;text-align:right;font-weight:800;font-size:24px;">${r.total}</div></div>`; });
  }
  html+=`<div style="text-align:center;margin-top:8px;font-size:11px;color:#3f454e;">${champion?("แชมป์: "+esc(champion)+" · "):""}ชนะ +1 · เสมอ +2 · สกอร์เป๊ะ +3 · คนยิง +1 · แชมป์ +10</div>`;
  box.innerHTML=html; bindAvatars(box);
}
