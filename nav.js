document.addEventListener('DOMContentLoaded', () => {
  // --- Логика меню (без изменений) ---
  const navView = document.getElementById('navView');
  const navToggle = document.getElementById('navToggle');
  const navBackdrop = document.getElementById('navBackdrop');
  const titleBar = document.getElementById('titleBar');
  const mainContent = document.getElementById('mainContent');

  function openNav() {
    if (!navView) return;
    navView.classList.add('expanded');
    if (navBackdrop) navBackdrop.classList.add('active');
    if (titleBar) titleBar.classList.add('expanded');
    if (mainContent) mainContent.classList.add('expanded');
  }

  function closeNav() {
    if (!navView) return;
    navView.classList.remove('expanded');
    if (navBackdrop) navBackdrop.classList.remove('active');
    if (titleBar) titleBar.classList.remove('expanded');
    if (mainContent) mainContent.classList.remove('expanded');
  }

  function toggleNav() {
    if (navView && navView.classList.contains('expanded')) {
      closeNav();
    } else {
      openNav();
    }
  }

  if (navToggle) navToggle.addEventListener('click', toggleNav);
  if (navBackdrop) navBackdrop.addEventListener('click', closeNav);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });

  const currentPage = document.body.getAttribute('data-page');
  if (currentPage) {
    const activeItem = document.querySelector('.nav-view-item[data-page="' + currentPage + '"]');
    if (activeItem) activeItem.classList.add('active');
  }

  // --- Инициализация Glide (только один раз, без вложенности) ---
  if (typeof Glide !== 'undefined') {
    const glideHistoryEl = document.getElementById('glide-history');
    if (glideHistoryEl) {
      new Glide(glideHistoryEl, {
        type: 'slider',
        perView: 1,
        gap: 10,
        autoplay: false,
        keyboard: true,
        dragThreshold: 2
      }).mount();
    }

    const glideNazvaEl = document.getElementById('glide-nazva');
    if (glideNazvaEl) {
      new Glide(glideNazvaEl, {
        type: 'slider',
        perView: 1,
        gap: 10,
        autoplay: false,
        keyboard: true,
        dragThreshold: 2
      }).mount();
    }

    console.log('Слайдеры успешно инициализированы');
  } else {
    console.warn('Glide не загружен. Проверь подключение glide.min.js перед nav.js');
  }
});
