/**
 * music.js — background music controller.
 *
 * Exposes `window.Wedding.music` with:
 *   unlock()  — MUST be called synchronously inside a user gesture (the "open" tap). Silently
 *               starts-and-pauses the element so browsers that gate playback per element
 *               (iOS/Safari, in-app browsers) will accept a later play() outside any gesture.
 *   play()    — starts the track. Safe outside a gesture once unlock() has run; if it is ever
 *               called first, it still works when invoked inside a gesture.
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
        window.Wedding.music = { unlock() { }, play() { }, pause() { }, toggle() { }, showToggle() { } };
        return;
    }

    let hasStarted = false;
    let isUnlocked = false;
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

    /**
     * Pre-authorise playback from inside a user gesture without making a sound.
     * play() + pause() in the same tick never outputs audio (and the element is muted for the
     * duration as belt-and-braces); the play promise rejects with AbortError, which is expected.
     */
    function unlock() {
        if (isUnlocked) return;
        try {
            audio.muted = true;
            const attempt = audio.play();
            audio.pause();
            audio.muted = false;
            if (attempt && typeof attempt.catch === 'function') {
                attempt.catch(() => { /* AbortError: interrupted by the pause() above — intended */ });
            }
            isUnlocked = true;
            console.info(`${TAG} 🔓 unlocked by the guest's tap — will start when the invitation is revealed`);
        } catch (err) {
            audio.muted = false;
            console.warn(`${TAG} ⚠️ could not pre-unlock playback — will still try when revealed:`, err);
        }
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

    window.Wedding.music = { unlock, play, pause, toggle, showToggle };
    console.info(`${TAG} ✅ controller ready`);
})();
