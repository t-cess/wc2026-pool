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

// ===== Modal ยืนยัน + dropdown เมนู (ของแอปเอง · แทน confirm()/native) =====
export function confirmModal(message, opts={}){
  const { okText="ยืนยัน", cancelText="ยกเลิก", danger=true } = opts;
  return new Promise(resolve=>{
    const ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;z-index:300;padding:28px;";
    ov.innerHTML=`<div style="background:#14171D;border:1px solid #2A303A;border-radius:18px;padding:22px 20px;max-width:340px;width:100%;">
      <div class="k" style="font-size:15px;line-height:1.55;color:#EEF1F4;margin-bottom:20px;white-space:pre-line;">${esc(message)}</div>
      <div style="display:flex;gap:10px;"><div data-c="0" class="k" style="flex:1;height:46px;display:flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid #2A303A;color:#8A929E;font-weight:700;cursor:pointer;">${esc(cancelText)}</div>
      <div data-c="1" class="k" style="flex:1;height:46px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:${danger?"#EF3E42":"#1FB85E"};color:#fff;font-weight:700;cursor:pointer;">${esc(okText)}</div></div></div>`;
    document.body.appendChild(ov); ov.animate([{opacity:0},{opacity:1}],{duration:130});
    const done=v=>{ ov.remove(); resolve(v); };
    ov.querySelector('[data-c="0"]').onclick=()=>done(false);
    ov.querySelector('[data-c="1"]').onclick=()=>done(true);
    ov.onclick=e=>{ if(e.target===ov) done(false); };
  });
}
// prompt อินพุต (เปลี่ยนชื่อ/แก้ยกมา) → resolve(ค่า) หรือ null (ยกเลิก)
export function promptModal(message, opts={}){
  const { value="", placeholder="", okText="บันทึก", numeric=false } = opts;
  return new Promise(resolve=>{
    const ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;z-index:300;padding:28px;";
    ov.innerHTML=`<div style="background:#14171D;border:1px solid #2A303A;border-radius:18px;padding:22px 20px;max-width:340px;width:100%;">
      <div class="k" style="font-size:15px;line-height:1.5;color:#EEF1F4;margin-bottom:14px;white-space:pre-line;">${esc(message)}</div>
      <input id="__pm" class="field" ${numeric?'inputmode="numeric"':''} placeholder="${esc(placeholder)}" style="margin-bottom:18px;height:46px;">
      <div style="display:flex;gap:10px;"><div data-c="0" class="k" style="flex:1;height:46px;display:flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid #2A303A;color:#8A929E;font-weight:700;cursor:pointer;">ยกเลิก</div>
      <div data-c="1" class="k btnG" style="flex:1;height:46px;">${esc(okText)}</div></div></div>`;
    document.body.appendChild(ov); ov.animate([{opacity:0},{opacity:1}],{duration:130});
    const inp=ov.querySelector("#__pm"); inp.value=value; setTimeout(()=>inp.focus(),30);
    const done=v=>{ ov.remove(); resolve(v); };
    ov.querySelector('[data-c="0"]').onclick=()=>done(null);
    ov.querySelector('[data-c="1"]').onclick=()=>done(inp.value);
    inp.onkeydown=e=>{ if(e.key==="Enter") done(inp.value); };
    ov.onclick=e=>{ if(e.target===ov) done(null); };
  });
}
// เลือกจากรายการ (ย้ายวง) · options:[{label,value}] → resolve(value) หรือ null
export function pickModal(message, options){
  return new Promise(resolve=>{
    const ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;z-index:300;padding:28px;";
    ov.innerHTML=`<div style="background:#14171D;border:1px solid #2A303A;border-radius:18px;padding:20px;max-width:340px;width:100%;">
      <div class="k" style="font-size:15px;line-height:1.5;color:#EEF1F4;margin-bottom:14px;">${esc(message)}</div>
      ${options.map(o=>`<div data-v="${esc(o.value)}" class="k" style="padding:13px;border:1px solid #2A303A;border-radius:11px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;">${esc(o.label)}</div>`).join("")||`<div class="k" style="color:var(--dim);font-size:13px;margin-bottom:8px;">— ไม่มีตัวเลือก —</div>`}
      <div data-c="0" class="k" style="height:44px;display:flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid #2A303A;color:#8A929E;font-weight:700;cursor:pointer;margin-top:4px;">ยกเลิก</div></div>`;
    document.body.appendChild(ov); ov.animate([{opacity:0},{opacity:1}],{duration:130});
    const done=v=>{ ov.remove(); resolve(v); };
    ov.querySelectorAll("[data-v]").forEach(el=>el.onclick=()=>done(el.dataset.v));
    ov.querySelector('[data-c="0"]').onclick=()=>done(null);
    ov.onclick=e=>{ if(e.target===ov) done(null); };
  });
}
// items: [{label, danger, onClick}] · เปิดเมนูลอยใกล้ปุ่ม ⋮ · ปิดเมื่อเลือก/แตะนอก
export function openMenu(anchorEl, items){
  const ov=document.createElement("div"); ov.style.cssText="position:fixed;inset:0;z-index:300;";
  const menu=document.createElement("div"); menu.className="k";
  menu.style.cssText="position:fixed;min-width:184px;background:#1b1f27;border:1px solid #2A303A;border-radius:13px;padding:6px;box-shadow:0 14px 36px -10px rgba(0,0,0,.75);opacity:0;";   // opacity:0 จนกว่าจะวางตำแหน่งเสร็จ (กันเด้งจากกลางจอ)
  menu.innerHTML=items.map((it,i)=>`<div data-i="${i}" style="padding:11px 13px;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;color:${it.danger?"#ff6b6b":"#EEF1F4"};">${esc(it.label)}</div>`).join("");
  ov.appendChild(menu); document.body.appendChild(ov);
  const r=anchorEl.getBoundingClientRect(); const mw=menu.offsetWidth||184;
  menu.style.left=Math.max(8, Math.min(r.right-mw, window.innerWidth-mw-8))+"px";
  menu.style.top=(r.bottom+5+menu.offsetHeight>window.innerHeight-8 ? Math.max(8,r.top-menu.offsetHeight-5) : r.bottom+5)+"px";
  menu.animate([{opacity:0,transform:"translateY(-4px)"},{opacity:1,transform:"translateY(0)"}],{duration:120,easing:"ease",fill:"forwards"});   // วางเสร็จแล้วค่อย fade (ไม่มี translate -50%)
  const close=()=>ov.remove();
  ov.onclick=e=>{ if(e.target===ov) close(); };
  items.forEach((it,i)=>{ menu.querySelector(`[data-i="${i}"]`).onclick=()=>{ close(); it.onClick&&it.onClick(); }; });
}

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
// หัวข้อ "คืนแข่ง" ไทย จากคีย์ ymdNYC (YYYY-MM-DD) — matchday US D = คืนคนไทยนั่งดู (ราว 23:00 วัน D → 08:00 วัน D+1)
const TH_WD=["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const TH_MON=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
export const matchNightLabel = key => {
  if(!key) return "ยังไม่ระบุวัน";
  const [y,mo,da]=key.split("-").map(Number);
  return `คืนวัน${TH_WD[new Date(y,mo-1,da).getDay()]} ${da} ${TH_MON[mo-1]}`;
};
const TH_WD_S=["อา","จ","อ","พ","พฤ","ศ","ส"];   // ป้ายสั้นบนชิปเลือกวัน
export const matchNightShort = key => {
  if(!key) return "—";
  const [y,mo,da]=key.split("-").map(Number);
  return `${TH_WD_S[new Date(y,mo-1,da).getDay()]}·${da}·${TH_MON[mo-1]}`;   // วัน·วันที่·เดือน
};
