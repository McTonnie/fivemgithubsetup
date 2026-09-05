/*
    Apex Billboards — html/js/board.js
    The content engine that runs inside every render-slot DUI (and inside
    the wizard's preview iframe — both feed it the same messages).

    Message protocol (window 'message' events):
      { action:'load', content, aspect, crop, mask, name, brand, preview }
      { action:'clear' }
      { action:'eco',   on:bool }   far away → pause animations/videos
      { action:'sleep', on:bool }   occluded/off-screen → pause everything

    Geometry model:
      • The DUI canvas has a fixed aspect; the physical board does not.
        #fit is laid out in a virtual 1000×(1000/aspect) space and then
        scaled onto the canvas, so nothing ever distorts.
      • Wrap faces render a horizontal SLICE of the content: crop=[a,b].
        #strip holds the full content box and is shifted/enlarged so the
        visible window is exactly that slice.
*/

'use strict';

const $fit    = document.getElementById('fit');
const $bg     = document.getElementById('bg');
const $strip  = document.getElementById('strip');
const $layers = [document.getElementById('layerA'), document.getElementById('layerB')];
const $ph     = document.getElementById('ph');

const VW = 1000; // virtual board width (px) — everything lays out against this

let state = null;        // last load payload
let live  = 0;           // which layer is visible
let timers = [];         // pending timeouts
let rafId  = null;
let eco = false, sleeping = false;
let playIndex = 0;
let lastLoad = '';
let volume = 0;          // 0..1 — distance-attenuated by the Lua side
let zTop = 1;            // stacking counter for the crossfade

// ─── small utils ─────────────────────────────────────────────
function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}
function later(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; }
function paused() { return eco || sleeping; }
function isVideo(url) { return /\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(url); }

