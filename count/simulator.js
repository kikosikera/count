/* ============================================
   ANTI-GRAVITY SIMULATOR ENGINE
   ============================================ */

(function () {
    'use strict';

    // ── Canvas Setup ──────────────────────────
    const canvas = document.getElementById('sim-canvas');
    const ctx = canvas.getContext('2d');
    const wrapper = document.getElementById('sim-canvas-wrapper');

    let W, H;
    function resize() {
        const rect = wrapper.getBoundingClientRect();
        W = rect.width;
        H = Math.max(rect.height, 560);
        canvas.width = W * devicePixelRatio;
        canvas.height = H * devicePixelRatio;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    // ── Controls ──────────────────────────────
    const gravitySlider = document.getElementById('gravity-slider');
    const massSlider = document.getElementById('mass-slider');
    const turbulenceSlider = document.getElementById('turbulence-slider');
    const countSlider = document.getElementById('count-slider');
    const repelSlider = document.getElementById('repel-slider');

    const gravityVal = document.getElementById('gravity-value');
    const massVal = document.getElementById('mass-value');
    const turbulenceVal = document.getElementById('turbulence-value');
    const countVal = document.getElementById('count-value');
    const repelVal = document.getElementById('repel-value');

    const btnReset = document.getElementById('btn-reset');
    const btnPause = document.getElementById('btn-pause');

    const statFps = document.getElementById('stat-fps');
    const statObjects = document.getElementById('stat-objects');
    const statCollisions = document.getElementById('stat-collisions');

    let paused = false;
    let collisionCount = 0;

    // Update labels live
    [gravitySlider, massSlider, turbulenceSlider, countSlider, repelSlider].forEach(s => {
        s.addEventListener('input', () => {
            gravityVal.textContent = gravitySlider.value;
            massVal.textContent = massSlider.value;
            turbulenceVal.textContent = turbulenceSlider.value;
            countVal.textContent = countSlider.value;
            repelVal.textContent = repelSlider.value;
            syncObjectCount();
        });
    });

    btnPause.addEventListener('click', () => {
        paused = !paused;
        btnPause.innerHTML = paused
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
    });

    btnReset.addEventListener('click', () => {
        collisionCount = 0;
        objects.length = 0;
        initObjects(parseInt(countSlider.value));
    });

    // ── Object Pool ───────────────────────────
    const COLORS = [
        { fill: '#2fbd59', glow: 'rgba(47,189,89,0.35)' },
        { fill: '#22d3ee', glow: 'rgba(34,211,238,0.35)' },
        { fill: '#a78bfa', glow: 'rgba(167,139,250,0.35)' },
        { fill: '#f472b6', glow: 'rgba(244,114,182,0.35)' },
        { fill: '#fb923c', glow: 'rgba(251,146,60,0.35)' },
        { fill: '#facc15', glow: 'rgba(250,204,21,0.35)' },
        { fill: '#e8eaed', glow: 'rgba(232,234,237,0.25)' },
        { fill: '#38bdf8', glow: 'rgba(56,189,248,0.35)' },
    ];

    let objects = [];

    function rand(a, b) { return Math.random() * (b - a) + a; }

    function createObject(id) {
        const c = COLORS[id % COLORS.length];
        const r = rand(12, 32);
        return {
            id,
            x: rand(r, W - r),
            y: rand(r, H - r),
            vx: rand(-1.5, 1.5),
            vy: rand(-1.5, 1.5),
            r,
            mass: 1,
            fill: c.fill,
            glow: c.glow,
            trail: [],
            pulsePhase: rand(0, Math.PI * 2),
        };
    }

    function initObjects(n) {
        objects = [];
        for (let i = 0; i < n; i++) objects.push(createObject(i));
    }

    function syncObjectCount() {
        const target = parseInt(countSlider.value);
        while (objects.length < target) objects.push(createObject(objects.length));
        while (objects.length > target) objects.pop();
        statObjects.textContent = objects.length;
    }

    initObjects(parseInt(countSlider.value));

    // ── Mouse Interaction ─────────────────────
    let mouse = { x: -1000, y: -1000, active: false };
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.active = true;
    });
    canvas.addEventListener('mouseleave', () => { mouse.active = false; });

    // ── Physics ───────────────────────────────
    function updatePhysics(dt) {
        const gravity = parseFloat(gravitySlider.value) * 0.004;
        const massScale = parseFloat(massSlider.value);
        const turbulence = parseFloat(turbulenceSlider.value) * 0.003;
        const repelForce = parseFloat(repelSlider.value) * 0.0005;

        for (let i = 0; i < objects.length; i++) {
            const o = objects[i];
            o.mass = massScale;

            // Gravity (positive = down, negative = up / anti-gravity)
            o.vy += gravity * o.mass * dt;

            // Turbulence — random nudges
            o.vx += (Math.random() - 0.5) * turbulence * dt * 60;
            o.vy += (Math.random() - 0.5) * turbulence * dt * 60;

            // Mouse repel/attract
            if (mouse.active) {
                const dx = o.x - mouse.x;
                const dy = o.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy) + 1;
                if (dist < 180) {
                    const force = 3.0 / dist;
                    o.vx += dx * force * dt * 60;
                    o.vy += dy * force * dt * 60;
                }
            }

            // Object-to-object repel/attract
            for (let j = i + 1; j < objects.length; j++) {
                const b = objects[j];
                let dx = o.x - b.x;
                let dy = o.y - b.y;
                let dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
                const minDist = o.r + b.r;

                // Collision
                if (dist < minDist) {
                    collisionCount++;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = minDist - dist;

                    // Separate
                    o.x += nx * overlap * 0.5;
                    o.y += ny * overlap * 0.5;
                    b.x -= nx * overlap * 0.5;
                    b.y -= ny * overlap * 0.5;

                    // Elastic bounce
                    const dvx = o.vx - b.vx;
                    const dvy = o.vy - b.vy;
                    const dot = dvx * nx + dvy * ny;
                    if (dot > 0) {
                        const restitution = 0.85;
                        const impulse = dot * restitution;
                        o.vx -= impulse * nx;
                        o.vy -= impulse * ny;
                        b.vx += impulse * nx;
                        b.vy += impulse * ny;
                    }
                }

                // Repel/Attract force
                if (dist < 250 && dist > minDist) {
                    const f = repelForce / (dist * 0.1) * dt * 60;
                    const fx = (dx / dist) * f;
                    const fy = (dy / dist) * f;
                    o.vx += fx;
                    o.vy += fy;
                    b.vx -= fx;
                    b.vy -= fy;
                }
            }

            // Damping
            o.vx *= 0.998;
            o.vy *= 0.998;

            // Speed cap
            const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
            if (speed > 8) {
                o.vx = (o.vx / speed) * 8;
                o.vy = (o.vy / speed) * 8;
            }

            // Move
            o.x += o.vx * dt * 60;
            o.y += o.vy * dt * 60;

            // Wall bounce
            if (o.x - o.r < 0) { o.x = o.r; o.vx = Math.abs(o.vx) * 0.7; }
            if (o.x + o.r > W) { o.x = W - o.r; o.vx = -Math.abs(o.vx) * 0.7; }
            if (o.y - o.r < 0) { o.y = o.r; o.vy = Math.abs(o.vy) * 0.7; }
            if (o.y + o.r > H) { o.y = H - o.r; o.vy = -Math.abs(o.vy) * 0.7; }

            // Trail
            o.trail.push({ x: o.x, y: o.y });
            if (o.trail.length > 16) o.trail.shift();

            o.pulsePhase += dt * 2.5;
        }
    }

    // ── Rendering ─────────────────────────────
    function drawGrid() {
        ctx.strokeStyle = 'rgba(47, 189, 89, 0.04)';
        ctx.lineWidth = 0.5;
        const step = 48;
        for (let x = 0; x < W; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y < H; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
    }

    function drawConnections() {
        for (let i = 0; i < objects.length; i++) {
            for (let j = i + 1; j < objects.length; j++) {
                const a = objects[i], b = objects[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 160) {
                    const alpha = (1 - dist / 160) * 0.12;
                    ctx.strokeStyle = `rgba(47, 189, 89, ${alpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
    }

    function drawObjects(time) {
        for (const o of objects) {
            // Trail
            if (o.trail.length > 2) {
                ctx.beginPath();
                ctx.moveTo(o.trail[0].x, o.trail[0].y);
                for (let t = 1; t < o.trail.length; t++) {
                    ctx.lineTo(o.trail[t].x, o.trail[t].y);
                }
                ctx.strokeStyle = o.glow;
                ctx.lineWidth = o.r * 0.4;
                ctx.lineCap = 'round';
                ctx.globalAlpha = 0.15;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            const pulse = 1 + Math.sin(o.pulsePhase) * 0.08;
            const drawR = o.r * pulse;

            // Outer glow
            const grd = ctx.createRadialGradient(o.x, o.y, drawR * 0.3, o.x, o.y, drawR * 2.5);
            grd.addColorStop(0, o.glow);
            grd.addColorStop(1, 'transparent');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(o.x, o.y, drawR * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Main sphere gradient
            const sphereGrd = ctx.createRadialGradient(
                o.x - drawR * 0.3, o.y - drawR * 0.3, drawR * 0.1,
                o.x, o.y, drawR
            );
            sphereGrd.addColorStop(0, '#ffffff');
            sphereGrd.addColorStop(0.3, o.fill);
            sphereGrd.addColorStop(1, shadeColor(o.fill, -40));
            ctx.fillStyle = sphereGrd;
            ctx.beginPath();
            ctx.arc(o.x, o.y, drawR, 0, Math.PI * 2);
            ctx.fill();

            // Specular highlight
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.ellipse(o.x - drawR * 0.25, o.y - drawR * 0.3, drawR * 0.35, drawR * 0.2, -0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function shadeColor(hex, amount) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        r = Math.max(0, Math.min(255, r + amount));
        g = Math.max(0, Math.min(255, g + amount));
        b = Math.max(0, Math.min(255, b + amount));
        return `rgb(${r},${g},${b})`;
    }

    // ── FPS tracking ──────────────────────────
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let displayFps = 60;

    // ── Main Loop ─────────────────────────────
    let lastTime = performance.now();

    function loop(now) {
        requestAnimationFrame(loop);

        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        // FPS
        frameCount++;
        if (now - lastFpsTime >= 500) {
            displayFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
            frameCount = 0;
            lastFpsTime = now;
            statFps.textContent = displayFps;
            statCollisions.textContent = collisionCount;
        }

        if (paused) return;

        resize(); // keep canvas responsive

        updatePhysics(dt);

        // Clear
        ctx.clearRect(0, 0, W, H);

        // Background gradient
        const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
        bg.addColorStop(0, '#111820');
        bg.addColorStop(1, '#080c10');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        drawGrid();
        drawConnections();
        drawObjects(now);

        statObjects.textContent = objects.length;
    }

    requestAnimationFrame(loop);

    // ── Flip Clock Counter Animation ──────────
    const counterCurrent = document.getElementById('counter-current');
    const counterTotal = document.getElementById('counter-total');

    let currentCount = 0;
    const targetCount = 124;
    const totalSeats = 248;

    function updateFlipDigits(group, value, digits) {
        const str = String(value).padStart(digits, '0');
        const cards = group.querySelectorAll('.flip-card');
        cards.forEach((card, i) => {
            const digit = card.querySelector('.flip-digit');
            const newChar = str[i] || '0';
            if (digit.textContent !== newChar) {
                card.classList.add('flipping');
                setTimeout(() => {
                    digit.textContent = newChar;
                    card.classList.remove('flipping');
                }, 250);
            }
        });
    }

    // Animate counter on scroll into view
    let counterAnimated = false;

    function animateCounter() {
        if (counterAnimated) return;
        counterAnimated = true;

        const duration = 2500;
        const start = performance.now();

        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            currentCount = Math.round(eased * targetCount);

            updateFlipDigits(counterCurrent, currentCount, 3);
            updateFlipDigits(counterTotal, totalSeats, 3);

            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    // IntersectionObserver to trigger counter animation
    const counterEl = document.getElementById('flip-counter');
    if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    animateCounter();
                    obs.unobserve(e.target);
                }
            });
        }, { threshold: 0.5 });
        obs.observe(counterEl);
    } else {
        // Fallback
        setTimeout(animateCounter, 500);
    }

    // Initialize total digits immediately
    updateFlipDigits(counterTotal, totalSeats, 3);

})();
