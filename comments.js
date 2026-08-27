// 1. Импорты
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
   collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify/dist/purify.es.mjs";

// 2. Конфиг
const firebaseConfig = {
  apiKey: "AIzaSyCL4Uhe4MYa5_JUid5iCQS7P5pjnGz0-o8",
  authDomain: "forum-huegrad.firebaseapp.com",
  projectId: "forum-huegrad",
  storageBucket: "forum-huegrad.firebasestorage.app",
  messagingSenderId: "1047773676356",
  appId: "1:1047773676356:web:7e050aeba59ddbc4818d11"
};

import { db } from "./firebase-config.js";

export function initComments(newsId, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h3>Комментарии</h3>
    <div class="post">
        <input type="text" id="comment-nickname" placeholder="Ваш никнейм" maxlength="10">
        <div class="input-wrapper">
            <textarea id="comment-text" placeholder="Напишите комментарий (поддерживается Markdown)" maxlength="500"></textarea>
            <button id="comment-send-btn" class="send-btn" aria-label="Отправить">
                <svg xmlns="http://www.w3.org/2000/svg"
                    width="18" 
                    height="18" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    stroke-width="2" 
                    stroke-linecap="round" 
                    stroke-linejoin="round">
                    <path d="m3 3 3 9-3 9 19-9Z"/>
                    <path d="M6 12h16"/>
                </svg>
            </button>
        </div>
    </div>
    <div id="comments-list"></div>
  `;

  const list = container.querySelector("#comments-list");
  const nicknameInput = container.querySelector("#comment-nickname");
  const textInput = container.querySelector("#comment-text");
  const sendBtn = container.querySelector("#comment-send-btn");

  const q = query(
    collection(db, "comments"),
    where("newsId", "==", newsId),
    orderBy("createdAt")
  );

  onSnapshot(q, (snapshot) => {
    list.innerHTML = "";
    snapshot.forEach((doc) => {
      const data = doc.data();
      const div = document.createElement("div");
      div.className = "post";
      const safeHtml = DOMPurify.sanitize(marked.parse(data.text));
      div.innerHTML = `<b>${escapeHtml(data.nickname || "Аноним")}</b>: <div class="md-content">${safeHtml}</div>`;
      list.appendChild(div);
    });
  });

  sendBtn.addEventListener("click", async () => {
    const nickname = nicknameInput.value.trim() || "Аноним";
    const text = textInput.value.trim();
    if (!text) return;

    sendBtn.disabled = true;
    try {
      await addDoc(collection(db, "comments"), {
        newsId,
        nickname,
        text,
        createdAt: serverTimestamp()
      });
      textInput.value = "";
    } catch (e) {
      console.error(e);
      alert("Не удалось отправить комментарий");
    } finally {
      sendBtn.disabled = false;
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}