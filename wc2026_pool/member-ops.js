/* ===== member-ops: เปลี่ยนชื่อ / ย้ายวง — แตะข้อมูลที่ผูก "ชื่อ" (carry/player/preds/champPicks) ให้ครบ
   ใช้ทั้ง admin (วงปัจจุบัน) + manage (ทุกวง) · code = POOL_ID หรือ "" หรือโค้ดวง · uid อาจ undefined (ยังไม่ login) */
import { poolDocFor, poolColFor, getDoc, getDocs, setDoc, deleteDoc } from "./firebase.js";

// เปลี่ยนชื่อสมาชิกในวง code: carry key + champPicks key + player.name + โพยทุกใบของ uid
export async function renameMember(code, oldName, newName, uid){
  newName=(newName||"").trim(); if(!newName || newName===oldName) return;
  const carryRef=poolDocFor(code,"config","carry"); const carry=(await getDoc(carryRef)).data()||{};
  if(oldName in carry){ carry[newName]=carry[oldName]; delete carry[oldName]; await setDoc(carryRef,carry); }   // ไม่ merge = ลบ key เดิม
  const cpRef=poolDocFor(code,"config","champPicks"); const cp=(await getDoc(cpRef)).data()||{};
  if(oldName in cp){ cp[newName]=cp[oldName]; delete cp[oldName]; await setDoc(cpRef,cp); }
  if(uid){
    await setDoc(poolDocFor(code,"players",uid),{name:newName},{merge:true});
    const preds=await getDocs(poolColFor(code,"predictions"));
    for(const d of preds.docs){ if(d.data().uid===uid && d.data().player!==newName){
      await setDoc(d.ref,{player:newName},{merge:true});                                    // แต้มผูกชื่อ → อัปเดตโพยทุกใบ
      await setDoc(poolDocFor(code,"submitted",d.id),{player:newName},{merge:true});         // marker "ส่งแล้ว" ก็ผูกชื่อ → อัปเดตด้วย
    } }
  }
}

// ย้ายสมาชิกจากวง from → to: carry + champPicks + player + โพย (copy · โพยลบไม่ได้ rule delete:false → เหลือค้างในวงเดิมแบบซ่อน)
export async function moveMember(fromCode, toCode, name, uid){
  if(fromCode===toCode) return;
  const fcRef=poolDocFor(fromCode,"config","carry"), fcarry=(await getDoc(fcRef)).data()||{};
  if(name in fcarry){ await setDoc(poolDocFor(toCode,"config","carry"),{[name]:fcarry[name]},{merge:true}); delete fcarry[name]; await setDoc(fcRef,fcarry); }
  const fcpRef=poolDocFor(fromCode,"config","champPicks"), fcp=(await getDoc(fcpRef)).data()||{};
  if(name in fcp){ await setDoc(poolDocFor(toCode,"config","champPicks"),{[name]:fcp[name]},{merge:true}); delete fcp[name]; await setDoc(fcpRef,fcp); }
  if(uid){
    const ps=await getDoc(poolDocFor(fromCode,"players",uid));
    if(ps.exists()){ await setDoc(poolDocFor(toCode,"players",uid),ps.data(),{merge:true}); await deleteDoc(poolDocFor(fromCode,"players",uid)); }
    const preds=await getDocs(poolColFor(fromCode,"predictions"));
    for(const d of preds.docs){ if(d.data().uid===uid){
      const p=d.data();
      await setDoc(poolDocFor(toCode,"predictions",d.id),p,{merge:true});                          // copy โพย (ลบต้นทางไม่ได้)
      await setDoc(poolDocFor(toCode,"submitted",d.id),{uid,matchId:p.matchId,player:p.player},{merge:true});   // + marker "ส่งแล้ว" ในวงใหม่
    } }
  }
}
