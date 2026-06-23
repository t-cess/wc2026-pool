// เทส matchScorer กับโพยจริง (Firestore) + เคส adversarial · รัน: node test-namematch.mjs
import { readFileSync } from "node:fs";
import { matchScorer } from "./namematch.mjs";
const aliasMap = JSON.parse(readFileSync(new URL("aliases.json", import.meta.url)));

// คนยิงจริงต่อแมตช์ (ESPN ground truth)
const JPN = ["Daichi Kamada","Ayase Ueda","Junya Ito"];
const NED = ["Brian Brobbey","Cody Gakpo","Anthony Elanga","Crysencio Summerville"];
const GER = ["Franck Kessié","Deniz Undav"];
const ESP = ["Lamine Yamal","Mikel Oyarzabal"];   // คนยิงจริงสด (สเปน) — ไม่มีในดิก เทสว่าจับด้วยนามสกุล

// [input, actualScorers, expect]  expect=canonical ที่ควรได้ หรือ null=ไม่ควรตรงใคร
const CASES = [
  // — ญี่ปุ่น (โพยจริง) —
  ["อูเอเดะ", JPN, "Ayase Ueda"], ["คามาดะ", JPN, "Daichi Kamada"], ["อูเอดะ", JPN, "Ayase Ueda"],
  ["อายาเสะอุเอดะ", JPN, "Ayase Ueda"], ["Ayase Ueda", JPN, "Ayase Ueda"],
  ["โดอัน", JPN, null], ["โคกิโอกาสะ", JPN, null], ["Ritsu Doan", JPN, null], ["Takefusa Kubo", JPN, null],
  // — เนเธอร์แลนด์ (โพยจริง) —
  ["กักโป", NED, "Cody Gakpo"], ["กั๊กโป", NED, "Cody Gakpo"], ["Cody Gakpo", NED, "Cody Gakpo"],
  ["กั๊กโป มึงยิงให้กูสักหน่อยเถอะกูขอร้อง", NED, "Cody Gakpo"],   // มุก/ประโยคยาว
  ["Crysencio Summerville", NED, "Crysencio Summerville"],
  ["อิซัค", NED, null], ["isak", NED, null], ["Isak", NED, null],
  ["เยอเกเรส", NED, null], ["เจ๊เกียว", NED, null], ["โยเกียวเรส", NED, null], ["Depay", NED, null],
  // — เยอรมนี (โพยจริง) —
  ["อุนดาฟ", GER, "Deniz Undav"],
  ["มูเซียล่า", GER, null], ["ฮาเวิท", GER, null], ["ฮาแวร์ตซ์", GER, null], ["ฮาแวซ", GER, null],
  ["ไก่ฮาแวต", GER, null], ["อาหมัดเทพเจ้าดาวเหนือเดียโล่", GER, null],
  ["Kai Havertz", GER, null], ["Jamal Musiala", GER, null], ["Havertz", GER, null], ["Sane", GER, null],

  // — adversarial: กัน false positive —
  ["Brobbey", NED, "Brian Brobbey"],          // นามสกุลล้วน
  ["บร็อบบี้", NED, "Brian Brobbey"],          // ★ ยังไม่มีในดิก — คาดว่าพลาด (ต้อง Qwen) ดูว่าหลุดเป็น FP ไหม
  ["", GER, null],                             // ว่าง
  ["เอลังกา", NED, "Anthony Elanga"],          // ★ ยังไม่มีในดิก
  ["ซาเน่ ยิงให้ที", GER, null],               // ประโยค + คนไม่ได้ยิง → ห้ามตรง
  ["อุนดาฟกับฮาแวร์ตซ์", GER, "Deniz Undav"],   // 2 ชื่อในข้อความเดียว มีคนยิงจริง 1 → ตรง Undav

  // — สเปน (สด): ชื่อใหม่ที่ "ไม่อยู่ในดิก" ต้องจับได้ด้วยนามสกุล (โค้ดเก่า exact-match พลาดหมด) —
  ["Yamal", ESP, "Lamine Yamal"],                 // นามสกุลล้วน ไม่มีในดิก
  ["Lamine Yamal", ESP, "Lamine Yamal"],
  ["Mikel Oyarzabal", ESP, "Mikel Oyarzabal"],
  ["Morata", ESP, null],                          // ไม่ได้ยิง → ไม่ตรง (กฎสำรองให้ grader จัดการต่อ)
  ["ferran torres", ESP, null],                   // ลงเล่นแต่ยังไม่ยิง → name-reading คืน null ถูก
  ["Pedri", ESP, null],                           // กัน FP: Pedri ≠ Pedro Porro (ถ้าโผล่เป็นคนยิง)

  // — adversarial: ชื่อต้นชนกัน ห้ามเดา (FP มองไม่เห็น) —
  ["Mikel", ESP, null],                           // ชื่อต้นล้วน → ไม่ auto-credit (Oyarzabal ต้องผ่านนามสกุล/ดิก)
  ["Bruno", ["Bruno Fernandes","Bruno Guimarães"], null],   // 2 คนชื่อ Bruno → ชื่อต้นเดียวไม่พอ
  ["Fernandes", ["Bruno Fernandes","Bruno Guimarães"], "Bruno Fernandes"],  // นามสกุลแยกได้

  // — accent-insensitive: พิมพ์อังกฤษไม่ใส่ accent ต้องตรงคนยิงที่มี accent —
  ["Mbappe", ["Kylian Mbappé"], "Kylian Mbappé"], ["mbappe", ["Kylian Mbappé"], "Kylian Mbappé"],
  ["Nunez", ["Darwin Núñez"], "Darwin Núñez"], ["Munoz", ["Daniel Muñoz"], "Daniel Muñoz"],
  ["Alvarez", ["Julián Álvarez"], "Julián Álvarez"],
];

let pass=0, fpFail=[], fnFail=[];
for (const [input, actual, expect] of CASES) {
  const got = matchScorer(input, actual, aliasMap);
  const ok = got === expect;
  if (ok) { pass++; continue; }
  if (expect===null && got!==null) fpFail.push({input, got});          // FP: ไม่ควรตรง แต่ดันตรง (อันตราย)
  else fnFail.push({input, expect, got});                              // FN/ผิดคน
}
console.log(`\nผ่าน ${pass}/${CASES.length}`);
if (fpFail.length){ console.log(`\n❌ FALSE POSITIVE (${fpFail.length}) — ให้คะแนนผิด อันตรายสุด:`); fpFail.forEach(f=>console.log(`   "${f.input}" → ${f.got} (ควร null)`)); }
if (fnFail.length){ console.log(`\n⚠️ FALSE NEG/ผิดคน (${fnFail.length}) — ปฏิเสธผิด/ส่งQwenต่อ:`); fnFail.forEach(f=>console.log(`   "${f.input}" → ${f.got} (ควร ${f.expect})`)); }
console.log(fpFail.length===0 ? "\n✅ ไม่มี false positive" : "\n🔴 มี false positive ต้องแก้");
