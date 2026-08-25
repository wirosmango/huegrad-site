// 1. Импорты
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, getDoc,
  query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 2. Конфиг
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
const db = getFirestore(app);

// 4. Ссылки на коллекции
const postsRef = collection(db, "posts");
const topicsRef = collection(db, "topics");

let currentTopicId = new URLSearchParams(window.location.search).get('id');
let unsubscribePosts = null;

// --- Создание темы ---
async function createTopic() {
  const titleInput = document.getElementById('topicTitle');
  const title = titleInput.value.trim();
  if (!title) return;

  const docRef = await addDoc(topicsRef, {
    title: title.slice(0, 100),
    createdAt: serverTimestamp()
  });

  titleInput.value = '';
  openTopic(docRef.id, title);
}

document.addEventListener('DOMContentLoaded', () => {
  const createBtn = document.getElementById('createTopicBtn');
  if (createBtn) createBtn.addEventListener('click', createTopic);
});

// --- Список тем в сайдбаре ---
const topicsQuery = query(topicsRef, orderBy("createdAt", "desc"));
onSnapshot(topicsQuery, (snapshot) => {
  const list = document.getElementById('topicsList');
  if (!list) return;

  list.innerHTML = '';

  snapshot.forEach((docSnap) => {
    const t = docSnap.data();
    const link = document.createElement('a');
    link.href = `?id=${docSnap.id}`;
    link.className = 'topic-item';
    link.textContent = t.title;
    if (docSnap.id === currentTopicId) link.classList.add('active');

    link.addEventListener('click', (e) => {
      e.preventDefault();
      openTopic(docSnap.id, t.title);
    });

    list.appendChild(link);
  });
});

// --- Открытие темы (без перезагрузки страницы) ---
function openTopic(topicId, title) {
  currentTopicId = topicId;
  history.pushState({}, '', `?id=${topicId}`);

  document.querySelectorAll('.topic-item').forEach(el => {
    el.classList.toggle('active', el.href.includes(`id=${topicId}`));
  });

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
  <div class="content-inner">
    <h1>${title}</h1>
    <div class="post">
      <input id="nickname" placeholder="Ваш ник" maxlength="10">
      <div class="input-wrapper">
        <textarea id="message" placeholder="Сообщение (с поддержкой Markdown)" maxlength="2000"></textarea>
        <button id="sendBtn">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/>
          <path d="M6 12h16"/>
          </svg>
        </button>
      </div>
      <div id="posts">
        <div class="spinner-wrap">
          <div class="spinner"></div>
        </div>
      </div>
    </div>
  </div>
`;

  document.getElementById('sendBtn').addEventListener('click', sendPost);

  if (unsubscribePosts) unsubscribePosts();

  const q = query(
    postsRef,
    where("topicId", "==", topicId),
    orderBy("createdAt", "asc")
  );

  unsubscribePosts = onSnapshot(q, (snapshot) => {
    const container = document.getElementById('posts');
    if (!container) return;

    container.innerHTML = '';

    if (snapshot.empty) {
      container.textContent = 'Пока нет сообщений';
      return;
    }

    const docs = snapshot.docs;
    const total = docs.length;

    [...docs].reverse().forEach((docSnap, i) => {
      const p = docSnap.data();
      const number = total - i;

      const div = document.createElement('div');
      div.className = 'post';
      div.id = `post-${number}`;

      const numEl = document.createElement('span');
      numEl.className = 'post-number';
      numEl.textContent = `#${number}`;

      numEl.addEventListener('click', () => {
        const messageInput = document.getElementById('message');
        if (messageInput) {
          messageInput.value = `#${number} ` + messageInput.value;
          messageInput.focus();
        }
      });

      const nickEl = document.createElement('b');
      nickEl.textContent = ' ' + p.nickname;

      const dateEl = document.createElement('small');
      dateEl.textContent = p.createdAt
        ? p.createdAt.toDate().toLocaleString('ru-RU')
        : 'только что';

      const msgEl = document.createElement('p');
      msgEl.appendChild(renderMessage(p.message));

      div.appendChild(numEl);
      div.appendChild(nickEl);
      div.appendChild(dateEl);
      div.appendChild(msgEl);

      container.appendChild(div);
    });
  });
}


function renderMessage(text) {
  // 1. Markdown → HTML
  const rawHtml = marked.parse(text, { breaks: true }); // breaks: true — одиночный перенос строки тоже станет <br>

  // 2. Чистим от опасного HTML/скриптов
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'a', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'p', 'br', 'h1', 'h2', 'h3', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt']
  });

  const wrapper = document.createElement('div');
  wrapper.innerHTML = cleanHtml;

  // 3. Ищем #N внутри уже готового HTML и делаем кликабельными
  linkifyPostRefs(wrapper);

  return wrapper;
}

function linkifyPostRefs(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  textNodes.forEach((textNode) => {
    const regex = /#(\d+)/g;
    if (!regex.test(textNode.textContent)) return;
    regex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(textNode.textContent)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(textNode.textContent.slice(lastIndex, match.index)));
      }

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

    if (lastIndex < textNode.textContent.length) {
      fragment.appendChild(document.createTextNode(textNode.textContent.slice(lastIndex)));
    }

    textNode.replaceWith(fragment);
  });
}

// --- Отправка поста ---
async function sendPost() {
  if (!currentTopicId) return;

  const nicknameInput = document.getElementById('nickname');
  const messageInput = document.getElementById('message');
  const sendBtn = document.getElementById('sendBtn');
  const nickname = nicknameInput.value.trim();
  const message = messageInput.value.trim();
  if (!nickname || !message) return;

  const originalContent = sendBtn.innerHTML;
  sendBtn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>';
  sendBtn.disabled = true;

  try {
    await addDoc(postsRef, {
      topicId: currentTopicId,
      nickname: nickname.slice(0, 30),
      message: message.slice(0, 2000),
      createdAt: serverTimestamp()
    });
    messageInput.value = '';
  } finally {
    sendBtn.innerHTML = originalContent;
    sendBtn.disabled = false;
  }
}

// --- Если страница открыта сразу по ссылке ?id=... ---
if (currentTopicId) {
  getDoc(doc(db, "topics", currentTopicId)).then((snap) => {
    if (snap.exists()) openTopic(currentTopicId, snap.data().title);
  });
}
