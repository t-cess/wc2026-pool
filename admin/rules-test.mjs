// 🔐 เทส firestore.rules ที่ publish แล้ว แบบ programmatic (ยิง Firestore REST จริงด้วย token ปลอม)
//   มินต์ custom token (ใส่ claim email) → sign-in REST → ยิง write จริง → ดู allow(200)/deny(403)
//   ทุก test doc อยู่ใต้ _rt* แยกจากข้อมูลจริง · เก็บกวาดอัตโนมัติตอนจบ
// รัน: cd admin && node rules-test.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PROJECT = "wc2026-fc378";
const API_KEY = "AIzaSyAedCt1NUxlRb0FUv9IBYo6W-9emARcyWo";   // web apiKey (public) จาก config.js
const sa = JSON.parse(readFileSync(new URL("./serviceAccount.json", import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const auth = getAuth();

const REST = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SUPER_EMAIL = "ton.itthiphon@gmail.com";

// มินต์ token + แลก idToken (custom claim email → request.auth.token.email ใน rules)
async function signIn(uid, email) {
  const ct = await auth.createCustomToken(uid, email ? { email } : {});
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method:"POST", headers:{ "content-type":"application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true }),
  });
  const d = await r.json();
  if (!d.idToken) throw new Error("sign-in ล้มเหลว: " + JSON.stringify(d));
  return d.idToken;
}

// แปลง JS → Firestore REST typed fields
const toFields = obj => { const f={}; for (const [k,v] of Object.entries(obj)) {
  f[k] = typeof v==="number" ? { integerValue: String(v) } : { stringValue: String(v) }; } return { fields: f }; };

// ยิง write (PATCH = upsert) ด้วย idToken → คืน HTTP status
async function tryWrite(idToken, path, obj) {
  const r = await fetch(`${REST}/${path}`, {
    method:"PATCH", headers:{ "authorization":"Bearer "+idToken, "content-type":"application/json" },
    body: JSON.stringify(toFields(obj)),
  });
  return r.status;   // 200 = allow · 403 = deny
}

// ยิง read (GET) — idToken=null = ไม่ login (เทส PII คนนอกอ่านอีเมล)
async function tryRead(idToken, path) {
  const r = await fetch(`${REST}/${path}`, idToken ? { headers:{ "authorization":"Bearer "+idToken } } : {});
  return r.status;
}

async function main() {
  const now = Date.now();
  // ---- setup: test data ใต้ _rt* ----
  await db.doc("matches/_rt_future").set({ home:"RTH", away:"RTA", kickoff: now + 86400000, homeScore:0, awayScore:0, status:"upcoming" });
  await db.doc("matches/_rt_past").set({   home:"RTH", away:"RTA", kickoff: now - 3600000,  homeScore:0, awayScore:0, status:"upcoming" });
  await db.doc("pools/_rt/config/admins").set({ emails: ["pooladmin@test.com"] });
  await db.doc("config/_rt_pii").set({ secret: "email@x.com" });   // เทส PII: คนนอกอ่านไม่ได้

  // ---- tokens ----
  const sup = await signIn("u_rt_super",   SUPER_EMAIL);
  const pad = await signIn("u_rt_padmin",  "pooladmin@test.com");
  const str = await signIn("u_rt_stranger","stranger@test.com");
  const own = await signIn("u_rt_owner",   "owner@test.com");

  // ---- cases ----
  const cases = [
    ["super เขียน matches (วง1 ไม่พัง)",        () => tryWrite(sup, "matches/_rt_x", { homeScore:1 }),                                   "allow"],
    ["คนแปลกหน้า เขียน matches (gate คู่)",       () => tryWrite(str, "matches/_rt_x", { homeScore:9 }),                                   "deny"],
    ["super เขียน config/carry (regression)",    () => tryWrite(sup, "config/_rt_carry", { x:1 }),                                        "allow"],
    ["คนแปลกหน้า เขียน config/admins (ยกระดับ)",  () => tryWrite(str, "config/admins", { x:1 }),                                           "deny"],
    ["แอดมินวง เขียน pools/_rt/predictions",      () => tryWrite(pad, "pools/_rt/predictions/p1", { player:"x", homeScore:1, awayScore:0 }),"allow"],
    ["คนแปลกหน้า เขียน pools/_rt/predictions",    () => tryWrite(str, "pools/_rt/predictions/p2", { player:"x" }),                          "deny"],
    ["แอดมินวง เขียน pools/_rt/config/admins",    () => tryWrite(pad, "pools/_rt/config/admins", { emails_x:"hack" }),                      "deny"],
    ["เจ้าของทายปกติ (id ถูก matchId__uid)",      () => tryWrite(own, "predictions/_rt_future__u_rt_owner", { uid:"u_rt_owner", matchId:"_rt_future", player:"owner", homeScore:1, awayScore:0, scorer1:"x", scorer2:"" }), "allow"],
    ["เจ้าของทายหลังเตะแล้ว (_rt_past)",          () => tryWrite(own, "predictions/_rt_past__u_rt_owner", { uid:"u_rt_owner", matchId:"_rt_past",   homeScore:1, awayScore:0 }), "deny"],
    ["คนแปลกหน้าแอบเขียนโพยคนอื่น",               () => tryWrite(str, "predictions/_rt_future__u_rt_owner", { uid:"u_rt_owner", matchId:"_rt_future", homeScore:1, awayScore:0 }), "deny"],
    ["เจ้าของแอบใส่ scorerOk เอง (ปั๊มแต้ม)",      () => tryWrite(own, "predictions/_rt_future__u_rt_owner", { uid:"u_rt_owner", matchId:"_rt_future", homeScore:1, awayScore:0, scorerOk:true }), "deny"],
    ["เจ้าของแอบใส่ scorerManual (กัน grader ทับ)", () => tryWrite(own, "predictions/_rt_future__u_rt_owner", { uid:"u_rt_owner", matchId:"_rt_future", homeScore:1, awayScore:0, scorerManual:true }), "deny"],
    ["🔴 เจ้าของสร้างโพยใบที่ 2 id มั่ว (โกงปั๊มแต้ม)", () => tryWrite(own, "predictions/_rt_evil_extra", { uid:"u_rt_owner", matchId:"_rt_future", player:"owner", homeScore:2, awayScore:1, scorer1:"y", scorer2:"" }), "deny"],
    ["🔴 เจ้าของยัดโพย id เป็นของคนอื่น",          () => tryWrite(own, "predictions/_rt_future__someone_else", { uid:"u_rt_owner", matchId:"_rt_future", player:"owner", homeScore:0, awayScore:0 }), "deny"],
    ["🔒 คนนอก(ไม่ login) อ่าน config (PII อีเมล)", () => tryRead(null, "config/_rt_pii"), "deny"],
    ["🔒 คนนอก(ไม่ login) อ่าน players (PII)",      () => tryRead(null, "players"),         "deny"],
    ["สมาชิก(login) อ่าน config ได้ (regression)", () => tryRead(str,  "config/_rt_pii"), "allow"],
  ];

  let pass=0, fail=0;
  console.log("\n🔐 เทส firestore.rules (publish จริง)\n");
  for (const [name, fn, expect] of cases) {
    let status, got;
    try { status = await fn(); got = status===200 ? "allow" : (status===403 ? "deny" : `?${status}`); }
    catch(e){ got = "ERR:"+e.message; }
    const ok = got===expect;
    if (ok) pass++; else fail++;
    console.log(`${ok?"✅":"❌"} ${expect.toUpperCase().padEnd(5)} ได้ ${got.padEnd(6)} · ${name}`);
  }
  console.log(`\nสรุป: ${pass} ผ่าน / ${fail} พลาด`);

  // ---- cleanup ----
  const dels = ["matches/_rt_future","matches/_rt_past","matches/_rt_x","config/_rt_carry","config/_rt_pii",
    "predictions/_rt_future__u_rt_owner","predictions/_rt_past__u_rt_owner","predictions/_rt_evil_extra","predictions/_rt_future__someone_else",
    "pools/_rt/predictions/p1","pools/_rt/predictions/p2","pools/_rt/config/admins"];
  for (const p of dels) { try { await db.doc(p).delete(); } catch(e){} }
  console.log("🧹 เก็บกวาด test data แล้ว (" + dels.length + " docs)");
  return fail;
}
main().then(f=>process.exit(f?1:0)).catch(e=>{ console.error("❌", e); process.exit(2); });
