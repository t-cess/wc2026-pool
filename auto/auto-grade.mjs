// 🤖 Auto-grader: ESPN (ข้อเท็จจริง) → พจนานุกรม Claude (ชื่อ) → Qwen (ชื่อใหม่) → Firestore
// รัน: node auto-grade.mjs        (ตั้ง cron/GitHub Actions ทุก 5 นาทีตอนบอลเตะ)
// ต้องมี: serviceAccount.json + aliases.json · Qwen ผ่าน gateway (env QWEN_BASE_URL/QWEN_TOKEN)
//   local: อ่านจากไฟล์ · CI: serviceAccount จาก env FIREBASE_SERVICE_ACCOUNT
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const here = new URL(".", import.meta.url);
const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)                 // CI: GitHub Secret
  : JSON.parse(readFileSync(new URL("serviceAccount.json", here)));  // local: ไฟล์
const aliases = JSON.parse(readFileSync(new URL("aliases.json", here)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// วงที่จะตรวจ: base=null = top-level (วง1) / base=["pools","vong2"] = วง2
const POOLS = [
  { id: "วง1", base: null },
  { id: "วง2", base: ["pools","vong2"] },
];
const col = (p,name)=> p.base ? db.collection(p.base[0]).doc(p.base[1]).collection(name) : db.collection(name);

// ESPN อังกฤษ -> ไทย (ตามทีมในระบบ)
const T = {"Netherlands":"เนเธอร์แลนด์","Sweden":"สวีเดน","Germany":"เยอรมนี","Ivory Coast":"ไอวอรีโคสต์","Côte d'Ivoire":"ไอวอรีโคสต์","Ecuador":"เอกวาดอร์","Curacao":"คูราเซา","Curaçao":"คูราเซา","Tunisia":"ตูนิเซีย","Japan":"ญี่ปุ่น","Brazil":"บราซิล","Argentina":"อาร์เจนตินา","France":"ฝรั่งเศส","Spain":"สเปน","England":"อังกฤษ","Portugal":"โปรตุเกส","Belgium":"เบลเยียม","Italy":"อิตาลี","Croatia":"โครเอเชีย","Morocco":"โมร็อกโก","United States":"สหรัฐฯ","USA":"สหรัฐฯ","Mexico":"เม็กซิโก","Canada":"แคนาดา","South Korea":"เกาหลีใต้","Korea Republic":"เกาหลีใต้","Australia":"ออสเตรเลีย","Scotland":"สกอตแลนด์","Denmark":"เดนมาร์ก","Senegal":"เซเนกัล","Switzerland":"สวิตเซอร์แลนด์","Czechia":"เช็ก","Czech Republic":"เช็ก","South Africa":"แอฟริกาใต้","Qatar":"กาตาร์","Bosnia & Herzegovina":"บอสเนีย","Bosnia and Herzegovina":"บอสเนีย","Panama":"ปานามา","Turkey":"ตุรกี","Türkiye":"ตุรกี","Paraguay":"ปารากวัย","Algeria":"แอลจีเรีย","Jordan":"จอร์แดน","Austria":"ออสเตรีย","Iraq":"อิรัก","Norway":"นอร์เวย์","Uzbekistan":"อุซเบกิสถาน","Colombia":"โคลอมเบีย","Uruguay":"อุรุกวัย","Iran":"อิหร่าน","Ghana":"กานา","Haiti":"เฮติ","Cape Verde":"เคปเวิร์ด","Saudi Arabia":"ซาอุดีอาระเบีย","New Zealand":"นิวซีแลนด์","Egypt":"อียิปต์"};
const th = en => T[en] || en;

const norm = s => (s||"").trim().toLowerCase().replace(/\s+/g," ");
// พจนานุกรม: ข้อความ -> canonical
const ALIAS2CANON = {};
for (const [canon, arr] of Object.entries(aliases)) { if(canon[0]==="_")continue;
  ALIAS2CANON[norm(canon)] = canon;
  for (const a of arr) ALIAS2CANON[norm(a)] = canon; }
const resolve = txt => ALIAS2CANON[norm(txt)] || null;   // null = ไม่รู้จัก (ส่ง Qwen)

async function fetchEspn(dateStr) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`;
  const r = await fetch(url); const d = await r.json();
  return (d.events||[]).map(e => {
    const c = (e.competitions||[{}])[0];
    const comp = c.competitors||[];
    const home = comp.find(x=>x.homeAway==="home")||comp[0]||{};
    const away = comp.find(x=>x.homeAway==="away")||comp[1]||{};
    const scorers = (c.details||[]).filter(x=>x.scoringPlay)
      .map(x=>(x.athletesInvolved||[{}])[0]?.displayName).filter(Boolean);
    return {
      home: th(home.team?.displayName), away: th(away.team?.displayName),
      hs: parseInt(home.score), as: parseInt(away.score),
      final: !!e.status?.type?.completed, scorers,
    };
  });
}

// ถาม Qwen เฉพาะชื่อที่ไม่อยู่ในดิก (เจาะจง yes/no) — ผ่าน gateway แบบ OpenAI chat/completions
const QWEN_BASE = (process.env.QWEN_BASE_URL || "https://gateway.9arm.co").replace(/\/$/,"");
const QWEN_TOKEN = process.env.QWEN_TOKEN || "";
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3.6-35b-a3b";
async function askQwen(actualScorers, items) {
  if (!items.length) return {};
  if (!QWEN_TOKEN) { console.log("  ⚠️ ไม่มี QWEN_TOKEN — ข้าม Qwen (ชื่อใหม่จะ = ไม่ให้คะแนน)"); return {}; }
  const list = items.map((t,i)=>`${i+1}) "${t}"`).join("\n");
  const prompt = `คนยิงจริงในแมตช์นี้: ${actualScorers.join(", ")}\nต่อไปนี้คือชื่อที่ผู้เล่นพิมพ์ (ไทย/ฉายา/มุก) ตอบว่าแต่ละอันหมายถึง "คนยิงจริง" คนใดคนหนึ่งข้างบนไหม ตอบบรรทัดละ "เลข: YES" หรือ "เลข: NO" เท่านั้น\n${list}`;
  try {
    const r = await fetch(QWEN_BASE+"/v1/chat/completions", {
      method:"POST",
      headers:{ "content-type":"application/json", "authorization":"Bearer "+QWEN_TOKEN },
      body: JSON.stringify({ model:QWEN_MODEL, max_tokens:512, messages:[{role:"user",content:prompt}] }),
    });
    const d = await r.json();
    const out = d?.choices?.[0]?.message?.content || "";
    const res = {};
    out.split("\n").forEach(line=>{ const m=line.match(/^\s*(\d+)\D*(YES|NO)\s*$/i); if(m) res[items[+m[1]-1]] = /yes/i.test(m[2]); });  // Qwen สะท้อนชื่อกลับ → จับเลขต้นบรรทัด + YES/NO ท้ายบรรทัด
    return res;
  } catch(e){ console.log("  ⚠️ Qwen ล้มเหลว:", e.message); return {}; }
}

function scorerHit(pred, actualScorers, qwenMap) {
  if (pred.homeScore===0 && pred.awayScore===0) return null; // 0-0 แอปคิดเอง
  const acts = actualScorers.map(norm);
  for (const s of [pred.scorer1, pred.scorer2]) {
    if (!s) continue;
    const canon = resolve(s);
    if (canon && acts.includes(norm(canon))) return true;     // เจอในดิก + ตรงคนยิงจริง
    if (!canon && qwenMap[s] === true) return true;            // Qwen บอกตรง
  }
  return false;
}

const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");   // ข้าม live-window gate (ไว้เทส)

// มีคู่ที่ "อยู่ในเวลาเตะ" ไหม = ตั้งแต่เตะก่อน 5 นาที จนถึงจบ+3 ชม. และยังไม่ตรวจ
async function hasLiveWindow() {
  const now = Date.now(), BEFORE = 5*60*1000, AFTER = 3*60*60*1000;
  for (const p of POOLS) {
    for (const md of (await col(p,"matches").get()).docs) {
      const m = md.data();
      if (m.status==="finished" && m.autoGraded) continue;   // ตรวจจบแล้ว ไม่นับ
      const ko = m.kickoff||0;
      if (ko && now >= ko-BEFORE && now <= ko+AFTER) return true;
    }
  }
  return false;
}

async function run() {
  if (DRY) console.log("🧪 DRY-RUN: อ่าน + เรียก Qwen ได้ แต่จะไม่เขียน Firestore\n");
  if (!FORCE && !(await hasLiveWindow())) {   // ไม่มีบอลเตะ → ออกเลย (cron ตื่นเปล่า ไม่ยิง ESPN/Qwen)
    console.log("⏸️ ไม่มีคู่อยู่ในเวลาเตะ — ข้าม", new Date().toLocaleString("th-TH"));
    return;
  }
  // ดึง ESPN วันนี้+เมื่อวาน+พรุ่งนี้ (กันคาบเกี่ยวเที่ยงคืน)
  const now = new Date();
  const ds = [-1,0,1].map(o=>{ const d=new Date(now); d.setDate(d.getDate()+o);
    return d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0"); });
  const espn = (await Promise.all(ds.map(fetchEspn))).flat().filter(e=>e.final);
  console.log("ESPN คู่ที่จบ:", espn.map(e=>`${e.home} ${e.hs}-${e.as} ${e.away}`).join(" | ")||"(ไม่มี)");

  for (const p of POOLS) {
    const ms = await col(p,"matches").get();
    for (const mdoc of ms.docs) {
      const m = mdoc.data();
      if (m.status==="finished" && m.autoGraded) continue;       // ตรวจแล้ว ข้าม
      const ev = espn.find(e => e.home===m.home && e.away===m.away);
      if (!ev) continue;                                          // ESPN ยังไม่มี/ยังไม่จบ
      // 1) เขียนผลจริง
      console.log(`[${p.id}] ${DRY?"[DRY] จะเขียนผล":"✓ ผล"} ${m.home} ${ev.hs}-${ev.as} ${m.away} | ยิง: ${ev.scorers.join(", ")||"-"}`);
      if (!DRY) await mdoc.ref.set({ homeScore:ev.hs, awayScore:ev.as, scorers:ev.scorers, status:"finished", autoGraded:true }, {merge:true});
      // 2) ตรวจคนยิง
      const preds = (await col(p,"predictions").get()).docs.filter(d=>d.data().matchId===mdoc.id);
      const unknown = new Set();
      preds.forEach(d=>{ const pr=d.data(); if(pr.homeScore===0&&pr.awayScore===0)return;
        [pr.scorer1,pr.scorer2].forEach(s=>{ if(s && !resolve(s)) unknown.add(s); }); });
      const qwenMap = await askQwen(ev.scorers, [...unknown]);
      for (const d of preds) {
        const pr=d.data(); const ok=scorerHit(pr, ev.scorers, qwenMap);
        if (ok===null) continue;
        if (DRY) console.log(`[${p.id}]   [DRY] ${pr.player}: "${[pr.scorer1,pr.scorer2].filter(Boolean).join(" / ")||"-"}" → scorerOk=${ok}`);
        else await d.ref.set({ scorerOk:ok }, {merge:true});
      }
      console.log(`[${p.id}]   ตรวจคนยิง ${preds.length} โพย (ถาม Qwen ${unknown.size} ชื่อใหม่)`);
    }
  }
  console.log("เสร็จ ✅", new Date().toLocaleString("th-TH"));
}
run().then(()=>process.exit(0)).catch(e=>{ console.error("❌",e); process.exit(1); });
