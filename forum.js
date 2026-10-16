// ============================================================
// 1. Импорты (везде одна версия SDK!)
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
  query, where, orderBy, limit, startAt, endAt, documentId,
  getAggregateFromServer, count, sum,
  onSnapshot, serverTimestamp, increment, runTransaction
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

let currentTopicTitle = '';
let pendingScrollPostId = null;
let registrationInProgress = false;

let notifications = [];
let unsubscribeNotifications = null;
let notificationsUid = null;
let notificationsLoaded = false;

let authReadyResolve;
const authReady = new Promise((resolve) => { authReadyResolve = resolve; });

const profileCache = new Map(); // uid -> данные профиля (или null, если профиля нет)
let profileDialogEl = null;

// ============================================================
// 5. Утилиты
// ============================================================
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Ник: 2–30 символов, буквы/цифры/пробел/_ . -, без . - пробела в конце
const NICK_RE = /^[\p{L}\p{N}][\p{L}\p{N}_. -]{0,28}[\p{L}\p{N}_]$/u;

// @ник  или  @[Ник с пробелом]  (группа 1 — #N, 2/3 — упоминание)
const TOKEN_RE = /#(\d+)|(?<![\p{L}\p{N}_])@(?:\[([^\]\n]{2,30})\]|([\p{L}\p{N}_.-]{2,30}))/gu;

function sanitizeNick(raw) {
  const s = String(raw || '')
    .replace(/[^\p{L}\p{N}_. -]/gu, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .slice(0, 30)
    .replace(/[. -]+$/, '');
  return s.length >= 2 ? s : 'Пользователь';
}

// ники, упомянутые в тексте (в нижнем регистре, без дублей, без кода)
function extractMentions(text) {
  const clean = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, '');
  const found = new Set();
  for (const m of clean.matchAll(TOKEN_RE)) {
    const raw = m[2] || m[3];
    if (!raw) continue;
    const nick = raw.trim().replace(/[.\-]+$/, '').toLowerCase();
    if (nick.length >= 2) found.add(nick);
  }
  return [...found];
}

function showToast(text) {
  const t = document.createElement('div');
  t.className = 'wui-toast';
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 200);
  }, 4000);
}

