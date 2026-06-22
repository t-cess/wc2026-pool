// 🤖 Auto-grader: ESPN (ข้อเท็จจริง) → พจนานุกรม Claude (ชื่อ) → Qwen (ชื่อใหม่) → Firestore
// รัน: node auto-grade.mjs        (ตั้ง cron/GitHub Actions ทุก 5 นาทีตอนบอลเตะ)
// ต้องมี: serviceAccount.json + aliases.json · Qwen ผ่าน gateway (env QWEN_BASE_URL/QWEN_TOKEN)
//   local: อ่านจากไฟล์ · CI: serviceAccount จาก env FIREBASE_SERVICE_ACCOUNT
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { matchScorer, composeGrade } from "./namematch.mjs";   // อ่านชื่อ + ประกอบกฎตัวสำรอง (แหล่งความจริงเดียว)

const here = new URL(".", import.meta.url);
const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)                 // CI: GitHub Secret
  : JSON.parse(readFileSync(new URL("serviceAccount.json", here)));  // local: ไฟล์
const aliases = JSON.parse(readFileSync(new URL("aliases.json", here)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ===== safeguard: นับ read ของ grader ต่อวัน · ใกล้เพดาน → low-power (กัน quota เต็ม = แอปล่มทั้งวง) =====
const READ_CAP = +(process.env.READ_CAP || 40000);   // grader ใช้ได้ ~40K/วัน เหลือ ~10K ให้แอปเพื่อน
let dayReads = 0;                                     // นับ read ในรอบนี้
const RD = snap => { dayReads += (snap.size ?? 1); return snap; };   // ครอบ .get() เพื่อนับ
const ymdPT = () => {   // วันแบบ Pacific — ตรงกับรอบ reset โควตา Firestore (เที่ยงคืน Pacific)
  const d = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Los_Angeles"}));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
async function usageRead() {   // อ่านยอดสะสมวันนี้ (1 read) ทุกรอบ
  try { const ref = db.doc("config/usage"); const u = RD(await ref.get()).data() || {};
    return { prior: (u.day===ymdPT() ? (u.reads||0) : 0), ref }; }
  catch(e){ return { prior:0, ref:null }; }
}
const isQuota = e => /RESOURCE_EXHAUSTED|Quota exceeded/i.test(e?.message||"") || e?.code===8;

// matches = ใช้ร่วม top-level ที่เดียว (คู่ชุดเดียวกันทุกวง) · ต่อวง = predictions/players/config
const TOP = { id: "วง1", base: null };               // วงหลัก top-level
const matchesCol = () => db.collection("matches");   // คู่ใช้ร่วมเสมอ
const col = (p,name)=> p.base ? db.collection(p.base[0]).doc(p.base[1]).collection(name) : db.collection(name);
// รายชื่อทุกวง: วงหลัก + ทุก pools/{CODE} · listDocuments เห็นวงที่มีแต่ subcollection (ไม่มี doc แม่) ด้วย
//   → เปิดวงใหม่ผ่านแอปแล้ว auto จับเองอัตโนมัติ ไม่ต้องแก้สคริปต์
async function listPools() {
  const refs = await db.collection("pools").listDocuments();
  return [TOP, ...refs.map(r => ({ id: r.id, base: ["pools", r.id] }))];
}

// ESPN อังกฤษ -> ไทย (ตามทีมในระบบ)
const T = {"Netherlands":"เนเธอร์แลนด์","Sweden":"สวีเดน","Germany":"เยอรมนี","Ivory Coast":"ไอวอรีโคสต์","Côte d'Ivoire":"ไอวอรีโคสต์","Ecuador":"เอกวาดอร์","Curacao":"คูราเซา","Curaçao":"คูราเซา","Tunisia":"ตูนิเซีย","Japan":"ญี่ปุ่น","Brazil":"บราซิล","Argentina":"อาร์เจนตินา","France":"ฝรั่งเศส","Spain":"สเปน","England":"อังกฤษ","Portugal":"โปรตุเกส","Belgium":"เบลเยียม","Italy":"อิตาลี","Croatia":"โครเอเชีย","Morocco":"โมร็อกโก","United States":"สหรัฐฯ","USA":"สหรัฐฯ","Mexico":"เม็กซิโก","Canada":"แคนาดา","South Korea":"เกาหลีใต้","Korea Republic":"เกาหลีใต้","Australia":"ออสเตรเลีย","Scotland":"สกอตแลนด์","Denmark":"เดนมาร์ก","Senegal":"เซเนกัล","Switzerland":"สวิตเซอร์แลนด์","Czechia":"เช็ก","Czech Republic":"เช็ก","South Africa":"แอฟริกาใต้","Qatar":"กาตาร์","Bosnia & Herzegovina":"บอสเนีย","Bosnia and Herzegovina":"บอสเนีย","Panama":"ปานามา","Turkey":"ตุรกี","Türkiye":"ตุรกี","Paraguay":"ปารากวัย","Algeria":"แอลจีเรีย","Jordan":"จอร์แดน","Austria":"ออสเตรีย","Iraq":"อิรัก","Norway":"นอร์เวย์","Uzbekistan":"อุซเบกิสถาน","Colombia":"โคลอมเบีย","Uruguay":"อุรุกวัย","Iran":"อิหร่าน","Ghana":"กานา","Haiti":"เฮติ","Cape Verde":"เคปเวิร์ด","Saudi Arabia":"ซาอุดีอาระเบีย","New Zealand":"นิวซีแลนด์","Egypt":"อียิปต์","Bosnia-Herzegovina":"บอสเนีย","Congo DR":"คองโก"};
const th = en => T[en] || en;

async function fetchEspn(dateStr) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`;
  const r = await fetch(url); const d = await r.json();
  return (d.events||[]).map(e => {
    const c = (e.competitions||[{}])[0];
    const comp = c.competitors||[];
    const home = comp.find(x=>x.homeAway==="home")||comp[0]||{};
    const away = comp.find(x=>x.homeAway==="away")||comp[1]||{};
    const homeId = home.team?.id, awayId = away.team?.id;
    const goals = (c.details||[]).filter(x=>x.scoringPlay).map(x=>({   // คนยิง + นาที + ฝั่ง
      name: (x.athletesInvolved||[{}])[0]?.displayName || "?",
      time: x.clock?.displayValue || "",
      side: x.team?.id===homeId ? "h" : (x.team?.id===awayId ? "a" : ""),
      og: /own/i.test(x.type?.text||""), pen: /penal/i.test(x.type?.text||""),
    }));
    const scorers = goals.map(g=>g.name).filter(Boolean);
    return {
      id: e.id,                                                     // ไว้ดึง lineup
      home: th(home.team?.displayName), away: th(away.team?.displayName),
      hs: parseInt(home.score), as: parseInt(away.score),
      final: !!e.status?.type?.completed,
      state: e.status?.type?.state,                                  // pre | in | post
      live: e.status?.type?.state === "in",                          // กำลังเตะ
      clock: e.status?.type?.shortDetail || e.status?.displayClock || "",  // "67'" / "HT" / "FT"
      scorers, goals,
    };
  });
}

// ดึงรายชื่อ "คนที่ลงเล่น" (ตัวจริง+สำรองที่ลงมา) → array ชื่อ ESPN จริง · ใช้กฎคนยิงสำรอง (s1played)
async function fetchLineup(eventId) {
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${eventId}`);
    const d = await r.json();
    const played = [];
    for (const t of (d.rosters||[])) for (const pl of (t.roster||[])) {
      if (pl.starter || pl.subbedIn) { const n=pl.athlete?.displayName; if(n) played.push(n); }
    }
    return played;
  } catch(e){ return []; }
}

