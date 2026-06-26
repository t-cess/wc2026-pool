/* ===== firebase init + re-export SDK ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig, POOL_ID } from "./config.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// data ของแต่ละวง: POOL_ID ว่าง = วงหลัก (top-level) · มีโค้ด = pools/{code}/...
// หมายเหตุ: matches ใช้ร่วมทุกวง → อ่าน top-level เสมอ (ไม่ผ่าน 2 ตัวนี้)
export const poolCol = name => POOL_ID ? collection(db,"pools",POOL_ID,name) : collection(db,name);
export const poolDoc = (...p) => POOL_ID ? doc(db,"pools",POOL_ID,...p) : doc(db,...p);

// เวอร์ชันระบุวงได้ (สำหรับหน้า "จัดการ" ข้ามวงของ super) — code ว่าง = วงหลัก top-level
export const poolColFor = (code,name) => code ? collection(db,"pools",code,name) : collection(db,name);
export const poolDocFor = (code,...p) => code ? doc(db,"pools",code,...p) : doc(db,...p);

export { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where,
  signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged };
