/* ===== mock mode: ?mock=1 → ข้อมูลปลอม ไม่ต่อ Firestore ไม่ต้อง login (ไว้เทส UX ทุกสถานะ) ===== */
import { S } from "./state.js";
import { enterAppUI } from "./auth.js";
import { renderAll } from "./data.js";

export function startMock(){
  const now = Date.now(), H = 3600000;
  S.me = { uid:"u_ton", name:"ต้น", email:"ton.itthiphon@gmail.com", photo:"" };
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
  ];
  S.allPreds = [
    { uid:"u_ton",  player:"ต้น",   matchId:"m1", homeScore:2, awayScore:0, scorer1:"เนย์มาร์", scorer2:"" },
    { uid:"u_graf", player:"กราฟ", matchId:"m1", homeScore:1, awayScore:1, scorer1:"", scorer2:"" },
    { uid:"u_graf", player:"กราฟ", matchId:"m2", homeScore:2, awayScore:0, scorer1:"เคน", scorer2:"" },   // m2: ต้น ยังไม่ทาย
    { uid:"u_ton",  player:"ต้น",   matchId:"m3", homeScore:2, awayScore:1, scorer1:"เอ็มบัปเป้", scorer2:"", s1hit:true, s2hit:false, s1played:true, scorerOk:true },  // สด: ผลถูก+คนยิงถูก
    { uid:"u_graf", player:"กราฟ", matchId:"m3", homeScore:1, awayScore:1, scorer1:"กรีซมันน์", scorer2:"", s1hit:false, s1played:true, scorerOk:false },
    { uid:"u_ton",  player:"ต้น",   matchId:"m4", homeScore:2, awayScore:0, scorer1:"เมสซี่", scorer2:"", s1hit:true, s2hit:false, s1played:true, scorerOk:true },     // จบ: สกอร์เป๊ะ+คนยิงถูก
    { uid:"u_graf", player:"กราฟ", matchId:"m4", homeScore:0, awayScore:0, scorer1:"", scorer2:"" },
  ];
  S.myPreds = {}; S.allPreds.forEach(p=>{ if(p.uid===S.me.uid) S.myPreds[p.matchId]=p; });
  S.playersByName = { "ต้น":{photo:"",uid:"u_ton"}, "กราฟ":{photo:"",uid:"u_graf"}, "กุ้ย":{photo:"",uid:"u_kui"}, "BB":{photo:"",uid:"u_bb"}, "กอล์ฟ":{photo:"",uid:"u_golf"} };
  S.champPicks = { "ต้น":["บราซิล","อาร์เจนตินา"], "กราฟ":["ฝรั่งเศส","สเปน"] };
  S.tournament = { batchLabel:"MOCK · ชุดทดสอบ" };
  S.nowTs = now;
  enterAppUI();
  renderAll();   // ไม่มี watchData ใน mock → ต้องเรนเดอร์เอง
  console.log("🧪 MOCK mode — ข้อมูลปลอม (ไม่ต่อ Firestore)");
}
