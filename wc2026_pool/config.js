/* ===== config: ค่าคงที่ + lookup ทีม (ไม่มี state) ===== */
export const firebaseConfig = {
  apiKey: "AIzaSyAedCt1NUxlRb0FUv9IBYo6W-9emARcyWo",
  authDomain: "wc2026-fc378.firebaseapp.com",
  projectId: "wc2026-fc378",
  storageBucket: "wc2026-fc378.firebasestorage.app",
  messagingSenderId: "57497802236",
  appId: "1:57497802236:web:2fa37e0869fb9653774e79",
  measurementId: "G-1XHSCEYBSC",
};
export const ADMIN_EMAILS = ["ton.itthiphon@gmail.com"];
export const ROSTER = ["กราฟ","กุ้ย","นน","BB","กอล์ฟ","ต้น"];   // fallback เริ่มต้น (ถ้า carry ว่าง)
export const LOCK_BEFORE_MS = 10*60*1000;

export const TEAMS = {
  "บราซิล":{code:"BRA",color:"#E0A800",dark:true},"อาร์เจนตินา":{code:"ARG",color:"#74a9d8",dark:true},
  "ฝรั่งเศส":{code:"FRA",color:"#274fa3"},"สเปน":{code:"ESP",color:"#c8102e"},"อังกฤษ":{code:"ENG",color:"#c7283b"},
  "โปรตุเกส":{code:"POR",color:"#0e7a3b"},"เยอรมนี":{code:"GER",color:"#2b2f38"},"เนเธอร์แลนด์":{code:"NED",color:"#e2620e"},
  "เบลเยียม":{code:"BEL",color:"#caa227",dark:true},"อิตาลี":{code:"ITA",color:"#1e6fb0"},"โครเอเชีย":{code:"CRO",color:"#c8324b"},
  "โมร็อกโก":{code:"MAR",color:"#a01e2b"},"สหรัฐฯ":{code:"USA",color:"#b0203c"},"เม็กซิโก":{code:"MEX",color:"#0f7a4a"},
  "แคนาดา":{code:"CAN",color:"#d52b1e"},"ญี่ปุ่น":{code:"JPN",color:"#bc002d"},"เกาหลีใต้":{code:"KOR",color:"#1e3a8a"},
  "ออสเตรเลีย":{code:"AUS",color:"#FFCD00",dark:true},"สกอตแลนด์":{code:"SCO",color:"#27488f"},"สวีเดน":{code:"SWE",color:"#1f6ab0"},
  "เดนมาร์ก":{code:"DEN",color:"#c60c30"},"เซเนกัล":{code:"SEN",color:"#1a8a4a"},"เอกวาดอร์":{code:"ECU",color:"#ffce00",dark:true},
  "คูราเซา":{code:"CUR",color:"#1a3a8f"},"ตูนิเซีย":{code:"TUN",color:"#c1121f"},"ไอวอรีโคสต์":{code:"CIV",color:"#f77f00",dark:true},
  "เฮติ":{code:"HAI",color:"#15317e"},"สวิตเซอร์แลนด์":{code:"SUI",color:"#d52b1e"},"เช็ก":{code:"CZE",color:"#11457e"},
  "แอฟริกาใต้":{code:"RSA",color:"#007a4d"},"กาตาร์":{code:"QAT",color:"#8d1b3d"},"บอสเนีย":{code:"BIH",color:"#1b3a8f"},
  "ปานามา":{code:"PAN",color:"#d21034"},"ตุรกี":{code:"TUR",color:"#e30a17"},"ปารากวัย":{code:"PAR",color:"#d52b1e"},
  "แอลจีเรีย":{code:"ALG",color:"#1a7a4a"},"จอร์แดน":{code:"JOR",color:"#007a3d"},"ออสเตรีย":{code:"AUT",color:"#ed2939"},
  "อิรัก":{code:"IRQ",color:"#1a7a4a"},"นอร์เวย์":{code:"NOR",color:"#ba0c2f"},"อุซเบกิสถาน":{code:"UZB",color:"#1eb53a"},
  "โคลอมเบีย":{code:"COL",color:"#fcd116",dark:true},"อุรุกวัย":{code:"URU",color:"#4a8fd6",dark:true},
  "อิหร่าน":{code:"IRN",color:"#239f40"},"กานา":{code:"GHA",color:"#1a7a4a"},
  "เคปเวิร์ด":{code:"CPV",color:"#1c3f94"},"อียิปต์":{code:"EGY",color:"#c8102e"},"นิวซีแลนด์":{code:"NZL",color:"#16181d"},
  "ซาอุดีอาระเบีย":{code:"KSA",color:"#006c35"},"คองโก":{code:"COD",color:"#2b6cd4"},
};
export const CHAMP_TEAMS = ["บราซิล","อาร์เจนตินา","ฝรั่งเศส","สเปน","อังกฤษ","โปรตุเกส","เยอรมนี","เนเธอร์แลนด์","เบลเยียม","อิตาลี","โครเอเชีย","โมร็อกโก"];
export const FLAGS = {
  "บราซิล":"🇧🇷","อาร์เจนตินา":"🇦🇷","ฝรั่งเศส":"🇫🇷","สเปน":"🇪🇸","อังกฤษ":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","โปรตุเกส":"🇵🇹","เยอรมนี":"🇩🇪",
  "เนเธอร์แลนด์":"🇳🇱","เบลเยียม":"🇧🇪","อิตาลี":"🇮🇹","โครเอเชีย":"🇭🇷","โมร็อกโก":"🇲🇦","สหรัฐฯ":"🇺🇸","เม็กซิโก":"🇲🇽",
  "แคนาดา":"🇨🇦","ญี่ปุ่น":"🇯🇵","เกาหลีใต้":"🇰🇷","ออสเตรเลีย":"🇦🇺","สกอตแลนด์":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","สวีเดน":"🇸🇪","เดนมาร์ก":"🇩🇰",
  "เซเนกัล":"🇸🇳","เอกวาดอร์":"🇪🇨","คูราเซา":"🇨🇼","ตูนิเซีย":"🇹🇳","ไอวอรีโคสต์":"🇨🇮","เฮติ":"🇭🇹","สวิตเซอร์แลนด์":"🇨🇭",
  "เช็ก":"🇨🇿","แอฟริกาใต้":"🇿🇦","กาตาร์":"🇶🇦","บอสเนีย":"🇧🇦","ปานามา":"🇵🇦","ตุรกี":"🇹🇷","ปารากวัย":"🇵🇾","แอลจีเรีย":"🇩🇿",
  "จอร์แดน":"🇯🇴","ออสเตรีย":"🇦🇹","อิรัก":"🇮🇶","นอร์เวย์":"🇳🇴","อุซเบกิสถาน":"🇺🇿","โคลอมเบีย":"🇨🇴","อุรุกวัย":"🇺🇾","อิหร่าน":"🇮🇷","กานา":"🇬🇭",
  "เคปเวิร์ด":"🇨🇻","อียิปต์":"🇪🇬","นิวซีแลนด์":"🇳🇿","ซาอุดีอาระเบีย":"🇸🇦","คองโก":"🇨🇩",
};
export const fe = n => FLAGS[n] || "";
export const team = n => TEAMS[n] || {code:(n||"").slice(0,3), color:"#3A3F49"};
