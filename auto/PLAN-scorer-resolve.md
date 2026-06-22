# Implementation Plan — Resolve คนยิงด้วยสควอด + DeepSeek (canon-based grading)

สถานะ: **ร่าง รอ user อนุมัติ** · ยังไม่แตะ grader จริง · grader นี้รันทุกนาทีกลางทัวร์ → เทสหนักก่อน deploy

## เป้าหมาย
แมพ "ชื่อคนยิงที่เพื่อนพิมพ์" → ผู้เล่นจริงในสควอด ESPN (canonical displayName) ครั้งเดียวตอนเตะ แล้ว cache →
ตรวจ "ยิงไหม / ลงสนามไหม" เป็น **exact string compare** (ไม่เดา) · แก้บั๊ค amber-ก่อนมีโกลเป็นผลพลอยได้

## ข้อเท็จจริงที่ตรวจแล้ว (กันสร้างบนสมมุติ)
1. **DeepSeek ใช้อยู่จริง** — `askQwen()` ยิง `api.deepseek.com` / `deepseek-chat` (env `QWEN_*`, secret=DeepSeek key). local เรียกไม่ได้ (key เป็น GH secret) → **dry-run DeepSeek ได้แค่บน cloud**
2. **ESPN rosters**: pre-match = ว่าง · live = สควอดเต็ม 26/ทีม (starter=11, subbedIn เติมระหว่างเกม) → resolve ที่ "รอบ live แรก" ไม่ใช่ lock T-10
3. **ชื่อคนยิง == roster displayName เป๊ะ** (8/8 ทดสอบ) → `canon ∈ actualScorers` / `canon ∈ lineup` เป็น exact compare ได้

## Data model — field ใหม่บน prediction doc
- `scorer1Canon` : string | null — displayName ESPN ที่ resolve ได้ (null = DeepSeek ตอบว่าไม่ตรงใครในสควอด)
- `scorer2Canon` : string | null
- `canonResolved`: bool — true เมื่อ resolve เสร็จ (ดิกจับได้ หรือ DeepSeek ตอบสำเร็จ) → กันเรียก LLM ซ้ำ
- (คงเดิม) `scorerOk, s1hit, s2hit, s1played, s1unsure, s2unsure, scorerManual`

predictions lock ที่ T-10 (ก่อน resolve ที่ live) → ชื่อ freeze แล้ว ไม่ต้องกังวล name เปลี่ยนหลัง resolve

## เฟส A — Resolve (รอบ live แรกที่สควอดมา · ครั้งเดียว · hybrid)
ทริกใน live branch เมื่อ `squad.length>0` และยังมี pred ที่ `!canonResolved`:
1. รวม "ชื่อดิบ" (scorer1/scorer2) ของทุก pred **ข้ามทุกวง** ที่ยัง !canonResolved → unique set
2. **ดิกก่อน** (`matchScorer(name, squad, aliases)`): จับได้ → canon = ผลนั้น (ฟรี/เร็ว/เทสได้)
3. **DeepSeek เฉพาะที่ดิกไม่จับ** — 1 call/คู่ (รวมทุกวง): `askQwen(squad, unknownNames)` แมพชื่อ → เบอร์ในสควอด (0=ไม่ตรง→null)
   - ✅ ใช้ `askQwen` เดิมได้เลย แค่ส่ง `squad` แทน `actualScorers` เป็น candidate list
4. เขียน `scorer1Canon/scorer2Canon/canonResolved=true` ลงทุก pred (เฉพาะที่เปลี่ยน)
5. **null policy**: DeepSeek error/ล่ม → **ไม่** set canonResolved (retry รอบหน้า) · DeepSeek ตอบ "ไม่ตรง (0)" → canon=null + canonResolved=true (amber, รอแอดมิน)
6. กันพิษ learnedAliases เดิมไว้ (DeepSeek เคยเรียนผิด Trézéguet→มามูช) — safeguard `matchScorer(t,allCanon)` ขัดกัน → ไม่เรียน

