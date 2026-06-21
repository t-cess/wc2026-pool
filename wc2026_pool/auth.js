/* ===== auth: login / เลือกตัวตน / เข้าแอป (รองรับหลายวง + admin gate) ===== */
import { S, rosterNames } from "./state.js";
import { firebaseConfig, POOL_ID } from "./config.js";
import { auth, provider, poolDoc, poolCol, getDoc, getDocs, setDoc,
  signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from "./firebase.js";
import { $, toast, isAdmin } from "./utils.js";
import { renderNav } from "./views.js";
import { renderAdmin } from "./admin.js";
import { watchData } from "./data.js";

export function bindAuthButtons(){
  $("#googleBtn").onclick = async ()=>{
    if(firebaseConfig.apiKey==="ใส่ของคุณ"){ $("#liMsg").textContent="⚠️ ยังไม่ได้ใส่ Firebase config"; return; }
    try{ await signInWithPopup(auth, provider); }
    catch(e){
      if(["auth/popup-blocked","auth/cancelled-popup-request","auth/operation-not-supported-in-this-environment","auth/web-storage-unsupported"].includes(e.code)){
        try{ await signInWithRedirect(auth, provider); return; }catch(e2){ e=e2; }
      }
      const h = e.code==="auth/unauthorized-domain" ? " — เพิ่มโดเมนใน Authorized domains" : e.code==="auth/operation-not-allowed" ? " — เปิด Google ใน Authentication" : "";
      $("#liMsg").textContent="เข้าไม่สำเร็จ: "+(e.code||e.message)+h;
    }
  };
  $("#logoutBtn").onclick = ()=> signOut(auth);
  $("#confirmIdentity").onclick = async ()=>{
    const name = S.pickName;
    if(!name){ toast("เลือกชื่อก่อน"); return; }
    try{ await setDoc(poolDoc("players",S.me.uid),{uid:S.me.uid,email:S.me.email,name,photo:S.me.photo,champ1:"",champ2:""},{merge:true});
      S.me.name=name; enterApp(); }
    catch(e){ toast("บันทึกไม่ได้: "+(e.code||e.message)); }
  };
}

export function startAuth(){
  onAuthStateChanged(auth, async user=>{
    if(!user){ show("login"); S.me=null; return; }
    try{
      S.me = {uid:user.uid, email:user.email, photo:user.photoURL||"", name:""};
      // วงที่มีโค้ด: ต้องมี config/meta ก่อน (กันสุ่มโค้ดสร้างวงขยะ)
      if(POOL_ID){
        const meta = await getDoc(poolDoc("config","meta"));
        if(!meta.exists()){ blockScreen("ไม่พบวงทายผลบอลนี้","โค้ดไม่ถูกต้อง หรือวงทายผลบอลนี้ยังไม่ถูกสร้าง"); return; }
        S.poolMeta = meta.data();
      }
      // โหลด admins ให้ isAdmin() ใช้ได้ตั้งแต่ตอน login
      try{ const a=await getDoc(poolDoc("config","admins")); S.admins = a.exists()?(a.data().emails||[]):[]; }catch(e){ S.admins=[]; }
      const snap = await getDoc(poolDoc("players",user.uid));
      S.me.name = snap.exists()?snap.data().name:"";
      if(S.me.name){ try{ await setDoc(poolDoc("players",S.me.uid),{photo:S.me.photo,email:S.me.email},{merge:true}); }catch(e){} enterApp(); }
      else if(isAdmin()){ enterApp(); }                 // แอดมินล้วน — เข้าดูแลได้ ไม่ต้องมีชื่อ
      else { await showIdentity(); }                     // ผู้เล่น: เลือกชื่อที่แอดมินเพิ่มไว้ (ไม่มี → block)
    }catch(e){ show("login"); $("#liMsg").textContent="อ่านข้อมูลไม่ได้: "+(e.code||e.message)+" — ยังไม่ได้ Publish Rules?"; }
  });
}

function show(v){ $("#loginView").classList.toggle("hidden",v!=="login");
  $("#identityView").classList.toggle("hidden",v!=="identity");
  $("#appView").classList.toggle("hidden",v!=="app"); }

// หน้าบล็อก (ไม่พบวง / รอแอดมิน) — reuse identityView
function blockScreen(title,msg){
  show("identity");
  $("#identityView h2").textContent=title;
  $("#identityView p").textContent=msg;
  $("#rosterChips").innerHTML="";
  $("#newNameWrap").classList.add("hidden");
  $("#confirmIdentity").style.display="none";
}

async function showIdentity(){
  const snap = await getDocs(poolCol("players"));
  const taken = new Set(); snap.forEach(d=>{const p=d.data(); if(p.name&&p.uid!==S.me.uid) taken.add(p.name);});
  const avail = rosterNames().filter(n=>!taken.has(n));
  if(!avail.length){ blockScreen("รอแอดมินเพิ่มชื่อ","ยังไม่มีชื่อของคุณในวงทายผลบอลนี้ — บอกแอดมินให้เพิ่มชื่อก่อนนะ"); return; }
  show("identity");
  $("#identityView h2").textContent="คุณคือใคร?";
  $("#identityView p").textContent="เลือกชื่อตัวเองจากรายชื่อวงทายผลบอล — ผูกกับบัญชี Google นี้ครั้งเดียว";
  $("#newNameWrap").classList.add("hidden");
  $("#confirmIdentity").style.display="";
  S.pickName = avail[0];
  const box = $("#rosterChips"); box.innerHTML="";
  avail.forEach(n=>{
    const sel = n===S.pickName;
    const c = document.createElement("div"); c.className="k";
    c.style.cssText = `font-weight:700;font-size:16px;padding:11px 20px;border-radius:13px;cursor:pointer;background:${sel?"#1FB85E":"#14171D"};color:${sel?"#04210F":"#EEF1F4"};border:1px solid ${sel?"#1FB85E":"#262b33"};`;
    c.textContent = n;
    c.onclick = ()=>{ S.pickName=n; showIdentityRefresh(); };
    box.appendChild(c);
  });
}
function showIdentityRefresh(){
  [...$("#rosterChips").children].forEach(c=>{
    const sel = c.textContent===S.pickName;
    c.style.background = sel?"#1FB85E":"#14171D"; c.style.color = sel?"#04210F":"#EEF1F4";
    c.style.border = "1px solid "+(sel?"#1FB85E":"#262b33");
  });
}

function enterApp(){
  show("app");
  setAvatar();
  if(!S.me.name) S.tab="admin";   // แอดมินล้วน → เปิดแท็บแอดมิน
  renderNav();
  ["fixtures","champion","board","admin"].forEach(t=>{ const el=$("#tab-"+t); if(el) el.classList.toggle("hidden",t!==S.tab); });
  if(S.tab==="admin" && isAdmin()) renderAdmin();
  watchData();
}
function initialAvatar(name){
  const d=document.createElement("div"); d.id="mePhoto";
  d.style.cssText="width:38px;height:38px;border-radius:50%;background:#1b1f27;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 0 0 1.5px #2a2f38;overflow:hidden;";
  d.innerHTML=`<svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="14.5" r="6.4" fill="#5b626d"/><path d="M7.5 32.5c0-6.6 5.2-10.5 11.5-10.5s11.5 3.9 11.5 10.5z" fill="#5b626d"/></svg>`;
  return d;
}
function setAvatar(){
  const el=$("#mePhoto"); if(!el) return;
  if(S.me.photo && el.tagName==="IMG"){
    el.referrerPolicy="no-referrer";
    el.onerror=()=>{ const f=initialAvatar(S.me.name); el.replaceWith(f); };
    el.src=S.me.photo;
  } else {
    el.replaceWith(initialAvatar(S.me.name));
  }
}