function scrollToPost(postId) {
  const el = document.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('highlight');
  setTimeout(() => el.classList.remove('highlight'), 1500);
  return true;
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

// Закрепляет ник за аккаунтом (уникальность гарантируют правила Firestore)
async function ensureUsername(user) {
  const mine = await getDocs(
    query(collection(db, 'usernames'), where('uid', '==', user.uid), limit(1))
  );
  if (!mine.empty) return mine.docs[0].data().nickname;

  const base = sanitizeNick(user.displayName);
  for (let attempt = 0; attempt < 5; attempt++) {
    const nick = attempt === 0
      ? base
      : `${base.slice(0, 26)}${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await setDoc(doc(db, 'usernames', nick.toLowerCase()), {
        uid: user.uid,
        nickname: nick,
        createdAt: serverTimestamp()
      });
      if (user.displayName !== nick) await updateProfile(user, { displayName: nick });
      return nick;
    } catch (err) {
      if (err.code !== 'permission-denied') throw err; // ник занят — пробуем другой
    }
  }
  return null;
}

async function applyUsername(user) {
  try {
    const nick = await ensureUsername(user);
    if (nick && nick !== currentUserNickname) {
      currentUserNickname = nick;
      renderAuthUI();
      updateNicknameField();
      if (lastPostsSnapshot) renderPosts(lastPostsSnapshot);
    }
  } catch (err) {
    console.error('Не удалось закрепить ник:', err);
  }
}

async function registerWithEmail(email, password, nickname) {
  nickname = nickname.trim();
  if (!NICK_RE.test(nickname)) {
    showAuthError('Ник: 2–30 символов, буквы, цифры, пробел и _ . - (не в конце)');
    return;
  }

  try {
    const taken = await getDoc(doc(db, 'usernames', nickname.toLowerCase()));
    if (taken.exists()) {
      showAuthError('Этот ник уже занят');
      return;
    }
  } catch (err) {
    console.error('Не удалось проверить ник:', err);
  }

  registrationInProgress = true; // чтобы onAuthStateChanged не закрепил ник раньше времени
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: nickname });
    await applyUsername(cred.user);
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    showAuthError(translateAuthError(err.code));
  } finally {
    registrationInProgress = false;
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
}

// Профиль (или кнопка "Войти") в верхней панели
function renderHeaderUser() {
  const box = document.getElementById('headerUser');
  if (!box) return;

  box.classList.remove('open', 'open-notif');
  box.innerHTML = '';

  if (currentUserNickname) {
    // --- колокольчик ---
    const bell = document.createElement('button');
    bell.type = 'button';
    bell.className = 'header-bell';
    bell.setAttribute('aria-label', 'Уведомления');
    bell.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
      </svg>
      <span class="notif-badge" id="notifBadge" hidden></span>
    `;
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      box.classList.remove('open');
      box.classList.toggle('open-notif');
    });

    const notifMenu = document.createElement('div');
    notifMenu.className = 'notif-menu';
    notifMenu.innerHTML = `
      <div class="notif-head">
        <span>Уведомления</span>
        <button type="button" id="notifReadAll">Прочитать все</button>
      </div>
      <div id="notifList"></div>
    `;
    notifMenu.addEventListener('click', (e) => e.stopPropagation());

    // --- профиль ---
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'header-user-btn';

    const name = document.createElement('span');
    name.className = 'header-user-name';
    name.textContent = currentUserNickname;

    btn.append(createAvatar(currentUserNickname, currentUserPhoto, 32), name);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      box.classList.remove('open-notif');
      box.classList.toggle('open');
    });

    const menu = document.createElement('div');
    menu.className = 'header-user-menu';
    const outBtn = document.createElement('button');
    outBtn.type = 'button';
    outBtn.textContent = 'Выйти';
    outBtn.addEventListener('click', logout);
    const profBtn = document.createElement('button');
    profBtn.type = 'button';
    profBtn.textContent = 'Мой профиль';
    profBtn.addEventListener('click', () => openProfile(currentUserId));
    menu.append(profBtn, outBtn);

    box.append(bell, btn, menu, notifMenu);

    notifMenu.querySelector('#notifReadAll').addEventListener('click', markAllNotificationsRead);
    renderNotifications();
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'header-user-btn guest';
    btn.textContent = 'Войти';
    btn.addEventListener('click', openAuthDialog);
    box.appendChild(btn);
  }
}



function updateNicknameField() {
  const field = document.getElementById('nickname');
  if (field) field.style.display = currentUserNickname ? 'none' : '';
}

