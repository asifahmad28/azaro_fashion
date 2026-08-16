import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyBDIaQI1UQrQgsLt1P7mAUpjBxYefwJmkU",
    authDomain: "azaro-f5561.firebaseapp.com",
    projectId: "azaro-f5561",
    storageBucket: "azaro-f5561.firebasestorage.app",
    messagingSenderId: "292148827640",
    appId: "1:292148827640:web:2cf4983879c5bbfd60320d",
    measurementId: "G-90WS26PKJ1"
  };


const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);