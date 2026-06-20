# ⏰ ตั้ง auto-grade ให้รันเอง (cron)

เป้าหมาย: ทุก 5 นาที **เฉพาะช่วงมีบอลเตะ** ตรวจผล+คนยิงเข้าแอปอัตโนมัติ แล้วหยุดเองเมื่อบอลจบ

## หลักการ
- cron ตื่นทุก 5 นาที → เรียก `run.sh` → `auto-grade.mjs`
- สคริปต์มี **live-window gate**: ทำงานเฉพาะคู่ที่อยู่ในช่วง `เตะก่อน 5 นาที → จบ + 3 ชม.` และยังไม่ตรวจ
- นอกช่วงนั้น = ออกทันที (ไม่ยิง ESPN/Qwen เปล่า) → ตั้ง `*/5 * * * *` ทั้งวันได้ ไม่เปลือง
- คู่ที่ ESPN ว่า "จบ" + ตรวจแล้ว = ปัก `autoGraded` → ไม่แตะซ้ำ (บอลจบ ระบบรู้เอง)

## เตรียมเครื่องที่จะรัน (เครื่องเพื่อนที่เปิดค้าง)
ต้องมีในเครื่อง:
1. **node** (v18+)
2. **claude CLI** + `~/.claude-9arm.json` (gateway Qwen — ก๊อปไฟล์นี้มาวาง)
3. โฟลเดอร์ `auto/` ครบ: `auto-grade.mjs`, `aliases.json`, `run.sh`, **`serviceAccount.json`** (กุญแจ Firebase), และ **node_modules**
   - ติดตั้ง firebase-admin ในเครื่องนั้น:
     ```
     cd auto && npm init -y && npm i firebase-admin
     ```
     (บนเครื่อง dev เราใช้ symlink ไป admin/node_modules — เครื่องเพื่อนติดตั้งของตัวเอง)

## ตั้ง cron
```
chmod +x /ABSOLUTE/PATH/auto/run.sh
crontab -e
```
ใส่บรรทัด (แก้ path เป็นจริง):
```
*/5 * * * * /ABSOLUTE/PATH/auto/run.sh
```

## ตรวจ/ดีบั๊ก
- log อยู่ที่ `auto/auto-grade.log` (เก็บ 2000 บรรทัดท้าย)
- เทสทันที (ข้าม gate): `node auto-grade.mjs --dry-run --force`
- ถ้า cron ไม่เดิน: มักเป็น PATH หา node/claude ไม่เจอ → แก้ `export PATH=...` ใน `run.sh` ให้ตรงเครื่อง (`which node`, `which claude`)

## ชื่อคนยิงใหม่ที่ Qwen ไม่ชัวร์
auto จะติ๊กเท่าที่มั่นใจ (ดิก + Qwen yes/no) ที่เหลือแอดมินติ๊กในแอปได้ · ชื่อใหม่ที่ตรวจแล้ว → เติม `aliases.json` ครั้งหน้าระบบจำเอง
