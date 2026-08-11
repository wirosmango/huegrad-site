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

const q = query(postsRef, orderBy("createdAt", "asc")); // изменили desc → asc

onSnapshot(q, (snapshot) => {
  const container = document.getElementById('posts');
  container.innerHTML = '';

  if (snapshot.empty) {
    container.textContent = 'Пока нет сообщений';
    return;
  }

  const docs = snapshot.docs; // порядок: от старых к новым
  const total = docs.length;

  // переворачиваем только для отображения (новые сверху),
  // но номер считаем от исходного порядка (старые = маленькие номера)
  [...docs].reverse().forEach((doc, i) => {
    const p = doc.data();
    const number = total - i; // т.к. массив развёрнут

    const div = document.createElement('div');
    div.className = 'post';
    div.id = `post-${number}`;

    const numEl = document.createElement('span');
    numEl.className = 'post-number';
    numEl.textContent = `#${number}`;

    numEl.addEventListener('click', () => {
      const messageInput = document.getElementById('message');
      messageInput.value = `#${number} ` + messageInput.value;
      messageInput.focus();
    });

    const nickEl = document.createElement('b');
    nickEl.textContent = ' ' + p.nickname;

    const dateEl = document.createElement('small');
    dateEl.textContent = p.createdAt
      ? p.createdAt.toDate().toLocaleString('ru-RU')
      : 'только что';
    
      function renderMessageWithLinks(text) {
        const fragment = document.createDocumentFragment();
        const regex = /#(\d+)/g;
        let lastIndex = 0;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
          // текст до найденного номера
          if (match.index > lastIndex) {
            fragment.appendChild(
              document.createTextNode(text.slice(lastIndex, match.index))
            );
          }
          
          // сама ссылка
          const num = match[1];
          const link = document.createElement('a');
          link.href = `#post-${num}`;
          link.textContent = `#${num}`;
          link.className = 'post-ref';
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.getElementById(`post-${num}`);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              target.classList.add('highlight');
              setTimeout(() => target.classList.remove('highlight'), 1500);
            }
          });
          fragment.appendChild(link);
          
          lastIndex = regex.lastIndex;
        }
        
        // остаток текста после последнего совпадения
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        
        return fragment;
      }
    const msgEl = document.createElement('p');
    msgEl.appendChild(renderMessageWithLinks(p.message));

    div.appendChild(numEl);
    div.appendChild(nickEl);
    div.appendChild(dateEl);
    div.appendChild(msgEl);

    container.appendChild(div);
  });
});