// ============================================================
// 1. Импорты (везде одна версия SDK!)
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// ============================================================
// 2. Конфиг
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCL4Uhe4MYa5_JUid5iCQS7P5pjnGz0-o8",
  authDomain: "forum-huegrad.firebaseapp.com",
  projectId: "forum-huegrad",
  storageBucket: "forum-huegrad.firebasestorage.app",
  messagingSenderId: "1047773676356",
  appId: "1:1047773676356:web:7e050aeba59ddbc4818d11"
};

// ============================================================
// 3. Инициализация
// ============================================================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const postsRef = collection(db, "posts");
const topicsRef = collection(db, "topics");

// ============================================================
// 4. Состояние
// ============================================================
let currentTopicId = new URLSearchParams(window.location.search).get('id');
let unsubscribePosts = null;
let unsubscribePoll = null;
let lastPostsSnapshot = null;
let lastPollSnapshot = null;

let currentUserId = null;
let currentUserNickname = null; // null для анонимных
let currentUserPhoto = null;

let authReadyResolve;
const authReady = new Promise((resolve) => { authReadyResolve = resolve; });

// ============================================================
// 5. Утилиты
// ============================================================
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function avatarColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

// Аватарка: фото (только https) или кружок с первой буквой ника
function createAvatar(name, photoURL, size = 32) {
  const el = document.createElement('span');
  el.className = 'avatar';
  el.style.width = el.style.height = size + 'px';
  el.style.fontSize = Math.round(size * 0.45) + 'px';

  const showLetter = () => {
    el.textContent = ((name || '?').trim()[0] || '?').toUpperCase();
    el.style.background = avatarColor(name || '?');
  };

  if (photoURL && photoURL.startsWith('https://')) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer'; // иначе фото Google иногда не грузятся
    img.addEventListener('error', () => { img.remove(); showLetter(); });
    img.src = photoURL;
    el.appendChild(img);
  } else {
    showLetter();
  }
  return el;
}

// Открыть/закрыть шторку тем (на телефоне) и синхронизировать aria-expanded
function setSidebarOpen(open) {
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) sidebarEl.classList.toggle('active', open);
  const toggle = document.getElementById('topicsToggleBtn');
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
}

// ============================================================
// 6. Авторизация
// ============================================================
function translateAuthError(code) {
  const map = {
    'auth/email-already-in-use': 'Этот email уже зарегистрирован',
    'auth/invalid-email': 'Некорректный email',
    'auth/weak-password': 'Пароль слишком простой (минимум 6 символов)',
    'auth/user-not-found': 'Пользователь не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/invalid-credential': 'Неверный email или пароль',
    'auth/popup-closed-by-user': 'Окно входа было закрыто',
    'auth/operation-not-allowed': 'Этот способ входа не включён в Firebase Console',
    'auth/unauthorized-domain': 'Домен сайта не добавлен в Authorized domains'
  };
  return map[code] || `Произошла ошибка (${code || 'неизвестный код'}), попробуйте ещё раз`;
}

async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error('Ошибка входа через Google:', err);
    showAuthError(translateAuthError(err.code));
  }
}

async function registerWithEmail(email, password, nickname) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: nickname.slice(0, 30) });
    // updateProfile не вызывает onAuthStateChanged — обновим вручную
    currentUserNickname = nickname.slice(0, 30);
    renderAuthUI();
    updateNicknameField();
    if (lastPostsSnapshot) renderPosts(lastPostsSnapshot);
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    showAuthError(translateAuthError(err.code));
  }
}

async function loginWithEmail(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error('Ошибка входа:', err);
    showAuthError(translateAuthError(err.code));
  }
}

async function logout() {
  await signOut(auth);
  signInAnonymously(auth).catch((err) => console.error('Ошибка анонимного входа:', err));
}

function renderAuthUI() {
  renderHeaderUser();
  renderSidebarAuth();
}

// Профиль (или кнопка "Войти") в верхней панели
function renderHeaderUser() {
  const box = document.getElementById('headerUser');
  if (!box) return;

  box.classList.remove('open');
  box.innerHTML = '';

  if (currentUserNickname) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'header-user-btn';

    const name = document.createElement('span');
    name.className = 'header-user-name';
    name.textContent = currentUserNickname;

    btn.append(createAvatar(currentUserNickname, currentUserPhoto, 32), name);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      box.classList.toggle('open');
    });

    const menu = document.createElement('div');
    menu.className = 'header-user-menu';
    const outBtn = document.createElement('button');
    outBtn.type = 'button';
    outBtn.textContent = 'Выйти';
    outBtn.addEventListener('click', logout);
    menu.appendChild(outBtn);

    box.append(btn, menu);
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'header-user-btn guest';
    btn.textContent = 'Войти';
    btn.addEventListener('click', openAuthDialog);
    box.appendChild(btn);
  }
}

