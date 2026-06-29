// เทส LLM provider ใดๆ (OpenAI-compat) กับ prompt อ่านชื่อคนยิงจริง — ดูว่า format ที่ตอบ parse ได้ไหม
// รัน: DS_BASE_URL=... DS_TOKEN=<key> DS_MODEL=... node test-llm.mjs
//   DeepSeek: DS_BASE_URL=https://api.deepseek.com DS_MODEL=deepseek-v4-flash
const BASE=(process.env.DS_BASE_URL||"https://gateway.9arm.co").replace(/\/$/,"");
const TOK=process.env.DS_TOKEN||"";
const MODEL=process.env.DS_MODEL||"deepseek-v4-pro";
if(!TOK){ console.log("❌ ใส่ DS_TOKEN ก่อน"); process.exit(1); }

const actual=["Mikel Oyarzabal","Lamine Yamal","Ferran Torres"];
const items=["โอยาซาบัล","ลามีนยามาล","เปดรี","ตอเรส","มิเกลโอยา"];   // คาด: 1,2,0,3,1
const alist=actual.map((s,i)=>`[${i+1}] ${s}`).join(", ");
const list=items.map((t,i)=>`${i+1}) "${t}"`).join("\n");
const prompt=`คนยิงจริงในแมตช์ (มีเลขกำกับ): ${alist}\nต่อไปนี้คือชื่อที่ผู้เล่นพิมพ์ (ไทย/ฉายา/มุก) — ตอบว่าแต่ละชื่อหมายถึงคนยิงจริง "เบอร์ไหน" ตอบบรรทัดละ "ลำดับ: เบอร์" (เบอร์ 0 = ไม่ตรงใคร) เท่านั้น\n${list}`;

const t0=Date.now();
const r=await fetch(BASE+"/v1/chat/completions",{method:"POST",
  headers:{"content-type":"application/json","authorization":"Bearer "+TOK},
  body:JSON.stringify({model:MODEL,max_tokens:256,messages:[{role:"user",content:prompt}]})});
const d=await r.json();
console.log(`provider: ${BASE} · model: ${MODEL} · HTTP ${r.status} · ${Date.now()-t0}ms`);
if(d?.error){ console.log("❌ error:", JSON.stringify(d.error)); process.exit(1); }
const msg=d?.choices?.[0]?.message||{};
if(msg.reasoning_content) console.log("⚠️ มี reasoning_content แยก (thinking mode) — content หลักควรยังสะอาด");
const out=msg.content||"";
console.log("=== RAW content ===\n"+out);
const res={};
out.split("\n").filter(l=>/\d/.test(l)).forEach((line,idx)=>{ if(idx>=items.length)return; const ns=line.match(/\d+/g); const si=+ns[ns.length-1]; res[items[idx]]=si>0?(actual[si-1]||null):null; });
console.log("=== PARSED ===", JSON.stringify(res,null,1));
const exp={"โอยาซาบัล":"Mikel Oyarzabal","ลามีนยามาล":"Lamine Yamal","เปดรี":null,"ตอเรส":"Ferran Torres","มิเกลโอยา":"Mikel Oyarzabal"};
const okAll=Object.keys(exp).every(k=>res[k]===exp[k]);
console.log(okAll?"✅ parse ถูกหมด — ใช้ได้":"⚠️ บางตัวไม่ตรงคาด (ดู RAW ว่า format ต่างไหม)");
