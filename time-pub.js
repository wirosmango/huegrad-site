function updateRelativeTimes() {
    document.querySelectorAll('.pub-time').forEach(el => {
        const published = new Date(el.getAttribute('datetime'));
        const now = new Date();
        const diffMs = now - published;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        let text;
        if (diffMin < 1) {
            text = 'только что';
        } else if (diffMin < 60) {
            text = `${diffMin} мин. назад`;
        } else if (diffHour < 24) {
            text = `${diffHour} ч. назад`;
        } else {
            text = `${diffDay} дн. назад`;
        }

        el.textContent = text;
    });
}

updateRelativeTimes();
setInterval(updateRelativeTimes, 60000);