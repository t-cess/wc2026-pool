// 🗂️ Backfill registry config/poolsIndex — รายชื่อวงทั้งหมด (ให้ super หน้า "จัดการ" เห็นทุกวง)
// client enumerate วงเองไม่ได้ (subcollection docs ลิสต์จากฝั่ง client ไม่ได้) → ต้องมี registry กลาง
// รัน:  cd admin && node backfill-poolsindex.mjs
//   อ่าน pools/* ทั้งหมด → meta.name → เขียน config/poolsIndex = {pools:[{code:"",name:"วงหลัก"},{code,name},...]}
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(new URL("./serviceAccount.json", import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ชื่อวงหลัก (top-level) — meta ไม่มีใน top-level config เสมอไป
const mainMetaSnap = await db.doc("config/meta").get();
const mainName = (mainMetaSnap.exists && mainMetaSnap.data().name) || "วงหลัก";

const pools = [{ code: "", name: mainName }];

// enumerate pools/{CODE} (listDocuments คืน ref รวม doc ที่ "ขาด" แต่มี subcollection)
const poolRefs = await db.collection("pools").listDocuments();
for (const ref of poolRefs) {
  const metaSnap = await db.doc(`pools/${ref.id}/config/meta`).get();
  const name = (metaSnap.exists && metaSnap.data().name) || ref.id;
  pools.push({ code: ref.id, name });
}

await db.doc("config/poolsIndex").set({ pools });
console.log("✅ เขียน config/poolsIndex แล้ว:");
pools.forEach(p => console.log(`   ${p.code || "(วงหลัก)"} → ${p.name}`));
