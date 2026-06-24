// 🔐 Migrate email ออกจาก players/{uid} → emails/{uid} (PII แยก gated) · top-level + ทุก pool
// idempotent: รันซ้ำได้ · doc ที่ไม่มี email แล้ว = ข้าม
// ⚠️ รัน "หลัง" deploy code ที่เขียน email แยกแล้ว · "ก่อน" publish rule players read=authed (กัน email รั่วระหว่างทาง)
// รัน:  cd admin && node migrate-emails.mjs        (--dry-run = พรีวิวไม่เขียน)
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(new URL("./serviceAccount.json", import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const DRY = process.argv.includes("--dry-run");

async function migratePool(label, playersCol, emailsCol) {
  const snap = await playersCol.get();
  let moved = 0, skipped = 0;
  for (const d of snap.docs) {
    const p = d.data();
    if (!("email" in p) || !p.email) { skipped++; continue; }   // ไม่มี email แล้ว = ย้ายไปแล้ว/ไม่มี
    console.log(`  ${DRY ? "[DRY] " : ""}${label} ${d.id} (${p.name || "?"}) → emails/${d.id} = ${p.email}`);
    if (!DRY) {
      await emailsCol.doc(d.id).set({ uid: d.id, email: p.email }, { merge: true });   // เก็บ email gated
      await d.ref.update({ email: FieldValue.delete() });                               // ลบฟิลด์ออกจาก players (กัน public read เห็น)
    }
    moved++;
  }
  console.log(`${label}: ย้าย ${moved} · ข้าม ${skipped} (รวม ${snap.size})`);
}

// วงหลัก (top-level)
await migratePool("วงหลัก", db.collection("players"), db.collection("emails"));

// ทุก pool
const poolRefs = await db.collection("pools").listDocuments();
for (const ref of poolRefs) {
  await migratePool(`pool/${ref.id}`, ref.collection("players"), ref.collection("emails"));
}
console.log(DRY ? "\nDRY — เอา --dry-run ออกเพื่อเขียนจริง" : "\n✅ migrate เสร็จ");
process.exit(0);
