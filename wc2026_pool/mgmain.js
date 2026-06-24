/* ===== mgmain: entry ของ manage.html — login + เช็ก super + โหลดทุกวง + tab nav ===== */
import { S } from "./state.js";
import { firebaseConfig, MOCK } from "./config.js";
import { auth, provider, db, collection, query, orderBy, onSnapshot,
  signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from "./firebase.js";
import { $, isSuper } from "./utils.js";
import { loadAllPools, loadNextSet, renderManage, renderMgBanner } from "./manage.js";

function show(v){ const sp=$("#mgSplash"); if(sp) sp.classList.add("hidden");   // ผ่านขั้นกู้ session แล้ว
  $("#mgLogin").classList.toggle("hidden",v!=="login"); $("#mgBlock").classList.toggle("hidden",v!=="block"); $("#mgApp").classList.toggle("hidden",v!=="app"); }

function bindNav(){
  document.querySelectorAll("[data-mgtab]").forEach(el=>el.onclick=()=>{ S.mgTab=el.dataset.mgtab; try{localStorage.setItem("mg_tab",S.mgTab)}catch(e){}; renderManage(); });
  $("#mgLogout").onclick=()=>signOut(auth);
}
function startMatchesWatch(){
  onSnapshot(query(collection(db,"matches"),orderBy("kickoff")), snap=>{ S.allMatches=snap.docs.map(d=>({id:d.id,...d.data()})); renderMgBanner(); if(S.mgTab==="scores"||S.mgTab==="matches") renderManage(); });
}

async function enter(){
  show("app");
  try{ const t=localStorage.getItem("mg_tab"); if(["pools","scores","champ","matches"].includes(t)) S.mgTab=t; }catch(e){}
  bindNav();
  $("#mgContent").innerHTML=`<div class="k" style="color:var(--dim);text-align:center;padding:60px 0;">กำลังโหลดทุกวง…</div>`;
  startMatchesWatch();
  await Promise.all([ loadAllPools(), loadNextSet() ]);
  renderManage();
}

if(MOCK){
  const now=Date.now(), H=3600000;
  S.me={ uid:"u_ton", name:"ต้น", email:"ton.itthiphon@gmail.com", photo:"" };
  S.allMatches=[
    { id:"m4", home:"อาร์เจนตินา", away:"เม็กซิโก", group:"กลุ่ม C นัด 2", kickoff:now-3*H, homeScore:2, awayScore:0, status:"finished", scorers:["Lionel Messi","Julian Alvarez"], goals:[{name:"Lionel Messi",time:"23'",side:"h"},{name:"Julian Alvarez",time:"67'",side:"h"}] },
    { id:"m1", home:"บราซิล", away:"สเปน", group:"กลุ่ม G นัด 1", kickoff:now+2*H, homeScore:0, awayScore:0, status:"upcoming" },
    { id:"m3", home:"ฝรั่งเศส", away:"เดนมาร์ก", group:"กลุ่ม D นัด 2", kickoff:now-1*H, homeScore:2, awayScore:1, live:true, status:"upcoming", scorers:["Kylian Mbappé"], goals:[{name:"Kylian Mbappé",time:"12'",side:"h"}] },
  ];
  const mkPool=(code,name,carry,players,preds,tour)=>{ const champPicks={}; Object.entries(players).forEach(([n,pl])=>{ const a=[pl.champ1,pl.champ2].filter(Boolean); if(a.length) champPicks[n]=a; });
    return { code,name,carry, configChampPicks:{}, champPicks, tournament:tour||{}, admins:["graf@example.com"], meta:{name},
    bind:{"graf@example.com":"กราฟ"}, playersByName:players, emailByUid:Object.fromEntries(Object.values(players).map(p=>[p.uid,p.uid+"@example.com"])), preds }; };
  S.mgPools=[
    mkPool("","วงหลัก (mock)",{"ต้น":30,"กราฟ":35,"กุ้ย":33,"ช่องว่าง":0},
      {"ต้น":{uid:"u_ton",photo:"",champ1:"บราซิล",champ2:""},"กราฟ":{uid:"u_graf",photo:""},"กุ้ย":{uid:"u_kui",photo:""}},
      [{uid:"u_ton",player:"ต้น",matchId:"m4",homeScore:2,awayScore:0,scorer1:"เมสซี่",scorer2:"",s1hit:true,scorerOk:true,s1played:true},
       {uid:"u_graf",player:"กราฟ",matchId:"m4",homeScore:1,awayScore:1,scorer1:"กรีซมันน์",scorer2:"",s1unsure:true},
       {uid:"u_ton",player:"ต้น",matchId:"m3",homeScore:2,awayScore:1,scorer1:"เอ็มบัปเป้",scorer2:""}], {}),
    mkPool("YXL7K","กลุ่มแทงบอลเถื่อนฯ (mock)",{"พี่นิก":12,"พี่บอล":18},
      {"พี่นิก":{uid:"u_nick",photo:""},"พี่บอล":{uid:"u_ball",photo:""}},
      [{uid:"u_nick",player:"พี่นิก",matchId:"m4",homeScore:2,awayScore:0,scorer1:"เมสซี่",scorer2:""}], {regLocked:true}),
  ];
  S.mgNextSet={ key:"2026-06-26", fixtures:[{home:"ญี่ปุ่น",away:"สวีเดน",group:"กลุ่ม F นัด 3",kickoff:now+30*H},{home:"ตุรกี",away:"สหรัฐฯ",group:"กลุ่ม D นัด 3",kickoff:now+33*H}] };
  show("app"); try{const t=localStorage.getItem("mg_tab"); if(["pools","scores","champ","matches"].includes(t))S.mgTab=t;}catch(e){} bindNav(); renderManage();
  console.log("🧪 MOCK manage.html");
} else {
  $("#mgGoogle").onclick=async()=>{
    if(firebaseConfig.apiKey==="ใส่ของคุณ"){ $("#mgLiMsg").textContent="⚠️ ยังไม่ได้ใส่ Firebase config"; return; }
    try{ await signInWithPopup(auth, provider); }
    catch(e){ if(["auth/popup-blocked","auth/cancelled-popup-request","auth/operation-not-supported-in-this-environment"].includes(e.code)){ try{ await signInWithRedirect(auth, provider); return; }catch(e2){ e=e2; } }
      $("#mgLiMsg").textContent="เข้าไม่สำเร็จ: "+(e.code||e.message); }
  };
  onAuthStateChanged(auth, async user=>{
    if(!user){ show("login"); S.me=null; return; }
    S.me={ uid:user.uid, email:user.email, photo:user.photoURL||"", name:"" };
    if(!isSuper()){ show("block"); return; }
    try{ await enter(); }catch(e){ show("login"); $("#mgLiMsg").textContent="โหลดไม่ได้: "+(e.code||e.message); }
  });
}
