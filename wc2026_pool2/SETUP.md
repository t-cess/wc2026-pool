# 🛠️ วง 2 — ติดตั้ง

ใช้ Firebase project เดิม (`wc2026-fc378`) แต่ข้อมูลแยกอยู่ใต้ `pools/vong2/...`
ไม่กระทบวงเดิมเลย

## ขั้นเดียวที่ต้องทำ — เพิ่ม Rules สำหรับ `pools/`
Firestore → **Rules** → วางทับทั้งหมดด้วยอันนี้ (รวมของวงเดิม + วงใหม่) → **Publish**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
        && request.auth.token.email in ['ton.itthiphon@gmail.com'];
    }

    // ===== วงเดิม (top-level) =====
    match /players/{uid} { allow read: if true; allow write: if request.auth != null && request.auth.uid == uid; }
    match /matches/{id} { allow read: if true; allow write: if isAdmin(); }
    match /config/{id}  { allow read: if true; allow write: if isAdmin(); }
    match /predictions/{pid} {
      allow read: if true;
      allow create, update: if request.auth != null
        && request.auth.uid == request.resource.data.uid
        && request.time.toMillis()
           < get(/databases/$(database)/documents/matches/$(request.resource.data.matchId)).data.kickoff - 600000;
      allow delete: if false;
    }

    // ===== วงใหม่ (แยกตามรหัสวง) =====
    match /pools/{pool}/players/{uid} {
      allow read: if true;
      allow write: if (request.auth != null && request.auth.uid == uid) || isAdmin();
    }
    match /pools/{pool}/matches/{id} { allow read: if true; allow write: if isAdmin(); }
    match /pools/{pool}/config/{id}  { allow read: if true; allow write: if isAdmin(); }
    match /pools/{pool}/predictions/{pid} {
      allow read: if true;
      allow create, update: if isAdmin() ||
        (request.auth != null
         && request.auth.uid == request.resource.data.uid
         && request.time.toMillis()
            < get(/databases/$(database)/documents/pools/$(pool)/matches/$(request.resource.data.matchId)).data.kickoff - 600000);
      allow delete: if false;
    }
  }
}
```

## วิธีเริ่มใช้ (แอดมินทำเองครบ ไม่ต้องพึ่งสคริปต์/AI)
1. ล็อกอินด้วยอีเมลแอดมิน → แท็บ **แอดมิน**
2. **รายชื่อวง + คะแนนยกมา:** ใส่ชื่อสมาชิก + คะแนนยกมาทีละคน → บันทึก
3. **เพิ่มคู่:** ทีม + เวลาเตะ
4. เพื่อนเข้า Google → เลือกชื่อตัวเอง → ทาย
5. **ตรวจผล:** เลือกคู่ → ใส่สกอร์จริง → บันทึกผล → **ติ๊ก "ให้คนยิง" ทีละคน** (ดูชื่อที่เขาทายเอง เพราะพิมพ์ต่างกันได้)
6. ตั้งแชมป์ / ป้ายชุด / ล็อกทายแชมป์ / จัดการสมาชิก ได้ในแท็บแอดมิน

## การให้แต้ม
- ชนะ +1 · เสมอ +2 · สกอร์เป๊ะ +3 (คิดออโต้) · **คนยิง +1 (แอดมินติ๊กเอง)** · แชมป์ +10
- ทาย 0-0 = ทายว่าไม่มีใครยิง → ถ้าจบ 0-0 ได้ +1 อัตโนมัติ
- ตารางคะแนนคิดออโต้ = ยกมา + แต้มรายคู่ + แชมป์
