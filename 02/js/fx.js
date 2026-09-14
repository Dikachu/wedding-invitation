/**
 * fx.js — lightweight canvas particle engine (gold dust, sparks, blush petals).
 *
 * Exposes `window.Wedding.fx`:
 *   burst({ x, y, count, type, speed })          — one-shot radial explosion (e.g. seal crack)
 *   emit({ x, y, width, height, rate, duration, type }) — spawn continuously inside a rect for `duration` ms
 *   ambient(on)                                  — slow floating motes across the whole viewport
 *   stop()                                       — stop every emitter; live particles fade out naturally
 *
 * Performance guard-rails: DPR capped at 1.5, hard particle cap (lower on low-core devices),
 * pre-rendered glow sprites, rAF only runs while something is alive, paused when the tab is hidden.
 * With prefers-reduced-motion every call is a no-op.
 */
(function () {
    'use strict';

    const TAG = '✨ [fx]';
    window.Wedding = window.Wedding || {};

    const noop = { burst() { }, emit() { }, ambient() { }, stop() { } };
    const canvas = document.getElementById('fx-canvas');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!canvas || !canvas.getContext) {
        console.warn(`${TAG} ⚠️ canvas unavailable — particles disabled.`);
        window.Wedding.fx = noop;
        return;
    }
    if (reducedMotion) {
        console.info(`${TAG} 🧘 prefers-reduced-motion — particles disabled.`);
        window.Wedding.fx = noop;
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error(`${TAG} ❌ 2D context could not be created — particles disabled.`);
        window.Wedding.fx = noop;
        return;
    }

    const LOW_POWER = (navigator.hardwareConcurrency || 4) <= 4;
    const MAX_PARTICLES = LOW_POWER ? 180 : 300;
    const PETAL_COLORS = ['#F7C9D5', '#F2B3C4', '#FBE0E7', '#EDA0B6'];

    let dpr = 1;
    let viewW = 0;
    let viewH = 0;
    let particles = [];
    let emitters = [];
    let rafId = 0;
    let lastTime = 0;

    const rand = (min, max) => min + Math.random() * (max - min);

    /** Pre-render a soft radial glow once; drawing images is far cheaper than gradients per frame. */
    function makeGlow(radius, stops) {
        const c = document.createElement('canvas');
        c.width = c.height = radius * 2;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
        stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
        g.fillStyle = grad;
        g.fillRect(0, 0, radius * 2, radius * 2);
        return c;
    }

    const SPRITES = {
        dust: makeGlow(32, [[0, 'rgba(255,246,214,1)'], [0.18, 'rgba(246,220,150,.9)'], [0.45, 'rgba(212,175,106,.35)'], [1, 'rgba(212,175,106,0)']]),
        spark: makeGlow(32, [[0, 'rgba(255,255,245,1)'], [0.25, 'rgba(255,232,170,.95)'], [0.6, 'rgba(230,180,90,.25)'], [1, 'rgba(230,180,90,0)']]),
        mote: makeGlow(48, [[0, 'rgba(255,220,190,.55)'], [0.5, 'rgba(240,170,150,.14)'], [1, 'rgba(240,170,150,0)']]),
    };

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        viewW = window.innerWidth;
        viewH = window.innerHeight;
        canvas.width = Math.round(viewW * dpr);
        canvas.height = Math.round(viewH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(type, x, y, overrides) {
        if (particles.length >= MAX_PARTICLES) return;
        const p = { type, x, y, age: 0, phase: rand(0, Math.PI * 2) };

        if (type === 'spark') {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(90, 320);
            Object.assign(p, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40, life: rand(0.55, 1.1), size: rand(2.4, 5.2) });
        } else if (type === 'dust') {
            Object.assign(p, { vx: rand(-14, 14), vy: rand(8, 46), life: rand(1.6, 3.2), size: rand(1.4, 3.6), sway: rand(6, 20), twinkle: rand(5, 11) });
        } else if (type === 'mote') {
            Object.assign(p, { vx: rand(-6, 6), vy: rand(-16, -5), life: rand(5, 9), size: rand(10, 26), sway: rand(4, 12), twinkle: rand(0.8, 2) });
        } else if (type === 'petal') {
            Object.assign(p, {
                vx: rand(-20, 20), vy: rand(38, 80), life: rand(3.6, 5.6), size: rand(6, 11),
                rot: rand(0, Math.PI * 2), vr: rand(-2.2, 2.2), flip: rand(2, 4.5), sway: rand(18, 40),
                color: PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0],
            });
        }
        if (overrides) Object.assign(p, overrides);
        particles.push(p);
    }

    function update(dt) {
        // Emitters
        for (let i = emitters.length - 1; i >= 0; i--) {
            const e = emitters[i];
            e.elapsed += dt * 1000;
            e.carry += e.rate * dt;
            while (e.carry >= 1) {
                e.carry -= 1;
                spawn(e.type, e.x + Math.random() * e.width, e.y + Math.random() * e.height);
            }
            if (e.duration !== Infinity && e.elapsed >= e.duration) emitters.splice(i, 1);
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.age += dt;
            if (p.age >= p.life || p.y > viewH + 40) {
                particles.splice(i, 1);
                continue;
            }
            if (p.type === 'spark') {
                const drag = Math.pow(0.06, dt);
                p.vx *= drag;
                p.vy = p.vy * drag + 70 * dt;
            } else if (p.type === 'dust') {
                p.vy += 10 * dt;
                p.x += Math.sin(p.age * 2 + p.phase) * p.sway * dt;
            } else if (p.type === 'mote') {
                p.x += Math.sin(p.age * 0.7 + p.phase) * p.sway * dt;
            } else if (p.type === 'petal') {
                p.rot += p.vr * dt;
                p.x += Math.sin(p.age * 1.6 + p.phase) * p.sway * dt;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
    }

    function draw() {
        ctx.clearRect(0, 0, viewW, viewH);

        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
            if (p.type === 'petal') continue;
            const t = p.age / p.life;
            const fade = t < 0.15 ? t / 0.15 : 1 - Math.pow((t - 0.15) / 0.85, 2);
            let alpha = fade;
            if (p.type === 'dust' || p.type === 'mote') alpha *= 0.55 + 0.45 * Math.sin(p.age * p.twinkle + p.phase);
            if (alpha <= 0.01) continue;
            ctx.globalAlpha = Math.min(alpha, 1);
            const s = p.size * (p.type === 'mote' ? 1 : 3);
            ctx.drawImage(SPRITES[p.type], p.x - s, p.y - s, s * 2, s * 2);
        }

        ctx.globalCompositeOperation = 'source-over';
        for (const p of particles) {
            if (p.type !== 'petal') continue;
            const t = p.age / p.life;
            ctx.globalAlpha = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(Math.cos(p.age * p.flip + p.phase), 1); // 3D flutter illusion
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(210,80,120,.28)';
            ctx.beginPath();
            ctx.ellipse(-p.size * 0.35, 0, p.size * 0.35, p.size * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function frame(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.05); // clamp after jank/tab switches
        lastTime = now;
        update(dt);
        draw();
        if (particles.length || emitters.length) {
            rafId = requestAnimationFrame(frame);
        } else {
            rafId = 0;
            ctx.clearRect(0, 0, viewW, viewH);
        }
    }

    function ensureRunning() {
        if (rafId || document.hidden) return;
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
    }

    function burst({ x, y, count = 36, type = 'spark' } = {}) {
        for (let i = 0; i < count; i++) spawn(type, x, y);
        ensureRunning();
    }

    function emit({ x = 0, y = 0, width = viewW, height = 0, rate = 20, duration = 1000, type = 'dust', id } = {}) {
        emitters.push({ id, x, y, width, height, rate, duration, type, elapsed: 0, carry: 0 });
        ensureRunning();
    }

    function ambient(on) {
        emitters = emitters.filter((e) => e.id !== 'ambient');
        if (on) emit({ id: 'ambient', x: 0, y: viewH * 0.15, width: viewW, height: viewH * 0.85, rate: LOW_POWER ? 3 : 5, duration: Infinity, type: 'mote' });
    }

    function stop() {
        emitters = [];
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        } else if (!document.hidden && (particles.length || emitters.length)) {
            ensureRunning();
        }
    });

    window.addEventListener('resize', resize, { passive: true });
    resize();

    window.Wedding.fx = { burst, emit, ambient, stop };
    console.info(`${TAG} ✅ ready (cap ${MAX_PARTICLES}, dpr ${dpr})`);
})();