// ถาม Qwen เฉพาะชื่อที่ไม่อยู่ในดิก (เจาะจง yes/no) — ผ่าน gateway แบบ OpenAI chat/completions
const QWEN_BASE = (process.env.QWEN_BASE_URL || "https://gateway.9arm.co").replace(/\/$/,"");
const QWEN_TOKEN = process.env.QWEN_TOKEN || "";
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3.6-35b-a3b";
async function askQwen(actualScorers, items) {
  if (!items.length) return {};
  if (!QWEN_TOKEN) { console.log("  ⚠️ ไม่มี QWEN_TOKEN — ข้าม Qwen (ชื่อใหม่จะ = ไม่ให้คะแนน)"); return {}; }
  const alist = actualScorers.map((s,i)=>`[${i+1}] ${s}`).join(", ");
  const list = items.map((t,i)=>`${i+1}) "${t}"`).join("\n");
  // ถาม mapping (ชื่อ→คนยิงจริงเบอร์ไหน) ไม่ใช่แค่ YES/NO → เอาไปเติมดิก (self-learning)
  const prompt = `คนยิงจริงในแมตช์ (มีเลขกำกับ): ${alist}\nต่อไปนี้คือชื่อที่ผู้เล่นพิมพ์ (ไทย/ฉายา/มุก) — ตอบว่าแต่ละชื่อหมายถึงคนยิงจริง "เบอร์ไหน" ตอบบรรทัดละ "ลำดับ: เบอร์" (เบอร์ 0 = ไม่ตรงใคร) เท่านั้น\n${list}`;
  try {
    const r = await fetch(QWEN_BASE+"/v1/chat/completions", {
      method:"POST",
      headers:{ "content-type":"application/json", "authorization":"Bearer "+QWEN_TOKEN },
      body: JSON.stringify({ model:QWEN_MODEL, max_tokens:256, messages:[{role:"user",content:prompt}] }),
    });
    const d = await r.json();
    const out = d?.choices?.[0]?.message?.content || "";
    const res = {};   // ชื่อที่พิมพ์ -> canonical คนยิงจริง (หรือ null)
    // Qwen สลับ format ("1) ลำดับ: 2" หรือ "ลำดับ: 2") → parse ตามลำดับบรรทัดที่มีเลข + เอา "เลขท้ายบรรทัด" = เบอร์คนยิง
    out.split("\n").filter(l=>/\d/.test(l)).forEach((line,idx)=>{ if(idx>=items.length)return; const ns=line.match(/\d+/g); const si=+ns[ns.length-1]; res[items[idx]] = si>0 ? (actualScorers[si-1]||null) : null; });
    return res;
  } catch(e){ console.log("  ⚠️ Qwen ล้มเหลว:", e.message); return {}; }
}

