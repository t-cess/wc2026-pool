/* ===== utils: DOM + format helpers ===== */
import { S } from "./state.js";
import { SUPER_ADMINS, team } from "./config.js";

export const $ = s => document.querySelector(s);
export const esc = s => (s||"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const norm = s => (s||"").trim().toLowerCase();
export const isAdmin = () => !!(S.me && (SUPER_ADMINS.includes(S.me.email) || (S.admins||[]).includes(S.me.email)));
export const isSuper = () => !!(S.me && SUPER_ADMINS.includes(S.me.email));   // คู่ใช้ร่วมทุกวง → เพิ่ม/แก้ตารางคู่ได้เฉพาะ super admin

export function flag(n, sm){ const t=team(n); const w=sm?34:42,h=sm?24:30,fs=sm?11:13;
  return `<div class="k" style="display:flex;align-items:center;justify-content:center;width:${w}px;height:${h}px;border-radius:6px;font-weight:700;font-size:${fs}px;letter-spacing:.5px;background:${t.color};color:${t.dark?"#1a1a1a":"#fff"};flex:none;">${esc(t.code)}</div>`; }
export function silhouetteHTML(s){ const i=Math.round(s*.62);
  return `<div style="width:${s}px;height:${s}px;border-radius:50%;background:#1b1f27;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 0 0 1.5px #2a2f38;"><svg width="${i}" height="${i}" viewBox="0 0 38 38"><circle cx="19" cy="14.5" r="6.4" fill="#5b626d"></circle><path d="M7.5 32.5c0-6.6 5.2-10.5 11.5-10.5s11.5 3.9 11.5 10.5z" fill="#5b626d"></path></svg></div>`; }
export function avatarHTML(photo,s){ s=s||34;
  if(photo) return `<img class="ava" data-s="${s}" referrerpolicy="no-referrer" src="${esc(photo)}" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover;flex:none;box-shadow:0 0 0 1.5px #2a2f38;">`;
  return silhouetteHTML(s); }
export function bindAvatars(box){ box.querySelectorAll("img.ava").forEach(img=>{ img.onerror=()=>{
  const t=document.createElement("template"); t.innerHTML=silhouetteHTML(+img.dataset.s); img.replaceWith(t.content.firstChild); }; }); }

let toastT;
export function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden");
  t.style.animation="toastIn .2s ease"; clearTimeout(toastT); toastT=setTimeout(()=>t.classList.add("hidden"),1800); }

export function countdown(ms){ if(ms<=0) return "ปิดรับแล้ว";
  const s=Math.floor(ms/1000), d=Math.floor(s/86400);
  if(d>=1) return "ปิดใน "+d+" วัน "+Math.floor((s%86400)/3600)+" ชม.";
  const p=n=>String(n).padStart(2,"0");
  return "ปิดใน "+Math.floor(s/3600)+":"+p(Math.floor((s%3600)/60))+":"+p(s%60); }
export const fmtKo = m => m.kickoff ? new Date(m.kickoff).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "";
// คีย์ "วันแข่ง" ตัดรอบ 6 โมงเช้า NYC — เกมดึกข้ามเที่ยงคืนยังนับเป็นวันเดียวกันจนถึง 6am (กันเครื่องคนดูต่าง tz)
export const ymdNYC = ts => {
  const d = new Date(new Date(ts).toLocaleString("en-US",{timeZone:"America/New_York"}));
  d.setHours(d.getHours()-6);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
