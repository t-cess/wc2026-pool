/* ===== predRow: แถวโพยรายคน — ใช้ร่วม "หน้าวง" (fixtures-detail) กับ "หน้าตรวจคนยิง" (manage) ให้เป๊ะกัน =====
   ป้อน pred + match ตรงกัน → ได้ HTML เดียวกันเสมอ · ต่างกันแค่ opts.tapKey (หน้าตรวจ = แตะคนยิงได้) */
import { esc } from "./utils.js";
import { scoreMatch, isKo, koActual, predAdvance } from "./scoring.js";

// opts: { showPts, isMe, tapKey }  — tapKey ตั้งค่า = เซลล์คนยิงแตะได้ (ใส่ data-tap) สำหรับหน้าตรวจคนยิง
export function predRowHTML(p, m, opts={}){
  const { showPts=false, isMe=false, tapKey=null } = opts;
  const pts = showPts ? scoreMatch(p,m) : null;
  const a = koActual(m);   // KO = สกอร์ 90' · กลุ่ม = สกอร์จริง (badge ผล/สกอร์เทียบตัวนี้)
  const zero = p.homeScore===0 && p.awayScore===0;
  const sgn=(x,y)=>(x>y)-(x<y);
  const resG = showPts && sgn(p.homeScore,p.awayScore)===sgn(a.h,a.a);    // ผลทาย (แพ้/ชนะ/เสมอ) ถูก — เทียบ 90' สำหรับ KO
  const exact = showPts && p.homeScore===a.h && p.awayScore===a.a;        // สกอร์เป๊ะ → 🔥
  // เขียว=ตรงคนยิง · amber+?=ระบบอ่านชื่อไม่ออก ไม่แน่ใจจะได้แต้ม · แดง=ไม่ลง · ขีดฆ่า=ไม่ได้ใช้ · เทา=ปกติ
  const nm=(t,g,u,np,sk)=>g?`<span style="color:#1FB85E;font-weight:700;">${esc(t)} ✓</span>`:u?`<span style="color:#E0A33E;font-weight:600;" title="ระบบอ่านชื่อไม่ออก ยังไม่แน่ใจว่าจะได้แต้ม">${esc(t)} ?</span>`:np?`<span style="color:#EF3E42;">${esc(t)} <b style="font-weight:800;">ไม่ลง</b></span>`:sk?`<span style="color:var(--dim);text-decoration:line-through;">${esc(t)}</span>`:`<span style="color:var(--mut);">${esc(t)}</span>`;
  let scH, hasName=false;
  if(zero){ const noScHit = showPts && m && a.h===0 && a.a===0;   // ทาย 0-0 "ไม่มีคนยิง" ถูก (จบ 0-0 ที่ 90' = +1) → เขียว ✓ เหมือนคนยิงถูก
    scH=noScHit?`<span style="color:#1FB85E;font-weight:700;">ไม่มีคนยิง ✓</span>`:`<span style="color:var(--mut);">ไม่มีคนยิง</span>`; }
  else { const s2active=!p.s1hit&&!p.s1played; const ps=[];
    if(p.scorer1){ hasName=true; ps.push(nm(p.scorer1, showPts&&p.s1hit, showPts&&p.s1unsure, showPts&&p.s1played===false)); }
    if(p.scorer2){ hasName=true; ps.push(nm(p.scorer2, showPts&&p.s2hit&&s2active, showPts&&p.s2unsure&&s2active, showPts&&p.s2played===false, showPts&&!s2active)); }
    scH=ps.join(` <span style="color:#3f454e;">/</span> `)||`<span style="color:var(--mut);">—</span>`; }
  const tappable = !!(tapKey&&hasName);   // 0-0 / ไม่ใส่คนยิง = แตะไม่ได้
  // KO: badge "เข้ารอบ" — ทายชนะล็อกทีมชนะ / ทายเสมอใช้ advancePick · โชว์ทีมที่เลือกตั้งแต่ก่อนรู้ผล (กลางๆ) · รู้ผลแล้ว = ✓/✗
  let advH="";
  if(isKo(m)){ const pick=predAdvance(p); const advTeam = pick==="h"?m.home:pick==="a"?m.away:null;
    if(advTeam){ const known=!!m.advancer, ok=known&&pick===m.advancer;
      const bg=!known?"#1e2633":ok?"#10301f":"#2a1e1e", fg=!known?"#9fb3cc":ok?"#5fcf94":"#c98b8b";
      const label=!known?"เข้ารอบ: "+esc(advTeam):ok?"เข้ารอบ ✓":esc(advTeam)+" ✗";
      advH = `<div class="k" style="flex:none;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:99px;background:${bg};color:${fg};white-space:nowrap;">${label}</div>`;
    } else if(showPts) advH = `<div class="k" style="flex:none;font-size:10.5px;color:#5b626d;">เข้ารอบ —</div>`; }   // ทายเสมอ ยังไม่เลือกทีม
  const scCell=`<div ${tappable?`data-tap="${tapKey}" `:""}style="flex:1;min-width:0;font-size:12px;word-break:break-word;line-height:1.3;${tappable?"cursor:pointer;":""}">${scH}</div>`;
  return `<div ${tapKey?`data-prow="${tapKey}" `:""}style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;margin-bottom:4px;background:${isMe?"#16241a":"transparent"};border:1px solid ${isMe?"#1f5a39":"transparent"};">
    <div class="k" style="width:46px;flex:none;font-weight:600;font-size:13.5px;">${esc(p.player)}</div>
    <div class="k" style="width:58px;flex:none;font-weight:700;font-size:14px;color:${resG?'#1FB85E':'#cfd4db'};">${p.homeScore}-${p.awayScore}${exact?' 🔥':resG?' ✓':''}</div>
    ${scCell}${advH}
    <div class="k" style="flex:none;text-align:right;font-weight:800;${(showPts&&pts>=5)?`min-width:40px;font-size:23px;color:#FFD24A;animation:auraGlow 1.6s ease-in-out infinite;`:`width:30px;font-size:15px;color:${showPts?(pts>0?"#1FB85E":"#5b626d"):"transparent"};`}">${showPts?(pts>0?"+"+pts:pts):""}</div></div>`;
}