function scorerHitOne(s, actualScorers, qwenMap) {   // ชื่อเดียวตรงคนยิงจริงไหม
  if (!s) return false;
  if (matchScorer(s, actualScorers, aliases)) return true;     // ดิก+substring+นามสกุล ตรงคนยิงจริง
  if (qwenMap[s]) return true;                                 // Qwen แมพชื่อนี้ → คนยิงจริง (ชื่อใหม่)
  return false;
}

// 📚 self-learning: Qwen แมพชื่อไทย→คนยิงจริง ที่ดิก/นามสกุลยังจับไม่ได้ → เติม config/learnedAliases (แยกจาก aliases.json)
const isAsciiName = s => /^[\x00-\x7f]+$/.test(s);
async function learnAliases(qwenMap) {
  const add = {};   // canonical -> [alias ไทยใหม่]
  const allCanon = Object.keys(aliases);
  for (const [typed, canon] of Object.entries(qwenMap)) {
    const t = (typed||"").trim();
    if (!canon || isAsciiName(t) || t.length < 3 || t.length > 30) continue;   // เรียนเฉพาะไทย ความยาวพอเหมาะ (อังกฤษจับนามสกุลได้เอง)
    if (matchScorer(t, [canon], aliases)) continue;                            // ดิก/นามสกุลจับได้แล้ว ไม่ต้องเรียน
    const other = matchScorer(t, allCanon, aliases);                           // 🛡️ ชื่อไทยนี้ชนคนอื่นในดิกอยู่แล้วไหม → DeepSeek อ่านผิด อย่าเรียน (กัน FP เช่น มามูช→Trézéguet ทั้งที่ดิกมี →Marmoush)
    if (other && other !== canon) { console.log(`  🛡️ ข้าม learn "${t}"→${canon} (ดิกมี "${t}"→${other} อยู่แล้ว ขัดกัน)`); continue; }
    (add[canon] = add[canon] || []).push(t);
  }
  if (!Object.keys(add).length) return;
  for (const [c, arr] of Object.entries(add)) {                                // merge เข้า runtime (ใช้ในรอบนี้ต่อเลย)
    aliases[c] = [...new Set([...(aliases[c]||[]), ...arr])];
    console.log(`  📚 เรียนรู้: ${c} += ${arr.join(", ")}`);
  }
  if (DRY) return;
  try {
    const ref = db.doc("config/learnedAliases");
    const cur = (await ref.get()).data() || {};
    for (const [c, arr] of Object.entries(add)) cur[c] = [...new Set([...(cur[c]||[]), ...arr])];
    await ref.set(cur);
  } catch(e){ console.log("  ⚠️ เซฟ learnedAliases ล้มเหลว:", e.message); }
}
function scorerHit(pred, actualScorers, qwenMap) {
  if (pred.homeScore===0 && pred.awayScore===0) return null; // 0-0 แอปคิดเอง
  return scorerHitOne(pred.scorer1, actualScorers, qwenMap) || scorerHitOne(pred.scorer2, actualScorers, qwenMap);
}

