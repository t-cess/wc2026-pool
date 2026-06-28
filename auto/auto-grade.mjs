// 🤖 Auto-grader: ESPN (ข้อเท็จจริง) → พจนานุกรม Claude (ชื่อ) → Qwen (ชื่อใหม่) → Firestore
// รัน: node auto-grade.mjs        (ตั้ง cron/GitHub Actions ทุก 5 นาทีตอนบอลเตะ)
// ต้องมี: serviceAccount.json + aliases.json · Qwen ผ่าน gateway (env QWEN_BASE_URL/QWEN_TOKEN)
//   local: อ่านจากไฟล์ · CI: serviceAccount จาก env FIREBASE_SERVICE_ACCOUNT
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { matchScorer, composeGrade, readable } from "./namematch.mjs";   // อ่านชื่อ + ประกอบกฎตัวสำรอง (แหล่งความจริงเดียว)

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
const RD = snap => { dayReads += Math.max(1, snap.size ?? 1); return snap; };   // ครอบ .get() เพื่อนับ · query ว่าง Firestore ก็คิดขั้นต่ำ 1 (กัน undercount)
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

// ===== LINE Messaging API — โพสต์โพยทั้งวงเข้ากลุ่มตอน "ปิดรับ" (โปร่งใส) =====
const LINE_TOKEN = process.env.LINE_TOKEN || "";   // channel access token (OA)
const LINE_GROUP = process.env.LINE_GROUP || "";   // group id (กลุ่มเดิม · ได้จาก webhook)
async function linePush(text) {
  if (!LINE_TOKEN || !LINE_GROUP) { console.log("  ⚠️ ไม่มี LINE_TOKEN/LINE_GROUP — ข้ามส่ง LINE"); return false; }
  try {
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method:"POST",
      headers:{ "content-type":"application/json", "authorization":"Bearer "+LINE_TOKEN },
      body: JSON.stringify({ to: LINE_GROUP, messages:[{ type:"text", text }] }),
    });
    if (!r.ok) { console.log("  ⚠️ LINE push fail:", r.status, (await r.text()).slice(0,200)); return false; }
    return true;
  } catch(e){ console.log("  ⚠️ LINE error:", e.message); return false; }
}

