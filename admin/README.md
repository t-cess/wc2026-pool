# 🛠️ admin — เครื่องมือแอดมิน (ไม่เอาขึ้นเว็บ!)

โฟลเดอร์นี้อยู่**นอก** `wc2026_pool/` ตั้งใจ — เพื่อไม่ให้ `serviceAccount.json` (กุญแจลับ)
หลุดขึ้นเว็บตอนลาก `wc2026_pool` ไป Netlify

## เตรียมครั้งเดียว
1. **โหลดกุญแจ:** Firebase Console → ⚙️ Project settings → แท็บ **Service accounts**
   → **Generate new private key** → ได้ไฟล์ .json
2. เปลี่ยนชื่อเป็น **`serviceAccount.json`** วางไว้ในโฟลเดอร์ `admin/` นี้
   > ⚠️ ห้าม commit / ห้ามแชร์ — มันคือสิทธิ์แอดมินเต็มของ Firebase (อยู่ใน .gitignore แล้ว)
3. ติดตั้ง: `cd admin && npm install`

## ใช้งาน
- ดูคู่ทั้งหมด + id (เอาไว้กรอกผล): `node admin.mjs list`
- ลงข้อมูลที่กำหนดใน `admin.mjs` (CARRY / ADD_MATCHES / RESULTS / CHAMPION): `node admin.mjs`

Claude จะแก้บล็อกข้อมูลใน `admin.mjs` แล้วรันให้แต่ละวัน
