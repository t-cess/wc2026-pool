/* ===== data: realtime onSnapshot + renderAll ===== */
import { S } from "./state.js";
import { db, collection, query, orderBy, where, onSnapshot, poolCol } from "./firebase.js";
import { renderHeader, renderFixtures, renderChampion, renderBoard } from "./views.js";
import { renderAdmin } from "./admin.js";
import { isAdmin } from "./utils.js";

function applyVisibility(){   // matches = allMatches กรองด้วย startFrom + hidden ของวงนี้
  const sf = S.visibility.startFrom||0, hid = S.visibility.hidden||[];
  S.matches = S.allMatches.filter(m => (m.kickoff||0) >= sf && !hid.includes(m.id));
}
function deriveChampPicks(){   // ฐานจาก config (legacy) + ผู้เล่นเลือกเอง (player doc champ1/champ2) ทับ
  const cp = {...S.configChampPicks};
  Object.entries(S.playersByName).forEach(([name,p])=>{ const a=[p.champ1,p.champ2].filter(Boolean); if(a.length) cp[name]=a; });
  S.champPicks = cp;
}

// ----- โพย: รวม "ของตัวเอง" + "ของคนอื่นที่เปิดเผยแล้ว (revealed)" เป็น S.allPreds -----
let ownPreds=[], otherPreds=[];
function mergePreds(){
  const byId={};   // dedup ด้วย matchId__uid (own ทับ other)
  otherPreds.forEach(p=>byId[p.matchId+"__"+p.uid]=p);
  ownPreds.forEach(p=>byId[p.matchId+"__"+p.uid]=p);
  S.allPreds=Object.values(byId);
  S.myPreds={}; ownPreds.forEach(p=>{ if(p.uid===S.me.uid) S.myPreds[p.matchId]=p; });
  renderAll();
}
export function watchData(){
  onSnapshot(query(collection(db,"matches"),orderBy("kickoff")), snap=>{   // ⭐ matches ใช้ร่วม top-level
    S.allMatches = snap.docs.map(d=>({id:d.id,...d.data()})); applyVisibility(); renderAll();
  });
  // โพย: gate ที่ rule (คนอื่นอ่านได้เฉพาะ revealed) → onSnapshot ทั้ง collection ไม่ได้ (เจอ doc ที่ยังไม่ revealed = reject ทั้งก้อน)
  //   แยก 2 ทาง · ทั้งคู่เป็น equality query (rule authorize ได้ชัวร์) · realtime → โพยคนอื่นโผล่เองตอน auto-grade พลิก revealed (ไม่ต้อง re-subscribe)
  onSnapshot(query(poolCol("predictions"), where("uid","==",S.me.uid)), snap=>{   // (ก) โพยตัวเอง — owner อ่านได้เสมอ
    ownPreds=snap.docs.map(d=>d.data()); mergePreds();
  });
  onSnapshot(query(poolCol("predictions"), where("revealed","==",true)), snap=>{   // (ข) โพยคนอื่นที่เปิดเผยแล้ว (เริ่มเตะ)
    otherPreds=snap.docs.map(d=>d.data()).filter(p=>p.uid!==S.me.uid); mergePreds();
  });
  // (ค) marker "ใครส่งแล้ว" — สาธารณะ (ไม่มีสกอร์) → โชว์ subLine ก่อน kickoff โดยไม่รั่วโพย
  onSnapshot(poolCol("submitted"), snap=>{
    const m={}; snap.forEach(d=>{ const x=d.data(); const a=(m[x.matchId]=m[x.matchId]||[]); if(!a.includes(x.player)) a.push(x.player); });
    S.submittedByMatch=m; renderAll();
  });
  onSnapshot(poolCol("config"), snap=>{
    snap.forEach(d=>{ if(d.id==="carry")S.carry=d.data(); if(d.id==="champPicks")S.configChampPicks=d.data(); if(d.id==="tournament")S.tournament=d.data(); if(d.id==="prev")S.prev=d.data();
      if(d.id==="admins")S.admins=d.data().emails||[]; if(d.id==="meta")S.poolMeta=d.data(); if(d.id==="bind")S.bind=d.data();
      if(d.id==="visibility")S.visibility={startFrom:d.data().startFrom||0,hidden:d.data().hidden||[]}; });
    deriveChampPicks(); applyVisibility(); renderAll();
  });
  onSnapshot(poolCol("players"), snap=>{
    S.playersByName={}; snap.forEach(d=>{ const p=d.data(); if(p.name) S.playersByName[p.name]={photo:p.photo||"",uid:p.uid,champ1:p.champ1||"",champ2:p.champ2||""}; });   // ⚠️ ไม่มี email (PII แยกไป emails/{uid})
    deriveChampPicks(); renderAll();
  });
  if(isAdmin()) onSnapshot(poolCol("emails"), snap=>{   // email = PII → โหลดเฉพาะแอดมิน (rule กัน non-admin list emails) · S.admins โหลดแล้วใน startAuth ก่อนถึงนี่
    S.emailByUid={}; snap.forEach(d=>{ const e=d.data(); if(e.uid) S.emailByUid[e.uid]=e.email||""; }); renderAll();
  });
}
export function renderAll(){ renderFixtures(); renderHeader(); renderChampion(); renderBoard();
  if(S.tab==="admin" && isAdmin()) renderAdmin();   // refresh admin เมื่อ data มา (ไม่มี input ค้างแล้ว · เมนูเป็น modal แยก)
}