// ===== DeepSeek แต่งสำนวน "แซวเพื่อนสุดขีด" — ห่อข้อความแห้งให้กวน · ล้มเหลว/ไม่มี token = คืนข้อความเดิม =====
const SPICE = process.env.LINE_SPICE !== "0";   // ปิด spice ได้ด้วย LINE_SPICE=0 (กลับไปข้อความแห้ง)
// v4-pro/flash default = thinking mode (ช้า 6-9 วิ + content เพี้ยน) → ปิดเสมอ ให้เร็ว ~1-2 วิ · รุ่นเก่า (deepseek-chat) จะ ignore field นี้
const NO_THINK = { thinking: { type: "disabled" } };
async function dsChat(prompt, max_tokens) {   // เรียก DeepSeek (gateway เดียวกับ askQwen) — คืน content หรือ "" ถ้าพัง
  const r = await fetch(QWEN_BASE+"/v1/chat/completions", {
    method:"POST",
    headers:{ "content-type":"application/json", "authorization":"Bearer "+QWEN_TOKEN },
    body: JSON.stringify({ model:QWEN_MODEL, max_tokens, temperature:0.8, ...NO_THINK, messages:[{role:"user",content:prompt}] }),
  });
  if (!r.ok) { console.log("  ⚠️ spice fail:", r.status); return ""; }
  return (await r.json())?.choices?.[0]?.message?.content || "";
}
// ตัดขยะที่โมเดลแอบใส่: คำนำ ("นี่คือข้อความ..."), ป้ายกำกับ, สองเวอร์ชัน(เส้นคั่น ---), meta ท้าย
function cleanSpice(raw, fallback) {
  let t = (raw||"").replace(/```/g,"").trim();
  if (!t) return fallback;
  const segs = t.split(/\n\s*-{3,}\s*\n/);   // โมเดลทำ 2 เวอร์ชันคั่น --- → เอาเวอร์ชันหลัง
  if (segs.length > 1) t = segs[segs.length-1].trim();
  const dropHead = /^(นี่คือ|นี่เลย|ได้เลย|จัดให้|โอเค|ตามนี้|เอาไป|ข้อความ(ที่|กวน|ใหม่|แซว)?|\*+\s*ข้อความ)[^\n]*[:：]\s*$/i;
  let lines = t.split("\n");
  while (lines.length && (lines[0].trim()==="" || dropHead.test(lines[0].trim()))) lines.shift();
  t = lines.join("\n").trim();
  return t.length >= 10 ? t : fallback;
}
const stripFrameLabel = s => s.replace(/^\s*(เกริ่น|ปิดท้าย|intro|outro)\s*[:：]\s*/i,"").replace(/^["“”'']+|["“”'']+$/g,"").trim();
// แต่งเฉพาะ "ประโยคเกริ่น + ปิดท้าย" ครอบบล็อกที่ห้ามแตะ — ใช้กับ "เปิดไพ่/ปิดรับ" ซึ่งเป็นบันทึกโปร่งใส แก้ไม่ได้
// → โพย/สกอร์/ชื่อ คงเดิมเป๊ะ byte-for-byte (LLM ไม่แตะ) แค่ใส่บรรยากาศแซวรอบๆ
async function spiceFrame(frozen, kind, hint="") {
  if (!SPICE || !QWEN_TOKEN) return frozen;
  const prompt = `คุณคือบอท "AI กุ้ย-ชิน" ในกลุ่มไลน์เพื่อนสนิทเล่นทายผลบอลโลก 2026
ขอ "ประโยคเกริ่นกวนๆ" 1 บรรทัด และ "ประโยคปิดท้ายแซวๆ" 1 บรรทัด — สั้น กระชับ "ประโยคเดียวจบ/บรรทัด" ❌ ห้ามยาว — แบบสุดขีด ตลกร้าย ปากจัด เหมือนเพื่อนซี้แซวกัน (ห้ามหยาบคายรุนแรง/ด่าพ่อแม่/เหยียด)
ไว้ครอบข้อความข้างล่าง — บล็อกจะถูกแปะตามเดิมเป๊ะอยู่แล้ว ❌ ห้ามพิมพ์ตัวเลขสกอร์/ชื่อคนในบล็อกซ้ำให้ผิดเพี้ยน ❌ ห้ามสมมุติชื่อใครเพิ่ม
✅ แซวภาพรวมโพยได้หลายมุม — เลือกมุกให้เข้ากับ "ข้อมูลรอบนี้" ด้านล่าง: เททางเดียวมากๆ เล่น "รถผ้าป่า/ลอกกัน" ก็ได้ · ถ้ามี "คนทายสวนทาง" ให้ไปแซวหรืออวยคนนั้น (กล้าต่าง/มั่นใจ/บ้าบิ่น) · ❌ ไม่ต้องเล่นรถผ้าป่าทุกครั้ง เลือกมุมที่เด็ดสุด
✅ แซวตามอันดับวง + "แต้มที่ได้วันนี้" ได้ — เด็ดสุดคือผสมกัน เช่น "วันนี้ได้เยอะกำลังไล่จ่าฝูง" · "ยัง +0 วันนี้ยิ่งจมบ๊วย" · "จ่าฝูงวันนี้แป้กระวังโดนไล่" — แต่ ❌ ห้ามโชว์ตัวเลขคะแนน/อันดับในข้อความ เอามาเป็นมุกเฉยๆ ❌ ห้ามแต่งอันดับเกินจากข้อมูล${hint?`\nข้อมูลรอบนี้ (วัตถุดิบแซว ยึดเป๊ะ ห้ามแต่งเกิน): ${hint}`:""}
สไตล์: เขียนให้ "ลื่นเป็นมุกเล่าต่อเนื่อง" แบบตลกคาเฟ่/น้าค่อม — ปากจัด จริงใจ ตลกร้าย หยาบได้แต่ไม่หยาบโลน · ❌ ห้ามไล่รายงานข้อมูลทีละคนแบบลิสต์ ให้ร้อยข้อมูลเข้าไปในมุกอย่างเนียน · เล่นลีลาตลกไทยได้ (เช่น "ไอ้สั้ส"(ไม่บ่อย)/"จัดไป"/"โถ่เอ๊ย"/"เอาดิ") พอดีๆ ไม่ยัด · ❌ ห้ามขึ้นต้นซ้ำคำเดิมทุกข้อความ
รูปแบบ: 2 บรรทัดเท่านั้น บรรทัดแรก=ประโยคเกริ่น บรรทัดสอง=ประโยคปิดท้าย — เขียนประโยคตรงๆ ❌ ห้ามขึ้นต้นด้วยคำว่า "เกริ่น"/"ปิดท้าย" ❌ ห้ามครอบด้วยเครื่องหมายคำพูด
ใส่อิโมจิกวนๆ "1-2 อันเท่านั้น" รวมทั้ง 2 บรรทัด (เช่น 😏🔥😂💀🤡😈) ❌ ห้ามเกิน 2 อัน ❌ ห้ามรัวหลายตัว
ประเภท: ${kind}

บล็อก:
${frozen}`;
  try {
    const lines = (await dsChat(prompt, 300)).replace(/```/g,"").split("\n").map(stripFrameLabel).filter(Boolean);
    if (!lines.length) return frozen;
    const intro = lines[0], outro = lines[1] || "";
    return outro ? `${intro}\n\n${frozen}\n\n${outro}` : `${intro}\n\n${frozen}`;
  } catch(e){ console.log("  ⚠️ spiceFrame error:", e.message, "— ใช้ข้อความแห้ง"); return frozen; }
}
// แต่งเฉพาะ "ย่อหน้าปิดท้ายแซว" ต่อท้ายบล็อกที่ห้ามแก้ (frozen เป๊ะ byte-for-byte · ไม่แทรกในเนื้อหา) — ใช้ทั้งสรุปจบ + เปิดชุดใหม่
async function spiceOutro(frozen, kind, instr="", opts={}) {
  if (!SPICE || !QWEN_TOKEN) return frozen;
  // ปรับความยาว/โควต้า token ต่อการเรียกได้ — digest ขอยาวพอ "เอ่ยชื่อครบทุกคน" · เรียกอื่นคงสั้นเหมือนเดิม
  const { maxTokens=160, lenRule=`เขียนแค่ "1-2 ประโยคสั้นๆ" จบในบรรทัดเดียว-สองบรรทัด ❌ ห้ามยาวเกินนั้น` } = opts;
  const prompt = `คุณคือบอท "AI กุ้ย-ชิน" ในกลุ่มไลน์เพื่อนสนิทเล่นทายผลบอลโลก 2026
ข้างล่างคือข้อความที่ห้ามแก้ ขอเขียน "ย่อหน้าปิดท้ายแซวๆ" แบบสุดขีด ตลกร้าย ปากจัด เหมือนเพื่อนซี้ ต่อท้ายให้หน่อย (ระบบจะแปะใต้บล็อกเดิมให้เอง)
${instr}
กฎรวม:
- อ้างชื่อ/เวลาได้เฉพาะที่อยู่ในบล็อก "หรือในคำสั่ง/ข้อมูลด้านบน" เท่านั้น ❌ ห้ามแต่งเลข/เวลา/ชื่อใหม่ ❌ ห้ามสมมุติชื่อคนที่ไม่มี ❌ ห้ามพิมพ์ตัวเลขคะแนน/แต้ม/+N/อันดับ ในย่อหน้าแซว (ถึงจะมีในตารางก็ตาม) — ใช้คำแทน เช่น เยอะ/น้อยสุด/จิ๊บจ๊อย/ไล่จี้
- ❌ ห้ามแตะ/ห้ามพิมพ์บล็อกซ้ำ · ❌ ห้ามแซวแทรกทีละบรรทัด — ${lenRule} ❌ ห้ามมีคำนำ/ป้ายกำกับ/เครื่องหมาย \`\`\`
- ใส่อิโมจิกวนๆ "1-2 อันเท่านั้น" ทั้งย่อหน้า (เช่น 😏🔥😂💀🤡😈) ❌ ห้ามเกิน 2 อัน ❌ ห้ามรัวหลายตัว
สไตล์: เขียนให้ "ลื่นเป็นมุกเล่าต่อเนื่อง" แบบตลกคาเฟ่/น้าค่อม — ปากจัด จริงใจ ตลกร้าย หยาบได้แต่ไม่หยาบโลน · ❌ ห้ามไล่รายงานข้อมูลทีละคนแบบลิสต์ ให้ร้อยข้อมูลเข้าไปในมุกอย่างเนียน · เล่นลีลาตลกไทยได้ (เช่น "ไอ้สั้ส"(ไม่บ่อย)/"จัดไป"/"โถ่เอ๊ย"/"เอาดิ") พอดีๆ ไม่ยัด · ❌ ห้ามขึ้นต้นซ้ำคำเดิมทุกข้อความ
ประเภท: ${kind}

บล็อก (ห้ามแก้/ห้ามพิมพ์ซ้ำ):
${frozen}`;
  try {
    const outro = cleanSpice(await dsChat(prompt, maxTokens), "");
    return outro && outro.length>=10 ? `${frozen}\n\n${outro}` : frozen;
  } catch(e){ console.log("  ⚠️ spiceOutro error:", e.message, "— ใช้ข้อความแห้ง"); return frozen; }
}
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
      body: JSON.stringify({ model:QWEN_MODEL, max_tokens:256, ...NO_THINK, messages:[{role:"user",content:prompt}] }),
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

