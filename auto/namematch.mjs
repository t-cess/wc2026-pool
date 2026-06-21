// 🔤 อ่านชื่อคนยิง: "ข้อความที่เพื่อนพิมพ์" = คนยิงจริงคนไหนในแมตช์นี้ (ถ้ามี)
// กรอบ (ตาม advisor): ตรวจ alias ของ "คนยิงจริงแต่ละคน" ว่าโผล่ใน input ไหม — ไม่ใช่ match มั่วกับดิกทั้งก้อน
// → bound false positive (เทียบเฉพาะคนที่ยิงจริง) + จับมุก/ประโยคยาวได้เองโดยไม่ต้องเติมทั้งประโยคลงดิก
// deterministic ล้วน (ไม่เรียก Qwen) → เทสได้เร็ว/ซ้ำได้ · ชื่อใหม่ที่ดิกไม่มี → คืน null ให้ Qwen รับช่วง

export const norm = s => (s||"").toString().trim().toLowerCase().replace(/\s+/g," ");
const isAscii = s => /^[\x00-\x7f]+$/.test(s);

// alias ของคน 1 คน = ชื่อเต็ม + นามสกุล(token ท้าย เป็นหลักฐานแรง) + ดิก
// ตั้งใจ "ไม่" ใส่ชื่อต้น/กลาง — ชื่อต้นชนกันได้ (2 คนชื่อ Bruno) → เครดิตผิดเงียบๆ (FP มองไม่เห็น)
//   ชื่อต้นที่คนชอบเรียก (สายบราซิล Vinicius/Rodrygo) ให้เก็บในดิกเอาเอง = ตั้งใจเลือก (FN ดิกซ่อมได้ · FP ซ่อมไม่ได้)
function aliasesFor(canon, aliasMap) {
  const out = new Set();
  const n = norm(canon);
  out.add(n);                                            // ชื่อเต็ม
  const toks = n.split(" "), last = toks[toks.length-1];
  if (last.length >= 3) out.add(last);                   // นามสกุล (token ท้าย)
  for (const a of (aliasMap[canon] || [])) out.add(norm(a));   // ดิก: ฉายา/ชื่อต้นที่คนเรียก/สะกดเพี้ยน
  return [...out];
}

// alias a โผล่ใน input ni ไหม — ASCII ใช้ขอบคำ (กัน "ito" ใน "benito"), ไทยใช้ substring (ไทยไม่มีเว้นวรรค)
function aliasHit(ni, a) {
  if (!a || a.length < 3) return false;
  if (isAscii(a)) return new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}([^a-z0-9]|$)`).test(ni);
  return ni.includes(a);
}

// คืน canonical ของคนยิงจริงที่ input หมายถึง · null = ไม่ตรงใคร (ส่ง Qwen)
export function matchScorer(input, actualScorers, aliasMap) {
  const ni = norm(input);
  if (!ni) return null;
  for (const canon of actualScorers) {
    for (const a of aliasesFor(canon, aliasMap)) if (aliasHit(ni, a)) return canon;
  }
  return null;
}
