// 🔧 Backfill: ตั้ง revealed=true ให้โพยของคู่ที่ "เริ่มเตะแล้ว" (kickoff<=now) + สร้าง marker "ส่งแล้ว" ให้คู่ที่ยังไม่เตะ
//   revealed = ฟิลด์ที่ rule ใช้เปิดให้คนอื่นอ่านโพย (auto-grade พลิกให้ตอนเริ่มเตะ · ตัวนี้ backfill ของเก่าก่อน publish rule)
//   top-level + ทุก pool · matches ใช้ร่วม top-level (โหลดครั้งเดียว)
// idempotent: รันซ้ำได้ · โพยที่ revealed แล้ว = ข้าม · marker merge
// ⚠️ ลำดับ: รัน "ก่อน" publish rule ใหม่ (gate read) — โพยคู่ที่เตะแล้วแต่ยังไม่ revealed จะถูกอ่านไม่ได้หลัง publish → บอร์ดเพี้ยน
// รัน:  cd admin && node backfill-pred-reveal.mjs        (--dry-run = พรีวิวไม่เขียน)
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(new URL("./serviceAccount.json", import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const DRY = process.argv.includes("--dry-run");
const now = Date.now();

// kickoff ของทุกคู่ (matches = top-level ใช้ร่วมทุกวง)
const koOf = {};
(await db.collection("matches").get()).forEach(d => { koOf[d.id] = d.data().kickoff || 0; });
console.log(`โหลด ${Object.keys(koOf).length} คู่ (matches)\n`);

async function backfillPool(label, predsCol, submittedCol) {
  const snap = await predsCol.get();
  let rv = 0, mk = 0, skip = 0;
  for (const d of snap.docs) {
    const p = d.data();
    const k = koOf[p.matchId];
    if (k == null) { skip++; continue; }                       // ไม่รู้จัก match → ข้าม
    if (k <= now) {                                            // เตะแล้ว → เปิดเผยโพย
      if (!p.revealed) {
        if (!DRY) await d.ref.set({ revealed: true }, { merge: true });
        rv++;
      }
    } else {                                                  // ยังไม่เตะ → ต้องมี marker "ส่งแล้ว"
      const pid = `${p.matchId}__${p.uid}`;                    // canonical id (ตรงกับที่ client เขียน) กัน marker ซ้ำ
      if (!DRY) await submittedCol.doc(pid).set({ uid: p.uid, matchId: p.matchId, player: p.player }, { merge: true });
      mk++;
    }
  }
  console.log(`${label}: revealed ${rv} · marker ${mk} · ข้าม ${skip} (รวม ${snap.size})`);
}

// วงหลัก (top-level)
await backfillPool("วงหลัก", db.collection("predictions"), db.collection("submitted"));

// ทุก pool
const poolRefs = await db.collection("pools").listDocuments();
for (const ref of poolRefs) {
  await backfillPool(`pool/${ref.id}`, ref.collection("predictions"), ref.collection("submitted"));
}
console.log(DRY ? "\nDRY — เอา --dry-run ออกเพื่อเขียนจริง" : "\n✅ backfill เสร็จ");
process.exit(0);
