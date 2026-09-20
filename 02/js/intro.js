/**
 * intro.js — the envelope opening experience.
 *
 * Flow:  loading → ready (tap to open) → opening timeline → reveal site → cleanup (overlay removed)
 *
 * Timeline (ms after the tap)                         what happens
 *   0      seal pressed (scale)                        music is silently unlocked (same gesture → autoplay-safe)
 *   260    gold crack glints across the seal           spark burst + tiny haptic tick
 *   640    bottom half of the seal drops away
 *   700    flap opens: outer face 0→90°, liner −90→0°  gold dust pours from the opening
 *   850    envelope slides down (full size kept) to make room above it for the card
 *   1800   card rises out of the pocket (slow)
 *   3150   light sheen sweeps the card
 *   3900   camera pushes into the card (slow)
 *   4550   warm bloom fills the screen
 *   5200   site hero entrance starts underneath, petals fall
 *   5400   overlay fades out — the home page appears, MUSIC STARTS here
 *   6350   overlay removed, scroll unlocked
 *
 * Robustness: every step is wrapped; any error jumps straight to the site. "Skip animation" and
 * prefers-reduced-motion use a short crossfade. If this file never runs, css/intro.css fades the
 * overlay out on its own after 9 s.
 */
(function () {
    'use strict';

    const TAG = '✉️ [intro]';
    const FONT_TIMEOUT_MS = 2800;

    /* While it opens the envelope keeps its full (screen-covering) size and only slides down until
       its top edge sits this far down the viewport — that gap is what the card rises into. */
    const ENVELOPE_TOP = 0.26;
    /* Card insert geometry as fractions of the envelope height (mirrors .envelope__card in intro.css)
       and the range it may rise out of the pocket by (fraction of its own height). */
    const CARD = { top: 0.04, height: 0.88, minRise: 0.12, maxRise: 0.5 };
    /* The risen card's top edge lands here (fraction of the viewport height). */
    const FRAME_TOP = 0.04;

    const T = {
        crack: 260,
        split: 640,
        flap: 700,
        flapDur: 1300,
        camera: 850,
        rise: 1800,
        riseDur: 1900,
        sheen: 3150,
        push: 3900,
        pushDur: 1800,
        bloom: 4550,
        bloomDur: 1000,
        reveal: 5200,
        fade: 5400,
        fadeDur: 900,
        cleanup: 6350,
    };

    const Wedding = window.Wedding || (window.Wedding = {});
    const intro = document.getElementById('intro');
    const main = document.getElementById('main');
    const htmlEl = document.documentElement;

    const music = () => Wedding.music || { unlock() { }, play() { }, showToggle() { } };
    const fx = () => Wedding.fx || { burst() { }, emit() { }, ambient() { }, stop() { } };
    const enterHero = () => (Wedding.site ? Wedding.site.enterHero() : undefined);

    if (!intro) {
        console.info(`${TAG} no intro on this page — skipping.`);
        return;
    }

    /* ---------------- Element lookup ---------------- */
    const byId = (id) => document.getElementById(id);
    const els = {
        scene: byId('intro-scene'),
        envelope: byId('envelope'),
        flap: byId('envelope-flap'),
        liner: byId('envelope-liner'),
        linerShade: byId('envelope-liner-shade'),
        card: byId('envelope-card'),
        cardSheen: byId('envelope-card-sheen'),
        sealTop: byId('seal-top'),
        sealBottom: byId('seal-bottom'),
        crack: document.querySelector('#seal-crack polyline'),
        openBtn: byId('intro-open'),
        openLabel: byId('intro-open-label'),
        skipBtn: byId('intro-skip'),
        bloom: byId('intro-bloom'),
    };

    const missing = Object.keys(els).filter((key) => !els[key]);
    if (missing.length) {
        console.error(`${TAG} ❌ intro markup incomplete (missing: ${missing.join(', ')}). Removing the intro so guests still see the invitation.`);
        intro.remove();
        enterHero();
        return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canAnimate = typeof Element.prototype.animate === 'function';

    let state = 'loading'; // loading | ready | opening | done
    let musicStarted = false;
    const timers = [];
    const running = [];

    /* ---------------- Helpers ---------------- */
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function at(ms, label, fn) {
        timers.push(setTimeout(() => {
            if (state === 'done') return;
            try {
                fn();
            } catch (err) {
                console.error(`${TAG} ❌ step "${label}" failed — jumping to the invitation.`, err);
                finish();
            }
        }, ms));
    }

    function animate(el, keyframes, options) {
        const animation = el.animate(keyframes, Object.assign({ fill: 'forwards' }, options));
        running.push(animation);
        return animation;
    }

    function setThemeColor(color) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', color);
    }

    function setInert(el, value) {
        if (!el) return;
        if ('inert' in el) el.inert = value;
        else if (value) el.setAttribute('inert', '');
        else el.removeAttribute('inert');
    }

    /* ---------------- Lifecycle ---------------- */
    function arm() {
        intro.classList.add('is-armed'); // cancels the CSS failsafe fade
        htmlEl.classList.add('is-locked');
        setInert(main, true);
        console.info(`${TAG} 🔒 armed (reduced motion: ${reducedMotion}, WAAPI: ${canAnimate})`);
    }

    async function waitForFonts() {
        if (!document.fonts || typeof document.fonts.load !== 'function') return 'unsupported';
        const loads = ['400 1em "Great Vibes"', '600 1em Cinzel', '700 1em Cinzel', '400 1em "EB Garamond"']
            .map((font) => document.fonts.load(font));
        const result = await Promise.race([
            Promise.allSettled(loads).then(() => 'loaded'),
            delay(FONT_TIMEOUT_MS).then(() => 'timeout'),
        ]);
        return result;
    }

    async function prepare() {
        try {
            const fonts = await waitForFonts();
            if (fonts === 'timeout') console.warn(`${TAG} ⚠️ fonts still loading after ${FONT_TIMEOUT_MS}ms — continuing with fallbacks.`);
            else console.info(`${TAG} 🔤 fonts ${fonts}`);
        } catch (err) {
            console.warn(`${TAG} ⚠️ font readiness check failed — continuing.`, err);
        }
        markReady();
    }

    function markReady() {
        if (state !== 'loading') return;
        state = 'ready';
        intro.classList.add('is-ready');
        els.openBtn.disabled = false;
        els.openLabel.textContent = 'Tap to open';
        els.openBtn.setAttribute('aria-label', 'Open the invitation');
        try {
            els.openBtn.focus({ preventScroll: true });
        } catch (err) {
            /* focus options unsupported — harmless */
        }
        fx().ambient(true);
        console.info(`${TAG} ✅ ready — waiting for the guest to open`);
    }

    function open(mode) {
        if (state !== 'ready') return;
        state = 'opening';

        // Must stay synchronous inside the gesture for iOS/Chrome autoplay rules. Nothing is heard
        // yet — the music itself starts when the home page appears (startMusic at T.fade).
        music().unlock();

        intro.classList.add('is-opening');
        els.openBtn.disabled = true;
        console.info(`${TAG} 💌 opening (${mode})`);

        if (mode === 'skip' || reducedMotion || !canAnimate) {
            quickReveal();
            return;
        }

        try {
            runTimeline();
        } catch (err) {
            console.error(`${TAG} ❌ timeline could not start — revealing the invitation directly.`, err);
            quickReveal();
        }
    }

    function sealCentre() {
        const r = els.sealBottom.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    /**
     * How the scene moves while the envelope opens: the envelope keeps its size and slides down so
     * its top edge sits at ENVELOPE_TOP, and the card rises just far enough for its top edge to
     * reach FRAME_TOP — so the names on the card are on screen whatever the screen size.
     * Uses layout sizes, not transformed rects, so a tap mid-entrance still measures the resting box.
     */
    function cameraTarget() {
        const viewH = window.innerHeight;
        const scene = els.scene.getBoundingClientRect();
        const envH = els.envelope.offsetHeight;
        const restingTop = scene.top + (scene.height - envH) / 2; // the envelope is centred in the scene

        const shift = Math.round(ENVELOPE_TOP * viewH - restingTop);
        const openedTop = restingTop + shift;
        // Card top after rising = openedTop + (CARD.top − CARD.height·rise)·envH; solve for FRAME_TOP·viewH
        const wanted = (CARD.top - (FRAME_TOP * viewH - openedTop) / envH) / CARD.height;
        const rise = Math.min(CARD.maxRise, Math.max(CARD.minRise, wanted));

        console.info(`${TAG} 🎥 envelope slides down ${shift}px, card rises ${(rise * 100).toFixed(0)}% of its height (envelope ${envH}px in ${viewH}px)`);
        return { shift, rise };
    }

    function runTimeline() {
        const flapTiming = { delay: T.flap, duration: T.flapDur, easing: 'cubic-bezier(.6, 0, .35, 1)' };
        const riseTiming = { delay: T.rise, duration: T.riseDur, easing: 'cubic-bezier(.22, 1, .36, 1)' };
        // The envelope settles at the same moment the card finishes rising.
        const cameraTiming = { delay: T.camera, duration: T.rise + T.riseDur - T.camera, easing: 'cubic-bezier(.33, 1, .68, 1)' };

        // 0 — press the seal (individual `scale` so later `translate/rotate` animations don't clash)
        [els.sealTop, els.sealBottom].forEach((el) => animate(el, [
            { scale: '1' }, { scale: '.93', offset: 0.35 }, { scale: '1.02', offset: 0.75 }, { scale: '1' },
        ], { duration: 520, easing: 'ease-out' }));

        // 1 — crack glint
        animate(els.crack, [
            { strokeDashoffset: 1, opacity: 0 },
            { strokeDashoffset: 0, opacity: 1, offset: 0.65 },
            { strokeDashoffset: 0, opacity: 0 },
        ], { delay: T.crack, duration: 760, easing: 'ease-out' });

        at(T.crack + 220, 'crack-burst', () => {
            const c = sealCentre();
            fx().burst({ x: c.x, y: c.y, count: 34, type: 'spark' });
            fx().burst({ x: c.x, y: c.y, count: 14, type: 'dust' });
            if (navigator.vibrate) navigator.vibrate(16);
        });

        // 2 — bottom half of the seal falls away
        animate(els.sealBottom, [
            { translate: '0 0', rotate: '0deg', opacity: 1 },
            { translate: '0 18%', rotate: '-10deg', opacity: 0 },
        ], { delay: T.split, duration: 900, easing: 'cubic-bezier(.55, 0, .75, .3)' });

        // 3 — flap: outer face to edge-on, then the liner face continues the same motion
        animate(els.flap, [
            { transform: 'perspective(1200px) rotateX(0deg)', opacity: 1 },
            { transform: 'perspective(1200px) rotateX(90deg)', opacity: 1, offset: 0.5 },
            { transform: 'perspective(1200px) rotateX(90deg)', opacity: 0, offset: 0.5001 },
            { transform: 'perspective(1200px) rotateX(90deg)', opacity: 0 },
        ], flapTiming);
        animate(els.liner, [
            { transform: 'perspective(1200px) rotateX(-90deg)', opacity: 0 },
            { transform: 'perspective(1200px) rotateX(-90deg)', opacity: 0, offset: 0.5 },
            { transform: 'perspective(1200px) rotateX(-90deg)', opacity: 1, offset: 0.5001 },
            { transform: 'perspective(1200px) rotateX(0deg)', opacity: 1 },
        ], flapTiming);
        animate(els.linerShade, [
            { opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 },
        ], flapTiming);

        at(T.flap + 380, 'dust-pour', () => {
            const r = els.envelope.getBoundingClientRect();
            fx().emit({ x: r.left + r.width * 0.2, y: r.top - r.height * 0.05, width: r.width * 0.6, height: r.height * 0.3, rate: 48, duration: 1500, type: 'dust' });
        });

        // 4 — the envelope slides down (same size, still full width) while the flap opens,
        //     making room above it for the card
        const camera = cameraTarget();
        animate(els.envelope, [
            { translate: '0 0' },
            { translate: `0 ${Math.round(camera.shift * 0.46)}px`, offset: 0.45 },
            { translate: `0 ${camera.shift}px` },
        ], cameraTiming);

        // ...and the card rises out of the pocket
        animate(els.card, [{ transform: 'translateY(0)' }, { transform: `translateY(${(-camera.rise * 100).toFixed(1)}%)` }], riseTiming);

        // 5 — sheen across the card
        animate(els.cardSheen, [{ transform: 'translateX(-130%)' }, { transform: 'translateX(130%)' }],
            { delay: T.sheen, duration: 1000, easing: 'ease-in-out' });

        // 6 — push into the card + bloom
        at(T.push, 'push-in', () => {
            const sceneRect = els.scene.getBoundingClientRect();
            const cardRect = els.card.getBoundingClientRect();
            const focusX = cardRect.left + cardRect.width / 2;
            const focusY = cardRect.top + cardRect.height * 0.28;

            els.scene.style.transformOrigin = `${focusX - sceneRect.left}px ${focusY - sceneRect.top}px`;
            els.bloom.style.setProperty('--bloom-x', `${focusX}px`);
            els.bloom.style.setProperty('--bloom-y', `${focusY}px`);

            const scale = Math.max(window.innerWidth / cardRect.width, window.innerHeight / (cardRect.height * 0.55)) * 1.25;
            animate(els.scene, [{ transform: 'scale(1)' }, { transform: `scale(${scale.toFixed(2)})` }],
                { duration: T.pushDur, easing: 'cubic-bezier(.7, 0, .2, 1)' });
            fx().ambient(false);
        });
        animate(els.bloom, [{ opacity: 0 }, { opacity: 1 }], { delay: T.bloom, duration: T.bloomDur, easing: 'cubic-bezier(.4, 0, .2, 1)' });

        // 7 — reveal the site underneath, then fade the overlay
        at(T.reveal, 'reveal', () => {
            reveal();
            fx().emit({ x: 0, y: -24, width: window.innerWidth, height: 8, rate: window.innerWidth < 600 ? 9 : 16, duration: 1800, type: 'petal' });
            fx().burst({ x: window.innerWidth / 2, y: window.innerHeight * 0.42, count: 26, type: 'dust' });
        });

        // 8 — the overlay fades and the home page comes through: this is when the music starts
        at(T.fade, 'fade', () => {
            intro.classList.add('is-closing');
            startMusic();
        });
        animate(intro, [{ opacity: 1 }, { opacity: 0 }], { delay: T.fade, duration: T.fadeDur, easing: 'ease' });

        at(T.cleanup, 'cleanup', finish);
    }

    /** Short, motion-light path for "Skip animation", reduced motion, or missing WAAPI. */
    function quickReveal() {
        timers.forEach(clearTimeout);
        timers.length = 0;
        fx().ambient(false);
        reveal();
        startMusic(); // still inside the tap for the skip path, so it plays even without unlock()

        if (canAnimate) {
            const fade = intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion ? 350 : 650, easing: 'ease', fill: 'forwards' });
            fade.finished.then(finish).catch(finish);
        } else {
            finish();
        }
    }

    function reveal() {
        setThemeColor('#F7EEE8');
        enterHero();
        music().showToggle();
    }

    /** Starts the track once, the moment the guest lands on the home page. */
    function startMusic() {
        if (musicStarted) return;
        musicStarted = true;
        console.info(`${TAG} 🎵 home page in view — starting the music`);
        music().play();
    }

    function finish() {
        if (state === 'done') return;
        state = 'done';

        timers.forEach(clearTimeout);
        timers.length = 0;
        fx().ambient(false);

        reveal(); // idempotent — guarantees the site is visible even if we got here via an error
        startMusic();
        htmlEl.classList.remove('is-locked');
        setInert(main, false);
        intro.remove();
        running.length = 0;

        const title = document.getElementById('hero-title');
        if (title) {
            title.setAttribute('tabindex', '-1');
            try {
                title.focus({ preventScroll: true });
            } catch (err) {
                /* focus options unsupported — harmless */
            }
        }
        document.dispatchEvent(new CustomEvent('wedding:intro-done'));
        console.info(`${TAG} 🎉 done — invitation revealed`);
    }

    /* ---------------- Events ---------------- */
    els.openBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        open('tap');
    });

    // The whole stage is tappable (the envelope is the natural target on phones).
    intro.addEventListener('click', () => open('tap'));

    els.skipBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state === 'ready') open('skip');
        else if (state === 'opening') quickReveal();
        else if (state === 'loading') {
            // Guest is impatient before fonts load — skip straight in (music is still gesture-started).
            state = 'ready';
            open('skip');
        }
    });

    // Never leave a guest stuck: if something throws before we are ready, fall back to the site.
    try {
        arm();
        prepare();
    } catch (err) {
        console.error(`${TAG} ❌ failed to initialise — showing the invitation without the intro.`, err);
        finish();
    }
})();