## เฟส B — Grade (ทุกรอบ · ไม่เรียก LLM)
```
s1 = !!scorer1Canon && actualScorers.includes(scorer1Canon)   // exact
s2 = !!scorer2Canon && actualScorers.includes(scorer2Canon)
s1played:
  !scorer1            → false
  scorer1Canon (มี)   → played.includes(scorer1Canon)         // exact, definitive (สด→ฟันธงตอนจบ)
  canon=null          → true (อนุรักษ์: ถือว่าลง → ไม่ปล่อยแต้มสำรองมั่ว)  ← แทน readable() hack เดิม
ok = s1 || (!s1played && s2)        // กฎสำรองเดิม
s1unsure = !!scorer1 && canonResolved && !scorer1Canon        // resolve แล้วแต่ไม่ตรงสควอด = ต้องเช็กมือ
```
- 0-0 → ข้าม (แอปคิดเอง, เดิม) · `scorerManual` → ไม่ทับ (เดิม)
- amber ใหม่ = "ชื่อ resolve แล้วไม่ตรงสควอด" — **ไม่ผูกกับโกลอีกต่อไป → ปิดบั๊คเดิม** (ก่อน resolve = เทาเฉยๆ ไม่ amber)

## จุดแก้โค้ด (auto-grade.mjs + namematch.mjs)
1. `fetchLineup` → คืน `{squad:[...ทุกคนใน roster], played:[...starter‖subbedIn]}` (เดิมคืนแค่ played)
2. ใหม่ `resolveCanons(pools, matchId, squad)` — เฟส A (ดิก→DeepSeek→เขียน canon)
3. `gradeScorers` — ใช้ canon (เฟส B) แทน scorerHitOne(ชื่อดิบ)
4. `composeGrade` (namematch.mjs) — รับ canon + played; s1played/s1unsure ตามสูตรใหม่ (null fallback)
5. flow: live branch → fetchLineup → resolveCanons (ถ้ายังไม่ครบ) → gradeScorers · finish branch → เหมือนกัน (resolve+grade รอบจบ)
6. ลบ logic `readable()`-based s1played (ถูกแทนด้วย canon∈played) — เก็บ `readable` ไว้เผื่อ? → ลบถ้าไม่มีใครใช้

## เทส (deterministic แยกจาก LLM)
- **unit (รันได้ local, mock resolver)**: ขยาย `test-grade.mjs`/`test-namematch.mjs` ป้อน canon ตรงๆ:
  - คนแรกยิง → ✓ · คนแรกไม่ลง+คนสองยิง → ✓สำรอง · คนแรกลงแต่ไม่ยิง → ไม่ได้ · canon=null → amber+ถือว่าลง
  - เป้า: composeGrade ใหม่ผ่านทุกเคสเดิม + เคส canon ใหม่ · **0 false positive**
- **LLM format**: `test-llm.mjs` (มีแล้ว) — ยิง DeepSeek ด้วย squad เป็น candidate ดู parse ได้
- **integration (cloud เท่านั้น — local ไม่มี DeepSeek key)**: workflow_dispatch `--dry-run --force` กับคู่จริง → ดู log

## Rollout (gate ชัด ก่อนเขียน prod)
1. เขียนโค้ด + unit test เขียวครบ (local)
2. push branch → **cloud dry-run** (`--dry-run --force`) กับคู่ที่กำลังเตะ/เพิ่งจบ → **diff old-vs-new** ของ `scorerOk/s1hit/s1played/s1unsure` ทุก pred → ตรวจด้วยตาว่าไม่มี regression
3. ผ่าน gate → merge main (cron ใช้ทันที)
4. คู่ที่ **autoGraded ไปแล้ว ไม่แตะ** (ไม่มี canon ก็ไม่ re-grade) · คู่ที่ live ตอน deploy → resolve รอบถัดไป

## ความเสี่ยง / เปิดประเด็น
- **ทำลาย invariant "ไม่เรียก LLM ตอน live"** — ยอมรับ: +1 DeepSeek call/คู่ ตอน live แรก (cache แล้วไม่ซ้ำ, dedup ข้ามวง) · cost ยังต่ำ (~$ น้อย/เดือน)
- **dry-run DeepSeek ต้องบน cloud** (key เป็น GH secret) — หรือ user ให้ key มาเทส local ชั่วคราว → ต้องตัดสินใจ
- DeepSeek อ่านผิดได้ → null/unsure → amber/ติ๊กมือ เป็น safety net (คงไว้)
- squad มา "รอบ live แรก" ไม่ใช่ lock — โกลก่อน resolve เสร็จ = ได้แต้มช้า ≤1 รอบ ไม่ตกหล่น (re-grade สะสม)

