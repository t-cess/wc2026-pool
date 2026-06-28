/* ===== mock mode: ?mock=1 → ข้อมูลปลอม ไม่ต่อ Firestore ไม่ต้อง login (ไว้เทส UX ทุกสถานะ) ===== */
import { S } from "./state.js";
import { enterAppUI, bindAuthButtons, showIdentity } from "./auth.js";
import { renderAll } from "./data.js";

export function startMock(){
  const now = Date.now(), H = 3600000;
  // ?as=admin = แอดมินวงธรรมดา · ?as=super = ต้น (default) · ?as=new = คนใหม่ยังไม่ตั้งชื่อ (เทส self-register · +&lock=1 = ปิดรับสมัคร)
  const params = new URLSearchParams(location.search);
  const asParam = params.get("as");
  const asAdmin = asParam==="admin", asNew = asParam==="new";
  S.me = asNew  ? { uid:"u_new", name:"", email:"newbie@example.com", photo:"" }
       : asAdmin ? { uid:"u_kui", name:"กุ้ย", email:"kui@example.com", photo:"" }
                 : { uid:"u_ton", name:"ต้น", email:"ton.itthiphon@gmail.com", photo:"" };
  S.admins = asAdmin ? ["kui@example.com","graf@example.com"] : ["graf@example.com"];   // config/admins มีทุกแอดมิน (as=admin: กุ้ย+กราฟ) · super: graf ตัวอย่าง
  if(asParam) S.tab = "admin";                     // เด้งเข้าแท็บแอดมินเลย
  S.carry = { "ต้น":30, "กราฟ":35, "กุ้ย":33, "BB":28, "กอล์ฟ":25 };
  S.matches = S.allMatches = [
    // เปิดทาย + ทายแล้ว
    { id:"m1", home:"บราซิล", away:"สเปน", group:"G นัด1", kickoff:now+2*H, homeScore:0, awayScore:0, status:"upcoming" },
    // เปิดทาย + ยังไม่ทาย (ต้น) → ทดสอบ "ยังไม่ได้ทาย"
    { id:"m2", home:"อังกฤษ", away:"อิหร่าน", group:"B นัด1", kickoff:now+3*H, homeScore:0, awayScore:0, status:"upcoming" },
    // กำลังแข่ง (สด)
    { id:"m3", home:"ฝรั่งเศส", away:"เดนมาร์ก", group:"D นัด2", kickoff:now-1*H, homeScore:2, awayScore:1, live:true, clock:"67'", status:"upcoming",
      goals:[{name:"Kylian Mbappé",time:"31'",side:"h"},{name:"Kylian Mbappé",time:"55'",side:"h"},{name:"Christian Eriksen",time:"62'",side:"a"}] },
    // จบแล้ว
    { id:"m4", home:"อาร์เจนตินา", away:"เม็กซิโก", group:"C นัด2", kickoff:now-3*H, homeScore:2, awayScore:0, status:"finished", clock:"จบ",
      goals:[{name:"Lionel Messi",time:"64'",side:"h"},{name:"Enzo Fernández",time:"87'",side:"h"}] },
    // จบแล้ว เสมอเป๊ะ → ทดสอบ +6 (ออร่า)
    { id:"m5", home:"โปรตุเกส", away:"เยอรมนี", group:"E นัด2", kickoff:now-4*H, homeScore:1, awayScore:1, status:"finished", clock:"จบ",
      goals:[{name:"Cristiano Ronaldo",time:"40'",side:"h"},{name:"Kai Havertz",time:"70'",side:"a"}] },
    // จบแล้ว คืนก่อน (คนละ matchday) → ทดสอบหัวข้อ "คืนแข่ง" หลายคืน
    { id:"m6", home:"เนเธอร์แลนด์", away:"โครเอเชีย", group:"F นัด1", kickoff:now-27*H, homeScore:3, awayScore:1, status:"finished", clock:"จบ" },
    { id:"m7", home:"เบลเยียม", away:"โมร็อกโก", group:"A นัด1", kickoff:now-29*H, homeScore:0, awayScore:2, status:"finished", clock:"จบ" },
    // จบแล้ว สองคืนก่อน
    { id:"m8", home:"อุรุกวัย", away:"กานา", group:"H นัด1", kickoff:now-51*H, homeScore:1, awayScore:0, status:"finished", clock:"จบ" },
    // จบแล้ว คืนเก่าๆ → ทดสอบหลายวัน (10 คืน) ลูกศร/หรี่/scroll
    { id:"m9",  home:"ญี่ปุ่น", away:"ออสเตรเลีย", group:"G นัด1", kickoff:now-75*H,  homeScore:2, awayScore:2, status:"finished", clock:"จบ" },
    { id:"m10", home:"สหรัฐฯ", away:"แคนาดา", group:"A นัด2", kickoff:now-99*H,  homeScore:1, awayScore:3, status:"finished", clock:"จบ" },
    { id:"m11", home:"เกาหลีใต้", away:"ซาอุดีอาระเบีย", group:"F นัด2", kickoff:now-123*H, homeScore:0, awayScore:0, status:"finished", clock:"จบ" },
    { id:"m12", home:"สวิตเซอร์แลนด์", away:"เซอร์เบีย", group:"E นัด1", kickoff:now-147*H, homeScore:3, awayScore:1, status:"finished", clock:"จบ" },
    { id:"m13", home:"โปแลนด์", away:"เซเนกัล", group:"B นัด2", kickoff:now-171*H, homeScore:1, awayScore:2, status:"finished", clock:"จบ" },
    { id:"m14", home:"อิตาลี", away:"นอร์เวย์", group:"C นัด1", kickoff:now-195*H, homeScore:2, awayScore:0, status:"finished", clock:"จบ" },
    { id:"m15", home:"โคลอมเบีย", away:"เอกวาดอร์", group:"D นัด1", kickoff:now-219*H, homeScore:1, awayScore:1, status:"finished", clock:"จบ" },
    // 🆕 น็อกเอาต์: เปิดทาย (ทดสอบแตะเลือกทีมเข้ารอบ เมื่อทายเสมอ) — ต้น ยังไม่ทาย → โชว์ฟอร์ม
    { id:"k2", home:"บราซิล", away:"โครเอเชีย", group:"รอบ 16", kickoff:now+4*H, homeScore:0, awayScore:0, status:"upcoming", ko:true },
    // 🆕 น็อกเอาต์: จบแล้ว 90' เสมอ 1-1 → ต่อเวลา ฝรั่งเศสชนะ 2-1 (อังกฤษตกรอบ) · reg=สกอร์ 90' · advancer=h
    { id:"k1", home:"ฝรั่งเศส", away:"อังกฤษ", group:"รอบ 16", kickoff:now-2*H, homeScore:2, awayScore:1, status:"finished", clock:"จบ", ko:true, reg:{h:1,a:1}, advancer:"h",
      goals:[{name:"Kylian Mbappé",time:"22'",side:"h",phase:"reg"},{name:"Harry Kane",time:"58'",side:"a",pen:true,phase:"reg"},{name:"Olivier Giroud",time:"106'",side:"h",phase:"et"}] },
  ];
  S.allPreds = [
    { uid:"u_ton",  player:"ต้น",   matchId:"m1", homeScore:2, awayScore:0, scorer1:"เนย์มาร์", scorer2:"" },
    { uid:"u_graf", player:"กราฟ", matchId:"m1", homeScore:1, awayScore:1, scorer1:"", scorer2:"" },
    { uid:"u_graf", player:"กราฟ", matchId:"m2", homeScore:2, awayScore:0, scorer1:"เคน", scorer2:"" },   // m2: ต้น ยังไม่ทาย
    { uid:"u_ton",  player:"ต้น",   matchId:"m3", homeScore:2, awayScore:1, scorer1:"เอ็มบัปเป้", scorer2:"", s1hit:true, s2hit:false, s1played:true, scorerOk:true },  // สด: ผลถูก+คนยิงถูก
    { uid:"u_graf", player:"กราฟ", matchId:"m3", homeScore:1, awayScore:1, scorer1:"กรีซมันน์", scorer2:"", s1hit:false, s1played:true, scorerOk:false, s1unsure:true },   // amber: ระบบอ่านชื่อไม่ชัวร์ → โชว์ ? + ปุ่ม ✕ ให้แอดมินกดไม่ให้แต้ม
    { uid:"u_ton",  player:"ต้น",   matchId:"m4", homeScore:2, awayScore:0, scorer1:"เมสซี่", scorer2:"", s1hit:true, s2hit:false, s1played:true, scorerOk:true },     // จบ: สกอร์เป๊ะ+คนยิงถูก
    { uid:"u_graf", player:"กราฟ", matchId:"m4", homeScore:0, awayScore:0, scorer1:"", scorer2:"" },
    { uid:"u_ton",  player:"ต้น",   matchId:"m5", homeScore:1, awayScore:1, scorer1:"โรนัลโด้", scorer2:"", s1hit:true, s2hit:false, s1played:true, scorerOk:true },  // จบ: เสมอเป๊ะ+คนยิง = +6
    { uid:"u_graf", player:"กราฟ", matchId:"m5", homeScore:2, awayScore:1, scorer1:"", scorer2:"" },
    { uid:"u_ton",  player:"ต้น",   matchId:"m6", homeScore:2, awayScore:1, scorer1:"", scorer2:"" },
    { uid:"u_ton",  player:"ต้น",   matchId:"m7", homeScore:0, awayScore:1, scorer1:"", scorer2:"" },
    { uid:"u_ton",  player:"ต้น",   matchId:"m8", homeScore:1, awayScore:0, scorer1:"", scorer2:"", s1hit:false, scorerOk:false },
    // KO k1 (จบ): ต้น ทายเสมอ 1-1 + เลือกฝรั่งเศสเข้ารอบ → ผล90'ถูก+สกอร์เป๊ะ+คนยิง+เข้ารอบ = +7
    { uid:"u_ton",  player:"ต้น",   matchId:"k1", homeScore:1, awayScore:1, scorer1:"เอ็มบัปเป้", scorer2:"", advancePick:"h", s1hit:true, s1played:true, scorerOk:true },
    // KO k1: กราฟ ทายอังกฤษชนะ 1-2 → ผล/สกอร์/เข้ารอบ พลาด (ล็อกอังกฤษ) แต่คนยิงเคนถูก = +1
    { uid:"u_graf", player:"กราฟ", matchId:"k1", homeScore:1, awayScore:2, scorer1:"เคน", scorer2:"", s1hit:true, s1played:true, scorerOk:true },
  ];
  S.myPreds = {}; S.allPreds.forEach(p=>{ if(p.uid===S.me.uid) S.myPreds[p.matchId]=p; });
  S.submittedByMatch = {}; S.allPreds.forEach(p=>{ const a=(S.submittedByMatch[p.matchId]=S.submittedByMatch[p.matchId]||[]); if(!a.includes(p.player)) a.push(p.player); });   // mock: derive จาก allPreds (ไม่มี gate)
  S.expanded = { m4:true, m5:true, k1:true };   // เปิดโพยคู่จบไว้เลย เห็นออร่า +5/+6 + badge เข้ารอบ (เทส)
  S.playersByName = { "ต้น":{photo:"",uid:"u_ton"}, "กราฟ":{photo:"",uid:"u_graf"}, "กุ้ย":{photo:"",uid:"u_kui"}, "BB":{photo:"",uid:"u_bb"}, "กอล์ฟ":{photo:"",uid:"u_golf"} };
  S.champPicks = { "ต้น":["บราซิล","อาร์เจนตินา"], "กราฟ":["ฝรั่งเศส","อังกฤษ"] };   // อังกฤษ ตกรอบจาก k1 → โชว์หม่น + pill "ตกรอบ"
  S.tournament = { batchLabel:"MOCK · ชุดทดสอบ" };
  S.poolMeta = { name:"กลุ่มแทงบอลเถื่อนของอาจารย์กุ้ย" };   // ชื่อวงใต้หัวข้อ
  S.bind = { "graf@example.com":"กราฟ" };                      // กราฟ = แอดมิน+ผู้เล่น → โชว์ badge แอดมิน + ลบเฉพาะ super
  S.nowTs = now;
  if(asNew){   // เทส self-register: คนใหม่ยังไม่มีชื่อ → โชว์หน้า "ตั้งชื่อ" · เพิ่ม "ช่องว่าง" = ชื่อ pre-add ที่ยังไม่มีใคร claim (เลือกได้) · กราฟ/กุ้ย ถูก claim แล้ว
    S.carry = { ...S.carry, "ช่องว่าง":0 };
    delete S.playersByName["ต้น"]; delete S.playersByName["BB"]; delete S.playersByName["กอล์ฟ"];   // เหลือ กราฟ/กุ้ย claimed → avail = ช่องว่าง + พิมพ์ใหม่
    S.tournament = { ...S.tournament, regLocked: params.has("lock") };
    bindAuthButtons();
    showIdentity();
    console.log("🧪 MOCK self-register"+(S.tournament.regLocked?" · 🔒 ปิดรับสมัคร":" · เปิดรับ"));
    return;
  }
  enterAppUI();
  renderAll();   // ไม่มี watchData ใน mock → ต้องเรนเดอร์เอง
  console.log("🧪 MOCK mode — ข้อมูลปลอม (ไม่ต่อ Firestore)");
}
