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

// "อ่านชื่อออก" ไหม — อังกฤษ (อ่านเองได้จากนามสกุล) หรือ ไทยที่มีในดิก
// ใช้ตัดสิน s1played: ถ้าอ่านไม่ออก + ไม่เจอใน lineup → อย่าสรุปว่า "ไม่ได้ลง" (กันเปิดคนสองมั่วทั้งที่คนแรกลง)
export function readable(input, aliasMap) {
  const ni = norm(input);
  if (!ni) return false;
  if (isAscii(ni)) return true;                          // อังกฤษ = อ่านออกเอง
  for (const [canon, arr] of Object.entries(aliasMap)) { // ไทย = ต้องโผล่เป็น alias ไทยในดิก
    if (canon[0] === "_") continue;
    for (const a of arr) { const na = norm(a); if (!isAscii(na) && na.length >= 3 && ni.includes(na)) return true; }
  }
  return false;
}

// ประกอบผลโพยเดียว จาก s1/s2 (คนยิงไหม — ตัวเรียกหามาแล้ว เทียบ "คนยิงจริง" + DeepSeek) + lineup → กฎตัวสำรอง
// แหล่งความจริงเดียว (grader + เทสใช้ร่วม) · credit = ชื่อที่ได้แต้ม (0/1/2) · resolved = ตรวจเสร็จ (ตอนจบ) → gate amber กันโผล่ตอนสด/ก่อนมีโกล
// s1played: ใช้ดิกเทียบ lineup + อนุรักษ์ "อ่านไม่ออก→ถือว่าลง" (ไม่ free สำรองจากชื่อเดาไม่ออก = safe FN · เลี่ยง FP ที่วงซ่อมไม่ได้)
export function composeGrade({ s1, s2, scorer1, scorer2, played, resolved, aliasMap }) {
  const lineupKnown = played && played.length > 0;
  const inPlayed = lineupKnown && !!matchScorer(scorer1, played, aliasMap);
  const s1played = !scorer1 ? false : !lineupKnown ? true : (inPlayed || !readable(scorer1, aliasMap));
  const ok = s1 || (!s1played && s2);
  const credit = ok ? (s1 ? 1 : 2) : 0;
  // amber = (resolved=ตอนจบ) + ยังไม่ตรงคนยิง + อ่านชื่อไม่ออก → ต้องเช็กมือ · gate resolved = ไม่ขึ้น amber ตอนสด/ก่อนมีโกล (ปิดบั๊คเดิม)
  const s1unsure = !!scorer1 && !!resolved && !s1 && !readable(scorer1, aliasMap);
  const s2unsure = !!scorer2 && !!resolved && !s2 && !readable(scorer2, aliasMap);
  return { s1played, ok, credit, s1unsure, s2unsure };
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