// 🚫 ปิด auto-learn (2026-06-23) — DeepSeek resolve สดทุกครั้งแล้ว · self-learning เคย poison ดิก (เช่น โอลิเซ่→Mbappé, ฮาแลนด์→Pedersen)
// config/learnedAliases ที่มีอยู่ (ล้าง poison แล้ว) ยังโหลดมาใช้เป็นดิกเสริม แต่ไม่เขียนเพิ่มแล้ว
function scorerHit(pred, actualScorers, qwenMap) {
  if (pred.homeScore===0 && pred.awayScore===0) return null; // 0-0 แอปคิดเอง
  return scorerHitOne(pred.scorer1, actualScorers, qwenMap) || scorerHitOne(pred.scorer2, actualScorers, qwenMap);
}

const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");   // ข้าม live-window gate (ไว้เทส)
const REGRADE = process.argv.includes("--regrade");   // ตรวจซ้ำคู่ที่ autoGraded แล้ว (backfill s1hit/s2hit)
const BACKFILL = process.argv.includes("--backfill-group");   // one-shot: เติม "กลุ่ม X" ให้ field group ของคู่เดิม (--dry-run = พรีวิว)
const LINETEST = process.argv.includes("--line-test");        // one-shot: ยิงข้อความทดสอบไป LINE_GROUP (เทส token+push)
let anyLive = false;                               // มีคู่กำลังเตะรอบนี้ไหม (ให้ workflow loop วนต่อ)

// อ่านเฉพาะคู่ที่ kickoff อยู่ใน [now-afterMs, now+5นาที] (range query — ไม่อ่านทั้ง collection)
const W_BEFORE = 5*60*1000, W_GATE = 3*60*60*1000, W_GRADE = 8*60*60*1000;
const LOCK_BEFORE_MS = 10*60*1000;   // ปิดรับโพย = kickoff - 10 นาที (ตรงกับแอป config.js)
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
const thKick = ms => new Date(ms).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});   // บังคับเวลาไทย (Actions รันบน UTC ไม่งั้นเพี้ยน -7 ชม.)

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

async function autoAddNext(ms) {   // ms = คู่ 48 ชม.ที่อ่านมาแล้ว (แชร์กับ nightDigest กัน read ซ้ำ)
  const POOL = TOP;                                       // คู่ใช้ร่วม (top-level)
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
  let added=0; const addedList=[];
  for (const fx of nextFx) {
    const home=th(fx.homeEN), away=th(fx.awayEN), label=labelFor(fx,allFx);
    if (existPairs.has(pairKey(home,away,nextKey))) continue;     // กันซ้ำด้วยคู่ทีม+วัน
    console.log(`auto-add: ${DRY?"[DRY] ":""}+ ${home} vs ${away} | ${label} | ${thKick(fx.ms)}`);
    if (!DRY) await col(POOL,"matches").doc(addId(home,away,label)).set(
      {home,away,group:label,kickoff:fx.ms,homeScore:0,awayScore:0,scorers:[],status:"upcoming"},{merge:true});
    added++; addedList.push({home,away,ms:fx.ms});
  }
  if (!DRY && added) await db.doc("config/autoadd").set({autoAddedThrough:nextKey},{merge:true});
  // #เตือนเปิดทายชุดใหม่ → LINE (ให้คนไปทาย)
  if (added && LINE_TOKEN && LINE_GROUP) {
    const hhmm = ms => new Date(ms).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit"});   // เวลาล้วน HH:MM (คืนเดียวกัน ไม่ต้องโชว์วันที่ซ้ำทุกบรรทัด)
    const list = addedList.map(x=>`• ${x.home} vs ${x.away} ${hhmm(x.ms)}`).join("\n");
    const dry = `🆕 เปิดทายคืนนี้ ${added} คู่ — รีบทาย!\n${list}`;
    const stand = standingsHint(await computeBoardNode(TOP));   // อันดับวง → กวนให้คนตามหลังรีบทายไล่แต้ม
    const instr = `- เขียน "ประโยคเดียวสั้นๆ" พอ ❌ ห้ามยาว — คัดแค่ 1 "คู่ไฮไลท์" มาแซวกวนให้รีบทาย ไม่ต้องพูดถึงทุกคู่
- แซวตามอันดับวงได้ (อวยจ่าฝูง/ยุคนรั้งท้ายให้ไล่/ลุ้นบ๊วย) แต่ห้ามโชว์ตัวเลข ❌ อันดับวง: ${stand}`;
    const text = await spiceOutro(dry, "เปิดทายชุดใหม่ (คู่ที่จะเตะคืนนี้)", instr);
    if (DRY) console.log(`[DRY] OPEN-NOTIFY →\n${text}\n`); else await linePush(text);
  }
  console.log(`auto-add: ${DRY?"[dry] จะเพิ่ม":"เพิ่ม"} ${added} คู่ · ชุด ${nextKey}`);
}

async function updateNextSetPreview() {   // พรีวิว "คู่ชุดถัดไป" (ที่ autoAddNext จะเปิดให้เมื่อชุดนี้จบ) → เขียน config/nextSet ให้ super เห็นล่วงหน้า
  const latestSnap = await matchesCol().orderBy("kickoff","desc").limit(1).get();
  if (latestSnap.empty) return;
  const latestKey = ymd6(latestSnap.docs[0].data().kickoff);
  const cur = (await db.doc("config/nextSet").get()).data() || {};
  if (cur.basedOnLatest === latestKey && Array.isArray(cur.fixtures)) { if(DRY)console.log(`nextSet[dry]: ชุดล่าสุด ${latestKey} ไม่เปลี่ยน — ข้าม ESPN`); return; }   // ชุดล่าสุดยังเดิม → ไม่ต้อง fetch ESPN ซ้ำ (ถูก)
  const allFx = await espnAllFixtures();
  const futureKeys = [...new Set(allFx.map(x=>ymd6(x.ms)).filter(k=>k>latestKey))].sort();
  let key=null, fixtures=[];
  if (futureKeys.length) { key=futureKeys[0];
    fixtures = allFx.filter(x=>ymd6(x.ms)===key).sort((a,b)=>a.ms-b.ms)
      .map(fx=>({home:th(fx.homeEN),away:th(fx.awayEN),group:labelFor(fx,allFx),kickoff:fx.ms})); }
  if (DRY) { console.log(`nextSet[dry]: ชุด ${key||"(จบทัวร์)"} · ${fixtures.length} คู่`); fixtures.forEach(f=>console.log(`  + ${f.home} vs ${f.away} | ${f.group} | ${thKick(f.kickoff)}`)); return; }
  await db.doc("config/nextSet").set({ key, basedOnLatest:latestKey, fixtures, updatedAt:Date.now() });
  console.log(`nextSet preview: ชุด ${key||"(จบทัวร์)"} · ${fixtures.length} คู่`);
}

