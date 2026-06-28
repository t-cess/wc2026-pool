/* ===== scoring + board calc (กติกาวง) ===== */
import { S, rosterNames } from "./state.js";
import { LOCK_BEFORE_MS } from "./config.js";
import { norm, ymdNYC } from "./utils.js";

// ===== รอบน็อกเอาต์ (แพ้คัดออก) — ผล/สกอร์/คนยิง ตัดที่ 90 นาที + ทีมเข้ารอบ +1 =====
// ⚠️ ตรรกะนี้ต้องเป๊ะเท่ากับ scoreMatchNode/isKo/koActual/predAdvance ใน auto/auto-grade.mjs (แหล่งกติกาคู่)
export const KO_GROUPS = new Set(["รอบ 32","รอบ 16","ก่อนรองฯ","รองชนะเลิศ","ชิงที่ 3","ชิงชนะเลิศ","น็อกเอาต์"]);
export const isKo = m => !!(m && (m.ko || KO_GROUPS.has(m.group)));
// สกอร์ที่ใช้ตัดสิน: KO ใช้ 90' (m.reg) ถ้ามี · ไม่งั้น/รอบกลุ่ม ใช้สกอร์จริง (live ยังไม่มี reg → ใช้สด)
export const koActual = m => (isKo(m) && m.reg) ? { h:m.reg.h, a:m.reg.a } : { h:m.homeScore, a:m.awayScore };
// ทีมเข้ารอบที่โพยเลือก: ทายชนะ → ล็อกทีมที่ทายชนะ · ทายเสมอ → advancePick (เลือกเอง)
export const predAdvance = p => { const s=p.homeScore>p.awayScore?"h":p.homeScore<p.awayScore?"a":"d"; return s==="d" ? (p.advancePick||null) : s; };
// ทีมที่ตกรอบแล้ว (จาก KO ที่จบ + รู้ผู้เข้ารอบ) → ใช้หน้าทายแชมป์
export function eliminatedTeams(){ const out=new Set(); S.matches.forEach(m=>{ if(isKo(m) && m.status==="finished" && m.advancer){ out.add(m.advancer==="h"?m.away:m.home); } }); return out; }

export function scoreMatch(p, m){
  if(!p||!m||(m.status!=="finished" && !m.live)) return 0;   // นับเมื่อจบ หรือ กำลัง live
  let pts=0;
  const a = koActual(m);                                       // KO = สกอร์ 90' · กลุ่ม = สกอร์จริง
  const actual = a.h>a.a?"h":a.h<a.a?"a":"d";
  const g = p.homeScore>p.awayScore?"h":p.homeScore<p.awayScore?"a":"d";
  if(g===actual) pts += actual==="d"?2:1;
  if(p.homeScore===a.h && p.awayScore===a.a) pts+=3;
  if(p.homeScore===0 && p.awayScore===0){
    if(a.h===0 && a.a===0) pts+=1;   // ทาย 0-0 = ทายว่าไม่มีใครยิง (ใน 90' สำหรับ KO)
  } else if(p.scorerOk) pts+=1;       // คนยิง (KO = ยิงใน 90')
  if(isKo(m) && m.advancer){ const pick=predAdvance(p); if(pick && pick===m.advancer) pts+=1; }   // ทีมเข้ารอบ +1
  return pts;
}
export const lockTs = m => (m.kickoff||0) - LOCK_BEFORE_MS;
export const stateOf = m => m.status==="finished" ? "done" : (S.nowTs>=lockTs(m) ? "locked" : "open");

export function rankMap(tot){ const a=Object.entries(tot).map(([n,t])=>({n,t})).sort((x,y)=> y.t-x.t || x.n.localeCompare(y.n,"th")); const r={}; a.forEach((x,i)=>r[x.n]=i+1); return r; }   // ตัด tie ด้วยตัวอักษร = ตรงกับตาราง (ลูกศรไม่เพี้ยน)
export function isToday(ts){ if(!ts) return false; return ymdNYC(ts)===ymdNYC(S.nowTs); }
export function computeBoard(){
  const champion = norm(S.tournament.champion||"");
  const mById = Object.fromEntries(S.matches.map(m=>[m.id,m]));
  const mp={}, tp={}, byP={};   // แต้มรายคู่รวม / แต้มวันนี้ / โพยแยกตามคน
  S.allPreds.forEach(p=>{ const m=mById[p.matchId]; const pts=scoreMatch(p,m);
    mp[p.player]=(mp[p.player]||0)+pts;
    (byP[p.player]||(byP[p.player]=[])).push(p);
    if(m && (m.status==="finished"||m.live) && isToday(m.kickoff)) tp[p.player]=(tp[p.player]||0)+pts; });
  const formOf = name => (byP[name]||[])
    .map(p=>({m:mById[p.matchId],p}))
    .filter(x=>x.m && (x.m.status==="finished"||x.m.live))
    .sort((a,b)=>(a.m.kickoff||0)-(b.m.kickoff||0) || String(a.m.id).localeCompare(String(b.m.id)))   // เก่า→ใหม่ · tie คู่เตะพร้อมกันด้วย id ให้ลำดับคงที่ทุกที่
    .slice(-5).map(x=>scoreMatch(x.p,x.m));   // 5 นัดล่าสุด (แต้มต่อนัด 0-6)
  const names = new Set([...rosterNames(),...Object.keys(S.champPicks)]);
  const cur={};
  const rows=[...names].map(name=>{
    let champPts=0; if(champion) champPts=[...new Set((S.champPicks[name]||[]).map(norm))].filter(t=>t===champion).length*10;   // dedup กันทาย "ทีมเดียวกัน 2 ช่อง" → +20 (ยิง Firestore ตรงเลี่ยง UI guard ได้)
    const total=(S.carry[name]||0)+(mp[name]||0)+champPts;
    cur[name]=total;
    return {name,carryPts:S.carry[name]||0,matchPts:mp[name]||0,todayPts:tp[name]||0,champPts,total,form:formOf(name),photo:(S.playersByName[name]||{}).photo||""};
  });
  const prevTot={}; rows.forEach(r=>prevTot[r.name]=r.total-r.todayPts);
  const curRank=rankMap(cur), prevRank=rankMap(prevTot);
  rows.forEach(r=>r.move=(prevRank[r.name]||0)-(curRank[r.name]||0));   // >0 = ขึ้น
  rows.sort((a,b)=> b.total-a.total || a.name.localeCompare(b.name,"th"));   // คะแนนเท่า → เรียงตามตัวอักษร
  rows.forEach((r,i)=>r.rank=i+1);   // อันดับไล่ปกติ 1,2,3,...
  return rows;
}