// закрывать меню профиля по клику в любое другое место
document.addEventListener('click', () => {
  const box = document.getElementById('headerUser');
  if (box) box.classList.remove('open', 'open-notif');
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    currentUserId = null;
    currentUserNickname = null;
    currentUserPhoto = null;
    stopNotifications();
    renderAuthUI();
    return;
  }

  currentUserId = user.uid;
  currentUserNickname = user.isAnonymous ? null : (user.displayName || 'Пользователь');
  currentUserPhoto = user.isAnonymous ? null : user.photoURL;

  renderAuthUI();
  updateNicknameField();

  if (currentUserNickname && authDialogEl) closeAuthDialog();

  if (user.isAnonymous) {
    stopNotifications();
  } else {
    startNotifications(user.uid);
    loadOwnProfile(user);
    if (!registrationInProgress) applyUsername(user);
  }

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
  currentTopicTitle = title;
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
          <div class="mention-popup" id="mentionPopup" hidden></div>
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
  setupMentionAutocomplete();

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
    div.dataset.postId = postId;

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

    const prof = p.authorUid ? profileCache.get(p.authorUid) : null;
    const avatarEl = createAvatar(p.nickname, (prof && prof.photoURL) || p.photoURL, 36);

    if (p.authorUid) {
      avatarEl.classList.add('clickable');
      nickEl.classList.add('clickable');
      avatarEl.addEventListener('click', () => openProfile(p.authorUid));
      nickEl.addEventListener('click', () => openProfile(p.authorUid));
    }

    head.append(avatarEl, meta);
    div.append(head, msgEl, likeBtn);

    container.appendChild(div);
  });

  if (pendingScrollPostId && scrollToPost(pendingScrollPostId)) pendingScrollPostId = null;

  // подгружаем профили авторов и перерисовываем один раз, когда они появятся
  ensureProfiles(docs.map((d) => d.data().authorUid).filter(Boolean)).then((added) => {
    if (added && lastPostsSnapshot === snapshot) renderPosts(snapshot);
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

  const myNick = currentUserNickname ? currentUserNickname.toLowerCase() : null;

  textNodes.forEach((textNode) => {
    // внутри кода и ссылок ничего не размечаем
    if (textNode.parentElement && textNode.parentElement.closest('code, pre, a')) return;

    const text = textNode.textContent;
    TOKEN_RE.lastIndex = 0;
    if (!TOKEN_RE.test(text)) return;
    TOKEN_RE.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = TOKEN_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      if (match[1]) {
        // --- ссылка на пост #N ---
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
      } else {
        // --- упоминание @ник ---
        const raw = (match[2] || match[3]).trim();
        const nick = match[2] ? raw : raw.replace(/[.\-]+$/, '');
        const shownLength = match[2] ? match[0].length : 1 + nick.length;

        const span = document.createElement('span');
        span.className = 'mention' + (myNick && nick.toLowerCase() === myNick ? ' mention-me' : '');
        span.textContent = match[2] ? `@${nick}` : `@${nick}`;
        span.addEventListener('click', () => openProfileByNick(nick));
        fragment.appendChild(span);

        // вернуть в текст срезанные точки/дефисы на конце
        const consumedEnd = match.index + shownLength;
        if (consumedEnd < TOKEN_RE.lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(consumedEnd, TOKEN_RE.lastIndex)));
        }
      }

      lastIndex = TOKEN_RE.lastIndex;
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

  // гость не может писать под ником, который занят зарегистрированным пользователем
  if (!currentUserNickname) {
    try {
      const claimed = await getDoc(doc(db, 'usernames', nickname.toLowerCase()));
      if (claimed.exists()) {
        alert('Этот ник занят зарегистрированным пользователем. Выберите другой или войдите.');
        return;
      }
    } catch (err) {
      /* ник с недопустимыми для id символами — не занят, идём дальше */
    }
  }

  const originalContent = sendBtn.innerHTML;
  sendBtn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>';
  sendBtn.disabled = true;

  try {
    const postRef = await addDoc(postsRef, {
      topicId: currentTopicId,
      nickname: nickname.slice(0, 30),
      message: message.slice(0, 2000),
      createdAt: serverTimestamp(),
      likes: 0,
      ...(currentUserPhoto ? { photoURL: currentUserPhoto } : {}),
      ...(currentUserNickname ? { authorUid: currentUserId } : {})
    });
    messageInput.value = '';

    // уведомления отправляем отдельно: их сбой не должен ломать публикацию
    notifyRecipients(postRef.id, message.slice(0, 2000), nickname)
      .catch((err) => console.error('Не удалось отправить уведомления:', err));
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

  // ---------- Опроса ещё нет: форма создания ----------
  if (!snap.exists()) {
    // не затираем форму, если пользователь уже что-то вводит
    if (container.querySelector('#pollQuestion')) return;

    container.innerHTML = `
      <details class="wui-expander">
        <summary>
          <span>Создать опрос</span>
          <svg class="wui-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </summary>
        <div class="wui-expander-body">
          <label class="wui-field">
            <span>Вопрос</span>
            <input id="pollQuestion" maxlength="200">
          </label>
          <div id="pollOptionInputs">
            <label class="wui-field"><span>Вариант 1</span><input class="poll-option-input" maxlength="100"></label>
            <label class="wui-field"><span>Вариант 2</span><input class="poll-option-input" maxlength="100"></label>
          </div>
          <div class="wui-poll-actions">
            <button class="wui-btn" id="addPollOptionBtn" type="button">+ Вариант</button>
            <button class="wui-btn wui-btn-accent" id="createPollBtn" type="button">Создать опрос</button>
          </div>
        </div>
      </details>
    `;

    const addBtn = document.getElementById('addPollOptionBtn');
    addBtn.addEventListener('click', () => {
      const wrap = document.getElementById('pollOptionInputs');
      const count = wrap.querySelectorAll('.poll-option-input').length;
      if (count >= 6) return;
      wrap.insertAdjacentHTML('beforeend',
        `<label class="wui-field"><span>Вариант ${count + 1}</span><input class="poll-option-input" maxlength="100"></label>`);
      if (count + 1 >= 6) addBtn.disabled = true;
    });

    document.getElementById('createPollBtn').addEventListener('click', () => createPoll(topicId));
    return;
  }

  // ---------- Опрос есть ----------
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

  // запоминаем выбранный, но ещё не отправленный вариант (чтобы не сбросился)
  const prevChecked = containerNow.querySelector('input[name="pollOption"]:checked');
  const prevValue = prevChecked ? prevChecked.value : null;

  let bodyHtml;

  if (votedIndex === null) {
    // --- варианты друг под другом, как RadioButtons ---
    const radios = poll.options.map((opt, i) => `
      <label class="wui-radio">
        <input type="radio" name="pollOption" value="${i}">
        <span class="wui-radio-dot"></span>
        <span class="wui-radio-label">${escapeHtml(opt)}</span>
      </label>
    `).join('');

    bodyHtml = `
      <div class="wui-poll-options" role="radiogroup">${radios}</div>
      <div class="wui-poll-footer">
        <button class="wui-btn wui-btn-accent" id="pollVoteBtn" type="button" disabled>Проголосовать</button>
        <span class="wui-poll-total">Всего голосов: ${totalVotes}</span>
      </div>
    `;
  } else {
    // --- результаты: строки с ProgressBar ---
    const rows = poll.options.map((opt, i) => {
      const count = votes[i] || 0;
      const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      const isChosen = votedIndex === i;
      return `
        <div class="wui-poll-result ${isChosen ? 'chosen' : ''}">
          <div class="wui-poll-result-row">
            <span class="wui-poll-result-name">${escapeHtml(opt)}${isChosen ? ' ✓' : ''}</span>
            <span class="wui-poll-result-value">${percent}% · ${count}</span>
          </div>
          <div class="wui-progress"><div class="wui-progress-bar" style="width:${percent}%"></div></div>
        </div>
      `;
    }).join('');

    bodyHtml = `
      <div class="wui-poll-options">${rows}</div>
      <div class="wui-poll-footer">
        <span class="wui-poll-total">Всего голосов: ${totalVotes}</span>
      </div>
    `;
  }

  containerNow.innerHTML = `
    <div class="wui-poll">
      <div class="wui-poll-question">${escapeHtml(poll.question)}</div>
      ${bodyHtml}
    </div>
  `;

  if (votedIndex === null) {
    const voteBtn = containerNow.querySelector('#pollVoteBtn');
    const inputs = containerNow.querySelectorAll('input[name="pollOption"]');

    inputs.forEach((input) => {
      input.addEventListener('change', () => { voteBtn.disabled = false; });
      if (prevValue !== null && input.value === prevValue) {
        input.checked = true;
        voteBtn.disabled = false;
      }
    });

    voteBtn.addEventListener('click', () => {
      const selected = containerNow.querySelector('input[name="pollOption"]:checked');
      if (!selected) return;
      voteBtn.disabled = true;
      votePoll(topicId, Number(selected.value));
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
// Упоминания и уведомления
// ============================================================
async function notifyRecipients(postId, message, authorNick) {
  const recipients = new Map(); // uid получателя -> 'mention' | 'reply'
  const clean = message.replace(/```[\s\S]*?```|`[^`\n]*`/g, '');

  // --- упоминания @ник ---
  const nicks = extractMentions(message).slice(0, 5);
  const nickSnaps = await Promise.all(
    nicks.map((n) => getDoc(doc(db, 'usernames', n)).catch(() => null))
  );
  nickSnaps.forEach((s) => {
    if (s && s.exists()) recipients.set(s.data().uid, 'mention');
  });
      console.log('[mentions] найдено в тексте:', nicks, 'есть в usernames:', nickSnaps.map((s) => !!(s && s.exists())));

  // --- ответы #N (номер = позиция поста в теме) ---
  if (lastPostsSnapshot) {
    const docs = lastPostsSnapshot.docs;
    [...clean.matchAll(/#(\d+)/g)].slice(0, 5).forEach((m) => {
      const target = docs[Number(m[1]) - 1];
      const uid = target && target.data().authorUid;
      if (uid) recipients.set(uid, 'reply');
    });
  }

  recipients.delete(currentUserId); // себя не уведомляем
  const list = [...recipients].slice(0, 10);
  if (!list.length) return;

  const batch = writeBatch(db);
      console.log('[mentions] получатели:', list);
  list.forEach(([toUid, type]) => {
    batch.set(doc(db, 'notifications', `${postId}_${toUid}`), {
      type,
      toUid,
      fromUid: currentUserId,
      fromNickname: authorNick.slice(0, 30),
      fromPhoto: currentUserPhoto || null,
      topicId: currentTopicId,
      topicTitle: String(currentTopicTitle).slice(0, 100),
      postId,
      excerpt: message.replace(/\s+/g, ' ').slice(0, 140),
      createdAt: serverTimestamp(),
      read: false
    });
  });
  await batch.commit();
}

function startNotifications(uid) {
  if (notificationsUid === uid && unsubscribeNotifications) return;
  stopNotifications();

  notificationsUid = uid;
  notificationsLoaded = false;

  unsubscribeNotifications = onSnapshot(
    query(collection(db, 'notifications'), where('toUid', '==', uid)),
    (snap) => {
      notifications = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now();
          const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now();
          return tb - ta;
        })
        .slice(0, 30);

      if (notificationsLoaded) {
        snap.docChanges().forEach((ch) => {
          const n = ch.doc.data();
          if (ch.type === 'added' && !n.read) {
            showToast(`${n.fromNickname} ${n.type === 'reply' ? 'ответил(а) на ваше сообщение' : 'упомянул(а) вас'}`);
          }
        });
      }
      notificationsLoaded = true;
      renderNotifications();
    },
    (err) => console.error('Ошибка уведомлений:', err)
  );
}

function stopNotifications() {
  if (unsubscribeNotifications) unsubscribeNotifications();
  unsubscribeNotifications = null;
  notificationsUid = null;
  notifications = [];
  renderNotifications();
}

function renderNotifications() {
  const unread = notifications.filter((n) => !n.read).length;

  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.hidden = unread === 0;
  }

  const list = document.getElementById('notifList');
  if (!list) return;
  list.innerHTML = '';

  if (!notifications.length) {
    const empty = document.createElement('div');
    empty.className = 'notif-empty';
    empty.textContent = 'Пока нет уведомлений';
    list.appendChild(empty);
    return;
  }

  notifications.forEach((n) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'notif-item' + (n.read ? '' : ' unread');

    const body = document.createElement('div');
    body.className = 'notif-body';

    const title = document.createElement('div');
    title.className = 'notif-title';
    const action = n.type === 'reply' ? 'ответил(а) на ваше сообщение в' : 'упомянул(а) вас в';
    title.textContent = `${n.fromNickname} ${action} «${n.topicTitle}»`;

    const excerpt = document.createElement('div');
    excerpt.className = 'notif-excerpt';
    excerpt.textContent = n.excerpt;

    const time = document.createElement('div');
    time.className = 'notif-time';
    time.textContent = n.createdAt && n.createdAt.toDate
      ? n.createdAt.toDate().toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        })
      : 'только что';

    body.append(title, excerpt, time);
    item.append(createAvatar(n.fromNickname, n.fromPhoto, 32), body);
    item.addEventListener('click', () => openNotification(n));

    list.appendChild(item);
  });
}

function openNotification(n) {
  if (!n.read) {
    updateDoc(doc(db, 'notifications', n.id), { read: true })
      .catch((err) => console.error('Не удалось отметить прочитанным:', err));
  }

  const box = document.getElementById('headerUser');
  if (box) box.classList.remove('open', 'open-notif');

  if (currentTopicId === n.topicId) {
    if (!scrollToPost(n.postId)) pendingScrollPostId = n.postId;
  } else {
    pendingScrollPostId = n.postId;
    openTopic(n.topicId, n.topicTitle);
  }
}

async function markAllNotificationsRead() {
  const unread = notifications.filter((n) => !n.read);
  if (!unread.length) return;

  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
  try {
    await batch.commit();
  } catch (err) {
    console.error('Не удалось отметить прочитанными:', err);
  }
}

// ----- Подсказки ников при вводе @ -----
function setupMentionAutocomplete() {
  const textarea = document.getElementById('message');
  const popup = document.getElementById('mentionPopup');
  if (!textarea || !popup) return;

  let items = [];
  let active = 0;
  let token = null;
  let requestId = 0;

  const hide = () => {
    popup.hidden = true;
    popup.innerHTML = '';
    items = [];
    token = null;
  };

  const pick = (i) => {
    const nick = items[i];
    if (!nick || !token) return;
    const insert = (/\s/.test(nick) ? `@[${nick}]` : `@${nick}`) + ' ';
    const v = textarea.value;
    textarea.value = v.slice(0, token.start) + insert + v.slice(token.end);
    const pos = token.start + insert.length;
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
    hide();
  };

  const render = () => {
    popup.innerHTML = '';
    items.forEach((nick, i) => {
      const row = document.createElement('div');
      row.className = 'mention-item' + (i === active ? ' active' : '');
      const label = document.createElement('span');
      label.textContent = nick;
      row.append(createAvatar(nick, null, 22), label);
      row.addEventListener('mousedown', (e) => {
        e.preventDefault(); // не терять фокус textarea
        pick(i);
      });
      popup.appendChild(row);
    });
    popup.hidden = items.length === 0;
  };

  textarea.addEventListener('input', async () => {
    const caret = textarea.selectionStart;
    const before = textarea.value.slice(0, caret);

    const m =
      /(?<![\p{L}\p{N}_])@\[([^\]\n]{0,30})$/u.exec(before) ||
      /(?<![\p{L}\p{N}_])@([\p{L}\p{N}_.-]{0,30})$/u.exec(before);

    if (!m || m[1].length < 1) { hide(); return; }

    token = { start: m.index, end: caret };
    const prefix = m[1].toLowerCase();
    const myRequest = ++requestId;

    try {
      const snap = await getDocs(query(
        collection(db, 'usernames'),
        orderBy(documentId()),
        startAt(prefix),
        endAt(prefix + '\uf8ff'),
        limit(5)
      ));
      if (myRequest !== requestId) return; // пришёл устаревший ответ
      items = snap.docs.map((d) => d.data().nickname);
      active = 0;
      render();
    } catch (err) {
      console.error('Ошибка подсказок:', err);
      hide();
    }
  });

  textarea.addEventListener('keydown', (e) => {
    if (popup.hidden || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % items.length;
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + items.length) % items.length;
      render();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      hide();
    }
  });

  textarea.addEventListener('blur', hide);
}

// ============================================================
// Профили пользователей
// ============================================================

// Подгружает профили авторов; true — если что-то новое попало в кеш
async function ensureProfiles(uids) {
  const missing = [...new Set(uids)].filter((u) => u && !profileCache.has(u));
  if (!missing.length) return false;

  await Promise.all(missing.map(async (uid) => {
    try {
      const snap = await getDoc(doc(db, 'profiles', uid));
      profileCache.set(uid, snap.exists() ? snap.data() : null);
    } catch (err) {
      profileCache.set(uid, null);
    }
  }));
  return true;
}

// Свой профиль: создаём при первом входе, берём оттуда аватарку
async function loadOwnProfile(user) {
  try {
    await ensureProfiles([user.uid]);
    let prof = profileCache.get(user.uid);

    if (!prof) {
      prof = { bio: '', photoURL: user.photoURL || null };
      await setDoc(doc(db, 'profiles', user.uid), { ...prof, updatedAt: serverTimestamp() });
      profileCache.set(user.uid, prof);
    }

    const photo = prof.photoURL || user.photoURL || null;
    if (user.uid === currentUserId && photo !== currentUserPhoto) {
      currentUserPhoto = photo;
      renderAuthUI();
      if (lastPostsSnapshot) renderPosts(lastPostsSnapshot);
    }
  } catch (err) {
    console.error('Не удалось загрузить профиль:', err);
  }
}

async function openProfileByNick(nick) {
  try {
    const snap = await getDoc(doc(db, 'usernames', nick.toLowerCase()));
    if (snap.exists()) openProfile(snap.data().uid);
  } catch (err) {
    console.error('Не удалось открыть профиль:', err);
  }
}

function onProfileKey(e) {
  if (e.key === 'Escape') closeProfile();
}

function closeProfile() {
  if (!profileDialogEl) return;
  const el = profileDialogEl;
  profileDialogEl = null;
  document.removeEventListener('keydown', onProfileKey);
  el.classList.remove('open');
  setTimeout(() => el.remove(), 160);
}

async function openProfile(uid) {
  if (!uid || profileDialogEl) return;

  const overlay = document.createElement('div');
  overlay.className = 'wui-overlay';
  overlay.innerHTML = `
    <div class="wui-dialog" role="dialog" aria-modal="true" aria-labelledby="profTitle">
      <div class="wui-body" id="profBody">
        <div class="spinner-wrap"><div class="spinner"></div></div>
      </div>
      <div class="wui-footer">
        <button class="wui-btn" id="profClose" type="button">Закрыть</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  profileDialogEl = overlay;
  document.addEventListener('keydown', onProfileKey);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeProfile(); });
  overlay.querySelector('#profClose').addEventListener('click', closeProfile);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const [nameSnap, , agg] = await Promise.all([
    getDocs(query(collection(db, 'usernames'), where('uid', '==', uid), limit(1))),
    ensureProfiles([uid]),
    getAggregateFromServer(
      query(postsRef, where('authorUid', '==', uid)),
      { posts: count(), likes: sum('likes') }
    ).catch(() => null)
  ]);

  if (profileDialogEl !== overlay) return; // окно уже закрыли

  const nameData = nameSnap.empty ? null : nameSnap.docs[0].data();
  const nick = nameData ? nameData.nickname : 'Пользователь';
  const since = nameData && nameData.createdAt && nameData.createdAt.toDate
    ? nameData.createdAt.toDate().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const prof = profileCache.get(uid) || {};
  const stats = agg ? agg.data() : { posts: 0, likes: 0 };
  const isMe = uid === currentUserId;

  const body = overlay.querySelector('#profBody');
  body.innerHTML = `
    <div class="prof-head">
      <span id="profAvatarSlot"></span>
      <div class="prof-names">
        <h2 class="wui-title" id="profTitle"></h2>
        <div class="prof-since" id="profSince"></div>
      </div>
    </div>
    <div class="prof-stats">
      <div><b id="profPosts">0</b><span>сообщений</span></div>
      <div><b id="profLikes">0</b><span>лайков получено</span></div>
    </div>
    ${isMe ? `
      <label class="wui-field">
        <span>О себе</span>
        <textarea id="profBio" maxlength="200" rows="3"></textarea>
      </label>
      <label class="wui-field">
        <span>Ссылка на аватарку (https)</span>
        <input id="profPhoto" type="url" maxlength="500" placeholder="https://...">
      </label>
      <div class="prof-hint">Оставьте пустым, чтобы использовать фото Google или букву ника.</div>
      <div class="wui-error" id="profError" hidden></div>
    ` : `<div class="prof-bio" id="profBioView"></div>`}
  `;

  // динамические значения — только через textContent/value (без HTML)
  body.querySelector('#profTitle').textContent = nick;
  body.querySelector('#profSince').textContent = since ? `На форуме с ${since}` : '';
  body.querySelector('#profPosts').textContent = stats.posts || 0;
  body.querySelector('#profLikes').textContent = stats.likes || 0;

  const photo = prof.photoURL || (isMe ? currentUserPhoto : null);
  body.querySelector('#profAvatarSlot').replaceWith(createAvatar(nick, photo, 72));

  if (isMe) {
    body.querySelector('#profBio').value = prof.bio || '';
    const googlePhoto = auth.currentUser ? auth.currentUser.photoURL : null;
    body.querySelector('#profPhoto').value =
      prof.photoURL && prof.photoURL !== googlePhoto ? prof.photoURL : '';

    overlay.querySelector('.wui-footer').insertAdjacentHTML(
      'afterbegin',
      '<button class="wui-btn wui-btn-accent" id="profSave" type="button">Сохранить</button>'
    );
    overlay.querySelector('#profSave').addEventListener('click', () => saveProfile(overlay));
  } else {
    const bioEl = body.querySelector('#profBioView');
    if (prof.bio) {
      bioEl.textContent = prof.bio;
    } else {
      bioEl.textContent = 'Пока ничего не рассказал(а) о себе.';
      bioEl.classList.add('prof-bio-empty');
    }
  }
}

async function saveProfile(overlay) {
  const errBox = overlay.querySelector('#profError');
  errBox.hidden = true;

  const bio = overlay.querySelector('#profBio').value.trim().slice(0, 200);
  let photo = overlay.querySelector('#profPhoto').value.trim();

  if (photo && (!photo.startsWith('https://') || photo.length > 500)) {
    errBox.textContent = 'Ссылка на аватарку должна начинаться с https:// (до 500 символов)';
    errBox.hidden = false;
    return;
  }
  if (!photo) photo = (auth.currentUser && auth.currentUser.photoURL) || null;

  const saveBtn = overlay.querySelector('#profSave');
  saveBtn.disabled = true;

  try {
    await setDoc(doc(db, 'profiles', currentUserId), {
      bio,
      photoURL: photo,
      updatedAt: serverTimestamp()
    });
    profileCache.set(currentUserId, { bio, photoURL: photo });
    currentUserPhoto = photo;
    renderAuthUI();
    if (lastPostsSnapshot) renderPosts(lastPostsSnapshot);
    closeProfile();
  } catch (err) {
    console.error('Не удалось сохранить профиль:', err);
    errBox.textContent = 'Не удалось сохранить профиль';
    errBox.hidden = false;
    saveBtn.disabled = false;
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
