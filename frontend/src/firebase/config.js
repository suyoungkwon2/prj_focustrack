// frontend/src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // 필요시 Auth 추가

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    // !!! API 키를 Firebase 콘솔에서 다시 한번 정확히 복사하여 붙여넣으세요 !!!
    apiKey: "AIzaSyCHcA_JPytrfI2BFkIw7rJehHOiXcEaJkU",
    authDomain: "focustrack-3ba34.firebaseapp.com",
    projectId: "focustrack-3ba34",
    // storageBucket 값을 스크린샷과 일치하도록 수정
    storageBucket: "focustrack-3ba34.appspot.com",
    messagingSenderId: "1005172161434",
    appId: "1:1005172161434:web:02f980fac9acf66cb65823",
    measurementId: "G-8ZF3RYDEZC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firestore, Auth instances
export const db = getFirestore(app);
// Auth 인스턴스 내보내기 (필요시)
export const auth = getAuth(app);

export default app; 