// Форма входа в сайдбаре — только для гостей
function renderSidebarAuth() {
  const box = document.getElementById('authBox');
  if (!box) return;

  if (currentUserNickname) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <div class="auth-box">
      <button id="googleLoginBtn">Войти через Google</button>
      <details class="auth-email-details">
        <summary>или по email</summary>
        <input id="authEmail" type="email" placeholder="Email">
        <input id="authPassword" type="password" placeholder="Пароль">
        <input id="authNickname" placeholder="Ник (для регистрации)" maxlength="30">
        <div class="auth-buttons-row">
          <button id="loginBtn">Войти</button>
          <button id="registerBtn">Регистрация</button>
        </div>
      </details>
    </div>
  `;

  document.getElementById('googleLoginBtn').addEventListener('click', loginWithGoogle);

  document.getElementById('loginBtn').addEventListener('click', () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return;
    loginWithEmail(email, password);
  });

  document.getElementById('registerBtn').addEventListener('click', () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const nickname = document.getElementById('authNickname').value.trim();
    if (!email || !password || !nickname) {
      alert('Заполните email, пароль и ник');
      return;
    }
    registerWithEmail(email, password, nickname);
  });
}

function updateNicknameField() {
  const field = document.getElementById('nickname');
  if (field) field.style.display = currentUserNickname ? 'none' : '';
}

// закрывать меню профиля по клику в любое другое место
document.addEventListener('click', () => {
  const box = document.getElementById('headerUser');
  if (box) box.classList.remove('open');
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // ещё не вошли (или только что вышли) — ждём анонимного входа
    currentUserId = null;
    currentUserNickname = null;
    currentUserPhoto = null;
    renderAuthUI();
    return;
  }

  currentUserId = user.uid;
  // email публично не показываем: если имени ещё нет — нейтральная подпись
  currentUserNickname = user.isAnonymous ? null : (user.displayName || 'Пользователь');
  currentUserPhoto = user.isAnonymous ? null : user.photoURL;

  renderAuthUI();
  updateNicknameField();

  if (currentUserNickname && authDialogEl) closeAuthDialog();

  // перерисовываем то, что зависит от пользователя (кнопки лайков, опрос)
  if (lastPostsSnapshot) renderPosts(lastPostsSnapshot);
  if (lastPollSnapshot && currentTopicId) renderPollFrom(lastPollSnapshot, currentTopicId);

  authReadyResolve();
});

if (!auth.currentUser) {
  signInAnonymously(auth).catch((err) => console.error('Ошибка анонимного входа:', err));
}

// ============================================================
// Диалог входа при первом заходе (в стиле WinUI 3 ContentDialog)
// ============================================================
const AUTH_PROMPT_KEY = 'authPromptSeen';
let authDialogEl = null;

function showAuthError(message) {
  const err = document.getElementById('authDialogError');
  if (err) {
    err.textContent = message;
    err.hidden = false;
  } else {
    alert(message);
  }
}

function markAuthPromptSeen() {
  try { localStorage.setItem(AUTH_PROMPT_KEY, '1'); } catch (e) { /* приватный режим */ }
}

function onAuthDialogKey(e) {
  if (e.key === 'Escape') closeAuthDialog();
}

function closeAuthDialog() {
  if (!authDialogEl) return;
  markAuthPromptSeen();

  const el = authDialogEl;
  authDialogEl = null;
  document.removeEventListener('keydown', onAuthDialogKey);

  el.classList.remove('open');
  setTimeout(() => el.remove(), 160);
}

function openAuthDialog() {
  if (authDialogEl) return;

  const overlay = document.createElement('div');
  overlay.className = 'wui-overlay';
  overlay.innerHTML = `
    <div class="wui-dialog" role="dialog" aria-modal="true" aria-labelledby="wuiTitle">
      <div class="wui-body">
        <h2 class="wui-title" id="wuiTitle">Добро пожаловать на форум</h2>
        <p class="wui-text">Войдите, чтобы ник и аватарка сохранялись, а лайки и голоса были привязаны к вашему аккаунту. Или продолжайте как гость.</p>

        <button class="wui-btn wui-btn-wide" id="wuiGoogle" type="button">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Продолжить с Google
        </button>

        <div class="wui-divider"><span>или по email</span></div>

        <div class="wui-segmented" role="tablist">
          <button type="button" class="active" data-mode="login" role="tab">Вход</button>
          <button type="button" data-mode="register" role="tab">Регистрация</button>
        </div>

        <label class="wui-field" id="wuiNickField" hidden>
          <span>Ник</span>
          <input id="wuiNick" maxlength="30" autocomplete="nickname">
        </label>
        <label class="wui-field">
          <span>Email</span>
          <input id="wuiEmail" type="email" autocomplete="email">
        </label>
        <label class="wui-field">
          <span>Пароль</span>
          <input id="wuiPassword" type="password" autocomplete="current-password">
        </label>

        <div class="wui-error" id="authDialogError" hidden></div>
      </div>

      <div class="wui-footer">
        <button class="wui-btn wui-btn-accent" id="wuiSubmit" type="button">Войти</button>
        <button class="wui-btn" id="wuiGuest" type="button">Продолжить как гость</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  authDialogEl = overlay;
  document.addEventListener('keydown', onAuthDialogKey);

  const $ = (id) => overlay.querySelector('#' + id);
  let mode = 'login';

  // --- переключатель Вход / Регистрация ---
  overlay.querySelectorAll('.wui-segmented button').forEach((tab) => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.mode;
      overlay.querySelectorAll('.wui-segmented button')
        .forEach((t) => t.classList.toggle('active', t === tab));
      $('wuiNickField').hidden = mode !== 'register';
      $('wuiSubmit').textContent = mode === 'register' ? 'Создать аккаунт' : 'Войти';
      $('wuiPassword').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
      $('authDialogError').hidden = true;
    });
  });

  // --- отправка формы ---
  async function submit() {
    const email = $('wuiEmail').value.trim();
    const password = $('wuiPassword').value;
    const nickname = $('wuiNick').value.trim();
    const errorBox = $('authDialogError');
    errorBox.hidden = true;

    if (!email || !password || (mode === 'register' && !nickname)) {
      showAuthError(mode === 'register' ? 'Заполните ник, email и пароль' : 'Заполните email и пароль');
      return;
    }

    const btn = $('wuiSubmit');
    btn.disabled = true;
    try {
      if (mode === 'register') await registerWithEmail(email, password, nickname);
      else await loginWithEmail(email, password);
      // при успехе диалог закроет onAuthStateChanged
    } finally {
      btn.disabled = false;
    }
  }

  $('wuiSubmit').addEventListener('click', submit);
  overlay.querySelectorAll('.wui-field input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  });

  $('wuiGoogle').addEventListener('click', () => loginWithGoogle());
  $('wuiGuest').addEventListener('click', closeAuthDialog);

  // плавное появление
  requestAnimationFrame(() => overlay.classList.add('open'));
  $('wuiGoogle').focus();
}

