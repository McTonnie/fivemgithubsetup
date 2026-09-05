/* ============================================================
   Apex Vehicle Studio — dui.js (DUI frame receiver)
   Runs inside the offscreen DUI page (dui.html). Receives the
   composited canvas frames relayed by preview.lua and paints
   them onto a full-window canvas that the Lua side turns into
   a runtime texture (CreateRuntimeTextureFromDuiHandle).

   Transport (the production-proven DUI pattern):
     • Lua → page:  SendDuiMessage → window 'message' events
                    ({ action:'frame', frame:<dataURL> })
     • page → Lua:  POST https://cfx-nui-<resource>/duiReady on
                    load (retried until acknowledged). Lua
                    re-sends the latest frame on every duiReady,
                    so no frame is ever lost — even if this page
                    loads AFTER the first frames were pushed.
   GetParentResourceName() is not reliable inside DUI pages, so
   the resource name travels in the page URL (?resourceName=).
   ============================================================ */
(() => {
'use strict';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const RESOURCE = (() => {
    try {
        const fromQuery = new URLSearchParams(location.search).get('resourceName');
        if (fromQuery) return fromQuery;
    } catch (e) { /* fall through */ }
    return 'apex_vehicles';
})();

let lastUrl = null;   // last received frame (redrawn on resize)
let lastSig = '';     // dedupe signature of the last frame
let paintGen = 0;     // generation counter — stale onloads never paint

// ─── Canvas sizing ────────────────────────────────────────
function fillWhite() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function resize() {
    canvas.width = Math.max(1, window.innerWidth || 512);
    canvas.height = Math.max(1, window.innerHeight || 512);
    // An enabled preview with no frame yet must read as white,
    // never as a black square on the ped.
    fillWhite();
    if (lastUrl) paint(lastUrl, true);
}
window.addEventListener('resize', resize);
resize();

// ─── Frame dedupe (length + sampled char hash) ────────────
function sig(s) {
    let h = s.length >>> 0;
    for (let i = 0; i < 8; i++) {
        const p = Math.floor(s.length * (i + 0.5) / 8);
        h = ((h * 31) + s.charCodeAt(p)) >>> 0;
    }
    return s.length + ':' + h;
}

// ─── Painter (stretch-fit; frames are normally canvas-sized) ─
function paint(url, force) {
    if (!url || typeof url !== 'string' || url.indexOf('data:image') !== 0) return;
    const g = sig(url);
    if (!force && g === lastSig) return;
    lastSig = g;
    lastUrl = url;
    const gen = ++paintGen;
    const img = new Image();
    img.onload = () => {
        if (gen !== paintGen) return; // a newer frame already landed
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = url;
}

// ─── Lua → page frames (SendDuiMessage) ───────────────────
window.addEventListener('message', (e) => {
    const data = e && e.data;
    if (!data || typeof data !== 'object') return;
    if (data.action === 'frame') paint(data.frame);
});

// ─── page → Lua readiness handshake ───────────────────────
// Retry until one POST resolves OK (max 30 tries, 1 s apart).
let tries = 0;
function announce() {
    tries++;
    fetch('https://cfx-nui-' + RESOURCE + '/duiReady', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: '{}',
    })
        .then((r) => {
            if (!r.ok) throw new Error('http ' + r.status);
            // Acknowledged — Lua now re-sends the latest frame.
        })
        .catch(() => {
            if (tries < 30) setTimeout(announce, 1000);
        });
}
announce();

// Tiny surface for debugging from the DUI devtools.
window.DuiReceiver = { paint };

})();
