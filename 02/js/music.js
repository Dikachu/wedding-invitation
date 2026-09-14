/**
 * music.js — background music controller.
 *
 * Exposes `window.Wedding.music` with:
 *   play()    — MUST be called synchronously inside a user gesture the first time (autoplay policy).
 *   pause()
 *   toggle()
 *   showToggle() — reveals the floating play/pause button.
 *
 * Notes
 * - The track has ~0.95 s of leading silence, so the first play starts at START_AT seconds.
 * - iOS Safari ignores `audio.volume` (read-only). The track fades in naturally, so no Web Audio
 *   routing is used (that would also mute playback when the page is opened from file://).
 * - Playback pauses while the tab is hidden and resumes when visible, if it was playing.
 */
(function () {
    'use strict';

    const TAG = '🎵 [music]';
    const START_AT = 0.9;
    const TARGET_VOLUME = 0.6;

    const audio = document.getElementById('bg-music');
    const toggleBtn = document.getElementById('music-toggle');

    window.Wedding = window.Wedding || {};

    if (!audio) {
        console.error(`${TAG} ❌ <audio id="bg-music"> not found — music disabled.`);
        window.Wedding.music = { play() { }, pause() { }, toggle() { }, showToggle() { } };
        return;
    }

    let hasStarted = false;
    let pausedByVisibility = false;

    audio.volume = TARGET_VOLUME;

    audio.addEventListener('error', () => {
        const code = audio.error ? audio.error.code : 'unknown';
        console.error(`${TAG} ❌ could not load ${audio.currentSrc || audio.src} (MediaError code ${code}). Check that assets/music.mp3 exists and is served as audio/mpeg.`);
        if (toggleBtn) toggleBtn.hidden = true;
    });
    audio.addEventListener('canplaythrough', () => console.info(`${TAG} ✅ buffered and ready`), { once: true });
    audio.addEventListener('play', () => syncButton(true));
    audio.addEventListener('pause', () => syncButton(false));

    function syncButton(isPlaying) {
        if (!toggleBtn) return;
        toggleBtn.classList.toggle('is-playing', isPlaying);
        toggleBtn.setAttribute('aria-pressed', String(isPlaying));
        toggleBtn.setAttribute('aria-label', isPlaying ? 'Pause music' : 'Play music');
    }

    function play() {
        try {
            if (!hasStarted) {
                // Skip the silent lead-in on the very first play only.
                if (audio.readyState >= 1) audio.currentTime = START_AT;
                else audio.addEventListener('loadedmetadata', () => { audio.currentTime = START_AT; }, { once: true });
                hasStarted = true;
            }
            const attempt = audio.play();
            if (attempt && typeof attempt.catch === 'function') {
                attempt
                    .then(() => console.info(`${TAG} ▶️ playing`))
                    .catch((err) => {
                        // NotAllowedError = called outside a user gesture; AbortError = interrupted by pause().
                        console.warn(`${TAG} ⚠️ play() was blocked or interrupted: ${err.name} — ${err.message}. The guest can start it with the music button.`);
                        syncButton(false);
                    });
            }
        } catch (err) {
            console.error(`${TAG} ❌ unexpected error starting playback:`, err);
        }
    }

    function pause() {
        audio.pause();
        console.info(`${TAG} ⏸️ paused`);
    }

    function toggle() {
        if (audio.paused) play();
        else pause();
    }

    function showToggle() {
        if (!toggleBtn || audio.error) return;
        toggleBtn.hidden = false;
        // Next frame so the transition runs after display changes.
        requestAnimationFrame(() => toggleBtn.classList.add('is-visible'));
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            pausedByVisibility = false;
            toggle();
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && !audio.paused) {
            pausedByVisibility = true;
            audio.pause();
            console.info(`${TAG} 💤 tab hidden — paused`);
        } else if (!document.hidden && pausedByVisibility) {
            pausedByVisibility = false;
            play();
        }
    });

    window.Wedding.music = { play, pause, toggle, showToggle };
    console.info(`${TAG} ✅ controller ready`);
})();
