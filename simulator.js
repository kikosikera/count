/* ============================================
   ANTI-GRAVITY SIMULATOR ENGINE
   ============================================ */

(function () {
    'use strict';

    // ── Audio Context Initialization ──────────
    // We declare these early so they are available immediately
    let audioCtx = null;
    let masterGain = null;
    let compressor = null;
    let _pinkBuf = null;
    let _animStartTime = 0;
    let _animationId = null;

    getAudioCtx(); // Eager initialization

    // ── Canvas Setup ──────────────────────────
    const canvas = document.getElementById('sim-canvas');
    const wrapper = document.getElementById('sim-canvas-wrapper');
    const hasSimulator = canvas && wrapper;
    const ctx = hasSimulator ? canvas.getContext('2d') : null;

    let W = 0, H = 0;
    function resize() {
        if (!hasSimulator) return;
        const rect = wrapper.getBoundingClientRect();
        W = rect.width;
        H = Math.max(rect.height, 560);
        canvas.width = W * devicePixelRatio;
        canvas.height = H * devicePixelRatio;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    if (hasSimulator) {
        window.addEventListener('resize', resize);
        resize();
    }

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

    if (gravitySlider) {
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
    }

    if (btnPause) {
        btnPause.addEventListener('click', () => {
            paused = !paused;
            btnPause.innerHTML = paused
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            collisionCount = 0;
            objects.length = 0;
            initObjects(parseInt(countSlider.value));
        });
    }

    // ── Object Pool ───────────────────────────
    const COLORS = [
        { fill: '#1976d2', glow: 'rgba(25,118,210,0.35)' },
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

    if (countSlider) initObjects(parseInt(countSlider.value));

    // ── Mouse Interaction ─────────────────────
    let mouse = { x: -1000, y: -1000, active: false };
    if (hasSimulator) {
        canvas.addEventListener('mousemove', e => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
            mouse.active = true;
        });
        canvas.addEventListener('mouseleave', () => { mouse.active = false; });
    }

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
        ctx.strokeStyle = 'rgba(0, 250, 154, 0.04)';
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
                    ctx.strokeStyle = `rgba(0, 250, 154, ${alpha})`;
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
            if (statFps) statFps.textContent = displayFps;
            if (statCollisions) statCollisions.textContent = collisionCount;
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

    if (hasSimulator) requestAnimationFrame(loop);

    // ── Flip Clock Counter Animation ──────────
    const counterCurrent = document.getElementById('counter-current');
    const counterTotal = document.getElementById('counter-total');

    const leftStart = 12;
    const leftEnd = 248;
    const rightStart = 248;
    const rightEnd = 12;

    // ── Cinematic Audio Engine ────────────────
    // Paul Kellet's pink noise algorithm: far more natural than white noise for mechanical impacts
    function _buildPinkNoise(ctx) {
        const sr = ctx.sampleRate || 44100;
        const len = sr * 2; // 2-second buffer, accessed at random offsets for variation
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759;
            b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856;
            b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.0168980;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w*0.5362) / 8;
            b6 = w * 0.115926;
        }
        return buf;
    }

    // Micro-helpers that keep synthesis code readable
    function _noise() {
        const s = audioCtx.createBufferSource();
        s.buffer = _pinkBuf;
        s.loopStart = Math.random() * 1.2; // Random offset gives each flip unique character
        s.loopEnd = _pinkBuf.duration;
        s.loop = true;
        return s;
    }
    function _bpf(freq, q) {
        const f = audioCtx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; return f;
    }
    function _lpf(freq) {
        const f = audioCtx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = freq; return f;
    }
    function _hpf(freq) {
        const f = audioCtx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = freq; return f;
    }
    function _g(v) { const g = audioCtx.createGain(); g.gain.value = v; return g; }
    function _pan(v) {
        if (!audioCtx.createStereoPanner) return null;
        const p = audioCtx.createStereoPanner(); p.pan.value = v; return p;
    }
    function _osc(type, freq) {
        const o = audioCtx.createOscillator(); o.type = type; o.frequency.value = freq; return o;
    }

    function getAudioCtx() {
        if (!audioCtx) {
            try {
                const Cls = window.AudioContext || window.webkitAudioContext;
                if (!Cls) return null;
                audioCtx = new Cls();
                masterGain = _g(1.0); // Maximum clean volume

                const presEQ = audioCtx.createBiquadFilter();
                presEQ.type = 'peaking';
                presEQ.frequency.value = 2200;
                presEQ.Q.value = 0.85;
                presEQ.gain.value = 3.0;

                const airEQ = audioCtx.createBiquadFilter();
                airEQ.type = 'highshelf';
                airEQ.frequency.value = 9000;
                airEQ.gain.value = 2.5;

                compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -14;
                compressor.knee.value = 6;
                compressor.ratio.value = 4;
                compressor.attack.value = 0.001;
                compressor.release.value = 0.12;

                masterGain.connect(presEQ);
                presEQ.connect(airEQ);
                airEQ.connect(compressor);
                compressor.connect(audioCtx.destination);

                _pinkBuf = _buildPinkNoise(audioCtx);

                audioCtx.addEventListener('statechange', function _onReady() {
                    if (audioCtx.state !== 'running') return;
                    audioCtx.removeEventListener('statechange', _onReady);
                    const elapsed = performance.now() - _animStartTime;

                    if (_animStartTime <= 0) return;

                    if (elapsed <= 500) {
                        playSystemInit();
                        return;
                    }

                    if (counterAnimated) {
                        // Cleanly stop any existing animation
                        if (_animationId) cancelAnimationFrame(_animationId);
                        
                        document.querySelectorAll('.flip-card').forEach(card => {
                            card.classList.remove('flipping');
                            if (card.flipTimer) { clearTimeout(card.flipTimer); card.flipTimer = null; }
                            const leaf = card.querySelector('.leaf');
                            if (leaf) { leaf.style.transition = 'none'; leaf.style.transform = 'rotateX(0deg)'; }
                        });
                        
                        counterAnimated = false; // Allow animateCounter to run again
                        setDigits(counterCurrent, leftStart, 3);
                        setDigits(counterTotal, rightStart, 3);
                        setTimeout(animateCounter, 50);
                    }
                });
            } catch (e) { return null; }
        }

        // Proactively attempt resume on every access if suspended
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    }

    function unlockAudio() {
        const ctx = getAudioCtx();
        if (ctx && ctx.state !== 'running') {
            ctx.resume().catch(() => {});
        }
    }

    // Listen for clear user intent to unlock the Web Audio context
    ['click', 'mousedown', 'touchstart', 'keydown'].forEach(ev => {
        document.addEventListener(ev, unlockAudio, { once: true, passive: true });
    });

    // Periodic check to help with autoplay on refresh
    setInterval(() => {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
    }, 1000);

    // Listen for visibility changes (helps with resume after tab switch/refresh)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            unlockAudio();
        }
    });

    // Explicitly allow clicking the hero to start audio
    const hero = document.getElementById('hero-section');
    if (hero) {
        hero.addEventListener('click', unlockAudio);
    }

    // ── Cinematic Components ──────────────────

    function playSystemInit() {
        // No whistle/init sounds as requested
    }

    function playFlipClack(isFast = false, isFinal = false, pan = 0) {
        const ctx = getAudioCtx();
        if (!ctx) return; 
        
        // Force a resume attempt on every clack if suspended (helps with "sometimes" issues)
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        
        const t = ctx.currentTime;
        const panner = _pan(pan);
        const out = panner || masterGain;
        if (panner) panner.connect(masterGain);

        const v = 0.9 + Math.random() * 0.2; // Variation

        // ── Main Mechanical Clack (Impact) ──
        const n = _noise();
        const f = _bpf(1400 * v, 1.2);
        const h = _hpf(300);
        const g = _g(0);
        
        const vol = isFast ? 0.25 : 0.65;
        const dec = isFast ? 0.04 : 0.08;
        
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        
        n.connect(f); f.connect(h); h.connect(g); g.connect(out);
        n.start(t); n.stop(t + dec + 0.02);

        // ── Low-End Thud (Body Resonance) ──
        if (!isFast) {
            const thud = _osc('triangle', 110 * v);
            const thudG = _g(0);
            thud.frequency.setValueAtTime(110 * v, t);
            thud.frequency.exponentialRampToValueAtTime(40, t + 0.12);
            thudG.gain.setValueAtTime(0.2, t);
            thudG.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
            thud.connect(thudG); thudG.connect(out);
            thud.start(t); thud.stop(t + 0.15);
        }

        // ── High-End Snap ──
        const snap = _osc('square', 4500 * v);
        const snapG = _g(0);
        snapG.gain.setValueAtTime(0.04, t);
        snapG.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
        snap.connect(snapG); snapG.connect(out);
        snap.start(t); snap.stop(t + 0.02);
    }

    function playDeepMomentum() {
        // Removed as requested to keep only regular card sounds
    }

    function playResolution() {
        // No final hit/resolution sounds as requested
    }


    function setDigit(card, char) {
        card.querySelector('.top').textContent = char;
        card.querySelector('.bottom').textContent = char;
        card.querySelector('.leaf-front').textContent = char;
        card.querySelector('.leaf-back').textContent = char;
    }

    function setDigits(group, value, digits, pan = 0) {
        const str = String(value).padStart(digits, '0');
        const cards = group.querySelectorAll('.flip-card');
        cards.forEach((card, i) => {
            setDigit(card, str[i] || '0', pan);
        });
    }

    function flipDigit(card, newChar, pan = 0) {
        const top = card.querySelector('.top');
        const bottom = card.querySelector('.bottom');
        const leafFront = card.querySelector('.leaf-front');
        const leafBack = card.querySelector('.leaf-back');
        const leaf = card.querySelector('.leaf');

        const oldChar = top.textContent;
        if (oldChar === newChar) return;

        const now = Date.now();
        const lastFlipTime = parseInt(card.dataset.lastFlip || "0");
        const isFast = (now - lastFlipTime < 100);
        card.dataset.lastFlip = now;

        if (isFast) {
            leaf.style.transitionDuration = '0.1s';
        } else {
            leaf.style.transitionDuration = '';
        }

        // Cinematic Clack
        playFlipClack(isFast, false, pan);

        card.classList.add('flipping');
        top.textContent = newChar;
        leafBack.textContent = newChar;

        if (card.flipTimer) clearTimeout(card.flipTimer);
        const duration = isFast ? 100 : 600;

        card.flipTimer = setTimeout(() => {
            bottom.textContent = newChar;
            leafFront.textContent = newChar;
            card.classList.remove('flipping');
            leaf.style.transition = 'none';
            leaf.style.transform = 'rotateX(0deg)';
            leaf.getBoundingClientRect();
            leaf.style.transition = '';
            card.flipTimer = null;
        }, duration);
    }

    function updateFlipDigits(group, value, digits, pan = 0) {
        const str = String(value).padStart(digits, '0');
        const cards = group.querySelectorAll('.flip-card');
        cards.forEach((card, i) => {
            flipDigit(card, str[i] || '0', pan);
        });
    }

    let counterAnimated = false;

    function animateCounter() {
        if (counterAnimated) return;
        if (_animationId) cancelAnimationFrame(_animationId);
        
        const ctx = getAudioCtx(); 
        if (ctx) {
            // Warm up the context with a silent buffer
            const b = ctx.createBuffer(1, 1, 22050);
            const s = ctx.createBufferSource();
            s.buffer = b; s.connect(ctx.destination);
            s.start(0);
        }
        
        counterAnimated = true;
        _animStartTime = performance.now(); 

        // 400 ms init window: system hum + relay click + calibration beep play first,
        // then digit flipping begins — matching [0.0–0.4 s] of the sound spec.
        const duration = 4500;
        const start = performance.now();

        playSystemInit();

        let momentumPlayed = false;

        function tick(now) {
            const elapsed = now - start;
            const progress = Math.max(0, Math.min(elapsed / duration, 1));

            // easeInOutQuart: slow start → fast cascade → slow convergence
            const eased = progress < 0.5
                ? 8 * progress * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 4) / 2;

            if (progress > 0.4 && !momentumPlayed) {
                playDeepMomentum();
                momentumPlayed = true;
            }

            const leftCount = Math.round(leftStart + eased * (leftEnd - leftStart));
            const rightCount = Math.round(rightStart - eased * (rightStart - rightEnd));

            // Left counter fires immediately; right counter audio is staggered 9–17 ms
            // to produce the authentic "double-clack" texture of two simultaneous split-flap units.
            updateFlipDigits(counterCurrent, leftCount, 3, -0.55);
            const rc = rightCount;
            setTimeout(() => updateFlipDigits(counterTotal, rc, 3, 0.55), 9 + Math.floor(Math.random() * 9));

            if (progress < 1) {
                _animationId = requestAnimationFrame(tick);
            } else {
                _animationId = null;
                setTimeout(playResolution, 55);
            }
        }

        _animationId = requestAnimationFrame(tick);
    }

    const counterEl = document.getElementById('flip-counter');
    if (counterEl) {
        // Start after a short delay to allow browser to settle
        setTimeout(animateCounter, 100);
    }

    setDigits(counterCurrent, leftStart, 3);
    setDigits(counterTotal, rightStart, 3);


})();
