/*
  oneko.js — кот, бегающий за курсором.
  Просто подключи этот файл на странице:
    <script src="oneko.js"></script>
  Никаких зависимостей не требуется — спрайт рисуется на canvas,
  внешние картинки не нужны.
*/
(function () {
  "use strict";

  // ---- Настройки ----
  const SPEED = 10;          // скорость кота (px/кадр)
  const SPRITE_SIZE = 32;    // размер кота на экране (px)
  const IDLE_DISTANCE = 48;  // если курсор ближе — кот "сидит"

  // ---- Создаём canvas-элемент кота ----
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  canvas.style.position = "fixed";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "999999";
  canvas.style.left = "0px";
  canvas.style.top = "0px";
  canvas.style.imageRendering = "pixelated";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let catX = window.innerWidth / 2;
  let catY = window.innerHeight / 2;
  let mouseX = catX;
  let mouseY = catY;
  let frame = 0;
  let facing = "down";

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Простая пиксельная "мордочка" кота, рисуется кодом (без картинок).
  function drawCat(state) {
    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    ctx.fillStyle = "#e0a96d"; // рыжий кот
    // тело
    ctx.beginPath();
    ctx.ellipse(16, 20, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // голова
    ctx.beginPath();
    ctx.arc(16, 12, 8, 0, Math.PI * 2);
    ctx.fill();
    // уши
    ctx.beginPath();
    ctx.moveTo(9, 7); ctx.lineTo(11, 1); ctx.lineTo(14, 7);
    ctx.moveTo(23, 7); ctx.lineTo(21, 1); ctx.lineTo(18, 7);
    ctx.fill();
    // глаза
    ctx.fillStyle = "#000";
    const blink = state === "idle" && frame % 60 > 55;
    if (!blink) {
      ctx.fillRect(12, 11, 2, 2);
      ctx.fillRect(18, 11, 2, 2);
    } else {
      ctx.fillRect(12, 12, 2, 1);
      ctx.fillRect(18, 12, 2, 1);
    }
    // хвост — качается при ходьбе
    ctx.strokeStyle = "#e0a96d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    const tailSwing = state === "walk" ? Math.sin(frame / 4) * 4 : 2;
    ctx.moveTo(24, 22);
    ctx.quadraticCurveTo(30, 20 + tailSwing, 28, 12 + tailSwing);
    ctx.stroke();
  }

  function loop() {
    const dx = mouseX - catX;
    const dy = mouseY - catY;
    const dist = Math.hypot(dx, dy);

    let state = "idle";
    if (dist > IDLE_DISTANCE) {
      state = "walk";
      const angle = Math.atan2(dy, dx);
      catX += Math.cos(angle) * Math.min(SPEED, dist);
      catY += Math.sin(angle) * Math.min(SPEED, dist);
      facing = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? "right" : "left")
        : (dy > 0 ? "down" : "up");
    }

    canvas.style.left = (catX - SPRITE_SIZE / 2) + "px";
    canvas.style.top = (catY - SPRITE_SIZE / 2) + "px";
    canvas.style.transform = facing === "left" ? "scaleX(-1)" : "scaleX(1)";

    frame++;
    drawCat(state);
    requestAnimationFrame(loop);
  }

  loop();
})();