// ตรวจคนยิงทุกโพยในคู่ → ตั้ง scorerOk (เขียนเฉพาะที่เปลี่ยน)
// ถาม DeepSeek เมื่อ "มีคนยิงแล้ว" (สด+จบ) — เทียบ "คนยิงจริง" (set เล็ก = แม่น ปลอดภัย) → ตามแต้มเรียลไทม์ ไม่ต้องรอจบ
// ยังไม่มีโกล = ไม่ถาม + ไม่ amber (กัน amber โผล่ก่อนมีคนยิง)
async function gradeScorers(p, matchId, actualScorers, lineup) {
  const preds = RD(await col(p,"predictions").where("matchId","==",matchId).get()).docs;   // อ่านเฉพาะโพยคู่นี้ (ไม่ใช่ทั้งวง)
  const hasGoals = actualScorers.length > 0;
  let qwenMap = {};
  if (hasGoals) {
    const unknown = new Set();
    preds.forEach(d=>{ const pr=d.data(); if(pr.homeScore===0&&pr.awayScore===0)return;
      // ส่ง DeepSeek เฉพาะชื่อ "อ่านไม่ออก" จริง (ไทยนอกดิก) · อังกฤษ readable=true → ไม่ส่ง (กัน DeepSeek force-map ชื่อเป็นคนยิงมั่ว เช่น Nusa→FP) · accent ให้ norm จัดการ
      [pr.scorer1,pr.scorer2].forEach(s=>{ if(s && !matchScorer(s, actualScorers, aliases) && !readable(s, aliases)) unknown.add(s); }); });
    qwenMap = await askQwen(actualScorers, [...unknown]);   // DeepSeek resolve สด (ไม่ cache/ไม่เรียน — กัน poison · ตอนจบถามใหม่หมด = ตรวจใหญ่อีกรอบ)
  }
  let changed = 0;
  for (const d of preds) {
    const pr=d.data();
    if (!pr.revealed && !DRY) await d.ref.set({ revealed:true }, {merge:true});   // คู่เริ่มเตะแล้ว → เปิดเผยโพย (rule ให้คนอื่นอ่านได้) · ครอบทุกใบรวม 0-0/manual (ก่อน continue)
    if (pr.homeScore===0 && pr.awayScore===0) continue;   // 0-0 แอปคิดเอง
    if (pr.scorerManual) continue;                        // แอดมินติ๊กมือ → auto ไม่ทับ
    const s1 = scorerHitOne(pr.scorer1, actualScorers, qwenMap);   // คนแรกยิงไหม (ดิก + DeepSeek)
    const s2 = scorerHitOne(pr.scorer2, actualScorers, qwenMap);   // คนสองยิงไหม
    const { s1played, ok, s1unsure, s2unsure } = composeGrade({ s1, s2, scorer1:pr.scorer1, scorer2:pr.scorer2, played:lineup, resolved:hasGoals, aliasMap:aliases });   // amber เมื่อมีโกลแล้ว (ยังไม่มีโกล=ไม่ amber)
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

// โพสต์โพยทั้งวง (วง1) เข้า LINE ตอน "ปิดรับ" (lock = kickoff-10นาที) — ครั้งเดียว/คู่ (flag lockPosted) = โปร่งใส แก้ทีหลังไม่ได้
const fmtScorers = p => (p.homeScore===0 && p.awayScore===0) ? "ไม่มีคนยิง" : ([p.scorer1,p.scorer2].filter(Boolean).join(" / ") || "—");
function lockBlock(m, preds) {   // บล็อกโพยต่อ 1 คู่ (ไม่มีหัว 🔒 — เผื่อรวบหลายคู่ในข้อความเดียว)
  const rows = preds.slice().sort((a,b)=>(a.player||"").localeCompare(b.player||"","th"))
    .map(p=>`• ${p.player} ${p.homeScore}-${p.awayScore} · ${fmtScorers(p)}`).join("\n");
  return `${m.home} vs ${m.away}\n${rows||"(ยังไม่มีใครส่งโพย)"}`;
}
// แนวโน้มโพยรวม (คำนวณในโค้ด = แม่น) → ป้อนให้ DeepSeek เลือกมุก: รถผ้าป่า(เททางเดียว) / แซว-อวยคนทายสวน / คู่ทายตรงข้าม
function lockConsensus(m, preds) {
  const total = preds.length;
  if (total < 3) return "";   // คนน้อยไป ไม่สรุปเทรนด์
  const dir = p => p.homeScore>p.awayScore?"h":p.homeScore<p.awayScore?"a":"d";
  const lbl = {h:`${m.home}ชนะ`, d:"เสมอ", a:`${m.away}ชนะ`};
  const grp = {h:[],d:[],a:[]}; preds.forEach(p=>grp[dir(p)].push(p.player));
  const maj = Object.keys(grp).sort((x,y)=>grp[y].length-grp[x].length)[0], majN = grp[maj].length;
  const contra = preds.filter(p=>dir(p)!==maj).map(p=>`${p.player}(ทาย${lbl[dir(p)]})`);   // คนทายสวนเสียงข้างมาก
  const sc = {}; preds.forEach(p=>{ const k=`${p.homeScore}-${p.awayScore}`; (sc[k]=sc[k]||[]).push(p.player); });
  const topSc = Object.keys(sc).sort((a,b)=>sc[b].length-sc[a].length)[0];
  const scNote = sc[topSc].length>=3 ? ` · สกอร์ฮิต ${topSc} (${sc[topSc].length}/${total} คน เหมือนลอกกัน)` : "";
  if (majN===total) return `ทุกคนทายทางเดียวกันหมด "${lbl[maj]}" (${total}/${total}) — มุกที่เล่นได้: รถผ้าป่า/ทัวร์ลงทางเดียว หรือ โพยลอกกันทั้งวง${scNote}`;
  if (majN/total>=0.6) return `ส่วนใหญ่ทาย "${lbl[maj]}" (${majN}/${total}) · คนทายสวน: ${contra.join(", ")} — มุก: แซว/อวยคนทายสวน (กล้าต่าง·มั่นใจ·ถ้าถูกคือเทพ ถ้าพลาดคือตัวตลก) หรือเล่นรถผ้าป่ากับกลุ่มที่เทตามกัน${scNote}`;
  return `โพยแตกหลายทิศ: ${["h","d","a"].filter(k=>grp[k].length).map(k=>`${lbl[k]}=${grp[k].join("/")}`).join(" · ")} — มุก: แซวคู่ที่ทายตรงข้ามกันเอง${scNote}`;
}
// อันดับวง (คำนวณในโค้ด) → วัตถุดิบแซวตามตำแหน่ง: จ่าฝูง/ไล่จี้/กลางตาราง/บ๊วย/คู่ลุ้นบ๊วย · ใช้คำเชิงคุณภาพ (ไม่ใส่ตัวเลข กัน LLM เผลอโชว์เลข)
function standingsHint(board) {
  if (!board || board.length < 2) return "";
  const n = board.length, last = board[n-1];
  const tag = (r,i) => i===0 ? "จ่าฝูง"
    : i===1 ? "ไล่จี้จ่าฝูง"
    : i===n-1 ? "บ๊วย"
    : i===n-2 ? "รองบ๊วย" : "กลางตาราง";
  const rows = board.map((r,i)=>`${i+1}.${r.name}(${tag(r,i)})`).join(" · ");
  const close = board[n-2] && (board[n-2].total-last.total)<=2 ? ` · คู่ลุ้นบ๊วย ${board[n-2].name} กับ ${last.name} สูสีมาก (ใครพลาดจมบ๊วย)` : "";
  return `อันดับวงตอนนี้ ${rows}${close} — ❌ ห้ามเอาตัวเลขคะแนน/อันดับไปโชว์ในข้อความ`;
}
// แต้มที่ "ได้วันนี้" (จาก board.today) → วัตถุดิบแซวเชิงคุณภาพ: ไฟแรง/ได้น้อย/ยัง +0 · ไม่โชว์เลข
function todayHint(td) {
  const ents = Object.entries(td||{}); if (!ents.length) return "";
  const mx = Math.max(...ents.map(e=>e[1])), mn = Math.min(...ents.map(e=>e[1]));
  const hot = ents.filter(e=>e[1]===mx && mx>0).map(e=>e[0]);
  const zero = ents.filter(e=>e[1]===0).map(e=>e[0]);
  const low = ents.filter(e=>e[1]===mn && mn>0).map(e=>e[0]);
  const parts = [];
  if (hot.length) parts.push(`วันนี้ได้เยอะสุด(ไฟแรง): ${hot.join(", ")}`);
  if (low.length && mn!==mx) parts.push(`วันนี้ได้น้อยสุด: ${low.join(", ")}`);
  if (zero.length) parts.push(`วันนี้ยัง +0 (ยังไม่ออกตัว): ${zero.join(", ")}`);
  return parts.length ? `แต้มที่ได้วันนี้ (คู่ที่จบไปแล้ว) — ${parts.join(" · ")}` : "";
}
// #1 โพยตอนปิดรับ + #5 เตือนก่อนปิดรับ — รวมเป็น query เดียว/รอบ (window คลุมทั้งคู่) · flag ต่อวง (กันชนถ้า multipool)
async function lineLockNotify() {
  if (!LINE_TOKEN || !LINE_GROUP) return;   // ยังไม่ตั้ง LINE → ปิดสนิท (ไม่ query/ไม่ log)
  const POOL = TOP, now = Date.now(), pid = POOL.id;
  const snap = RD(await matchesCol().where("kickoff",">=", now-60*60*1000).where("kickoff","<=", now+LOCK_BEFORE_MS+PRELOCK_LEAD_MS+60000).get());
  let roster = null, board = null;
  const getBoard = async () => board || (board = await computeBoardNode(POOL));   // คำนวณ board ครั้งเดียว/รอบ (lazy · เฉพาะตอนจะโพสต์จริง) · มี .today = แต้มวันนี้
  // รวบ "คู่ที่เตะพร้อมกัน" (kickoff รายนาที — กัน ESPN เวลาเหลื่อมวินาที) เป็นกลุ่ม → 1 ข้อความ/กลุ่ม (ประหยัดโควต้า LINE)
  const lockGroups = new Map(), preGroups = new Map();
  const put = (map,k,v)=>{ const a=map.get(k)||[]; a.push(v); map.set(k,a); };
  for (const d of snap.docs) {
    const m = d.data();
    if (!m.kickoff || m.status==="finished") continue;
    const lockTs = m.kickoff - LOCK_BEFORE_MS, slot = Math.floor(m.kickoff/60000);
    if (now >= lockTs) {                                   // #1 ปิดรับแล้ว → โพยทั้งวง
      if (m["lockPosted_"+pid] || m.lockPosted) continue;  // โพสต์แล้ว (รองรับ flag เก่า)
      put(lockGroups, slot, {d, m});
    } else if (now >= lockTs - PRELOCK_LEAD_MS) {          // #5 ก่อนปิดรับ ≤1ชม → เตือนคนยังไม่ทาย
      if (m["preLockPosted_"+pid] || m.preLockPosted) continue;
      put(preGroups, slot, {d, m, lockTs});
    }
  }
  // #1 ปิดรับ — รวบทุกคู่ที่เตะเวลาเดียวกันเป็นข้อความเดียว
  for (const grp of lockGroups.values()) {
    const blocks = [], cons = [];
    for (const {d, m} of grp) {
      const preds = RD(await col(POOL,"predictions").where("matchId","==",d.id).get()).docs.map(x=>x.data());
      blocks.push(lockBlock(m, preds));
      const c = lockConsensus(m, preds); if (c) cons.push(`[${m.home}-${m.away}] ${c}`);
    }
    const b = await getBoard();
    const hint = [...cons, todayHint(b.today), standingsHint(b)].filter(Boolean).join(" · ");   // แนวโน้มโพย(ทุกคู่) + แต้มวันนี้ + อันดับวง
    const frozen = grp.length>1
      ? `🔒 ปิดรับ ${grp.length} คู่ (เตะเวลาเดียวกัน) — เปิดไพ่ทุกคน\n\n${blocks.join("\n\n")}`
      : `🔒 ปิดรับ — ${blocks[0]}`;
    const text = await spiceFrame(frozen, "ปิดรับโพย เปิดไพ่ทุกคน (โพยล็อกแล้วแก้ไม่ได้)", hint);
    if (DRY) { console.log(`[DRY] LOCK → รวบ ${grp.length} คู่\n${text}\n`); continue; }
    if (await linePush(text)) for (const {d} of grp) await d.ref.set({["lockPosted_"+pid]:true},{merge:true});
  }
  // #5 เตือนก่อนปิด — รวบทุกคู่ที่เตะเวลาเดียวกันเป็นข้อความเดียว
  for (const grp of preGroups.values()) {
    if (!roster) roster = await poolRoster(POOL);
    const lines = [];
    for (const {d, m} of grp) {
      const submitted = new Set(RD(await col(POOL,"predictions").where("matchId","==",d.id).get()).docs.map(x=>x.data().player));
      const missing = roster.filter(n=>!submitted.has(n));
      if (missing.length) lines.push(`${m.home} vs ${m.away} — ยังไม่ทาย: ${missing.join(", ")}`);
    }
    if (!lines.length) { if(!DRY) for (const {d} of grp) await d.ref.set({["preLockPosted_"+pid]:true},{merge:true}); continue; }   // ทุกคนทายครบทุกคู่ ไม่กวน
    const mins = Math.max(1, Math.round((grp[0].lockTs-now)/60000));
    const head = grp.length>1 ? `⏰ อีก ~${mins} น.ปิดรับ ${grp.length} คู่` : `⏰ อีก ~${mins} น.ปิดรับ — ${grp[0].m.home} vs ${grp[0].m.away}`;
    const dry = grp.length>1 ? `${head}\n${lines.join("\n")}` : `${head}\nยังไม่ทาย: ${lines[0].split("ยังไม่ทาย: ")[1]}`;
    const b = await getBoard();
    const instr = `- แซวคนที่ยังไม่ทาย (ชื่อในบรรทัด "ยังไม่ทาย") รายคนตามอันดับ/แต้มวันนี้ของเขา (จ่าฝูง/กลางตาราง/บ๊วย · วันนี้ไฟแรง/ยัง +0) กระตุ้นให้รีบทายก่อนปิด
- ❌ ห้ามโชว์ตัวเลขคะแนน/อันดับ · ${[standingsHint(b), todayHint(b.today)].filter(Boolean).join(" · ")}`;
    const text = await spiceOutro(dry, "เตือนคนยังไม่ทายก่อนปิดรับ", instr);   // frozen (เส้นตาย+รายชื่อคงเป๊ะ) + แซวด้านล่าง
    if (DRY) { console.log(`[DRY] PRELOCK → รวบ ${grp.length} คู่\n${text}\n`); continue; }
    if (await linePush(text)) for (const {d} of grp) await d.ref.set({["preLockPosted_"+pid]:true},{merge:true});
  }
}
// #3 สรุปจบคืน + ตารางคะแนน — replicate scoreMatch/computeBoard จาก wc2026_pool/scoring.js (แหล่งกติกาเดียวกัน)
const normTxt = s => (s||"").toString().trim().toLowerCase();
function scoreMatchNode(p, m) {   // = scoreMatch (กติกาวง) · ใช้ p.scorerOk ที่ grader ติ๊ก
  if (!p || !m || (m.status!=="finished" && !m.live)) return 0;
  let pts=0;
  const actual = m.homeScore>m.awayScore?"h":m.homeScore<m.awayScore?"a":"d";
  const g = p.homeScore>p.awayScore?"h":p.homeScore<p.awayScore?"a":"d";
  if (g===actual) pts += actual==="d"?2:1;
  if (p.homeScore===m.homeScore && p.awayScore===m.awayScore) pts+=3;
  if (p.homeScore===0 && p.awayScore===0) { if (m.homeScore===0 && m.awayScore===0) pts+=1; }
  else if (p.scorerOk) pts+=1;
  return pts;
}
async function computeBoardNode(POOL) {   // = computeBoard · ลำดับ + ชื่อ + คะแนนรวม (carry + แต้มคู่ + champ)
  const matches = RD(await matchesCol().get()).docs.map(d=>({id:d.id,...d.data()}));
  const mById = Object.fromEntries(matches.map(m=>[m.id,m]));
  const preds = RD(await col(POOL,"predictions").get()).docs.map(d=>d.data());
  const carry = (await col(POOL,"config").doc("carry").get()).data() || {};
  const players = RD(await col(POOL,"players").get()).docs.map(d=>d.data());
  const tourn = (await col(POOL,"config").doc("tournament").get()).data() || {};
  const cfgChamp = (await col(POOL,"config").doc("champPicks").get()).data() || {};
  const champion = normTxt(tourn.champion||"");
  const champPicks = {...cfgChamp};   // deriveChampPicks: config + player champ1/2 ทับ
  players.forEach(p=>{ if(p.name){ const a=[p.champ1,p.champ2].filter(Boolean); if(a.length) champPicks[p.name]=a; } });
  const todayKey = ymd6(Date.now());
  const todayIds = new Set(matches.filter(m=>m.status==="finished" && ymd6(m.kickoff)===todayKey).map(m=>m.id));   // คู่ที่จบไปแล้ว "วันนี้"
  const mp={}, td={};
  preds.forEach(p=>{ const m=mById[p.matchId]; const pts=scoreMatchNode(p,m); mp[p.player]=(mp[p.player]||0)+pts;
    if (todayIds.has(p.matchId)) td[p.player]=(td[p.player]||0)+pts; });
  const names = new Set([...Object.keys(carry), ...players.map(p=>p.name).filter(Boolean), ...Object.keys(champPicks)]);
  const rows=[...names].map(name=>{
    const champPts = champion ? [...new Set((champPicks[name]||[]).map(normTxt))].filter(t=>t===champion).length*10 : 0;   // dedup กันทาย "ทีมเดียวกัน 2 ช่อง" → +20 (ยิง Firestore ตรงเลี่ยง UI guard ได้)
    return { name, total:(carry[name]||0)+(mp[name]||0)+champPts };
  });
  rows.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,"th"));   // คะแนนเท่า → ตัวอักษร (ตรงกับแอป)
  rows.forEach((r,i)=>r.rank=i+1);
  rows.today = todayIds.size ? Object.fromEntries([...names].map(n=>[n, td[n]||0])) : {};   // แต้มวันนี้ต่อคน (ว่าง=ยังไม่มีคู่จบวันนี้)
  return rows;
}
async function nightDigest(recent) {   // recent = คู่ 48 ชม. (แชร์จาก autoAddNext กัน read ซ้ำ)
  if (!LINE_TOKEN || !LINE_GROUP) return;
  const POOL = TOP;
  const byNight={}; recent.forEach(m=>{ const k=ymd6(m.kickoff); (byNight[k]=byNight[k]||[]).push(m); });
  const cfgRef = col(POOL,"config").doc("lineNotify");
  const done = new Set(((await cfgRef.get()).data()||{}).digested||[]);
  const cand = Object.keys(byNight).filter(k=>!done.has(k) && byNight[k].every(m=>m.status==="finished")).sort();
  if (!cand.length) return;
  const night = cand[cand.length-1];   // คืนล่าสุดที่จบครบ + ยังไม่สรุป
  const matches = byNight[night].sort((a,b)=>a.kickoff-b.kickoff);
  const board = await computeBoardNode(POOL);
  // แต้มที่ "ได้วันนี้" ต่อคน (delta) = ผลรวม scoreMatchNode เฉพาะคู่ของคืนนี้ → ใช้แซว "ใครมาแรง/ใครแป้ก +0"
  const mById = Object.fromEntries(matches.map(m=>[m.id,m]));
  const ids = matches.map(m=>m.id).slice(0,30);   // คืนนึงมีไม่กี่คู่ (Firestore "in" รับได้ถึง 30)
  const npreds = ids.length ? RD(await col(POOL,"predictions").where("matchId","in",ids).get()).docs.map(d=>d.data()) : [];
  const delta = {}; npreds.forEach(p=>{ const m=mById[p.matchId]; if(m) delta[p.player]=(delta[p.player]||0)+scoreMatchNode(p,m); });
  const results = matches.map(m=>`• ${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`).join("\n");
  const table = board.map(r=>`${r.rank}. ${r.name} ${r.total} (+${delta[r.name]||0})`).join("\n");
  const dry = `📊 สรุปวันนี้ (${matches.length} คู่)\n${results}\n🏆 ตาราง (วงเล็บ = แต้มที่ได้วันนี้):\n${table}`;
  // ข้อเท็จจริงรอบนี้ (คำนวณในโค้ด = แม่น) → กัน DeepSeek แต่งมุก "+0" ทั้งที่ทุกคนได้แต้ม
  // ⚠️ ป้อนเป็น "คำเชิงอันดับ" ล้วน ไม่มีเลขดิบ (maxD/total/+N) — กันโมเดลหยิบเลขจาก hint มาพิมพ์ (กฎห้ามโชว์ตัวเลข)
  const dOf = r => delta[r.name]||0;
  const maxD = Math.max(...board.map(dOf)), minD = Math.min(...board.map(dOf));
  const surger = board.filter(r=>dOf(r)===maxD).map(r=>r.name);
  const laggard = board.filter(r=>dOf(r)===minD).map(r=>r.name);
  const zeros = board.filter(r=>dOf(r)===0).map(r=>r.name);
  const last = board[board.length-1];
  const hint = [
    `มาแรงสุดวันนี้: ${surger.join(", ")}`,
    maxD!==minD ? `ได้น้อยสุดวันนี้: ${laggard.join(", ")}` : `ทุกคนได้เท่ากันหมดวันนี้`,
    zeros.length ? `ไม่ได้แต้มเลยวันนี้ (นิ่งสนิท): ${zeros.join(", ")}` : `ไม่มีใครได้ศูนย์วันนี้ — แต่คนได้น้อยสุดแซว "แทบไม่ขยับ" ได้ (แค่ห้ามบอกว่าได้ศูนย์)`,
    `จ่าฝูง: ${board[0].name} · รั้งท้าย: ${last.name}`,
  ].join(" · ");
  const noZero = zeros.length
    ? `- คนที่ไม่ได้แต้มเลยวันนี้ (${zeros.join(", ")}) แซว "ไม่ขยับเลย/นิ่งสนิท" ได้เต็มที่`
    : `- ไม่มีใครได้ศูนย์วันนี้ แต่คนได้น้อยสุด (${laggard.join(", ")}) แซว "ไม่ขยับ/แทบไม่ขยับ/ขยับนิดเดียว/เก็บจิ๊บจ๊อย" ได้ · ❌ แค่ห้ามพูดให้เข้าใจว่าได้ "ศูนย์/ไม่ได้อะไรเลย" (เพราะจริงๆ ได้แต้มนิดนึง)`;
  const everyone = board.map(r=>r.name).join(", ");
  const instr = `- ❗"รีแคปทุกคน" — ต้องเอ่ยชื่อทุกคนในวงให้ครบอย่างน้อยคนละ 1 ครั้ง (ห้ามตกใคร): ${everyone}
- แต่ต้อง "ร้อยเป็นมุกเล่าต่อเนื่อง" ❌ ห้ามแตกเป็นลิสต์ทีละบรรทัด — จับคนที่เข้าพวกกัน (ได้เยอะ/ได้น้อย/ไม่ได้แต้ม/ทายสวน) มาแซวรวมเป็นช่วงๆ ให้ลื่น
- ❌ ห้ามพิมพ์ตัวเลขใดๆ เด็ดขาด (แต้ม/อันดับ/จำนวน) — ใช้คำแทนล้วน เช่น มาแรงสุด/จิ๊บจ๊อย/จ่าฝูง/รั้งท้าย/ไล่จี้
- ยึด "ข้อเท็จจริงรอบนี้" นี้เป๊ะ ห้ามขัด: ${hint}
${noZero}`;
  // ยาวได้เพราะต้องครบทุกคน → ปลดเพดาน "1-2 ประโยค" + เพิ่มโควต้า token (พอเอ่ยครบทั้งวง)
  const text = await spiceOutro(dry, "สรุปผลคู่ที่จบวันนี้ + ตารางคะแนน · เลขในวงเล็บ(+N)=แต้มที่ได้วันนี้", instr,
    { maxTokens: 600, lenRule: `เขียนยาวได้พอเอ่ยครบทุกคน (ราว 3-6 ประโยค ร้อยต่อเนื่อง) ❌ แต่ห้ามแตกเป็นบรรทัดลิสต์ทีละคน ❌ ห้ามน้ำเยอะเกินจำเป็น` });
  if (DRY) { console.log("[DRY] DIGEST:\n"+text+"\n"); return; }
  if (await linePush(text)) await cfgRef.set({digested:[...done, night]},{merge:true});
}