const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");   // ข้าม live-window gate (ไว้เทส)
const REGRADE = process.argv.includes("--regrade");   // ตรวจซ้ำคู่ที่ autoGraded แล้ว (backfill s1hit/s2hit)
const BACKFILL = process.argv.includes("--backfill-group");   // one-shot: เติม "กลุ่ม X" ให้ field group ของคู่เดิม (--dry-run = พรีวิว)
let anyLive = false;                               // มีคู่กำลังเตะรอบนี้ไหม (ให้ workflow loop วนต่อ)

// อ่านเฉพาะคู่ที่ kickoff อยู่ใน [now-afterMs, now+5นาที] (range query — ไม่อ่านทั้ง collection)
const W_BEFORE = 5*60*1000, W_GATE = 3*60*60*1000, W_GRADE = 8*60*60*1000;
async function matchesInWindow(afterMs) {
  const now = Date.now();
  return matchesCol().where("kickoff",">=", now-afterMs).where("kickoff","<=", now+W_BEFORE).get();
}
// มีคู่ที่ "อยู่ในเวลาเตะ" (เตะก่อน 5 นาที → จบ+3 ชม.) และยังไม่ตรวจจบไหม
async function hasLiveWindow() {
  for (const md of RD(await matchesInWindow(W_GATE)).docs) {
    const m = md.data();
    if (!(m.status==="finished" && m.autoGraded)) return true;   // อยู่ในช่วง + ยังไม่ตรวจจบ
  }
  return false;
}

// ===== auto-add: เพิ่มคู่ชุดถัดไปเอง (วันละครั้ง หลังชุดล่าสุดจบครบ +1 ชม.) — วง1 เท่านั้น =====
const ymd6 = ts => {   // คีย์ "วันแข่ง" ตัดรอบ 6 โมงเช้า NYC (ตรงกับแอป)
  const d = new Date(new Date(ts).toLocaleString("en-US",{timeZone:"America/New_York"}));
  d.setHours(d.getHours()-6);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const STAGE_TH = {"round-of-32":"รอบ 32","round-of-16":"รอบ 16","quarterfinal":"ก่อนรองฯ","quarterfinals":"ก่อนรองฯ","semifinal":"รองชนะเลิศ","semifinals":"รองชนะเลิศ","third-place":"ชิงที่ 3","final":"ชิงชนะเลิศ"};
const addId = (h,a,label) => "m_"+(h+"_"+a+"_"+label).replace(/\s+/g,"").replace(/[^a-z0-9ก-๙_]/gi,"");
const pairKey = (h,a,k) => `${h}|${a}|${k}`;
const thKick = ms => new Date(ms).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});

