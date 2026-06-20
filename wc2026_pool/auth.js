/* ===== auth: login / เลือกตัวตน / เข้าแอป ===== */
import { S, rosterNames } from "./state.js";
import { firebaseConfig } from "./config.js";
import { auth, provider, db, doc, getDoc, getDocs, setDoc, collection,
  signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from "./firebase.js";
import { $, toast } from "./utils.js";
import { renderNav } from "./views.js";
import { watchData } from "./data.js";

export function bindAuthButtons(){
  $("#googleBtn").onclick = async ()=>{
    if(firebaseConfig.apiKey==="ใส่ของคุณ"){ $("#liMsg").textContent="⚠️ ยังไม่ได้ใส่ Firebase config"; return; }
    try{ await signInWithPopup(auth, provider); }
    catch(e){
      // in-app browser / popup ถูกบล็อก → ใช้ redirect แทน
      if(["auth/popup-blocked","auth/cancelled-popup-request","auth/operation-not-supported-in-this-environment","auth/web-storage-unsupported"].includes(e.code)){
        try{ await signInWithRedirect(auth, provider); return; }catch(e2){ e=e2; }
      }
      const h = e.code==="auth/unauthorized-domain" ? " — เพิ่มโดเมนใน Authorized domains" : e.code==="auth/operation-not-allowed" ? " — เปิด Google ใน Authentication" : "";
      $("#liMsg").textContent="เข้าไม่สำเร็จ: "+(e.code||e.message)+h;
    }
  };
  $("#logoutBtn").onclick = ()=> signOut(auth);
  $("#confirmIdentity").onclick = async ()=>{
    const name = S.pickName==="__new__" ? $("#newName").value.trim() : S.pickName;
    if(!name){ toast("เลือกหรือพิมพ์ชื่อก่อน"); return; }
    try{ await setDoc(doc(db,"players",S.me.uid),{uid:S.me.uid,email:S.me.email,name,photo:S.me.photo,champ1:"",champ2:""},{merge:true});
      S.me.name=name; enterApp(); }
    catch(e){ toast("บันทึกไม่ได้: "+(e.code||e.message)); }
  };
}

export function startAuth(){
  onAuthStateChanged(auth, async user=>{
    if(!user){ show("login"); S.me=null; return; }
    try{
      const snap = await getDoc(doc(db,"players",user.uid));
      S.me = {uid:user.uid, email:user.email, photo:user.photoURL||"", name: snap.exists()?snap.data().name:""};
      if(!S.me.name){ await showIdentity(); show("identity"); }
      else { try{ await setDoc(doc(db,"players",S.me.uid),{photo:S.me.photo,email:S.me.email},{merge:true}); }catch(e){} enterApp(); }
    }catch(e){ show("login"); $("#liMsg").textContent="อ่านข้อมูลไม่ได้: "+(e.code||e.message)+" — ยังไม่ได้ Publish Rules?"; }
  });
}

function show(v){ $("#loginView").classList.toggle("hidden",v!=="login");
  $("#identityView").classList.toggle("hidden",v!=="identity");
  $("#appView").classList.toggle("hidden",v!=="app"); }

async function showIdentity(){
  const snap = await getDocs(collection(db,"players"));
  const taken = new Set(); snap.forEach(d=>{const p=d.data(); if(p.name&&p.uid!==S.me.uid) taken.add(p.name);});
  const avail = rosterNames().filter(n=>!taken.has(n));
  S.pickName = avail[0] || "__new__";
  const box = $("#rosterChips"); box.innerHTML="";
  const opts = [...avail, "__new__"];
  opts.forEach(n=>{
    const sel = n===S.pickName;
    const label = n==="__new__" ? "+ สมาชิกใหม่" : n;
    const c = document.createElement("div"); c.className="k";
    c.style.cssText = `font-weight:700;font-size:16px;padding:11px 20px;border-radius:13px;cursor:pointer;background:${sel?"#1FB85E":"#14171D"};color:${sel?"#04210F":"#EEF1F4"};border:1px solid ${sel?"#1FB85E":"#262b33"};`;
    c.textContent = label;
    c.onclick = ()=>{ S.pickName=n; showIdentityRefresh(); };
    box.appendChild(c);
  });
  $("#newNameWrap").classList.toggle("hidden", S.pickName!=="__new__");
}
function showIdentityRefresh(){
  [...$("#rosterChips").children].forEach((c)=>{
    const isNew = c.textContent==="+ สมาชิกใหม่";
    const n = isNew ? "__new__" : c.textContent;
    const sel = n===S.pickName;
    c.style.background = sel?"#1FB85E":"#14171D"; c.style.color = sel?"#04210F":"#EEF1F4";
    c.style.border = "1px solid "+(sel?"#1FB85E":"#262b33");
  });
  $("#newNameWrap").classList.toggle("hidden", S.pickName!=="__new__");
}

function enterApp(){
  show("app");
  setAvatar();
  renderNav(); watchData();
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
