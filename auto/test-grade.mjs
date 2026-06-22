// เทสการประกอบกฎตัวสำรอง (composeGrade) — ครอบ edge ที่ matchScorer เทสไม่ถึง · รัน: node test-grade.mjs
import { readFileSync } from "node:fs";
import { matchScorer, composeGrade } from "./namematch.mjs";
const aliases = JSON.parse(readFileSync(new URL("aliases.json", import.meta.url)));

// บริบทสเปน: ยิงจริง Yamal+Oyarzabal · lineup: Yamal/Oyarzabal/Pedri ตัวจริง, Ferran ลงสำรอง · Morata ไม่อยู่ในชุด
const ACT = ["Lamine Yamal","Mikel Oyarzabal"];
const LU  = ["Lamine Yamal","Mikel Oyarzabal","Pedri","Rodri","Ferran Torres"];

// [ชื่อเทส, scorer1, scorer2, expectOk, expectCredit]
const CASES = [
  ["คนแรกว่าง + คนสองยิง (ไทย)",        "", "ยามาล",                 true,  2],  // ★ บั๊กที่แก้
  ["คนแรกว่าง + คนสองยิง (อังกฤษ)",      "", "Yamal",                 true,  2],
  ["สองคนยิงทั้งคู่ → ให้คน1 ไม่ดับเบิล", "Lamine Yamal","Mikel Oyarzabal", true, 1],
  ["คน1 ยิง (ไทยในดิก)",                "โอยาซาบัล","ตอร์เรส",        true,  1],
  ["คน1 ลงเล่นไม่ยิง → บล็อกคน2",        "ตอร์เรส","ยามาล",           false, 0],  // Ferran ลงสำรอง ไม่ยิง
  ["คน1 ไม่อยู่ในชุด(อังกฤษ) → คน2 ยิง",  "Morata","Yamal",            true,  2],  // case-3
  ["คน1 อ่านไม่ออก(มั่ว) → กันเปิดคน2",   "งืดมั่วซั่ว","ยามาล",        false, 0],  // safety net (safe FN)
  ["ไม่มีใครยิง",                       "ตอร์เรส","Pedri",           false, 0],
];

let pass=0, fail=[];
for (const [name, s1raw, s2raw, eOk, eCredit] of CASES) {
  const s1 = !!matchScorer(s1raw, ACT, aliases), s2 = !!matchScorer(s2raw, ACT, aliases);
  const g = composeGrade(s1, s2, s1raw, s2raw, LU, aliases);
  const ok = g.ok===eOk && g.credit===eCredit;
  if (ok) pass++; else fail.push({name, s1raw, s2raw, got:`ok=${g.ok} credit=${g.credit}`, exp:`ok=${eOk} credit=${eCredit}`});
}
console.log(`\nผ่าน ${pass}/${CASES.length}`);
fail.forEach(f=>console.log(`❌ ${f.name}: "${f.s1raw}"/"${f.s2raw}" → ${f.got} (ควร ${f.exp})`));
console.log(fail.length===0 ? "✅ กฎตัวสำรอง + attribution ถูกหมด" : "🔴 มีพลาด");
