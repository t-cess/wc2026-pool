// ลบการจับคู่บัญชี Google ↔ ชื่อในวง (เพื่อให้เลือกตัวตนใหม่)
// รัน: node reset-player.mjs ต้น
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(new URL("./serviceAccount.json", import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const name = process.argv[2];
if (!name) { console.error("ใส่ชื่อ: node reset-player.mjs <ชื่อ>"); process.exit(1); }

const snap = await db.collection("players").where("name", "==", name).get();
if (snap.empty) { console.log("ไม่พบผู้เล่นชื่อ:", name); process.exit(0); }
for (const d of snap.docs) { await d.ref.delete(); console.log("✓ ลบการจับคู่:", d.id, "→", name); }
console.log("เสร็จ — รีเฟรชเว็บ (Cmd+Shift+R) จะเห็นหน้าเลือกตัวตนอีกครั้ง");
process.exit(0);
