// 📥 ดู/เคลียร์ "คิวรอตรวจ" ชื่อคนยิงที่ DeepSeek แมพได้ (config/suggestedAliases) — คนรีวิวเอง ไม่ auto-apply (กัน poison)
// รัน:
//   node review-aliases.mjs            → โชว์ "คิว: N" + รายการ (raw → canon · เห็นกี่แมตช์) · N=0 = เงียบ บรรทัดเดียว
//   node review-aliases.mjs --count    → พิมพ์แค่ตัวเลข (เช็กถูกสุด ก่อนตัดสินใจดึงเต็ม)
//   node review-aliases.mjs --clear "k1" "k2"   → ลบรายการที่เติม aliases.json แล้ว + ลด pending
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const here = new URL(".", import.meta.url);
const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : JSON.parse(readFileSync(new URL("serviceAccount.json", here)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const ref = db.doc("config/suggestedAliases");

const args = process.argv.slice(2);
const data = (await ref.get()).data() || {};
const items = data.items || {};
const keys = Object.keys(items);
const pending = data.pending ?? keys.length;

if (args[0] === "--count") { console.log(pending); process.exit(0); }

if (args[0] === "--clear") {
  const rm = args.slice(1);
  if (!rm.length) { console.log("ใส่ key ที่จะลบ เช่น --clear \"วินิซิอุส\""); process.exit(1); }
  const patch = {}; let n = 0;
  for (const k of rm) { if (items[k]) { patch[`items.${k}`] = FieldValue.delete(); n++; } else console.log("⚠️ ไม่พบในคิว:", k); }
  if (n) { patch.pending = Math.max(0, pending - n); await ref.update(patch); }
  console.log(`✅ ลบ ${n} รายการ · pending เหลือ ${Math.max(0, pending - n)}`);
  process.exit(0);
}

console.log(`คิวรอตรวจ: ${pending}`);
if (keys.length) {
  console.log("");
  for (const k of keys) { const it = items[k]; console.log(`  "${k}"  →  ${it.canon}   (เห็น ${it.matches?.length||1} แมตช์ · พิมพ์จริง: "${it.raw}")`); }
  console.log(`\nเติมเข้า aliases.json แล้ว เคลียร์ด้วย: node review-aliases.mjs --clear ${keys.map(k=>`"${k}"`).join(" ")}`);
}
process.exit(0);
