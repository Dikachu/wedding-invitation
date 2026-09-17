/**
 * ui.js — site chrome: the top navigation, the phone menu, and the Questions accordion.
 *
 * The nav stays hidden until the envelope has been opened (or appears immediately if there is
 * no intro on the page). The phone menu is a native <dialog>, so focus trapping and Esc come free.
 */
(function () {
    'use strict';

    const TAG = '🧭 [ui]';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------- Navigation ---------------- */
    const nav = document.getElementById('site-nav');
    const toggle = document.getElementById('nav-toggle');
    const menu = document.getElementById('nav-menu');
    const closeBtn = document.getElementById('nav-close');

    function showNav() {
        if (!nav || !nav.hidden) return;
        nav.hidden = false;
        console.info(`${TAG} 🧭 navigation shown`);
    }

    if (!nav) {
        console.error(`${TAG} ❌ #site-nav not found — navigation unavailable.`);
    } else if (!document.getElementById('intro')) {
        showNav();
    } else {
        document.addEventListener('wedding:intro-done', showNav, { once: true });
    }

    // Subtle shadow once the guest scrolls past the hero's top edge.
    if (nav) {
        const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ---------------- Phone menu ---------------- */
    if (menu && toggle && closeBtn && typeof menu.showModal === 'function') {
        let isClosing = false;

        const openMenu = () => {
            if (menu.open) return;
            isClosing = false;
            menu.classList.remove('is-closing');
            menu.showModal();
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', 'Close menu');
            console.info(`${TAG} 📂 menu opened`);
        };

        const closeMenu = (reason, then) => {
            if (!menu.open || isClosing) {
                if (then) then();
                return;
            }
            isClosing = true;
            menu.classList.add('is-closing');

            const panel = menu.querySelector('.nav-menu__panel');
            const done = () => {
                clearTimeout(fallback);
                menu.classList.remove('is-closing');
                if (menu.open) menu.close();
                isClosing = false;
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-label', 'Open menu');
                console.info(`${TAG} 📁 menu closed (${reason})`);
                if (then) then();
            };
            const fallback = setTimeout(done, 420); // animationend can be skipped (reduced motion, hidden tab)
            if (panel) panel.addEventListener('animationend', done, { once: true });
            else done();
        };

        toggle.addEventListener('click', () => (menu.open ? closeMenu('toggle') : openMenu()));
        closeBtn.addEventListener('click', () => closeMenu('close button'));
        menu.addEventListener('click', (event) => {
            if (event.target === menu) closeMenu('backdrop');
        });
        menu.addEventListener('cancel', (event) => {
            event.preventDefault();
            closeMenu('escape');
        });

        // Close first, then scroll — a modal dialog would otherwise sit over the target section.
        menu.querySelectorAll('.nav-menu__list a').forEach((link) => {
            link.addEventListener('click', (event) => {
                const id = link.getAttribute('href');
                if (!id || !id.startsWith('#')) return;
                const target = document.querySelector(id);
                if (!target) {
                    console.warn(`${TAG} ⚠️ menu link points at ${id}, which is not on the page.`);
                    return;
                }
                event.preventDefault();
                closeMenu('menu link', () => {
                    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
                });
            });
        });
    } else if (menu && toggle) {
        // No <dialog> support: fall back to the links in the header, never a dead button.
        toggle.hidden = true;
        console.warn(`${TAG} ⚠️ <dialog> unsupported — phone menu disabled.`);
    }

    /* ---------------- Questions accordion ---------------- */
    const questions = document.querySelectorAll('.faq__q');
    if (!questions.length) {
        console.warn(`${TAG} ⚠️ no FAQ items found.`);
    }

    questions.forEach((button) => {
        button.addEventListener('click', () => {
            const item = button.closest('.faq');
            const panel = document.getElementById(button.getAttribute('aria-controls'));
            if (!item || !panel) {
                console.error(`${TAG} ❌ FAQ item is missing its panel (aria-controls="${button.getAttribute('aria-controls')}").`);
                return;
            }
            const willOpen = button.getAttribute('aria-expanded') !== 'true';

            // One open at a time, like a printed Q&A card.
            document.querySelectorAll('.faq.is-open').forEach((open) => {
                open.classList.remove('is-open');
                const openBtn = open.querySelector('.faq__q');
                const openPanel = open.querySelector('.faq__a');
                if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
                if (openPanel) openPanel.hidden = true;
            });

            if (willOpen) {
                item.classList.add('is-open');
                button.setAttribute('aria-expanded', 'true');
                panel.hidden = false;
            }
        });
    });

    console.info(`${TAG} ✅ ready`);
})();
