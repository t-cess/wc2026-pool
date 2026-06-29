// เทสการประกอบกฎตัวสำรอง (composeGrade) — canon-based · ครอบ edge ที่ matchScorer เทสไม่ถึง · รัน: node test-grade.mjs
import { readFileSync } from "node:fs";
import { matchScorer, composeGrade } from "./namematch.mjs";
const aliases = JSON.parse(readFileSync(new URL("aliases.json", import.meta.url)));

// บริบทสเปน: ยิงจริง Yamal+Oyarzabal · สควอด/ลงสนาม: Yamal/Oyarzabal/Pedri/Rodri ตัวจริง, Ferran ลงสำรอง · Morata ไม่อยู่ในชุด
const ACT    = ["Lamine Yamal","Mikel Oyarzabal"];                                  // คนยิงจริง
const PLAYED = ["Lamine Yamal","Mikel Oyarzabal","Pedri","Rodri","Ferran Torres"];  // คนที่ลงสนาม (Ferran ลงสำรอง · Morata ไม่อยู่เลย)

// [ชื่อเทส, scorer1, scorer2, expectOk, expectCredit, expectUnsure1, dsJudged1?]
const CASES = [
  ["คนแรกว่าง + คนสองยิง (ไทย)",          "", "ยามาล",                 true,  2, false],  // ★ บั๊กที่แก้
  ["คนแรกว่าง + คนสองยิง (อังกฤษ)",        "", "Yamal",                 true,  2, false],
  ["สองคนยิงทั้งคู่ → ให้คน1 ไม่ดับเบิล",   "Lamine Yamal","Mikel Oyarzabal", true, 1, false],
  ["คน1 ยิง (ไทยในดิก)",                  "โอยาซาบัล","ตอร์เรส",       true,  1, false],
  ["คน1 ลงเล่นไม่ยิง → บล็อกคน2",          "ตอร์เรส","ยามาล",           false, 0, false],  // Ferran ลงสำรอง ไม่ยิง (canon=Ferran∈played)
  ["คน1 ไม่อยู่ในชุด(อังกฤษ) → คน2 ยิง",    "Morata","Yamal",            true,  2, false],  // canon=null+readable → ไม่ได้ลง → สำรองนับ · ไม่ amber
  ["คน1 อ่านไม่ออก(มั่ว) → กันเปิดคน2",     "งืดมั่วซั่ว","ยามาล",        false, 0, true],   // canon=null+อ่านไม่ออก → ถือว่าลง (safe FN) + amber
  ["ไม่มีใครยิง",                         "ตอร์เรส","Pedri",           false, 0, false],
  ["คน1 ยิงคนเดียว (ไม่มีสำรอง)",          "โอยาซาบัล","",              true,  1, false],
  ["คน1 ไทยนอกดิก resolve ไม่ได้ → amber + บล็อกสำรอง", "ปรเมศไทยมั่ว","ยามาล", false, 0, true],
  ["คน1 ไทยนอกดิก + DeepSeek ฟันแล้ว → amber หาย (option ก)", "ปรเมศไทยมั่ว","ยามาล", false, 0, false, true],  // ★ dsJudged1 → เคลียร์ amber อัตโนมัติ
];

let pass=0, fail=[];
for (const [name, s1raw, s2raw, eOk, eCredit, eUnsure1, dsJudged1] of CASES) {
  const s1 = !!matchScorer(s1raw, ACT, aliases);                     // ยิงไหม = เทียบคนยิงจริง (candidate น้อย = แม่น)
  const s2 = !!matchScorer(s2raw, ACT, aliases);
  const g = composeGrade({ s1, s2, scorer1:s1raw, scorer2:s2raw, played:PLAYED, resolved:true, aliasMap:aliases, dsJudged1 });   // resolved:true = จำลองตอนจบ (เทส amber) · dsJudged1 = DeepSeek ฟันแล้ว
  const ok = g.ok===eOk && g.credit===eCredit && g.s1unsure===eUnsure1;
  if (ok) pass++; else fail.push({name, got:`ok=${g.ok} credit=${g.credit} unsure1=${g.s1unsure}`, exp:`ok=${eOk} credit=${eCredit} unsure1=${eUnsure1}`});
}
console.log(`\nผ่าน ${pass}/${CASES.length}`);
fail.forEach(f=>console.log(`❌ ${f.name}: → ${f.got} (ควร ${f.exp})`));
console.log(fail.length===0 ? "✅ กฎตัวสำรอง + attribution + amber ถูกหมด" : "🔴 มีพลาด");
process.exit(fail.length?1:0);
