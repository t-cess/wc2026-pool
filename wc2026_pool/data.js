/* ===== data: realtime onSnapshot + renderAll ===== */
import { S } from "./state.js";
import { db, collection, query, orderBy, onSnapshot, poolCol } from "./firebase.js";
import { renderHeader, renderFixtures, renderChampion, renderBoard } from "./views.js";

function applyVisibility(){   // matches = allMatches กรองด้วย startFrom + hidden ของวงนี้
  const sf = S.visibility.startFrom||0, hid = S.visibility.hidden||[];
  S.matches = S.allMatches.filter(m => (m.kickoff||0) >= sf && !hid.includes(m.id));
}
function deriveChampPicks(){   // ฐานจาก config (legacy) + ผู้เล่นเลือกเอง (player doc champ1/champ2) ทับ
  const cp = {...S.configChampPicks};
  Object.entries(S.playersByName).forEach(([name,p])=>{ const a=[p.champ1,p.champ2].filter(Boolean); if(a.length) cp[name]=a; });
  S.champPicks = cp;
}
export function watchData(){
  onSnapshot(query(collection(db,"matches"),orderBy("kickoff")), snap=>{   // ⭐ matches ใช้ร่วม top-level
    S.allMatches = snap.docs.map(d=>({id:d.id,...d.data()})); applyVisibility(); renderAll();
  });
  onSnapshot(poolCol("predictions"), snap=>{
    S.allPreds = snap.docs.map(d=>d.data()); S.myPreds={};
    S.allPreds.forEach(p=>{ if(p.uid===S.me.uid) S.myPreds[p.matchId]=p; }); renderAll();
  });
  onSnapshot(poolCol("config"), snap=>{
    snap.forEach(d=>{ if(d.id==="carry")S.carry=d.data(); if(d.id==="champPicks")S.configChampPicks=d.data(); if(d.id==="tournament")S.tournament=d.data(); if(d.id==="prev")S.prev=d.data();
      if(d.id==="admins")S.admins=d.data().emails||[]; if(d.id==="meta")S.poolMeta=d.data();
      if(d.id==="visibility")S.visibility={startFrom:d.data().startFrom||0,hidden:d.data().hidden||[]}; });
    deriveChampPicks(); applyVisibility(); renderAll();
  });
  onSnapshot(poolCol("players"), snap=>{
    S.playersByName={}; snap.forEach(d=>{ const p=d.data(); if(p.name) S.playersByName[p.name]={photo:p.photo||"",email:p.email||"",uid:p.uid,champ1:p.champ1||"",champ2:p.champ2||""}; });
    deriveChampPicks(); renderAll();
  });
}
export function renderAll(){ renderHeader(); renderFixtures(); renderChampion(); renderBoard(); }   // แอดมินไม่รีเฟรชอัตโนมัติ (กันล้างที่กรอกค้าง)
