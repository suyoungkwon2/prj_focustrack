// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyCHcA_JPytrfI2BFkIw7rJehHOiXcEaJkU",
    authDomain: "focustrack-3ba34.firebaseapp.com",
    projectId: "focustrack-3ba34",
    storageBucket: "focustrack-3ba34.firebasestorage.app",
    messagingSenderId: "1005172161434",
    appId: "1:1005172161434:web:02f980fac9acf66cb65823",
    measurementId: "G-8ZF3RYDEZC"
  };
  
  // Firebase 초기화
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
  import { getFirestore, collection, addDoc, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
  
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  
  export { db, collection, addDoc, doc, updateDoc };