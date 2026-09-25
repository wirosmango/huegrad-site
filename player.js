(() => {
    const audio = document.getElementById('winuiAudio');
    const player = document.getElementById('winuiPlayer');
    const playlist = document.getElementById('winuiPlaylist');
    if (!audio || !player) return;

    const $ = id => document.getElementById(id);
    const play = $('winuiPlay');
    const prev = $('winuiPrev');
    const next = $('winuiNext');
    const back = $('winuiBack');
    const forward = $('winuiForward');
    const progress = $('winuiProgress');
    const volume = $('winuiVolume');
    const mute = $('winuiMute');
    const current = $('winuiCurrent');
    const duration = $('winuiDuration');
    const title = $('winuiTitle');
    const artist = $('winuiArtist');
    const cover = $('winuiCover');
    const fallback = $('winuiCoverFallback');
    const items = $('winuiPlaylistItems');
    const count = $('winuiPlaylistCount');
    const toggle = $('winuiPlaylistToggle');

    let tracks = [];
    let currentIndex = 0;
    let repeat = false;
    let shuffle = false;

    const formatTime = seconds => {
        if (!Number.isFinite(seconds)) return '0:00';
        return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
    };

    function renderPlaylist() {
        if (!items) return;
        items.innerHTML = '';

        tracks.forEach((track, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'winui-playlist-item' + (index === currentIndex ? ' is-current' : '');
            button.innerHTML = `
                <span class="winui-item-number">${index === currentIndex ? '▶' : String(index + 1).padStart(2, '0')}</span>
                <span class="winui-item-meta">
                    <span class="winui-item-title">${escapeHtml(track.title || 'Без названия')}</span>
                    <span class="winui-item-artist">${escapeHtml(track.artist || '')}</span>
                </span>
                <span class="winui-item-duration">${track.duration || ''}</span>`;
            button.addEventListener('click', () => loadTrack(index, true));
            items.appendChild(button);
        });

        if (count) count.textContent = `${tracks.length} ${tracks.length === 1 ? 'трек' : tracks.length < 5 ? 'трека' : 'треков'}`;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }

    function loadTrack(index, autoplay = false) {
        if (!tracks.length) return;
        currentIndex = (index + tracks.length) % tracks.length;
        const track = tracks[currentIndex];

        audio.src = track.audio;
        title.textContent = track.title || 'Без названия';
        artist.textContent = track.artist || '';
        duration.textContent = '0:00';
        current.textContent = '0:00';
        progress.value = 0;

        cover.onerror = () => {
            cover.style.display = 'none';
            fallback.style.display = 'flex';
        };
        cover.onload = () => {
            cover.style.display = 'block';
            fallback.style.display = 'none';
        };
        cover.src = track.cover || '';
        if (!track.cover) {
            cover.style.display = 'none';
            fallback.style.display = 'flex';
        }

        renderPlaylist();

        if (autoplay) audio.play().catch(() => {});
    }

    function updateProgress() {
        const percent = audio.duration ? audio.currentTime / audio.duration * 100 : 0;
        progress.value = percent;
        progress.style.setProperty('--progress', `${percent}%`);
        current.textContent = formatTime(audio.currentTime);
    }

    function updateVolume() {
        volume.style.setProperty('--volume', `${audio.volume * 100}%`);
        mute.classList.toggle('is-muted', audio.muted || audio.volume === 0);
    }

    function updatePlaying() {
        player.classList.toggle('is-playing', !audio.paused);
        play.setAttribute('aria-label', audio.paused ? 'Воспроизвести' : 'Пауза');
        play.title = audio.paused ? 'Воспроизвести' : 'Пауза';
        renderPlaylist();
    }

    function nextTrack() {
        if (!tracks.length) return;
        if (shuffle && tracks.length > 1) {
            let nextIndex;
            do nextIndex = Math.floor(Math.random() * tracks.length);
            while (nextIndex === currentIndex);
            loadTrack(nextIndex, true);
        } else {
            loadTrack(currentIndex + 1, true);
        }
    }

    play.addEventListener('click', () => audio.paused ? audio.play().catch(() => {}) : audio.pause());
    prev.addEventListener('click', () => {
        if (audio.currentTime > 3) audio.currentTime = 0;
        else loadTrack(currentIndex - 1, true);
    });
    next.addEventListener('click', nextTrack);
    back.addEventListener('click', () => audio.currentTime = Math.max(0, audio.currentTime - 10));
    forward.addEventListener('click', () => audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10));

    progress.addEventListener('input', () => {
        if (audio.duration) audio.currentTime = Number(progress.value) / 100 * audio.duration;
        updateProgress();
    });

    volume.addEventListener('input', () => {
        audio.volume = Number(volume.value);
        audio.muted = audio.volume === 0;
        updateVolume();
    });

    mute.addEventListener('click', () => {
        audio.muted = !audio.muted;
        updateVolume();
    });

    audio.addEventListener('loadedmetadata', () => {
        duration.textContent = formatTime(audio.duration);
        updateProgress();
    });
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('play', updatePlaying);
    audio.addEventListener('pause', updatePlaying);
    audio.addEventListener('ended', () => {
        if (repeat) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } else if (currentIndex < tracks.length - 1 || shuffle) {
            nextTrack();
        } else {
            updatePlaying();
        }
    });

    toggle?.addEventListener('click', () => {
        playlist.classList.toggle('is-collapsed');
        toggle.textContent = playlist.classList.contains('is-collapsed') ? '⌄' : '⌃';
    });

    async function loadTracks() {
        // When hosted normally, tracks.json remains the main editable source.
        // When opened directly as file://, browsers block fetch() for JSON;
        // in that case tracks.js provides the same data without a server.
        try {
            const response = await fetch('tracks.json', { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length) return data;
            }
        } catch (_) {}

        if (Array.isArray(window.HUEGRAD_TRACKS) && window.HUEGRAD_TRACKS.length) {
            return window.HUEGRAD_TRACKS;
        }

        return [{
            title: 'Гимн Хуеграда',
            artist: 'Huegrad FM',
            audio: 'gimn.mp3',
            cover: 'covers/gimn.jpg'
        }];
    }

    async function init() {
        tracks = await loadTracks();
        audio.volume = 1;
        updateVolume();
        loadTrack(0, false);

        // Glide was previously only loaded from the CDN but never initialized.
        // Initialize it here after the DOM is ready and keep it isolated from the player.
        if (window.Glide) {
            document.querySelectorAll('.glide').forEach(element => {
                if (!element.dataset.glideInitialized) {
                    new Glide(element, {
                        type: 'carousel',
                        perView: 1,
                        gap: 12,
                        autoplay: 5000,
                        hoverpause: true,
                        animationDuration: 450
                    }).mount();
                    element.dataset.glideInitialized = 'true';
                }
            });
        }
    }

    init();
})();
