# 🛠️ วิธีติดตั้งวงทายบอลโลก 2026 (v2 — Google login)

แอปไฟล์เดียว (`index.html`) + Firebase (ฟรี) — ทำครั้งเดียวจบ

---

## ขั้นที่ 1 — สร้างโปรเจกต์ Firebase
1. https://console.firebase.google.com → **Add project** → ตั้งชื่อ (เช่น `wc2026-pool`) → สร้าง
2. **Build → Firestore Database → Create database** → **Production mode** → location `asia-southeast1`

## ขั้นที่ 2 — เปิด Google Login
1. **Build → Authentication → Get started**
2. แท็บ **Sign-in method** → เลือก **Google** → Enable → Save
3. แท็บ **Settings → Authorized domains** → กด **Add domain** ใส่โดเมนที่จะ deploy
   - ถ้าใช้ Netlify: เช่น `ชื่อแอปคุณ.netlify.app`  · ถ้าทดสอบในเครื่อง: `localhost` (มีให้อยู่แล้ว)

## ขั้นที่ 3 — เอา config + อีเมลแอดมินใส่
1. เฟือง ⚙️ → **Project settings → Your apps → `</>`** (Web) → Register → คัดลอก `firebaseConfig`
2. วางทับใน **`index.html`** ตรง `firebaseConfig` (บรรทัด "ใส่ของคุณ")
3. เช็ก `const ADMIN_EMAILS = ["ton.itthiphon@gmail.com"];` ให้เป็นอีเมล Google ของแอดมิน

## ขั้นที่ 4 — วางกฎความปลอดภัย (ตัวกันโกง — เซิร์ฟเวอร์บังคับ)
Firestore → **Rules** → วางทับ → **Publish**
> แก้อีเมลในบรรทัด `isAdmin()` ให้ตรงกับ `ADMIN_EMAILS`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
        && request.auth.token.email in ['ton.itthiphon@gmail.com'];
    }

    // ผู้เล่น: อ่านได้หมด (คิดแต้ม) — แก้ได้เฉพาะโปรไฟล์ตัวเอง (doc id = uid)
    match /players/{uid} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    // คู่แข่งขัน + ตั้งค่า: อ่านได้หมด — เขียน/กรอกผลได้เฉพาะแอดมิน
    match /matches/{id} { allow read: if true; allow write: if isAdmin(); }
    match /config/{id}  { allow read: if true; allow write: if isAdmin(); }

    // โพย: อ่านได้หมด (โปร่งใส) — แก้ได้เฉพาะ "ของตัวเอง" และ "ก่อนเวลาเตะ"
    match /predictions/{pid} {
      allow read: if true;
      allow create, update:
        if request.auth != null
        && request.auth.uid == request.resource.data.uid
        && request.time.toMillis()
           < get(/databases/$(database)/documents/matches/$(request.resource.data.matchId)).data.kickoff;
      allow delete: if false;
    }
  }
}
```

## ขั้นที่ 5 — เอาขึ้นเว็บ (เลือก 1)
- **ง่ายสุด — Netlify Drop:** https://app.netlify.com/drop ลากโฟลเดอร์ `wc2026_pool` วาง → ได้ลิงก์
  - ⚠️ อย่าลืมเอาโดเมน `.netlify.app` ไปใส่ใน Authorized domains (ขั้น 2)
- **ทดสอบในเครื่อง:** `python3 -m http.server` → เปิด `http://localhost:8000`
  > เปิดไฟล์ตรงๆ (file://) ไม่ได้ — ต้องผ่าน http(s)

---

## 🎮 วิธีเล่น
1. **แอดมิน** เข้าด้วย Google → แท็บ **🛠️ แอดมิน** → กด **📥 นำเข้าโปรแกรมนัด3** (หรือเพิ่มคู่เอง) → **ตรวจ/แก้เวลาเตะให้ตรง**
2. **เพื่อน** เปิดลิงก์ → เข้า Google → ตั้งชื่อเล่น → แท็บ **🎯 ทายผล** กรอกสกอร์+คนยิง → บันทึก
3. ถึงเวลาเตะ → **ล็อกอัตโนมัติ (เซิร์ฟเวอร์บังคับ)** โพยทุกคนเปิดดู/แคปลงกลุ่มได้
4. จบเกม → แอดมินกรอกผล+คนยิง (+ "ตัวไม่ได้ลง" ถ้าจะให้คนยิงชื่อ2 มีผล) → คิดแต้มอัตโนมัติ
5. ตอนจบทัวร์ → แอดมินตั้งทีมแชมป์ → +10

## ✅ กันโกง & โปร่งใส (v2 — แกร่งเต็ม)
| กลไก | กันอะไร | ระดับ |
|---|---|---|
| ล็อกเวลาฝั่งเซิร์ฟเวอร์ | แก้โพยหลังบอลเตะ | 🔒 แน่น |
| uid ผูกกับโพย (Rules) | แก้โพย/สวมรอยคนอื่น | 🔒 แน่น (Google ยืนยัน) |
| เขียนผล = แอดมินเท่านั้น | คนอื่นแก้สกอร์/แชมป์ | 🔒 แน่น |
| โพยอ่านได้หมด + ลบไม่ได้ | อ้างทีหลังว่าทายอีกอย่าง | 🔒 แน่น |
| ก่อนปิดรับซ่อนโพยคนอื่น | ลอกโพยเพื่อน | 🔒 แน่น |

**กติกาคนยิง (เป๊ะตามวง):** ชื่อ1 ยิง = +1 · ถ้าชื่อ1 **ไม่ได้ลงสนาม** (แอดมินกรอกในช่อง "ตัวไม่ได้ลง") และชื่อ2 ยิง = +1 · ทายเสมอ 0-0 = ไม่นับคนยิง
