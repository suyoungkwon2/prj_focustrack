//Step 1. Firebase Connection

// Import Firebase modules we need
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

// Firebase configuration object (from your dev config)
const firebaseConfig = {
  apiKey: "AIzaSyCHcA_JPytrfI2BFkIw7rJehHOiXcE",
  authDomain: "focustrack-3ba34.firebaseapp.com",
  projectId: "focustrack-3ba34",
  storageBucket: "focustrack-3ba34.appspot.com",
  messagingSenderId: "1005172161434",
  appId: "1:1005172161434:web:02f980fac9acf66cb65823"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Firestore database instance
const db = getFirestore(app);

// Add a simple console log to verify connection
console.log("✅ Firebase connection initialized");

//Step 2. Fetch Sessions
async function fetchSessions(userId) {
  try {
    console.log("Attempting to fetch sessions for user:", userId);
    const sessionsRef = collection(db, `users/${userId}/sessions`);
    const snapshot = await getDocs(sessionsRef);
    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    console.log("Sessions fetched:", sessions);
    return sessions;
  } catch (error) {
    console.error("Error fetching sessions:", error);
    throw error;
  }
}

// Test the function with a user ID
fetchSessions("test_user_id");