// ⚽ คนยิงจริงในแมตช์ — รวมตามคน+ฝั่ง (เหย้าเขียว/เยือนเทา) + นาที + OG/จุดโทษ · ใช้ร่วมหน้าวง+หน้าตรวจ ให้เป๊ะกัน (กัน drift)
export function matchScorersHTML(m){
  const sep=` <span style="color:#3f454e;">·</span> `;
  if((m.goals||[]).length){
    const byp={}; m.goals.forEach(g=>{ const k=g.name+"|"+g.side; (byp[k]=byp[k]||{name:g.name,side:g.side,times:[]}); byp[k].times.push((g.time||"")+(g.og?" OG":g.pen?" (จุดโทษ)":"")); });
    return Object.values(byp).map(s=>`<span style="color:${s.side==='h'?'#9fe0b6':'#cdd6e0'};font-weight:600;">${esc(s.name)} <span style="color:#5b626d;font-weight:500;">${s.times.join(", ")}</span></span>`).join(sep);
  }
  return (m.scorers||[]).map(s=>`<span style="color:#cdd6e0;font-weight:600;">${esc(s)}</span>`).join(sep);   // fallback: มีแค่ array ชื่อ (ไม่มี goals) → เทากลางๆ
}

// แปลงสถานะที่แตะ (2 ตัวอักษร [คนแรก][คนสอง]) → effective pred ที่ใช้แสดง/คิดแต้ม (= ตรงกับที่ commitScorers จะบันทึก)
//   g=ยิง · x=ไม่ลง · อื่นๆ=ลงไม่ยิง · แตะแล้ว = แน่ใจ → ล้าง unsure
export function effPredFromState(pr, st){
  const s1hit=st[0]==="g", s2hit=st[1]==="g";
  return { ...pr, s1hit, s2hit, s1played:st[0]!=="x", s2played:st[1]!=="x", scorerOk:s1hit||s2hit, s1unsure:false, s2unsure:false };
}
