import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCL4Uhe4MYa5_JUid5iCQS7P5pjnGz0-o8",
    authDomain: "forum-huegrad.firebaseapp.com",
    projectId: "forum-huegrad",
    storageBucket: "forum-huegrad.firebasestorage.app",
    messagingSenderId: "1047773676356",
    appId: "1:1047773676356:web:7e050aeba59ddbc4818d11"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const postsRef = collection(db, "posts");

async function sendPost() {
  const nicknameInput = document.getElementById('nickname');
  const messageInput = document.getElementById('message');
  const nickname = nicknameInput.value.trim();
  const message = messageInput.value.trim();
  if (!nickname || !message) return;

  await addDoc(postsRef, {
    nickname: nickname.slice(0, 30),
    message: message.slice(0, 2000),
    createdAt: serverTimestamp()
  });

  nicknameInput.value = '';
  messageInput.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sendBtn').addEventListener('click', sendPost);
});

const q = query(postsRef, orderBy("createdAt", "desc"));

onSnapshot(q, (snapshot) => {
  const container = document.getElementById('posts');
  container.innerHTML = '';

  if (snapshot.empty) {
    container.textContent = 'Пока нет сообщений';
    return;
  }

  snapshot.forEach((doc) => {
    const p = doc.data();

    const div = document.createElement('div');
    div.className = 'post';

    const nickEl = document.createElement('b');
    nickEl.textContent = p.nickname;

    const dateEl = document.createElement('small');
    dateEl.textContent = p.createdAt
      ? p.createdAt.toDate().toLocaleString('ru-RU')
      : 'только что';

    const msgEl = document.createElement('p');
    msgEl.textContent = p.message;

    div.appendChild(nickEl);
    div.appendChild(dateEl);
    div.appendChild(msgEl);
    container.appendChild(div);
  });
});