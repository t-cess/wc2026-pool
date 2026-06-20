// 🛠️ สคริปต์แอดมินวงทายบอลโลก — เพิ่มคู่ / กรอกผล / ตั้งคะแนนยกมา / ตั้งแชมป์
// ใช้โดย Claude (หรือ ต้น) — เขียนลง Firestore ตรงๆ
//
// เตรียมครั้งเดียว:
//   1) วางไฟล์กุญแจไว้ที่  admin/serviceAccount.json  (ดูวิธีโหลดใน README ด้านล่างของไฟล์นี้)
//   2) cd admin && npm install
// รัน:
//   node admin.mjs list     → โชว์คู่ทั้งหมด + id (เอาไว้กรอกผล)
//   node admin.mjs          → ลงข้อมูลที่กำหนดในบล็อกด้านล่าง

import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(new URL("./serviceAccount.json", import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

/* ===================== แก้ข้อมูลตรงนี้แต่ละวัน ===================== */

// 1) คะแนนรวมล่าสุด (วันนี้) — ใส่ยอดรวมปัจจุบันของแต่ละคน
const CARRY = { "กราฟ":37, "กุ้ย":35, "นน":35, "BB":33, "กอล์ฟ":33, "ต้น":31 };

// 1.2) คะแนนเมื่อวาน (ใช้คิด "+วันนี้" = วันนี้-เมื่อวาน และลูกศรขึ้น/ลงอันดับ)
const PREV  = { "กุ้ย":31, "BB":30, "นน":29, "กราฟ":29, "กอล์ฟ":28, "ต้น":21 };

// 1.3) ป้ายชุดล่าสุด (คืน→เช้า) โชว์บนหน้าคะแนน
const BATCH = "ชุดล่าสุด · คืน 19 → เช้า 20 มิ.ย. (เวลาไทย)";

// 1.5) ทายแชมป์ของทุกคน (ทายครบแล้ว) + ล็อก/เปิดเผย
const CHAMP_PICKS = {
  "กราฟ":["โปรตุเกส","ฝรั่งเศส"], "กุ้ย":["สเปน","ฝรั่งเศส"], "นน":["อังกฤษ","โปรตุเกส"],
  "BB":["บราซิล","อังกฤษ"], "กอล์ฟ":["ฝรั่งเศส","สเปน"], "ต้น":["บราซิล","อาร์เจนตินา"],
};
const LOCK_PICKS = true;   // ล็อกทายแชมป์ (ทุกคนทายครบแล้ว → เปิดเผยในแอป)

// 2) เพิ่มคู่ (kickoff เวลาไทย) — id สร้างอัตโนมัติจากชื่อทีม+กลุ่ม (กันซ้ำ)
const ADD_MATCHES = [
  { home:"เนเธอร์แลนด์", away:"สวีเดน",      group:"F นัด2", kickoff:"2026-06-21T00:00" },
  { home:"เยอรมนี",     away:"ไอวอรีโคสต์", group:"E นัด2", kickoff:"2026-06-21T03:00" },
  { home:"เอกวาดอร์",   away:"คูราเซา",      group:"E นัด2", kickoff:"2026-06-21T07:00" },
  { home:"ตูนิเซีย",     away:"ญี่ปุ่น",       group:"F นัด2", kickoff:"2026-06-21T11:00" },
];

// 3) กรอกผล (เอา id จาก `node admin.mjs list`)
const RESULTS = [
  // { id:"m_เช็ก_เม็กซิโก_aนัด3", homeScore:1, awayScore:1, scorers:["ชิค"], dnp:[] },
];

// 4) ตั้งแชมป์ (ตอนจบทัวร์) — ปล่อยว่างถ้ายัง
const CHAMPION = "";

/* ===================== ลงมือ (ไม่ต้องแก้ด้านล่าง) ===================== */
const idFor = m => "m_" + (m.home+"_"+m.away+"_"+(m.group||"")).toLowerCase().replace(/\s+/g,"").replace(/[^a-z0-9ก-๙_]/g,"");

async function list() {
  const snap = await db.collection("matches").orderBy("kickoff").get();
  if (snap.empty) return console.log("(ยังไม่มีคู่)");
  snap.forEach(d => { const m=d.data();
    console.log(`${d.id}\t${m.status}\t${m.home} ${m.homeScore}-${m.awayScore} ${m.away} (${m.group||""})`);
  });
}

async function apply() {
  if (Object.keys(CARRY).length) {
    await db.doc("config/carry").set(CARRY, { merge:true });
    console.log("✓ คะแนนวันนี้:", CARRY);
  }
  if (Object.keys(PREV).length) {
    await db.doc("config/prev").set(PREV, { merge:true });
    console.log("✓ คะแนนเมื่อวาน:", PREV);
  }
  if (BATCH) {
    await db.doc("config/tournament").set({ batchLabel:BATCH }, { merge:true });
    console.log("✓ ป้ายชุด:", BATCH);
  }
  if (Object.keys(CHAMP_PICKS).length) {
    await db.doc("config/champPicks").set(CHAMP_PICKS, { merge:true });
    console.log("✓ ทายแชมป์ทุกคน:", Object.keys(CHAMP_PICKS).join(", "));
  }
  if (LOCK_PICKS) {
    await db.doc("config/tournament").set({ picksLocked:true }, { merge:true });
    console.log("✓ ล็อกทายแชมป์แล้ว");
  }
  for (const m of ADD_MATCHES) {
    const id = idFor(m);
    await db.doc("matches/"+id).set({
      home:m.home, away:m.away, group:m.group||"",
      kickoff:new Date(m.kickoff).getTime(),
      homeScore:0, awayScore:0, scorers:[], dnp:[], status:"upcoming"
    }, { merge:true });
    console.log("✓ เพิ่มคู่:", id);
  }
  for (const r of RESULTS) {
    await db.doc("matches/"+r.id).set({
      homeScore:r.homeScore, awayScore:r.awayScore,
      scorers:r.scorers||[], dnp:r.dnp||[], status:"finished"
    }, { merge:true });
    console.log("✓ กรอกผล:", r.id, `${r.homeScore}-${r.awayScore}`);
  }
  if (CHAMPION) {
    await db.doc("config/tournament").set({ champion:CHAMPION, championLocked:true }, { merge:true });
    console.log("✓ ตั้งแชมป์:", CHAMPION);
  }
  console.log("เสร็จ ✅");
}

const cmd = process.argv[2];
(cmd === "list" ? list() : apply())
  .then(() => process.exit(0))
  .catch(e => { console.error("❌", e.message); process.exit(1); });