async function espnAllFixtures() {   // ทั้งทัวร์ (มิ.ย.11–ก.ค.20) → {homeEN,awayEN,ms,slug}
  const days=[]; for(let d=new Date(Date.UTC(2026,5,11)); d<=new Date(Date.UTC(2026,6,20)); d.setUTCDate(d.getUTCDate()+1))
    days.push(d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,"0")+String(d.getUTCDate()).padStart(2,"0"));
  const all = await Promise.all(days.map(ds=>fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${ds}`).then(r=>r.json()).catch(()=>({}))));
  const out=[];
  for(const d of all) for(const e of (d.events||[])){ const c=(e.competitions||[{}])[0], cs=c.competitors||[];
    const h=cs.find(x=>x.homeAway==="home")||cs[0]||{}, a=cs.find(x=>x.homeAway==="away")||cs[1]||{};
    const grp=((c.altGameNote||"").match(/Group\s+([A-Z])/i)||[])[1]||"";   // กลุ่มอยู่ใน altGameNote เช่น "FIFA World Cup, Group J"
    out.push({homeEN:h.team?.displayName, awayEN:a.team?.displayName, ms:Date.parse(e.date), slug:e.season?.slug||"", grp}); }
  return out.filter(x=>x.homeEN&&x.awayEN&&x.ms);
}
function labelFor(fx, allFx) {
  if (fx.slug!=="group-stage") return STAGE_TH[fx.slug] || "น็อกเอาต์";
  const games = allFx.filter(x=>x.slug==="group-stage" && (x.homeEN===fx.homeEN||x.awayEN===fx.homeEN)).map(x=>x.ms).sort((a,b)=>a-b);
  const md = games.indexOf(fx.ms)+1;
  const round = md>0 ? `นัด ${md}` : "รอบแบ่งกลุ่ม";
  return fx.grp ? `กลุ่ม ${fx.grp} ${round}` : round;   // ใส่กลุ่มจาก ESPN เช่น "กลุ่ม J นัด 2"
}

async function autoAddNext() {
  const POOL = TOP;                                       // คู่ใช้ร่วม (top-level)
  const since = Date.now() - 48*60*60*1000;              // อ่านเฉพาะ 48 ชม.ล่าสุด (พอหาชุดล่าสุดที่จบ → เพิ่มชุดถัดไป)
  const ms = RD(await col(POOL,"matches").where("kickoff",">=",since).get()).docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.kickoff);
  if (!ms.length) { if(DRY)console.log("auto-add[dry]: ยังไม่มีคู่ตั้งต้น — ข้าม"); return; }
  const byKey={}; ms.forEach(m=>{ const k=ymd6(m.kickoff); (byKey[k]=byKey[k]||[]).push(m); });
  const latestKey = Object.keys(byKey).sort().pop();
  const batch = byKey[latestKey];
  const allFin = batch.every(m=>m.status==="finished");
  const lastFin = Math.max(...batch.map(m=>m.finishedAt || (m.kickoff+3*3600*1000)));
  const ready = allFin && Date.now() >= lastFin + 3600*1000;  // จบครบ + ผ่านไป 1 ชม.
  if (DRY) console.log(`auto-add[dry]: ชุดล่าสุด=${latestKey} (${batch.length} คู่) จบครบ=${allFin} ครบ1ชม=${Date.now()>=lastFin+3600*1000} → ${ready?"พร้อมเพิ่ม":"ยังไม่ถึงเวลา"}`);
  if (!ready) return;
  const allFx = await espnAllFixtures();
  const futureKeys = [...new Set(allFx.map(x=>ymd6(x.ms)).filter(k=>k>latestKey))].sort();
  if (!futureKeys.length) { console.log("auto-add: ไม่มีคู่ถัดไปใน ESPN"); return; }
  const nextKey = futureKeys[0];
  const cfg = (await db.doc("config/autoadd").get()).data() || {};
  if (cfg.autoAddedThrough && cfg.autoAddedThrough >= nextKey) { if(DRY)console.log(`auto-add: ชุด ${nextKey} เพิ่มไปแล้ว`); return; }
  const nextFx = allFx.filter(x=>ymd6(x.ms)===nextKey).sort((a,b)=>a.ms-b.ms);
  const existPairs = new Set(ms.map(m=>pairKey(m.home,m.away,ymd6(m.kickoff))));
  let added=0;
  for (const fx of nextFx) {
    const home=th(fx.homeEN), away=th(fx.awayEN), label=labelFor(fx,allFx);
    if (existPairs.has(pairKey(home,away,nextKey))) continue;     // กันซ้ำด้วยคู่ทีม+วัน
    console.log(`auto-add: ${DRY?"[DRY] ":""}+ ${home} vs ${away} | ${label} | ${thKick(fx.ms)}`);
    if (!DRY) await col(POOL,"matches").doc(addId(home,away,label)).set(
      {home,away,group:label,kickoff:fx.ms,homeScore:0,awayScore:0,scorers:[],status:"upcoming"},{merge:true});
    added++;
  }
  if (!DRY && added) await db.doc("config/autoadd").set({autoAddedThrough:nextKey},{merge:true});
  console.log(`auto-add: ${DRY?"[dry] จะเพิ่ม":"เพิ่ม"} ${added} คู่ · ชุด ${nextKey}`);
}

// ตรวจคนยิงทุกโพยในคู่ → ตั้ง scorerOk (เขียนเฉพาะที่เปลี่ยน)
// useQwen=false (สด: ดิกอย่างเดียว เร็ว ไม่เรียก Qwen) · true (จบ: ดิก + Qwen กวาดชื่อใหม่)
async function gradeScorers(p, matchId, actualScorers, useQwen, lineup) {
  const preds = RD(await col(p,"predictions").where("matchId","==",matchId).get()).docs;   // อ่านเฉพาะโพยคู่นี้ (ไม่ใช่ทั้งวง)
  let qwenMap = {};
  if (useQwen) {
    const unknown = new Set();
    preds.forEach(d=>{ const pr=d.data(); if(pr.homeScore===0&&pr.awayScore===0)return;
      [pr.scorer1,pr.scorer2].forEach(s=>{ if(s && !matchScorer(s, actualScorers, aliases)) unknown.add(s); }); });   // ชื่อที่ดิกอ่านไม่ออก → Qwen
    qwenMap = await askQwen(actualScorers, [...unknown]);
    await learnAliases(qwenMap);   // 📚 เติมดิกจากที่ Qwen ยืนยัน (ครั้งหน้า matchScorer จับได้เอง ไม่ต้องถาม Qwen)
  }
  let changed = 0;
  for (const d of preds) {
    const pr=d.data();
    if (pr.homeScore===0 && pr.awayScore===0) continue;   // 0-0 แอปคิดเอง
    if (pr.scorerManual) continue;                        // แอดมินติ๊กมือ → auto ไม่ทับ
    const s1 = scorerHitOne(pr.scorer1, actualScorers, qwenMap);   // คนแรกยิงไหม (รวม Qwen)
    const s2 = scorerHitOne(pr.scorer2, actualScorers, qwenMap);   // คนสองยิงไหม
    const { s1played, ok, s1unsure, s2unsure } = composeGrade({ s1, s2, scorer1:pr.scorer1, scorer2:pr.scorer2, played:lineup, resolved:useQwen, aliasMap:aliases });   // resolved=useQwen → amber เฉพาะตอนจบ
    if (ok===!!pr.scorerOk && s1===!!pr.s1hit && s2===!!pr.s2hit && s1played===!!pr.s1played
        && s1unsure===!!pr.s1unsure && s2unsure===!!pr.s2unsure) continue;   // ไม่เปลี่ยน
    changed++;
    if (DRY) console.log(`[${p.id}]   [DRY] ${pr.player}: "${[pr.scorer1,pr.scorer2].filter(Boolean).join(" / ")||"-"}" → ok=${ok} (s1ยิง=${s1} คนแรกลง=${s1played} s2ยิง=${s2}${s1unsure||s2unsure?" ⚠️อ่านไม่ออก":""})`);
    else await d.ref.set({ scorerOk:ok, s1hit:s1, s2hit:s2, s1played:s1played, s1unsure, s2unsure }, {merge:true});
  }
  return changed;
}

async function backfillGroup() {   // เติม/แก้ field group ของคู่เดิมให้เป็น "กลุ่ม X นัด Y" (จาก ESPN) · แก้แค่ field ไม่แตะ doc id (predictions อ้าง matchId)
  console.log("🔧 backfill group" + (DRY ? " [DRY]" : "") + " — ดึง ESPN...");
  const allFx = await espnAllFixtures();
  const labelMap = {};
  for (const fx of allFx) labelMap[pairKey(th(fx.homeEN), th(fx.awayEN), ymd6(fx.ms))] = labelFor(fx, allFx);
  const snap = await matchesCol().get();
  let fix = 0, same = 0; const miss = [];
  for (const d of snap.docs) {
    const m = d.data(); if (!m.kickoff) continue;
    const nl = labelMap[pairKey(m.home, m.away, ymd6(m.kickoff))];
    if (!nl) { miss.push(`${m.home} v ${m.away}`); continue; }
    if (nl === m.group) { same++; continue; }
    console.log(`  ${DRY ? "[DRY] " : ""}${m.home} v ${m.away}: "${m.group}" → "${nl}"`);
    if (!DRY) await d.ref.set({ group: nl }, { merge: true });
    fix++;
  }
  console.log(`รวม ${snap.size} คู่ · แก้ ${fix} · เหมือนเดิม ${same} · จับ ESPN ไม่ได้ ${miss.length}`);
  if (miss.length) console.log("  ไม่แมตช์ ESPN:", miss.join(", "));
  console.log(DRY ? "DRY — เอา --dry-run ออกเพื่อเขียนจริง" : "✅ เขียนเสร็จ");
}
async function run() {
  if (BACKFILL) { await backfillGroup(); return; }   // โหมด one-shot — ข้าม grader ปกติ
  if (DRY) console.log("🧪 DRY-RUN: อ่าน + เรียก Qwen ได้ แต่จะไม่เขียน Firestore\n");
  // safeguard: ใกล้เพดาน read วันนี้ไหม → low-power (เขียนสกอร์อย่างเดียว กันแอปล่มทั้งวง) · FORCE/REGRADE (สั่งมือ) ไม่โดน
  const usage = await usageRead();
  const lowPower = !FORCE && !REGRADE && usage.prior >= READ_CAP;
  if (lowPower) console.log(`🟡 LOW-POWER: read วันนี้ ${usage.prior} ≥ ${READ_CAP} — เขียนเฉพาะสกอร์ ข้ามตรวจคนยิง/autoAdd (regrade เก็บตกทีหลัง)`);
  const live = FORCE || await hasLiveWindow();
  if (!live) {                                 // ไม่มีบอลเตะ → ข้าม grade (แต่ auto-add ยังเช็กต่อ)
    console.log("⏸️ ไม่มีคู่อยู่ในเวลาเตะ — ข้าม grade", new Date().toLocaleString("th-TH"));
  } else {
  // โหลดดิกที่ "เรียนรู้เอง" (Qwen เติม) merge เข้า aliases สำหรับรอบนี้ (1 read) — ข้ามถ้า low-power
  if (!lowPower) try { const learned = RD(await db.doc("config/learnedAliases").get()).data() || {};
    for (const [c,arr] of Object.entries(learned)) if(Array.isArray(arr)) aliases[c] = [...new Set([...(aliases[c]||[]), ...arr])]; }
  catch(e){ console.log("  ⚠️ โหลด learnedAliases ไม่ได้:", e.message); }
  // ดึง ESPN วันนี้+เมื่อวาน+พรุ่งนี้ (กันคาบเกี่ยวเที่ยงคืน)
  const now = new Date();
  const ds = [-1,0,1].map(o=>{ const d=new Date(now); d.setDate(d.getDate()+o);
    return d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0"); });
  const espn = (await Promise.all(ds.map(fetchEspn))).flat();   // เอาทั้ง จบ + สด
  console.log("ESPN จบ:", espn.filter(e=>e.final).map(e=>`${e.home} ${e.hs}-${e.as} ${e.away}`).join(" | ")||"-",
    "· สด:", espn.filter(e=>e.live).map(e=>`${e.home} ${e.hs}-${e.as} ${e.away} ${e.clock}`).join(" | ")||"-");

  const pools = await listPools();
  console.log("วงที่ตรวจ:", pools.map(p=>p.id).join(", "));
  const ms = REGRADE ? RD(await matchesCol().get()) : RD(await matchesInWindow(W_GRADE));   // ปกติอ่านเฉพาะคู่ช่วง 8 ชม. (regrade=ทั้งหมด)
  for (const mdoc of ms.docs) {
    const m = mdoc.data();
    if (m.status==="finished" && m.autoGraded && !REGRADE) continue;   // ตรวจจบแล้ว ข้าม (--regrade = ทำซ้ำ)
    const ev = espn.find(e => e.home===m.home && e.away===m.away);
    if (!ev || ev.state==="pre") continue;                      // ESPN ยังไม่มี/ยังไม่เตะ
    // 🔴 ระหว่างเกม: เขียนสกอร์/นาฬิกาครั้งเดียว (top-level) แล้วตรวจคนยิงทุกวง
    if (!ev.final) {
      anyLive = true;
      console.log(`${DRY?"[DRY] ":""}🔴 สด ${m.home} ${ev.hs}-${ev.as} ${m.away} · ${ev.clock}`);
      if (!DRY) await mdoc.ref.set({ homeScore:ev.hs, awayScore:ev.as, live:true, clock:ev.clock, goals:ev.goals }, {merge:true});
      if (!lowPower) {   // low-power: เขียนสกอร์แล้วข้ามตรวจคนยิง (regrade เก็บตก)
        const luLive = await fetchLineup(ev.id);
        for (const p of pools) {
          const n = await gradeScorers(p, mdoc.id, ev.scorers, false, luLive);   // ⚽ ตรวจคนยิงสด (ดิก + กฎคนแรกลงเล่น)
          if (n) console.log(`[${p.id}]   ⚽ +1 คนยิงสด ${n} โพย`);
        }
      }
      continue;
    }
    // 1) จบแล้ว: เขียนผลครั้งเดียว (top-level) + ปิด live
    console.log(`${DRY?"[DRY] จะเขียนผล":"✓ ผล"} ${m.home} ${ev.hs}-${ev.as} ${m.away} | ยิง: ${ev.scorers.join(", ")||"-"}`);
    if (lowPower) {   // เขียนสกอร์ไว้ก่อน แต่ไม่ปิด (autoGraded) → budget กลับ/regrade ค่อยตรวจคนยิง
      if (!DRY) await mdoc.ref.set({ homeScore:ev.hs, awayScore:ev.as, scorers:ev.scorers, goals:ev.goals, status:"finished", live:false, clock:"จบ" }, {merge:true});
      continue;
    }
    if (!DRY) await mdoc.ref.set({ homeScore:ev.hs, awayScore:ev.as, scorers:ev.scorers, goals:ev.goals, status:"finished", autoGraded:true, finishedAt:Date.now(), live:false, clock:"จบ" }, {merge:true});
    // 2) ตรวจคนยิงเต็มทุกวง (ดิก + Qwen กวาดชื่อใหม่ + กฎคนแรกลงเล่น)
    const luFin = await fetchLineup(ev.id);
    for (const p of pools) {
      const n = await gradeScorers(p, mdoc.id, ev.scorers, true, luFin);
      console.log(`[${p.id}]   ตรวจคนยิง (จบ) เปลี่ยน ${n} โพย`);
    }
  }
  }   // ปิด else (live)
  // autoAdd อ่านคู่ 48ชม. = ตัวกิน read หลักตอน idle → รันแค่ทุก ~5 นาที · ข้ามถ้า low-power
  if (!lowPower && (FORCE || DRY || new Date().getMinutes() % 5 === 0))
    try { await autoAddNext(); } catch(e){ console.log("⚠️ auto-add ล้มเหลว:", e.message); }
  // บันทึกยอด read สะสมวันนี้ (กัน quota เต็ม) — 1 write
  if (!DRY && usage.ref) { try { await usage.ref.set({ day: ymdPT(), reads: usage.prior + dayReads }); console.log(`📊 read วันนี้ ~${usage.prior + dayReads}/${READ_CAP}`); } catch(e){} }
  console.log("เสร็จ ✅", new Date().toLocaleString("th-TH"));
  console.log("__LIVE__:" + (anyLive ? 1 : 0));   // สัญญาณให้ workflow loop: 1=ยังมีบอลสด วนต่อ
}
run().then(()=>process.exit(0)).catch(e=>{
  if (isQuota(e)) { console.log("🛑 Firestore quota เต็ม — หยุดรอบนี้แบบนิ่งๆ (รอ reset/วันใหม่)"); process.exit(0); }
  console.error("❌",e); process.exit(1);
});