// ─── YouTube ─────────────────────────────────────────────────
// Accepts watch?v= / youtu.be / shorts / embed links and returns the
// bare video id (or null when the URL isn't YouTube).
function ytId(url) {
    if (typeof url !== 'string') return null;
    const m = url.match(
        /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

// A clean, chrome-free embed: no controls, no title bar, no related
// videos, no keyboard, no fullscreen button — just the picture, muted
// (browsers only autoplay muted) and looping forever.
// `loop` needs `playlist=<id>` to actually repeat a single video.
function ytEmbedUrl(id) {
    const p = new URLSearchParams({
        autoplay: '1', mute: '1', loop: '1', playlist: id,
        controls: '0', modestbranding: '1', rel: '0', fs: '0',
        disablekb: '1', iv_load_policy: '3', playsinline: '1',
        enablejsapi: '1',
    });
    return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`;
}

// Push a play/pause command through the IFrame API (eco / sleep modes).
function ytCommand(frame, func) {
    try {
        frame.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: func, args: [] }), '*');
    } catch (e) { /* frame not ready yet — next state change will retry */ }
}

function boardSpace() {
    const aspect = (state && state.aspect) || 1.78;
    const crop = (state && state.crop) || [0, 1];
    const span = Math.max(0.02, (crop[1] - crop[0]));
    const H0 = VW / aspect;          // virtual board height for THIS face
    const stripW = VW / span;        // full content width in virtual px
    return { H0, stripW, span, crop };
}

// ─── layout ──────────────────────────────────────────────────
function layout() {
    if (!state) return;
    const { H0, stripW, crop, span } = boardSpace();
    const c = state.content || {};

    // Opaque backdrop: what the board shows wherever the content itself
    // does not paint — during a crossfade, while an image is loading, in
    // fit mode, or under a transparent PNG. Only a board explicitly marked
    // "transparent" lets the wall show through.
    $bg.style.display = (c.transparent === true) ? 'none' : 'block';
    $bg.style.background = c.letterbox || '#000000';

    $fit.style.width  = VW + 'px';
    $fit.style.height = H0 + 'px';
    $fit.style.transform =
        `scale(${window.innerWidth / VW}, ${window.innerHeight / H0})`;

    $strip.style.width = stripW + 'px';
    $strip.style.left  = (-stripW * crop[0]) + 'px';

    // Shape mask (circle / polygon) clips the whole face
    const mask = state.mask;
    if (mask && mask.type === 'circle') {
        $fit.style.clipPath = 'ellipse(50% 50% at 50% 50%)';
    } else if (mask && mask.type === 'poly' && Array.isArray(mask.points)) {
        const pts = mask.points
            .map(p => `${(p[0] * 100).toFixed(2)}% ${(p[1] * 100).toFixed(2)}%`)
            .join(',');
        $fit.style.clipPath = `polygon(${pts})`;
    } else {
        $fit.style.clipPath = 'none';
    }
}

// ─── placeholder ─────────────────────────────────────────────
function showPlaceholder(on) {
    $ph.style.display = on ? 'flex' : 'none';
    if (on && state) {
        document.documentElement.style.setProperty('--brand', state.brand || '#1F5EFF');
        const H0 = boardSpace().H0;
        // scale typography to the board height so tiny boards stay readable
        const base = Math.max(22, Math.min(90, H0 * 0.16));
        $ph.querySelector('.mark').style.fontSize = base + 'px';
        $ph.querySelector('.sub').style.fontSize = Math.max(11, base * 0.34) + 'px';
    }
}

// ─── media construction ──────────────────────────────────────
// Builds one layer's DOM for `url`, calls done(ok) once sized.
function buildLayer(layer, url, done) {
    layer.innerHTML = '';
    const c = state.content || {};
    const { H0, stripW } = boardSpace();
    const bw = stripW, bh = H0;      // content box = full (uncropped) strip

    const box = document.createElement('div');
    box.className = 'box';
    box.style.background = (c.fit === 'fit') ? (c.letterbox || '#000') : 'transparent';
    layer.appendChild(box);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;';
    box.appendChild(wrap);

    const yt = ytId(url);
    const kind = yt ? 'yt' : (isVideo(url) ? 'video' : 'img');

    let el;
    if (kind === 'yt') {
        el = document.createElement('iframe');
        el.setAttribute('frameborder', '0');
        el.setAttribute('allow', 'autoplay; encrypted-media');
        el.style.cssText = 'position:absolute;border:0;pointer-events:none;';
        el.dataset.yt = '1';
    } else if (kind === 'video') {
        el = document.createElement('video');
        el.muted = true; el.autoplay = true; el.loop = true;
        el.playsInline = true;
        el.setAttribute('muted', '');
    } else {
        el = document.createElement('img');
    }
    wrap.appendChild(el);

    let settled = false;
    const fail = () => { if (!settled) { settled = true; done(false); } };
    const ready = () => {
        if (settled) return;
        settled = true;

        let nw, nh;
        if (kind === 'yt') {
            nw = 1920; nh = 1080;               // YouTube players are 16:9
        } else if (kind === 'video') {
            nw = el.videoWidth; nh = el.videoHeight;
        } else {
            nw = el.naturalWidth; nh = el.naturalHeight;
        }
        if (!nw || !nh) return done(false);

        const anim = c.anim || 'none';
        if (anim === 'carousel' && kind === 'img') {
            buildCarousel(wrap, el, nw, nh, bw, bh, c);
        } else {
            // YouTube keeps a thin title/branding strip at the very top of
            // the player; a small overscan in fill mode pushes it outside
            // the visible surface.
            const cc = (kind === 'yt' && c.fit !== 'fit')
                ? Object.assign({}, c, { zoom: (c.zoom || 1) * 1.08 })
                : c;
            placeMedia(wrap, el, nw, nh, bw, bh, cc);
            if (anim !== 'none' && anim !== 'carousel') {
                wrap.classList.add('anim-' + anim);
            }
        }
        applyAudio();
        if (kind === 'video' && paused() && volume <= 0.001) el.pause();
        done(true);
    };

    el.addEventListener('error', fail);
    if (kind === 'yt') {
        el.addEventListener('load', ready);
        el.src = ytEmbedUrl(yt);
        // The iframe fires 'load' even on a blocked embed; a short grace
        // period is enough since we don't need its metadata.
        later(() => ready(), 1200);
    } else if (kind === 'video') {
        el.addEventListener('loadedmetadata', ready);
        el.src = url;
        el.play().catch(() => {});
    } else {
        el.addEventListener('load', ready);
        el.src = url;
    }
    later(fail, 15000); // network stall → placeholder
}

// Standard fill/fit + user framing (zoom / drag pan)
function placeMedia(wrap, el, nw, nh, bw, bh, c) {
    const cover = (c.fit !== 'fit');
    let scale = cover ? Math.max(bw / nw, bh / nh) : Math.min(bw / nw, bh / nh);
    scale *= (c.zoom || 1);
    const dw = nw * scale, dh = nh * scale;
    const px = (c.panX || 0), py = (c.panY || 0);
    const left = (bw - dw) / 2 + px * Math.abs(dw - bw) / 2;
    const top  = (bh - dh) / 2 + py * Math.abs(dh - bh) / 2;
    el.style.width  = dw + 'px';
    el.style.height = dh + 'px';
    el.style.left   = left + 'px';
    el.style.top    = top + 'px';
}

// Carousel: the image is treated as N side-by-side panels sized to the
// board. Two motion styles: dwell+slide steps, or seamless linear scroll.
function buildCarousel(wrap, el, nw, nh, bw, bh, c) {
    let n = (c.panels && c.panels >= 2) ? c.panels
          : Math.round((nw / nh) / (bw / bh));
    n = Math.max(2, Math.min(6, n || 2));

    const scale = bw / (nw / n);          // one panel fills the board width
    const dw = nw * scale, dh = nh * scale;
    const secs = Math.max(2, c.panelSeconds || 8);

    const strip = document.createElement('div');
    strip.className = 'car';
    strip.style.cssText =
        `position:absolute;left:0;top:${(bh - dh) / 2}px;height:${dh}px;width:${dw * 2}px;`;
    wrap.appendChild(strip);

    const mk = () => {
        const i = el.cloneNode();
        i.style.cssText = `position:absolute;top:0;width:${dw}px;height:${dh}px;`;
        return i;
    };
    el.remove();
    const a = mk(); a.style.left = '0px';
    strip.appendChild(a);

    if (c.motion === 'scroll') {
        // seamless marquee: two copies, constant speed, wrap at -dw
        const b = mk(); b.style.left = dw + 'px';
        strip.appendChild(b);
        const speed = dw / (n * secs); // px per second
        let x = 0, prev = performance.now();
        const step = (now) => {
            rafId = requestAnimationFrame(step);
            const dt = (now - prev) / 1000; prev = now;
            if (paused()) return;
            x -= speed * dt;
            if (x <= -dw) x += dw;
            strip.style.transform = `translateX(${x.toFixed(2)}px)`;
        };
        rafId = requestAnimationFrame(step);
    } else {
        // dwell + slide between panels
        let idx = 0;
        const slide = () => {
            if (!paused()) {
                idx = (idx + 1) % n;
                strip.style.transitionDuration = '900ms';
                strip.style.transform = `translateX(${-idx * bw}px)`;
            }
            later(slide, secs * 1000);
        };
        later(slide, secs * 1000);
    }
}

// ─── playlist / single dispatch ──────────────────────────────
function showUrl(url, cb) {
    const next = 1 - live;
    buildLayer($layers[next], url, (ok) => {
        if (!ok) { showPlaceholder(true); if (cb) cb(false); return; }
        showPlaceholder(false);

        // Stack the incoming layer ON TOP and fade it in. The outgoing one
        // stays fully opaque underneath until the fade has finished, so the
        // surface is never partially transparent — no wall bleeding through
        // between two playlist items.
        const old = $layers[live];
        $layers[next].style.zIndex = ++zTop;
        $layers[next].classList.add('on');

        later(() => {
            // by now the new layer is fully opaque and covers this one
            old.classList.remove('on');
            old.innerHTML = '';
        }, 950);

        live = next;
        if (cb) cb(true);
    });
}

function playlistTick() {
    const c = state.content || {};
    const urls = c.urls || [];
    if (!urls.length) return;
    const url = urls[playIndex % urls.length];
    showUrl(url, () => {
        later(() => {
            if (!sleeping) playIndex++;
            playlistTick();
        }, Math.max(3, c.itemSeconds || 10) * 1000);
    });
}

// ─── audio ───────────────────────────────────────────────────
// `volume` is pushed by the Lua side, already attenuated by the
// listener's distance to the board. 0 = silent (also the default, so a
// board never makes noise unless its owner enabled audio).
function applyAudio() {
    const on = volume > 0.001;

    document.querySelectorAll('video').forEach(v => {
        v.muted = !on;
        v.volume = on ? Math.min(1, volume) : 0;
    });

    document.querySelectorAll('iframe[data-yt]').forEach(f => {
        if (on) {
            ytCommand(f, 'unMute');
            try {
                f.contentWindow.postMessage(JSON.stringify({
                    event: 'command', func: 'setVolume',
                    args: [Math.round(Math.min(1, volume) * 100)],
                }), '*');
            } catch (e) {}
        } else {
            ytCommand(f, 'mute');
        }
    });
}

// ─── message handling ────────────────────────────────────────
// A board that is audible keeps PLAYING even while eco/asleep —
// otherwise a club screen would go silent the moment you turn your back
// on it. Only silent boards are actually paused to save frames.
function applyPause() {
    const audible = volume > 0.001;
    const freeze = paused() && !audible;

    document.body.classList.toggle('eco', paused());

    document.querySelectorAll('video').forEach(v => {
        if (freeze) v.pause();
        else v.play().catch(() => {});
    });
    document.querySelectorAll('iframe[data-yt]').forEach(f => {
        ytCommand(f, freeze ? 'pauseVideo' : 'playVideo');
    });
    applyAudio();
}

function load(payload) {
    const enc = JSON.stringify(payload);
    if (enc === lastLoad) { layout(); return; }
    lastLoad = enc;

    clearTimers();
    state = payload;
    playIndex = 0;
    $layers.forEach(l => { l.classList.remove('on'); l.innerHTML = ''; });

    layout();

    const c = state.content || {};
    // Lua encodes empty tables as {} — normalise before filtering
    const urls = (Array.isArray(c.urls) ? c.urls : [])
        .filter(u => typeof u === 'string' && u.length);
    if (!urls.length) {
        showPlaceholder(true);
        return;
    }
    if (c.mode === 'playlist' && urls.length > 1) {
        playlistTick();
    } else {
        showUrl(urls[0]);
    }
}

function handle(data) {
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!data || !data.action) return;
    switch (data.action) {
        case 'load':
            load(data);
            break;
        case 'clear':
            clearTimers();
            state = null; lastLoad = '';
            $layers.forEach(l => { l.classList.remove('on'); l.innerHTML = ''; });
            $bg.style.display = 'none';   // a parked slot must draw nothing
            showPlaceholder(false);
            break;
        case 'eco':
            eco = !!data.on; applyPause();
            break;
        case 'sleep':
            sleeping = !!data.on; applyPause();
            break;
        case 'volume': {
            const v = Math.max(0, Math.min(1, +data.v || 0));
            const was = volume > 0.001;
            volume = v;
            // crossing the silence threshold changes whether the board is
            // allowed to keep playing while asleep
            if (was !== (v > 0.001)) applyPause();
            else applyAudio();
            break;
        }
    }
}

window.addEventListener('message', (e) => handle(e.data));
window.addEventListener('resize', layout);