// Показываем при первом заходе, если человек ещё не вошёл
authReady.then(() => {
  let seen = false;
  try { seen = localStorage.getItem(AUTH_PROMPT_KEY) === '1'; } catch (e) { /* ignore */ }
  if (!seen && !currentUserNickname) openAuthDialog();
});

// ============================================================
// 7. Сайдбар: создание тем и список тем
// ============================================================
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

const createBtn = document.getElementById('createTopicBtn');
if (createBtn) createBtn.addEventListener('click', createTopic);

// Одна кнопка "Темы" на всё: работает и на стартовом экране, и внутри темы
document.addEventListener('click', (e) => {
  if (e.target.closest('#topicsToggleBtn')) {
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) setSidebarOpen(!sidebarEl.classList.contains('active'));
  }
});

onSnapshot(query(topicsRef, orderBy("createdAt", "desc")), (snapshot) => {
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

// ============================================================
// 8. Открытие темы
// ============================================================
async function openTopic(topicId, title) {
  await authReady; // ждём, пока появится uid (нужен для лайков и опросов)

  currentTopicId = topicId;
  lastPostsSnapshot = null;
  lastPollSnapshot = null;
  history.pushState({}, '', `?id=${topicId}`);

  document.querySelectorAll('.topic-item').forEach((el) => {
    el.classList.toggle('active', el.href.includes(`id=${topicId}`));
  });

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="content-inner">
      <div class="topic-header">
        <h1>${escapeHtml(title)}</h1>
        <button class="topics-toggle-btn" id="topicsToggleBtn" aria-label="Темы" aria-expanded="false">
          <span>Темы</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div id="pollContainer"></div>
      <div class="post">
        <input id="nickname" placeholder="Ваш ник" maxlength="30">
        <div class="input-wrapper">
          <textarea id="message" placeholder="Сообщение (поддерживается **жирный**, *курсив*, \`код\`, ![alt](ссылка))" maxlength="2000"></textarea>
          <button id="sendBtn">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/>
              <path d="M6 12h16"/>
            </svg>
          </button>
        </div>
        <div id="posts"><div class="spinner-wrap"><div class="spinner"></div></div></div>
      </div>
    </div>
  `;

  setSidebarOpen(false); // сворачиваем шторку тем после выбора темы
  updateNicknameField();
  document.getElementById('sendBtn').addEventListener('click', sendPost);

  // --- Посты ---
  if (unsubscribePosts) unsubscribePosts();

  const q = query(
    postsRef,
    where("topicId", "==", topicId),
    orderBy("createdAt", "asc")
  );

  unsubscribePosts = onSnapshot(q, (snapshot) => {
    lastPostsSnapshot = snapshot;
    renderPosts(snapshot);
  });

  // --- Опрос ---
  renderPoll(topicId);
}

// ============================================================
// 9. Рендер постов
// ============================================================
function renderPosts(snapshot) {
  const container = document.getElementById('posts');
  if (!container) return;

  container.innerHTML = '';

  if (snapshot.empty) {
    container.textContent = 'Пока нет сообщений';
    return;
  }

  const docs = snapshot.docs;
  const total = docs.length;

  // новые сверху, но номера считаем от старых к новым
  [...docs].reverse().forEach((docSnap, i) => {
    const p = docSnap.data();
    const number = total - i;
    const postId = docSnap.id;

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

    // --- Лайк ---
    const likeBtn = document.createElement('button');
    likeBtn.className = 'like-btn';
    likeBtn.innerHTML = `❤ <span>${Number(p.likes) || 0}</span>`;
    likeBtn.disabled = true; // пока не проверили, лайкал ли уже

    if (currentUserId) {
      getDoc(doc(db, "posts", postId, "likes", currentUserId))
        .then((snap) => { likeBtn.disabled = snap.exists(); })
        .catch((err) => console.error('Не удалось проверить лайк:', err));
    }

    likeBtn.addEventListener('click', () => likePost(postId, likeBtn));

    // --- Сборка: аватарка + (номер, ник, дата), затем текст и лайк ---
    const head = document.createElement('div');
    head.className = 'post-head';

    const meta = document.createElement('div');
    meta.className = 'post-meta';
    meta.append(numEl, nickEl, dateEl);

    head.append(createAvatar(p.nickname, p.photoURL, 36), meta);
    div.append(head, msgEl, likeBtn);

    container.appendChild(div);
  });
}

// ============================================================
// 10. Markdown + ссылки #N
// ============================================================
// marked и DOMPurify подключаются в HTML через <script> (CDN)
function renderMessage(text) {
  const rawHtml = marked.parse(text, { breaks: true });

  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'a', 'code', 'pre', 'blockquote',
                   'ul', 'ol', 'li', 'p', 'br', 'h1', 'h2', 'h3', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt']
  });

  const wrapper = document.createElement('div');
  wrapper.innerHTML = cleanHtml;

  linkifyPostRefs(wrapper);

  return wrapper;
}

function linkifyPostRefs(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  textNodes.forEach((textNode) => {
    const text = textNode.textContent;
    const regex = /#(\d+)/g;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
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

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.replaceWith(fragment);
  });
}

// ============================================================
// 11. Отправка поста
// ============================================================
async function sendPost() {
  if (!currentTopicId) return;

  const nicknameInput = document.getElementById('nickname');
  const messageInput = document.getElementById('message');
  const sendBtn = document.getElementById('sendBtn');

  const nickname = currentUserNickname || nicknameInput.value.trim();
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
      createdAt: serverTimestamp(),
      likes: 0,
      ...(currentUserPhoto ? { photoURL: currentUserPhoto } : {})
    });
    messageInput.value = '';
  } catch (err) {
    console.error('Ошибка отправки поста:', err);
    alert('Не удалось отправить сообщение');
  } finally {
    sendBtn.innerHTML = originalContent;
    sendBtn.disabled = false;
  }
}

// ============================================================
// 12. Лайки
// ============================================================
async function likePost(postId, btnEl) {
  if (!currentUserId) return;

  const likeRef = doc(db, "posts", postId, "likes", currentUserId);
  const postRef = doc(db, "posts", postId);

  btnEl.disabled = true;

  try {
    await runTransaction(db, async (transaction) => {
      const likeSnap = await transaction.get(likeRef);
      if (likeSnap.exists()) return; // уже лайкал

      transaction.set(likeRef, { likedAt: serverTimestamp() });
      transaction.update(postRef, { likes: increment(1) });
    });
  } catch (err) {
    console.error('Ошибка при лайке:', err);
    btnEl.disabled = false;
  }
}

// ============================================================
// 13. Опросы (один опрос на тему, id документа = id темы)
// ============================================================
function renderPoll(topicId) {
  if (unsubscribePoll) unsubscribePoll();

  unsubscribePoll = onSnapshot(doc(db, "polls", topicId), (snap) => {
    lastPollSnapshot = snap;
    renderPollFrom(snap, topicId);
  });
}

async function renderPollFrom(snap, topicId) {
  const container = document.getElementById('pollContainer');
  if (!container) return;

  if (!snap.exists()) {
    // не затираем форму, если пользователь уже что-то вводит
    if (container.querySelector('#pollQuestion')) return;

    container.innerHTML = `
      <details class="poll-create">
        <summary>+ Создать опрос</summary>
        <input id="pollQuestion" placeholder="Вопрос" maxlength="200">
        <input class="poll-option-input" placeholder="Вариант 1" maxlength="100">
        <input class="poll-option-input" placeholder="Вариант 2" maxlength="100">
        <input class="poll-option-input" placeholder="Вариант 3 (необязательно)" maxlength="100">
        <button id="createPollBtn">Создать опрос</button>
      </details>
    `;
    document.getElementById('createPollBtn').addEventListener('click', () => createPoll(topicId));
    return;
  }

  const poll = snap.data();
  const votes = poll.votes || {};
  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);

  let votedIndex = null;
  if (currentUserId) {
    try {
      const voterSnap = await getDoc(doc(db, "polls", topicId, "voters", currentUserId));
      if (voterSnap.exists()) votedIndex = voterSnap.data().optionIndex;
    } catch (err) {
      console.error('Не удалось проверить голос:', err);
    }
  }

  // за время await мог открыться другой опрос/тема
  if (currentTopicId !== topicId) return;
  const containerNow = document.getElementById('pollContainer');
  if (!containerNow) return;

  const optionsHtml = poll.options.map((opt, i) => {
    const count = votes[i] || 0;
    const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const isChosen = votedIndex === i;

    if (votedIndex !== null) {
      return `
        <div class="poll-result ${isChosen ? 'poll-result-chosen' : ''}">
          <div class="poll-result-label">${escapeHtml(opt)} ${isChosen ? '✓' : ''} — ${percent}% (${count})</div>
          <div class="poll-bar"><div class="poll-bar-fill" style="width:${percent}%"></div></div>
        </div>
      `;
    }
    return `<button class="poll-option-btn" data-index="${i}">${escapeHtml(opt)}</button>`;
  }).join('');

  containerNow.innerHTML = `
    <div class="poll-box">
      <div class="poll-question">${escapeHtml(poll.question)}</div>
      ${optionsHtml}
      ${votedIndex !== null ? `<small>Всего голосов: ${totalVotes}</small>` : ''}
    </div>
  `;

  if (votedIndex === null) {
    containerNow.querySelectorAll('.poll-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => votePoll(topicId, Number(btn.dataset.index)));
    });
  }
}

async function createPoll(topicId) {
  const question = document.getElementById('pollQuestion').value.trim();
  const options = [...document.querySelectorAll('.poll-option-input')]
    .map((input) => input.value.trim())
    .filter((v) => v.length > 0)
    .slice(0, 6);

  if (!question || options.length < 2) {
    alert('Нужен вопрос и минимум 2 варианта ответа');
    return;
  }

  const votes = {};
  options.forEach((_, i) => { votes[i] = 0; });

  try {
    await setDoc(doc(db, "polls", topicId), {
      question: question.slice(0, 200),
      options,
      votes,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error('Ошибка создания опроса:', err);
    alert('Не удалось создать опрос');
  }
}

async function votePoll(topicId, optionIndex) {
  if (!currentUserId) return;

  const voterRef = doc(db, "polls", topicId, "voters", currentUserId);
  const pollRef = doc(db, "polls", topicId);

  try {
    await runTransaction(db, async (transaction) => {
      const voterSnap = await transaction.get(voterRef);
      if (voterSnap.exists()) return; // уже голосовал

      transaction.set(voterRef, { optionIndex, votedAt: serverTimestamp() });
      transaction.update(pollRef, { [`votes.${optionIndex}`]: increment(1) });
    });
  } catch (err) {
    console.error('Ошибка голосования:', err);
  }
}

// ============================================================
// 14. Если страница открыта сразу по ссылке ?id=...
// ============================================================
if (currentTopicId) {
  getDoc(doc(db, "topics", currentTopicId)).then((snap) => {
    if (snap.exists()) openTopic(currentTopicId, snap.data().title);
  });
}