---
## เฟส 0 — ผล + design ที่ปรับจาก validation (2026-06-23)
**สร้าง+เทสแล้ว (ยังไม่ merge):** `composeGrade` canon-based, `fetchLineup→{squad,played}`, `resolveAndGrade`, wiring · test-grade 10/10 · test-namematch 47/47

**ปรับจากแผนเดิม 3 จุด (validation จับได้):**
1. **แยก candidate set** (เดิมรวมเป็น canon เดียว): "ยิงไหม" เทียบ **คนยิงจริง** (2-4 คน) · "ลงสนามไหม"+amber เทียบ **สควอด** — เพราะ dry-run จริงเจอ DeepSeek เดาผิดตอนเทียบสควอด 26 คน (เมซซี่→Lautaro). probe ยืนยัน: เทียบคนยิง set เล็ก → เมซซี่→Messi ถูก
2. **DeepSeek เฉพาะตอนจบ** (`useLLM`): สด=ดิกล้วน (เคารพ invariant "ไม่เรียก LLM ตอน live" — cron เร็ว/pinger) · ทิ้งไอเดีย resolve-at-kickoff (lineup ตอน T-10 ก็ไม่มีอยู่ดี)
3. **ไม่ cache canon** (ทิ้ง field `scorer1Canon/canonResolved`): squad stable แต่ scored เปลี่ยนตามโกล → คำนวณสดทุกรอบ (ดิก instant, DeepSeek จบเท่านั้น)

**amber ใหม่** = resolved(จบ) + แมพสควอดไม่ได้ + อ่านไม่ออก → ปิดบั๊ค amber-ก่อนมีโกล (สด resolved=false → ไม่ amber)

**validation:** live dry-run (ไม่มี DeepSeek call, ไม่ misread, amber-bug หาย) · finish dry-run คู่ 21 มิ.ย. (อูเอดะ→Ueda ได้แต้มถูก · 0-0 ไม่ให้แต้ม · 0 FP · ชื่อแมพไม่ออก→amber safe)

**เหลือ:** commit→push main (gate ผ่าน) · monitor finish จริงคู่แรก

---
## ✅ ตัดสินใจสุดท้าย: Option A (2026-06-23) — implemented
advisor จับ blind spot: squad-resolution ทำให้ DeepSeek misread ตกที่ **s1played** → ปล่อยแต้มสำรองผิดเงียบ (FP ที่วงซ่อมไม่ได้). user เลือก A (ปลอดภัย)

**สิ่งที่ทำจริง = เปลี่ยนน้อยมาก (ทิ้ง squad-resolution ทั้งหมด):**
- revert `auto-grade.mjs` กลับ committed (gradeScorers เดิม: scored เทียบคนยิงจริง + DeepSeek-vs-scorers ตอนจบ = พิสูจน์แล้ว ไม่มี regression)
- `composeGrade`: logic เดิมเป๊ะ + เพิ่มเงื่อนไข `resolved &&` ที่ s1unsure/s2unsure เท่านั้น
- `gradeScorers` ส่ง `resolved:useQwen` → **amber โผล่เฉพาะตอนจบ** (สด useQwen=false → ไม่ amber)

**ผลลัพธ์เดียว:** ปิดบั๊ค amber-ก่อนมีโกล (amber ไม่โผล่ตอนสด) · grading/กฎสำรอง/credit = เหมือนเดิมทุกอย่าง · 0 regression · 0 FP ใหม่
**ทิ้ง:** field canon, squad-resolution, fetchLineup {squad,played} (กลับเป็น played array เดิม), resolveAndGrade — ไม่ได้ใช้

⚠️ **หลัง merge ห้ามรัน `--regrade` กับ prod พร่ำเพรื่อ** — re-grade คู่เก่าด้วย logic ใหม่ จะเลื่อนกระดานที่ผู้เล่นเห็นแล้วเงียบๆ
