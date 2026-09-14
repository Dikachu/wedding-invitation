/**
 * site.js — page behaviour after (or without) the intro.
 *
 * Exposes `window.Wedding.site`:
 *   enterHero() — plays the hero entrance (names "write" in, ornaments settle). Idempotent.
 *
 * Also runs: countdown to the ceremony, scroll-reveal for [data-reveal] elements.
 */
(function () {
    'use strict';

    const TAG = '💐 [site]';
    const CEREMONY_START = new Date('2026-12-29T13:00:00+01:00'); // 1pm WAT (UTC+1, no DST)
    const CEREMONY_DAY_END = new Date('2026-12-30T00:00:00+01:00');

    window.Wedding = window.Wedding || {};

    // Enables the "hidden until revealed" styles. Content stays visible if this script never runs.
    document.documentElement.classList.add('js');

    /* ---------------- Hero entrance ---------------- */
    const hero = document.querySelector('.hero');
    let heroEntered = false;

    function enterHero() {
        if (heroEntered) return;
        if (!hero) {
            console.warn(`${TAG} ⚠️ .hero not found — skipping hero entrance.`);
            return;
        }
        heroEntered = true;

        hero.querySelectorAll('.hero__corner').forEach((el, i) => {
            el.style.setProperty('--hero-delay', `${i * 120}ms`);
        });
        hero.querySelectorAll('[data-hero]').forEach((el, i) => {
            el.style.setProperty('--hero-delay', `${250 + i * 150}ms`);
        });

        // Next frame so the initial (hidden) state is committed before transitioning.
        requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('is-entered')));
        console.info(`${TAG} 🌸 hero entrance`);
    }

    /* ---------------- Scroll reveal ---------------- */
    function initReveal() {
        const targets = document.querySelectorAll('[data-reveal]');
        if (!targets.length) return;

        if (!('IntersectionObserver' in window)) {
            console.warn(`${TAG} ⚠️ IntersectionObserver unsupported — showing all content immediately.`);
            targets.forEach((el) => el.classList.add('is-visible'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            // Stagger elements that enter together so blocks cascade gracefully.
            entries
                .filter((entry) => entry.isIntersecting)
                .forEach((entry, i) => {
                    entry.target.style.setProperty('--reveal-delay', `${Math.min(i, 6) * 110}ms`);
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

        targets.forEach((el) => observer.observe(el));
    }

    /* ---------------- Countdown ---------------- */
    function initCountdown() {
        const root = document.getElementById('countdown');
        const doneEl = document.getElementById('countdown-done');
        if (!root) {
            console.warn(`${TAG} ⚠️ #countdown not found — countdown disabled.`);
            return;
        }

        const cells = {};
        root.querySelectorAll('[data-unit]').forEach((el) => { cells[el.dataset.unit] = el; });
        const missing = ['days', 'hours', 'minutes', 'seconds'].filter((unit) => !cells[unit]);
        if (missing.length) {
            console.error(`${TAG} ❌ countdown cells missing: ${missing.join(', ')}`);
            return;
        }

        const pad = (n) => String(n).padStart(2, '0');
        let timerId = 0;

        function finish(message) {
            root.hidden = true;
            if (doneEl) {
                doneEl.textContent = message;
                doneEl.hidden = false;
            }
            clearTimeout(timerId);
            console.info(`${TAG} ⏳ countdown finished: "${message}"`);
        }

        function tick() {
            const now = Date.now();
            const diff = CEREMONY_START.getTime() - now;

            if (diff <= 0) {
                finish(now < CEREMONY_DAY_END.getTime() ? 'The celebration is today' : 'Thank you for celebrating with us');
                return;
            }

            const totalSeconds = Math.floor(diff / 1000);
            cells.days.textContent = String(Math.floor(totalSeconds / 86400));
            cells.hours.textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
            cells.minutes.textContent = pad(Math.floor((totalSeconds % 3600) / 60));
            cells.seconds.textContent = pad(totalSeconds % 60);

            // Align ticks to the wall-clock second to avoid drift.
            timerId = setTimeout(tick, 1000 - (now % 1000) + 20);
        }

        tick();
        console.info(`${TAG} ⏳ countdown started → ${CEREMONY_START.toISOString()}`);
    }

    try {
        initReveal();
        initCountdown();
    } catch (err) {
        console.error(`${TAG} ❌ initialisation failed — revealing all content as a fallback.`, err);
        document.documentElement.classList.remove('js');
    }

    window.Wedding.site = { enterHero };

    // No intro on the page (removed or failed to render) → show the hero straight away.
    const intro = document.getElementById('intro');
    if (!intro) {
        enterHero();
    } else {
        // Failsafe twin of the CSS one in intro.css: if intro.js never armed the overlay
        // (e.g. the script failed to load), the overlay fades itself out at ~9s — show the hero then too.
        setTimeout(() => {
            if (!heroEntered && !intro.classList.contains('is-armed')) {
                console.warn(`${TAG} ⚠️ intro script never started — revealing the hero via failsafe.`);
                enterHero();
            }
        }, 9200);
    }

    console.info(`${TAG} ✅ ready`);
})();
