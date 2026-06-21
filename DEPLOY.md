# 🚀 วิธี deploy — วงทายบอลโลก 2026

Firebase project: **`wc2026-fc378`** · hosting site: **`wc2026-kui-chin`** · live: https://wc2026-kui-chin.web.app
repo: github.com/t-cess/wc2026-pool (`main`)

กุญแจ `admin/serviceAccount.json` (gitignore) deploy **hosting ได้** แต่ **rules ไม่ได้ (403)** — rules ต้อง publish ใน Console เอง

---

## 1) Deploy แอป (hosting)

เสิร์ฟจากโฟลเดอร์ `wc2026_pool/` (ดู `firebase.json`)

```bash
cd /Users/ton/Public/WC2026_strategy
GOOGLE_APPLICATION_CREDENTIALS=admin/serviceAccount.json \
  npx --yes firebase-tools deploy --only hosting --project wc2026-fc378
```

เช็กว่าโค้ดใหม่ขึ้นจริง (hosting ตั้ง no-cache ไว้ ต่อ `?ts` กันแคชเบราว์เซอร์):

```bash
curl -s "https://wc2026-kui-chin.web.app/admin.js?$(date +%s)" | grep -o "isSuper" | head -1
curl -s -o /dev/null -w "%{http_code}\n" "https://wc2026-kui-chin.web.app/"   # ต้องได้ 200
```

---

## 2) Publish Firestore Rules (ทำใน Console — SA deploy ไม่ได้)

1. แก้ไฟล์ `firestore.rules`
2. **validate ก่อน publish** — รัน harness ยิง rules จริง (ดูข้อ 3)
3. [Firebase Console → Firestore → Rules](https://console.firebase.google.com/project/wc2026-fc378/firestore/rules) → วางทับทั้งหมดด้วยเนื้อหา `firestore.rules` → **Publish**

> เลี่ยง `firebase deploy --only firestore:rules` — service account ได้ **403** (ไม่มีสิทธิ์ `firebaserules.releases.create`)

---

## 3) เทส Rules (programmatic — ยิง rules ที่ publish จริง)

```bash
cd admin && node rules-test.mjs
```

มินต์ token ปลอม 4 ตัว (super / แอดมินวง / คนแปลกหน้า / เจ้าของโพย) ผ่าน Admin SDK → sign-in REST → ยิง Firestore REST จริง 10 เคส เทียบ allow/deny · test data อยู่ใต้ `_rt*` **ลบทิ้งเอง** · ต้องได้ `10 ผ่าน / 0 พลาด`

รันทุกครั้งหลังแก้ `firestore.rules` + หลัง publish

---

## 4) Git flow (เวลาแก้โค้ด)

```bash
git checkout -b <feature>        # อย่า commit ตรงบน main
# ...แก้...
node --check wc2026_pool/*.js     # เช็ก syntax
git add -A && git commit -m "..."
git push -u origin <feature>
git checkout main && git merge --ff-only <feature> && git push origin main
# แล้วค่อย deploy hosting (ข้อ 1)
```

ทดสอบ UX ก่อน deploy: เสิร์ฟ local + เปิด mock (ไม่ต่อ DB ไม่ต้อง login)

```bash
cd wc2026_pool && python3 -m http.server 8765
# http://localhost:8765/?mock=1            ← ต้น (super)
# http://localhost:8765/?mock=1&as=admin   ← แอดมินวงธรรมดา (เทส gate)
```

---

## 5) auto-grade (ตรวจผล) — cloud

รันเองบน GitHub Actions (`.github/workflows/auto-grade.yml`) ขับด้วย cron-job.org ทุก 1 นาที — **ไม่ต้อง deploy มือ** แก้โค้ด `auto/auto-grade.mjs` แล้ว push main พอ

เทส local ก่อน push (ไม่เขียน DB):

```bash
cd auto && node auto-grade.mjs --dry-run --force          # ดูสด/จบรอบนี้
cd auto && node auto-grade.mjs --dry-run --force --regrade # ตรวจซ้ำคู่ที่จบแล้ว
```

secrets ใน repo: `FIREBASE_SERVICE_ACCOUNT`, `QWEN_TOKEN`, `PINGER_PAT`

---

## ลำดับ release มาตรฐาน
1. แก้โค้ด → `node --check` + เทส mock → commit/merge main (ข้อ 4)
2. ถ้าแตะ `firestore.rules`: validate harness (ข้อ 3) → publish Console (ข้อ 2) → validate harness ซ้ำ
3. `deploy hosting` (ข้อ 1) → verify curl
