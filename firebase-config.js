import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCL4Uhe4MYa5_JUid5iCQS7P5pjnGz0-o8",
  authDomain: "forum-huegrad.firebaseapp.com",
  projectId: "forum-huegrad",
  storageBucket: "forum-huegrad.firebasestorage.app",
  messagingSenderId: "1047773676356",
  appId: "1:1047773676356:web:7e050aeba59ddbc4818d11"
};

// 3. Инициализация
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);