const PRELOCK_LEAD_MS = 60*60*1000;   // เตือนก่อน "ปิดรับ" 1 ชม (= kickoff - 70 นาที) · ใช้ใน lineLockNotify
async function poolRoster(POOL) {   // ชื่อสมาชิกวง = carry keys ∪ players (= rosterNames ของแอป)
  const carry = (await col(POOL,"config").doc("carry").get()).data() || {};
  const players = RD(await col(POOL,"players").get()).docs.map(d=>d.data().name).filter(Boolean);
  return [...new Set([...Object.keys(carry), ...players])];
}
async function run() {
  if (BACKFILL) { await backfillGroup(); return; }   // โหมด one-shot — ข้าม grader ปกติ
  if (LINETEST) { console.log("LINE test →", await linePush("🤖 สวัสดีครับ ผมคือ AI ที่มาแทนกุ้ย-ชิน\nหน้าที่ผม:\n• โพสต์โพยทั้งวงตอนปิดรับ (โปร่งใส แก้ไม่ได้)\n• เตือนก่อนปิดรับ + ใครยังไม่ทาย\n• แจ้งเปิดทายชุดใหม่\n• สรุปผล + ตารางคะแนนทุกวัน") ? "ส่งสำเร็จ ✅" : "ส่งไม่ได้ (เช็ก token/group)"); return; }
  if (DRY) console.log("🧪 DRY-RUN: อ่าน + เรียก Qwen ได้ แต่จะไม่เขียน Firestore\n");
  // safeguard: ใกล้เพดาน read วันนี้ไหม → low-power (เขียนสกอร์อย่างเดียว กันแอปล่มทั้งวง) · FORCE/REGRADE (สั่งมือ) ไม่โดน
  const usage = await usageRead();
  const lowPower = !FORCE && !REGRADE && usage.prior >= READ_CAP;
  if (lowPower) console.log(`🟡 LOW-POWER: read วันนี้ ${usage.prior} ≥ ${READ_CAP} — เขียนเฉพาะสกอร์ ข้ามตรวจคนยิง/autoAdd (regrade เก็บตกทีหลัง)`);
  const pools = await listPools();
  console.log("วงที่ตรวจ:", pools.map(p=>p.id).join(", "));
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
          const n = await gradeScorers(p, mdoc.id, ev.scorers, luLive);   // ⚽ ตรวจคนยิงสด (ดิก + DeepSeek เมื่อมีโกล + กฎคนแรกลงเล่น)
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
    if (!DRY) await mdoc.ref.set({ homeScore:ev.hs, awayScore:ev.as, scorers:ev.scorers, goals:ev.goals, status:"finished", live:false, clock:"จบ" }, {merge:true});   // เขียนผล/สกอร์ก่อน — ยัง"ไม่"ปิด (autoGraded) จนตรวจคนยิงครบ
    // 2) ตรวจคนยิงเต็มทุกวง (ดิก + Qwen กวาดชื่อใหม่ + กฎคนแรกลงเล่น)
    const luFin = await fetchLineup(ev.id);
    for (const p of pools) {
      const n = await gradeScorers(p, mdoc.id, ev.scorers, luFin);
      console.log(`[${p.id}]   ตรวจคนยิง (จบ) เปลี่ยน ${n} โพย`);
    }
    // 3) ปิด (autoGraded) "หลัง" ตรวจคนยิงครบทุกวง — กัน throw กลางคัน (quota/lineup) ค้าง grade ไม่สมบูรณ์ถาวร (บรรทัด 606 ข้าม) ·
    //    ต้องมี lineup จริง (หรือ 0-0 ไม่ต้องมี) ก่อนปิด — luFin ว่าง → composeGrade เดา s1played=true ผิด → ยังไม่ปิด รอ tick หน้า ESPN ส่ง lineup มา
    const luOk = luFin.length>0 || (ev.hs===0 && ev.as===0);
    if (!DRY && luOk) await mdoc.ref.set({ autoGraded:true, finishedAt:Date.now() }, {merge:true});
    else if (!luOk) console.log(`   ⏳ ${m.home}-${m.away}: lineup ว่าง — ยังไม่ปิด (autoGraded) รอ tick หน้า`);
  }
  }   // ปิด else (live)
  // 🔓 เปิดเผยโพยตอน "ปิดรับ" (kickoff-10min ≤ now < kickoff) — ทุกวง · นอก live-gate (ต้องรันแม้ยังไม่มีคู่ live ให้ตรงกับ LINE lock-post) · cheat-safe เพราะปิดรับแล้วแก้ไม่ได้ · live/finished → gradeScorers ดูแล revealed ต่อ
  if (!lowPower) try {
    const lockNow = Date.now();
    const lockMs = RD(await matchesCol().where("kickoff",">", lockNow).where("kickoff","<=", lockNow+LOCK_BEFORE_MS).get());   // คู่ที่ปิดรับแล้วแต่ยังไม่เตะ
    let rv = 0, done = 0;
    for (const md of lockMs.docs) {
      if (md.data().revealDone) continue;   // เปิดเผยครบแล้ว (ปิดรับแล้วไม่มีโพยใหม่) → ไม่อ่าน preds ซ้ำทุก tick · flag เหมือน lockPosted
      for (const p of pools)
        for (const d of RD(await col(p,"predictions").where("matchId","==",md.id).get()).docs)
          if (!d.data().revealed) { if (!DRY) await d.ref.set({ revealed:true }, {merge:true}); rv++; }
      if (!DRY) await md.ref.set({ revealDone:true }, {merge:true}); done++;   // มาร์กคู่นี้ "เปิดครบ" → tick หน้าข้าม
    }
    if (rv || done) console.log(`${DRY?"[DRY] ":""}🔓 เปิดเผยโพย ${done} คู่ · ${rv} โพย`);
  } catch(e){ console.log("⚠️ reveal ล้มเหลว:", e.message); }   // ไม่ให้ล้มแล้วทุบ autoAdd/LINE/usage ข้างล่าง (เหมือน try รอบ lineLockNotify)
  // autoAdd + digest อ่านคู่ 48ชม. = ตัวกิน read หลัก → อ่าน "ครั้งเดียว" แชร์กัน · ทุก ~5 นาที · ข้ามถ้า low-power
  if (!lowPower && (FORCE || DRY || new Date().getMinutes() % 5 === 0)) {
    const ms48 = RD(await matchesCol().where("kickoff",">=", Date.now()-48*60*60*1000).get()).docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.kickoff);
    try { await autoAddNext(ms48); } catch(e){ console.log("⚠️ auto-add ล้มเหลว:", e.message); }
    try { await updateNextSetPreview(); } catch(e){ console.log("⚠️ nextSet preview ล้มเหลว:", e.message); }   // พรีวิวชุดถัดไป → config/nextSet
    try { await nightDigest(ms48); } catch(e){ console.log("⚠️ night-digest ล้มเหลว:", e.message); }   // #3 สรุปจบคืน + ตาราง
  }
  // LINE ปิดรับ/เตือน — ทุกรอบ (ต้องไว) · query เดียว · ข้ามถ้า low-power
  if (!lowPower) try { await lineLockNotify(); } catch(e){ console.log("⚠️ line lock-notify ล้มเหลว:", e.message); }   // #1 + #5
  // บันทึกยอด read สะสมวันนี้ (กัน quota เต็ม) — 1 write
  if (!DRY && usage.ref) { try { await usage.ref.set({ day: ymdPT(), reads: usage.prior + dayReads }); console.log(`📊 read วันนี้ ~${usage.prior + dayReads}/${READ_CAP}`); } catch(e){} }
  console.log("เสร็จ ✅", new Date().toLocaleString("th-TH"));
  console.log("__LIVE__:" + (anyLive ? 1 : 0));   // สัญญาณให้ workflow loop: 1=ยังมีบอลสด วนต่อ
}
run().then(()=>process.exit(0)).catch(e=>{
  if (isQuota(e)) { console.log("🛑 Firestore quota เต็ม — หยุดรอบนี้แบบนิ่งๆ (รอ reset/วันใหม่)"); process.exit(0); }
  console.error("❌",e); process.exit(1);
});
