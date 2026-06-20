/* ===== entry: เริ่มระบบ + countdown tick ===== */
import { S } from "./state.js";
import { bindAuthButtons, startAuth } from "./auth.js";
import { stateOf, lockTs } from "./scoring.js";
import { $, countdown } from "./utils.js";
import { renderFixtures } from "./views.js";

bindAuthButtons();
startAuth();

/* ===== countdown tick (ไม่ re-render รบกวนการพิมพ์) ===== */
setInterval(()=>{
  const prev=S.matches.map(m=>stateOf(m)).join(",");
  S.nowTs=Date.now();
  if(S.tab==="fixtures"){
    S.matches.forEach(m=>{ if(stateOf(m)==="open"){ const el=$("#cd_"+m.id); if(el) el.textContent="⏱ "+countdown(lockTs(m)-S.nowTs); } });
    if(S.matches.map(m=>stateOf(m)).join(",")!==prev) renderFixtures();   // มีคู่เพิ่ง "ปิดรับ" → re-render
  }
},1000);
