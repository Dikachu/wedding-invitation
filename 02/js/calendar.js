/**
 * calendar.js — "Add to Calendar" chooser.
 *
 * Why a chooser instead of a single .ics link?
 *   Websites cannot open the phone's "choose a calendar app" menu:
 *   - Android Chrome has no calendar hand-off for .ics files (it downloads them), and Chrome only
 *     launches app screens marked BROWSABLE, which calendar "new event" screens are not.
 *   - iOS Safari shows its native "Add to Calendar" prompt for an https .ics served as text/calendar.
 *   So we let the guest choose here, and put the best option for their device first:
 *     Google Calendar (pre-filled event page) · Apple Calendar (.ics prompt) · Outlook (pre-filled) ·
 *     Other apps (downloads the .ics file, e.g. Samsung Calendar).
 *
 * Single source of truth: EVENT below. assets/chimezie-richard-traditional-marriage.ics must match it.
 * Progressive enhancement: without JS (or without <dialog>) the trigger is a plain link to the .ics.
 */
(function () {
    'use strict';

    const TAG = '📅 [calendar]';

    const EVENT = {
        title: 'Traditional Marriage Ceremony — Chimezie & Richard',
        startUtc: '2026-12-29T12:00:00Z', // 1pm WAT (UTC+1)
        endUtc: '2026-12-29T17:00:00Z', // end time is not on the card — placeholder, confirm with the couple
        location: 'Udechukwu Memorial School Compound, Mmaku, Awgu, Enugu State, Nigeria',
        details: 'Together with their families, Chimezie Ekwe and Richard Chidi Chinaka invite you to their ' +
            'Traditional Marriage Ceremony. Your presence will make our day more special.',
    };

    const trigger = document.getElementById('add-to-calendar');
    const sheet = document.getElementById('calendar-sheet');
    const list = document.getElementById('calendar-options');
    const closeBtn = document.getElementById('calendar-sheet-close');

    if (!trigger || !sheet || !list || !closeBtn) {
        console.error(`${TAG} ❌ chooser markup missing (#add-to-calendar, #calendar-sheet, #calendar-options, #calendar-sheet-close). The button stays a plain .ics link.`);
        return;
    }
    if (typeof sheet.showModal !== 'function') {
        console.warn(`${TAG} ⚠️ <dialog> unsupported in this browser — the button stays a plain .ics link.`);
        return;
    }

    /* ---------------- Link builders ---------------- */
    const enc = encodeURIComponent; // %20 for spaces (some services show "+" literally)

    /** 2026-12-29T12:00:00Z → 20261229T120000Z */
    const toGoogleDate = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    function googleUrl() {
        return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
            `&text=${enc(EVENT.title)}` +
            `&dates=${toGoogleDate(EVENT.startUtc)}%2F${toGoogleDate(EVENT.endUtc)}` +
            `&details=${enc(EVENT.details)}` +
            `&location=${enc(EVENT.location)}`;
    }

    function outlookUrl() {
        // Signed-out guests are sent to sign in first; the event is preserved in the redirect.
        return 'https://outlook.live.com/calendar/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent' +
            `&subject=${enc(EVENT.title)}` +
            `&startdt=${enc(EVENT.startUtc)}` +
            `&enddt=${enc(EVENT.endUtc)}` +
            `&body=${enc(EVENT.details)}` +
            `&location=${enc(EVENT.location)}`;
    }

    function setLink(key, href) {
        const link = list.querySelector(`[data-calendar-link="${key}"]`);
        if (link) link.href = href;
        else console.error(`${TAG} ❌ option "${key}" not found in #calendar-options`);
    }

    /* ---------------- Device-aware ordering ---------------- */
    function detectPlatform() {
        const ua = navigator.userAgent || '';
        const uaPlatform = (navigator.userAgentData && navigator.userAgentData.platform) || '';
        // iPadOS 13+ reports itself as a Mac; touch support gives it away.
        const isIPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
        if (/Android/i.test(ua) || /Android/i.test(uaPlatform)) return 'android';
        if (/iPhone|iPad|iPod/.test(ua) || isIPad) return 'ios';
        if (/Macintosh|Mac OS X/.test(ua) || /macOS/i.test(uaPlatform)) return 'mac';
        if (/Windows/i.test(ua) || /Windows/i.test(uaPlatform)) return 'windows';
        return 'other';
    }

    const ORDER = {
        android: ['google', 'file', 'outlook', 'apple'],
        ios: ['apple', 'google', 'outlook', 'file'],
        mac: ['apple', 'google', 'outlook', 'file'],
        windows: ['google', 'outlook', 'file', 'apple'],
        other: ['google', 'apple', 'outlook', 'file'],
    };

    function orderOptions(platform) {
        const order = ORDER[platform] || ORDER.other;
        order.forEach((key, index) => {
            const item = list.querySelector(`[data-calendar="${key}"]`);
            if (!item) return;
            if (index === 0) item.setAttribute('data-recommended', '');
            else item.removeAttribute('data-recommended');
            list.appendChild(item); // re-append in the desired order
        });
        return order[0];
    }

    /* ---------------- Open / close ---------------- */
    let isClosing = false;

    function open() {
        if (sheet.open) return;
        isClosing = false;
        sheet.classList.remove('is-closing');
        sheet.showModal();
        console.info(`${TAG} 📂 chooser opened`);
    }

    function close(reason) {
        if (!sheet.open || isClosing) return;
        isClosing = true;
        sheet.classList.add('is-closing');

        const panel = sheet.querySelector('.cal-sheet__panel');
        const done = () => {
            clearTimeout(fallbackTimer);
            sheet.classList.remove('is-closing');
            if (sheet.open) sheet.close();
            isClosing = false;
            trigger.focus({ preventScroll: true });
            console.info(`${TAG} 📁 chooser closed (${reason})`);
        };
        // animationend may never fire (reduced motion, background tab) — never leave the sheet stuck.
        const fallbackTimer = setTimeout(done, 450);
        if (panel) panel.addEventListener('animationend', done, { once: true });
        else done();
    }

    try {
        setLink('google', googleUrl());
        setLink('outlook', outlookUrl());
        const platform = detectPlatform();
        const first = orderOptions(platform);
        console.info(`${TAG} ✅ ready (platform: ${platform}, recommended: ${first})`);
    } catch (err) {
        console.error(`${TAG} ❌ failed to prepare calendar links — the button stays a plain .ics link.`, err);
        return;
    }

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        open();
    });

    closeBtn.addEventListener('click', () => close('close button'));

    // Tap on the dimmed backdrop (the <dialog> itself, outside the panel) closes it.
    sheet.addEventListener('click', (event) => {
        if (event.target === sheet) close('backdrop');
    });

    // Esc: animate out instead of the instant native close.
    sheet.addEventListener('cancel', (event) => {
        event.preventDefault();
        close('escape');
    });

    list.addEventListener('click', (event) => {
        const link = event.target.closest('[data-calendar-link]');
        if (!link) return;
        console.info(`${TAG} ➕ guest chose "${link.dataset.calendarLink}"`);
        // Let the navigation/download start, then tidy the sheet away.
        setTimeout(() => close('option chosen'), 150);
    });
})();
