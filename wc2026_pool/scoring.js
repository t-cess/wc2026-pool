/* ===== scoring + board calc (กติกาวง) ===== */
import { S, rosterNames } from "./state.js";
import { LOCK_BEFORE_MS } from "./config.js";
import { norm, ymdNYC } from "./utils.js";

export function scoreMatch(p, m){
  if(!p||!m||(m.status!=="finished" && !m.live)) return 0;   // นับเมื่อจบ หรือ กำลัง live
  let pts=0;
  const actual = m.homeScore>m.awayScore?"h":m.homeScore<m.awayScore?"a":"d";
  const g = p.homeScore>p.awayScore?"h":p.homeScore<p.awayScore?"a":"d";
  if(g===actual) pts += actual==="d"?2:1;
  if(p.homeScore===m.homeScore && p.awayScore===m.awayScore) pts+=3;
  if(p.homeScore===0 && p.awayScore===0){
    if(m.homeScore===0 && m.awayScore===0) pts+=1;   // ทาย 0-0 = ทายว่าไม่มีใครยิง
  } else if(p.scorerOk) pts+=1;                        // คนยิง = แอดมิน/auto ติ๊ก (scorerOk)
  return pts;
}
export const lockTs = m => (m.kickoff||0) - LOCK_BEFORE_MS;
export const stateOf = m => m.status==="finished" ? "done" : (S.nowTs>=lockTs(m) ? "locked" : "open");

export function rankMap(tot){ const a=Object.entries(tot).map(([n,t])=>({n,t})).sort((x,y)=>y.t-x.t); const r={}; a.forEach((x,i)=>r[x.n]=i+1); return r; }
export function isToday(ts){ if(!ts) return false; return ymdNYC(ts)===ymdNYC(S.nowTs); }
export function computeBoard(){
  const champion = norm(S.tournament.champion||"");
  const mById = Object.fromEntries(S.matches.map(m=>[m.id,m]));
  const mp={}, tp={};   // แต้มรายคู่รวม / แต้มวันนี้
  S.allPreds.forEach(p=>{ const m=mById[p.matchId]; const pts=scoreMatch(p,m);
    mp[p.player]=(mp[p.player]||0)+pts;
    if(m && (m.status==="finished"||m.live) && isToday(m.kickoff)) tp[p.player]=(tp[p.player]||0)+pts; });
  const names = new Set([...rosterNames(),...Object.keys(S.champPicks)]);
  const cur={};
  const rows=[...names].map(name=>{
    let champPts=0; if(champion) champPts=(S.champPicks[name]||[]).map(norm).filter(t=>t===champion).length*10;
    const total=(S.carry[name]||0)+(mp[name]||0)+champPts;
    cur[name]=total;
    return {name,carryPts:S.carry[name]||0,matchPts:mp[name]||0,todayPts:tp[name]||0,champPts,total,photo:(S.playersByName[name]||{}).photo||""};
  });
  const prevTot={}; rows.forEach(r=>prevTot[r.name]=r.total-r.todayPts);
  const curRank=rankMap(cur), prevRank=rankMap(prevTot);
  rows.forEach(r=>r.move=(prevRank[r.name]||0)-(curRank[r.name]||0));   // >0 = ขึ้น
  rows.sort((a,b)=>b.total-a.total);
  rows.forEach((r,i)=>r.rank=i+1);
  return rows;
}
