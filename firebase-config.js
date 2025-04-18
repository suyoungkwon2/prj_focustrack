// Firebase 초기화
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, addDoc, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// 개발 환경 설정
const devConfig = {
    apiKey: "AIzaSyCHcA_JPytrfI2BFkIw7rJehHOiXcEaJkU",
    authDomain: "focustrack-3ba34.firebaseapp.com",
    projectId: "focustrack-3ba34",
    storageBucket: "focustrack-3ba34.firebasestorage.app",
    messagingSenderId: "1005172161434",
    appId: "1:1005172161434:web:02f980fac9acf66cb65823",
    measurementId: "G-8ZF3RYDEZC"
};

// 프로덕션 환경 설정
const prodConfig = {
    apiKey: "AIzaSyALWLN7i8hibG43lUyovRhB6FR97-I9FPw",
    authDomain: "focustrack-457000.firebaseapp.com",
    projectId: "focustrack-457000",
    storageBucket: "focustrack-457000.firebasestorage.app",
    messagingSenderId: "935569391366",
    appId: "1:935569391366:web:eda7e9ad71314185c02887",
    measurementId: "G-56Z1RQT9FB"
};

// manifest.json에서 버전 확인
const manifest = chrome.runtime.getManifest();
const isProduction = manifest.version_name && manifest.version_name.includes('prod');

// 환경에 따른 설정 선택
const firebaseConfig = isProduction ? prodConfig : devConfig;

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, doc, updateDoc };