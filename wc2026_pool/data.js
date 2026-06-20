/* ===== data: realtime onSnapshot + renderAll ===== */
import { S } from "./state.js";
import { db, collection, query, orderBy, onSnapshot } from "./firebase.js";
import { renderHeader, renderFixtures, renderChampion, renderBoard } from "./views.js";

export function watchData(){
  onSnapshot(query(collection(db,"matches"),orderBy("kickoff")), snap=>{
    S.matches = snap.docs.map(d=>({id:d.id,...d.data()})); renderAll();
  });
  onSnapshot(collection(db,"predictions"), snap=>{
    S.allPreds = snap.docs.map(d=>d.data()); S.myPreds={};
    S.allPreds.forEach(p=>{ if(p.uid===S.me.uid) S.myPreds[p.matchId]=p; }); renderAll();
  });
  onSnapshot(collection(db,"config"), snap=>{
    snap.forEach(d=>{ if(d.id==="carry")S.carry=d.data(); if(d.id==="champPicks")S.champPicks=d.data(); if(d.id==="tournament")S.tournament=d.data(); if(d.id==="prev")S.prev=d.data(); });
    renderAll();
  });
  onSnapshot(collection(db,"players"), snap=>{
    S.playersByName={}; snap.forEach(d=>{ const p=d.data(); if(p.name) S.playersByName[p.name]={photo:p.photo||"",email:p.email||"",uid:p.uid}; });
    renderAll();
  });
}
export function renderAll(){ renderHeader(); renderFixtures(); renderChampion(); renderBoard(); }   // แอดมินไม่รีเฟรชอัตโนมัติ (กันล้างที่กรอกค้าง)
