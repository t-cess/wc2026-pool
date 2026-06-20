#!/bin/sh
# Cron wrapper: auto-grade ทุก 5 นาที (ตัวสคริปต์ gate เองว่ามีบอลเตะไหม)
# ตั้ง: crontab -e  แล้วใส่   */5 * * * * /ABSOLUTE/PATH/auto/run.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/auto-grade.log"
LOCK="$DIR/.lock"

# กันรันซ้อน (mkdir atomic — ใช้ได้ทั้ง mac/linux)
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date '+%F %T') skip: ยังรันรอบก่อนค้างอยู่" >> "$LOG"; exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# cron ให้ PATH จำกัด → เติมที่อยู่ node + claude (ปรับให้ตรงเครื่องถ้าหาไม่เจอ)
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$DIR" || exit 1
echo "----- $(date '+%F %T') -----" >> "$LOG"
node auto-grade.mjs >> "$LOG" 2>&1

# จำกัดขนาด log (เก็บ 2000 บรรทัดท้าย)
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
