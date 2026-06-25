// แก้ scorerOk ที่ตรวจแล้วผิด/ค้าง — targeted .set merge · DRY ก่อน, ใส่ --go ถึงเขียนจริง
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const here = new URL(".", import.meta.url);
const sa = JSON.parse(readFileSync(new URL("serviceAccount.json", here)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const GO = process.argv.includes("--go");
const predRef = (pool, id) => pool==="วง1"
  ? db.collection("predictions").doc(id)
  : db.collection("pools").doc(pool).collection("predictions").doc(id);

// แต่ละรายการ: ตรวจด้วย ESPN lineup แล้ว (ดู audit2.mjs) · patch = field ที่จะเขียน
const FIXES = [
  // ── ได้แต้มเพิ่ม (false negative) ──
  { tag:"+1 ต้น โมร็อกโก: En-Nesyri ไม่ลงสนาม, Saibari ยิง (กฎสำรอง)", pool:"วง1",
    id:"m_โมร็อกโก_เฮติ_กลุ่มCนัด3__2JDn4HZ2ztg5KOA3XnoXBsZj22n1",
    patch:{ scorerOk:true, s1unsure:false, s2unsure:false, scorerManual:true } },
  { tag:"+1 พี่นิก สกอต-บราซิล: Vini ยิง (ค้าง undefined)", pool:"YXL7K",
    id:"m_สกอตแลนด์_บราซิล_กลุ่มCนัด3__7tokPxKAe6VHdxMV75Q8WkAR2Mm1",
    patch:{ scorerOk:true, s1hit:true, s1unsure:false, s2unsure:false, scorerManual:true } },

  // ── เกรด undefined ค้าง → ✗ (ไม่เปลี่ยนแต้ม แค่ลบ "?") ──
  { tag:"กุ้ย เบลเยียม 0-0", pool:"วง1",
    id:"m_เบลเยียม_อิหร่าน_นัด2__IcBxpKFNvmcb8K10FYe6Yc1MwED3",
    patch:{ scorerOk:false, scorerManual:true } },
  { tag:"พี่ทศ เบลเยียม 0-0", pool:"YXL7K",
    id:"m_เบลเยียม_อิหร่าน_นัด2__UOHqMhgx6jSCJiAB26gxeLtNGCz1",
    patch:{ scorerOk:false, scorerManual:true } },
  { tag:"พี่บอล เบลเยียม 0-0", pool:"YXL7K",
    id:"m_เบลเยียม_อิหร่าน_นัด2__xUzOa6vQ4fgXAfHXzGB9sTbKaxr2",
    patch:{ scorerOk:false, scorerManual:true } },
  { tag:"พี่นิก จอร์แดน: Tamari ลงแต่ไม่ยิง", pool:"YXL7K",
    id:"m_จอร์แดน_แอลจีเรีย_นัด2__7tokPxKAe6VHdxMV75Q8WkAR2Mm1",
    patch:{ scorerOk:false, scorerManual:true } },
  { tag:"นน โมร็อกโก: En-Nesyri ไม่ลง + El Kaabi ไม่ยิง", pool:"วง1",
    id:"m_โมร็อกโก_เฮติ_กลุ่มCนัด3__SaFD31r2eqS8mAtHGNrX3fkypj73",
    patch:{ scorerOk:false, scorerManual:true } },

  // ── เคลียร์ amber ที่ verdict ชัวร์แล้ว (ไม่เปลี่ยนแต้ม) ──
  { tag:"clear amber ต้น จอร์แดน (ok=true)", pool:"วง1",
    id:"m_จอร์แดน_แอลจีเรีย_นัด2__2JDn4HZ2ztg5KOA3XnoXBsZj22n1", patch:{ s2unsure:false } },
  { tag:"clear amber ต้น ปานามา (ok=true)", pool:"วง1",
    id:"m_ปานามา_โครเอเชีย_กลุ่มLนัด2__2JDn4HZ2ztg5KOA3XnoXBsZj22n1", patch:{ s2unsure:false } },
  { tag:"clear amber BB โปรตุเกส (ok=true)", pool:"วง1",
    id:"m_โปรตุเกส_อุซเบกิสถาน_กลุ่มKนัด2__6PM3cbcuUfOnmD0suK3A3z4uIZ02", patch:{ s2unsure:false } },
  { tag:"clear amber นน โปรตุเกส (ok=true)", pool:"วง1",
    id:"m_โปรตุเกส_อุซเบกิสถาน_กลุ่มKนัด2__SaFD31r2eqS8mAtHGNrX3fkypj73", patch:{ s2unsure:false } },
  { tag:"clear amber BB โมร็อกโก (Díaz ลง+ไม่ยิง, ok=false)", pool:"วง1",
    id:"m_โมร็อกโก_เฮติ_กลุ่มCนัด3__6PM3cbcuUfOnmD0suK3A3z4uIZ02", patch:{ s1unsure:false } },
  { tag:"clear amber นน โคลอมเบีย (ok=false)", pool:"วง1",
    id:"m_โคลอมเบีย_คองโก_กลุ่มKนัด2__SaFD31r2eqS8mAtHGNrX3fkypj73", patch:{ s2unsure:false } },
];

console.log(GO ? "=== เขียนจริง ===\n" : "=== DRY RUN (ใส่ --go เพื่อเขียน) ===\n");
for (const f of FIXES){
  const ref = predRef(f.pool, f.id);
  const snap = await ref.get();
  if (!snap.exists){ console.log(`❌ ไม่เจอ: [${f.pool}] ${f.id}`); continue; }
  const d = snap.data();
  const before = { scorerOk:d.scorerOk, s1hit:d.s1hit, s2hit:d.s2hit, s1unsure:d.s1unsure, s2unsure:d.s2unsure };
  console.log(`• ${f.tag}`);
  console.log(`   ${d.player} (${d.scorer1||""}${d.scorer2?" / "+d.scorer2:""}) ${JSON.stringify(before)} → ${JSON.stringify(f.patch)}`);
  if (GO) await ref.set(f.patch, { merge:true });
}
console.log(GO ? "\n✅ เขียนเสร็จ" : "\nยังไม่เขียน (DRY)");
process.exit(0);
