/**
 * music.js — background music controller + the floating play/pause button.
 *
 * Exposes `window.Wedding.music` with:
 *   unlock()     — MUST be called synchronously inside a user gesture (the "open" tap). Silently
 *                  starts-and-pauses the element so browsers that gate playback per element
 *                  (iOS/Safari, in-app browsers) will accept a later play() outside any gesture.
 *   play()       — starts the track. Safe outside a gesture once unlock() has run. If the browser
 *                  still blocks it, playback is retried on the guest's next tap anywhere on the page
 *                  (a tap on the music button itself is left to the button).
 *   pause()
 *   toggle()     — play ↔ pause (what the floating button does).
 *   showToggle() — reveals the floating button. Idempotent.
 *
 * The button (#music-toggle) stays hidden while the envelope is on screen. It appears when the intro
 * finishes ('wedding:intro-done'), straight away if the page has no intro, or after the same ~9 s
 * failsafe as css/intro.css if js/intro.js never ran. It is removed if the track cannot load, so a
 * guest never sees a control that does nothing.
 *
 * Notes
 * - The track has ~0.95 s of leading silence, so the first play starts at START_AT seconds.
 * - iOS Safari ignores `audio.volume` (read-only). The track fades in naturally, so no Web Audio
 *   routing is used (that would also mute playback when the page is opened from file://).
 * - Playback pauses while the tab is hidden and resumes when visible — only if it was playing
 *   (a guest who paused with the button stays paused).
 */
(function () {
    'use strict';

    const TAG = '🎵 [music]';
    const START_AT = 0.9;
    const TARGET_VOLUME = 0.6;
    const FAILSAFE_MS = 9500; // css/intro.css fades the overlay out at 9 s if intro.js never armed it

    const audio = document.getElementById('bg-music');
    const toggleBtn = document.getElementById('music-toggle');

    window.Wedding = window.Wedding || {};

    if (!audio) {
        console.error(`${TAG} ❌ <audio id="bg-music"> not found — music disabled.`);
        if (toggleBtn) toggleBtn.remove(); // never show a control that does nothing
        window.Wedding.music = { unlock() { }, play() { }, pause() { }, toggle() { }, showToggle() { } };
        return;
    }
    if (!toggleBtn) {
        console.warn(`${TAG} ⚠️ #music-toggle not found — music still plays, without an on-screen control.`);
    }

    let hasStarted = false;
    let isUnlocked = false;
    let pausedByVisibility = false;
    let retryArmed = false;
    let retryHandler = null;
    let toggleShown = false;

    audio.volume = TARGET_VOLUME;

    audio.addEventListener('error', () => {
        const code = audio.error ? audio.error.code : 'unknown';
        console.error(`${TAG} ❌ could not load ${audio.currentSrc || audio.src} (MediaError code ${code}). Check that assets/music.mp3 exists and is served as audio/mpeg. Hiding the music button.`);
        if (toggleBtn) toggleBtn.hidden = true;
    });
    audio.addEventListener('canplaythrough', () => console.info(`${TAG} ✅ buffered and ready`), { once: true });
    audio.addEventListener('play', () => syncButton(true));
    audio.addEventListener('pause', () => syncButton(false));

    /** Mirror the real playback state on the button (dancing bars, label, aria-pressed). */
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
            console.info(`${TAG} 🔓 unlocked by the guest's tap — will start when the card rises`);
        } catch (err) {
            audio.muted = false;
            console.warn(`${TAG} ⚠️ could not pre-unlock playback — will still try when the card rises:`, err);
        }
    }

    function disarmRetry() {
        if (!retryArmed) return;
        document.removeEventListener('pointerdown', retryHandler, true);
        document.removeEventListener('keydown', retryHandler, true);
        retryArmed = false;
        retryHandler = null;
    }

    /**
     * A blocked start is retried on the guest's next tap/keypress — except when that tap is on the
     * music button: the button then decides, otherwise "retry → play" and "toggle → pause" would
     * fire on the same tap and cancel each other out.
     */
    function retryOnNextGesture() {
        if (retryArmed) return;
        retryArmed = true;
        retryHandler = (event) => {
            const onButton = Boolean(toggleBtn && event.target instanceof Node && toggleBtn.contains(event.target));
            disarmRetry();
            if (onButton) {
                console.info(`${TAG} 👆 guest used the music button — leaving it to the button`);
                return;
            }
            console.info(`${TAG} 👆 retrying playback on the guest's tap`);
            play();
        };
        document.addEventListener('pointerdown', retryHandler, true);
        document.addEventListener('keydown', retryHandler, true);
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
                        console.warn(`${TAG} ⚠️ play() was blocked or interrupted: ${err.name} — ${err.message}. Will retry on the next tap (or the music button).`);
                        syncButton(false);
                        if (err.name === 'NotAllowedError') retryOnNextGesture();
                    });
            }
        } catch (err) {
            console.error(`${TAG} ❌ unexpected error starting playback:`, err);
            syncButton(false);
        }
    }

    function pause() {
        audio.pause();
        console.info(`${TAG} ⏸️ paused`);
    }

    /** The floating button: a guest's explicit choice always wins over the automatic resume/retry. */
    function toggle() {
        pausedByVisibility = false;
        if (audio.paused) {
            disarmRetry();
            console.info(`${TAG} 🎛️ guest pressed play`);
            play();
        } else {
            console.info(`${TAG} 🎛️ guest pressed pause`);
            pause();
        }
    }

    function showToggle() {
        if (toggleShown || !toggleBtn || audio.error) return;
        toggleShown = true;
        toggleBtn.hidden = false;
        // Two frames so the hidden → visible state is committed before the entrance transition runs.
        requestAnimationFrame(() => requestAnimationFrame(() => toggleBtn.classList.add('is-visible')));
        console.info(`${TAG} 🎛️ music button shown`);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggle);
        syncButton(!audio.paused);

        const intro = document.getElementById('intro');
        if (!intro) {
            showToggle();
        } else {
            document.addEventListener('wedding:intro-done', showToggle, { once: true });
            // intro.js never armed the overlay (script failed to load) → css fades it at ~9 s; show the button too.
            setTimeout(() => {
                if (!intro.classList.contains('is-armed')) {
                    console.warn(`${TAG} ⚠️ intro never started — showing the music button via failsafe.`);
                    showToggle();
                }
            }, FAILSAFE_MS);
        }
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
