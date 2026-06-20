// เพิ่มโดเมนเข้า Authorized domains ของ Firebase Auth (ผ่าน Identity Toolkit Admin API)
// รัน: node add-authdomain.mjs wc2026-kui-chin.web.app
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";

const sa = JSON.parse(readFileSync(new URL("./serviceAccount.json", import.meta.url)));
const app = initializeApp({ credential: cert(sa) });
const project = sa.project_id;
const domain = process.argv[2];
if (!domain) { console.error("ใส่โดเมน: node add-authdomain.mjs <domain>"); process.exit(1); }

const { access_token } = await app.options.credential.getAccessToken();
const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const auth = { Authorization: `Bearer ${access_token}` };

const cur = await (await fetch(base, { headers: auth })).json();
if (cur.error) { console.error("GET ล้มเหลว:", cur.error.message); process.exit(1); }
const domains = new Set(cur.authorizedDomains || []);
if (domains.has(domain)) { console.log("มีอยู่แล้ว:", domain); process.exit(0); }
domains.add(domain);

const res = await fetch(`${base}?updateMask=authorizedDomains`, {
  method: "PATCH", headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ authorizedDomains: [...domains] }),
});
const out = await res.json();
if (out.error) { console.error("PATCH ล้มเหลว:", out.error.message); process.exit(1); }
console.log("✓ เพิ่มแล้ว — authorized domains ตอนนี้:", out.authorizedDomains.join(", "));
process.exit(0);
