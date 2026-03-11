// firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // <-- important

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBRI0rcgvgULDCMjHnszv2N3gN0z1V82bc",
  authDomain: "addisfuel-bc703.firebaseapp.com",
  projectId: "addisfuel-bc703",
  storageBucket: "addisfuel-bc703.firebasestorage.app",
  messagingSenderId: "878102356159",
  appId: "1:878102356159:web:e7941cfe6261100e12e60a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore and export it
export const db = getFirestore(app);