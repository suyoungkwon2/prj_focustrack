// 개발 환경 Firebase 설정
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY_DEV,
    authDomain: "focustrack-dev.firebaseapp.com",
    projectId: "focustrack-dev",
    storageBucket: "focustrack-dev.appspot.com",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID_DEV,
    appId: process.env.FIREBASE_APP_ID_DEV,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID_DEV
};

export default firebaseConfig; 