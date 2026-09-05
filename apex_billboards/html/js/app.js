/*
    Apex Billboards — html/js/app.js
    Studio UI: creation wizard (SHAPE → PLACE → CONTENT → CREATE),
    management dashboard, placement HUD, toasts.

    The content editor's preview iframe loads board.html — the SAME
    engine that renders in-world — so what you frame here is exactly
    what the billboard shows.
*/

'use strict';

const RES = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName() : 'apex_billboards';

function post(name, data) {
    return fetch(`https://${RES}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(data || {}),
    }).then(r => r.json()).catch(() => ({}));
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ─── i18n ────────────────────────────────────────────────────
// The server ships the active locale's `ui` table on open. Every label in
// index.html carries data-i18n / data-i18n-title / data-i18n-ph; anything
// built at runtime calls t() directly. A missing key falls back to the
// English text already in the markup, so a half-translated locale file
// degrades gracefully instead of showing blanks.
let L = {};

function t(key, ...args) {
    let s = L[key];
    if (typeof s !== 'string') return key;
    args.forEach((a) => { s = s.replace('%s', a); });
    return s;
}

function applyLocale() {
    $$('[data-i18n]').forEach((el) => {
        const v = L[el.dataset.i18n];
        if (typeof v === 'string') el.textContent = v;
    });
    $$('[data-i18n-title]').forEach((el) => {
        const v = L[el.dataset.i18nTitle];
        if (typeof v === 'string') el.title = v;
    });
    $$('[data-i18n-ph]').forEach((el) => {
        const v = L[el.dataset.i18nPh];
        if (typeof v === 'string') el.placeholder = v;
    });
}

// ─── State ───────────────────────────────────────────────────
const defContent = () => ({
    mode: 'single', urls: [''],
    fit: 'fill', letterbox: '#000000',
    zoom: 1, panX: 0, panY: 0,
    anim: 'none', panels: 0, motion: 'dwell',
    panelSeconds: 8, itemSeconds: 10,
    audio: false, volume: 1,
    transparent: false,     // false = opaque backdrop (no wall showing through)
});

// Same parser as the content engine — used for thumbnails and hints.
function ytId(url) {
    if (typeof url !== 'string') return null;
    const m = url.match(
        /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

const S = {
    open: false,
    ctx: {},
    boards: [],
    brand: '#1F5EFF',
    tab: 'create',
    step: 'shape',
    placed: null,          // placeDone payload
    editId: null,
    confirm: null,         // pending confirm-modal action
    wizard: null,
};

function resetWizard() {
    S.wizard = {
        shape: 'free', mode: 'world', name: '',
        content: defContent(),
        offset: 0.03, doubleSided: false, renderDist: 400,
        size: 4.0, aspect: 16 / 9, rot: 0,      // 'Image' shape
        relocateId: null, relocateBoard: null,
    };
    S.placed = null;
    $('#in-size').value = 40; $('#size-val').textContent = '4.0 m';
    $('#in-rot').value = 0; $('#rot-val').textContent = '0°';
    $('#in-name').value = '';
    $('#name-count').textContent = '0/40';
    $('#in-offset').value = 3; $('#off-val').textContent = '3 cm';
    $('#in-depth').value = 3; $('#depth-val').textContent = '3 cm';
    $('#in-offset-num').value = 0.03; $('#in-depth-num').value = 0.03;
    $('#in-dist').value = 400; $('#dist-val').textContent = '400 m';
    $('#in-double').checked = false;
    $$('#seg-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === 'world'));
    $$('#shape-grid .shape').forEach(b => b.classList.toggle('on', b.dataset.shape === 'free'));
    updateHints();
    if (wizardEditor) wizardEditor.set(S.wizard.content);
}

// ─── Image upload ────────────────────────────────────────────
// No image host, no API key: the picked file is downscaled and
// re-compressed in the browser until it fits Config.content.maxUploadKB,
// then stored inline with the board as a data: URL. That syncs to every
// client like any other content.
function isDataUrl(u) { return typeof u === 'string' && u.startsWith('data:image/'); }

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const maxPx = S.ctx.uploadMaxPx || 1600;
        const maxBytes = (S.ctx.maxUploadKB || 512) * 1024;
        const fr = new FileReader();
        fr.onerror = () => reject(new Error('read'));
        fr.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('decode'));
            img.onload = () => {
                let { width: w, height: h } = img;
                const scale = Math.min(1, maxPx / Math.max(w, h));
                w = Math.max(1, Math.round(w * scale));
                h = Math.max(1, Math.round(h * scale));

                const cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);

                // PNG keeps transparency but is heavy; fall back to JPEG and
                // walk the quality down until the payload fits the cap.
                const hasAlpha = /png|webp/i.test(file.type);
                let out = hasAlpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
                let q = 0.85;
                while (out.length * 0.75 > maxBytes && q >= 0.4) {
                    out = cv.toDataURL('image/jpeg', q);
                    q -= 0.1;
                }
                if (out.length * 0.75 > maxBytes) {
                    return reject(new Error('too_big'));
                }
                resolve({ url: out, w: img.width, h: img.height,
                          kb: Math.round(out.length * 0.75 / 1024) });
            };
            img.src = fr.result;
        };
        fr.readAsDataURL(file);
    });
}

// The board's natural aspect ratio, so the 'Image' shape never stretches.
function detectAspect(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        if (ytId(url)) return resolve(16 / 9);
        if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(url)) {
            const v = document.createElement('video');
            v.onloadedmetadata = () => resolve(v.videoWidth / Math.max(1, v.videoHeight));
            v.onerror = () => resolve(null);
            v.src = url;
            return;
        }
        const i = new Image();
        i.onload = () => resolve(i.naturalWidth / Math.max(1, i.naturalHeight));
        i.onerror = () => resolve(null);
        i.src = url;
    });
}

// Feed the traced 'Image' ghost the real aspect of whatever content is set.
function syncFreeAspect() {
    if (!S.wizard || S.wizard.shape !== 'free') return;
    const url = (S.wizard.content.urls || []).find(Boolean);
    detectAspect(url).then((a) => {
        if (!a || !S.wizard || S.wizard.shape !== 'free') return;
        S.wizard.aspect = a;
        post('bb:freeSize', { aspect: a });
    });
}

// Recommended source resolution for a board aspect: longest side 1920,
// rounded to even numbers (what a designer should export).
function pxFor(aspect) {
    aspect = Math.max(0.05, Math.min(20, +aspect || 1.78));
    let w, h;
    if (aspect >= 1) { w = 1920; h = Math.round(1920 / aspect); }
    else { h = 1920; w = Math.round(1920 * aspect); }
    w -= w % 2; h -= h % 2;
    return { w, h };
}

// Strip empty URLs / coerce numbers before anything leaves the UI
function cleanContent(c) {
    const out = JSON.parse(JSON.stringify(c));
    // Lua encodes empty tables as {} — normalise to a real array first
    out.urls = (Array.isArray(out.urls) ? out.urls : [])
        .map(u => (u || '').trim()).filter(Boolean);
    out.zoom = +out.zoom || 1;
    out.panX = +out.panX || 0;
    out.panY = +out.panY || 0;
    out.panels = +out.panels || 0;
    out.panelSeconds = +out.panelSeconds || 8;
    out.itemSeconds = +out.itemSeconds || 10;
    out.audio = out.audio === true;
    out.transparent = out.transparent === true;
    out.volume = Math.max(0, Math.min(1, +out.volume || 0));
    if (out.mode === 'single' && out.urls.length > 1) out.urls = [out.urls[0]];
    return out;
}

// Push the wizard's non-content settings (name, depth, double-sided) to
// the in-world ghost RIGHT NOW — no debounce, so dragging the depth
// slider moves the surface under the cursor in real time.
function pushGhost() {
    if (!S.wizard) return;
    post('bb:previewContent', {
        content: cleanContent(S.wizard.content),
        extra: {
            name: S.wizard.name,
            offset: S.wizard.offset,
            doubleSided: S.wizard.doubleSided,
        },
    });
}

// Depth is stored in METRES. The sliders give fine control over the usual
// range (±2 m) while the number boxes accept anything up to the server's
// sanity bound — so a board can be pushed arbitrarily far off the wall, or
// sunk arbitrarily deep into it.
function depthLimit() { return S.ctx.maxDepth || 100; }

function fmtDepth(m) {
    return Math.abs(m) < 1
        ? Math.round(m * 100) + ' cm'
        : (Math.round(m * 100) / 100).toFixed(2) + ' m';
}

// Both wizard depth controls (step 02 and step 04) drive the same value
// and stay in sync with each other.
function setDepth(metres) {
    const lim = depthLimit();
    let m = +metres;
    if (!isFinite(m)) m = 0;
    m = Math.max(-lim, Math.min(lim, m));
    m = Math.round(m * 1000) / 1000;
    S.wizard.offset = m;

    // the slider only spans ±2 m — it pins at the edge for bigger values,
    // which is honest: the number box is the source of truth then
    const cm = Math.max(-200, Math.min(200, Math.round(m * 100)));
    $('#in-depth').value = cm;
    $('#in-offset').value = cm;
    $('#in-depth-num').value = m;
    $('#in-offset-num').value = m;

    const label = fmtDepth(m);
    $('#depth-val').textContent = label;
    $('#off-val').textContent = label;
    pushGhost();
}

// ─── Toasts ──────────────────────────────────────────────────
const TOAST_ICONS = { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-circle-exclamation' };
function toast(msg, kind) {
    kind = TOAST_ICONS[kind] ? kind : 'info';
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<i class="fa-solid ${TOAST_ICONS[kind]}"></i><span></span>`;
    el.querySelector('span').textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
}

// ─── Content editor component ────────────────────────────────
// Mounted twice: wizard step 3 (live → updates the in-world ghost) and
// the dashboard edit modal (iframe preview only).
function ContentEditor(mountSel, opts) {
    const mount = $(mountSel);
    let content = defContent();
    let aspect = 16 / 6;
    let mask = null;
    const live = !!opts.live;

    mount.innerHTML = `
        <div class="ce-preview">
            <iframe src="board.html?preview=1"></iframe>
            <div class="drag"></div>
            <div class="badge"><i class="fa-solid fa-hand"></i> ${t('drag_hint')}</div>
        </div>
        <p class="hint" style="margin-top:2px">${t('live_preview')}</p>
        <div class="ce-px"><i class="fa-solid fa-expand"></i><span></span></div>

        <div class="fld-top"><span>${t('content_mode')}</span></div>
        <div class="seg ce-mode">
            <button data-v="single" class="on">${t('single')}</button>
            <button data-v="playlist">${t('playlist')}</button>
        </div>

        <div class="fld-top" style="margin-top:14px"><span>${t('content')}<span class="ce-plural">s</span></span></div>
        <div class="ce-upload">
            <input type="file" class="ce-file" accept="image/*">
            <button class="up-btn"><i class="fa-solid fa-arrow-up-from-bracket"></i> ${t('upload_image')}</button>
            <span class="up-info"><i class="fa-solid fa-check"></i><em class="up-kb"></em>
                <button><i class="fa-solid fa-xmark"></i></button></span>
        </div>
        <div class="ce-urls"></div>
        <button class="url-add"><i class="fa-solid fa-plus"></i> ${t('add_url')}</button>
        <p class="hint">${t('hint_content')}</p>

        <div class="fld-top"><span>${t('audio')}</span></div>
        <label class="switch-row ce-audio-row">
            <span><i class="fa-solid fa-volume-high"></i> <span>${t('play_sound')}</span></span>
            <span class="switch"><input type="checkbox" class="ce-audio"><i></i></span>
        </label>
        <div class="ce-vol-box" style="display:none">
            <div class="fld-top"><span>${t('volume')}</span>
                <span class="counter"><b class="ce-vol-val">100%</b></span></div>
            <input type="range" class="ce-vol" min="0" max="100" step="5" value="100">
            <p class="hint ce-vol-hint"></p>
        </div>

        <div class="fld-top"><span>${t('image_fit')}</span></div>
        <div class="chips ce-fit">
            <button class="chip on" data-v="fill">${t('fill')}</button>
            <button class="chip" data-v="fit">${t('fit_whole')}</button>
        </div>

        <div class="fld-top" style="margin-top:14px"><span>${t('background')}</span></div>
        <div class="color-row ce-lb">
            <input type="color" value="#000000">
            <em class="bg-note">${t('hint_background')}</em>
        </div>
        <label class="switch-row ce-trans-row">
            <span><i class="fa-regular fa-eye"></i> <span>${t('see_through')}</span></span>
            <span class="switch"><input type="checkbox" class="ce-trans"><i></i></span>
        </label>

        <div class="fld-top" style="margin-top:14px"><span>${t('animation')}</span></div>
        <div class="chips ce-anim">
            <button class="chip on" data-v="none">${t('anim_none')}</button>
            <button class="chip" data-v="kenburns">${t('anim_kenburns')}</button>
            <button class="chip" data-v="zoom">${t('anim_zoom')}</button>
            <button class="chip" data-v="pan">${t('anim_pan')}</button>
            <button class="chip" data-v="fade">${t('anim_fade')}</button>
            <button class="chip" data-v="pulse">${t('anim_pulse')}</button>
            <button class="chip" data-v="sway">${t('anim_sway')}</button>
            <button class="chip" data-v="carousel">${t('anim_carousel')}</button>
        </div>

        <div class="ce-carousel" style="display:none">
            <div class="fld-top" style="margin-top:14px"><span>${t('panels')}</span></div>
            <div class="chips ce-panels">
                <button class="chip on" data-v="0">${t('auto')}</button>
                <button class="chip" data-v="2">2</button><button class="chip" data-v="3">3</button>
                <button class="chip" data-v="4">4</button><button class="chip" data-v="5">5</button>
                <button class="chip" data-v="6">6</button>
            </div>
            <div class="fld-top" style="margin-top:12px"><span>${t('motion')}</span></div>
            <div class="seg ce-motion">
                <button data-v="dwell" class="on">${t('motion_dwell')}</button>
                <button data-v="scroll">${t('motion_scroll')}</button>
            </div>
            <div class="fld-top" style="margin-top:12px"><span>${t('seconds_panel')}</span>
                <span class="counter"><b class="ce-secs-val">8s</b></span></div>
            <input type="range" class="ce-secs" min="2" max="30" step="1" value="8">
        </div>

        <div class="ce-playlist" style="display:none">
            <div class="fld-top" style="margin-top:12px"><span>${t('seconds_item')}</span>
                <span class="counter"><b class="ce-item-val">10s</b></span></div>
            <input type="range" class="ce-item" min="3" max="120" step="1" value="10">
        </div>
    `;

    const iframe = mount.querySelector('iframe');
    const urlsBox = mount.querySelector('.ce-urls');

    // ── preview push (iframe + optional in-world ghost) ──
    let liveTimer = null;
    function pushPreview() {
        // The studio preview is ALWAYS silent — the real (distance-faded)
        // volume is driven in-world by the Lua render loop.
        const c = cleanContent(content);
        const payload = {
            action: 'load',
            content: Object.assign({}, c, { audio: false, volume: 0 }),
            aspect, crop: [0, 1], mask,
            brand: S.brand, preview: true,
        };
        try { iframe.contentWindow.postMessage(payload, '*'); } catch (e) {}
        if (live) {
            clearTimeout(liveTimer);
            liveTimer = setTimeout(() => {
                post('bb:previewContent', {
                    content: cleanContent(content),
                    extra: {
                        name: S.wizard ? S.wizard.name : undefined,
                        offset: S.wizard ? S.wizard.offset : undefined,
                        doubleSided: S.wizard ? S.wizard.doubleSided : undefined,
                    },
                });
            }, 180);
        }
        if (opts.onChange) opts.onChange(content);
    }

    // ── url rows ──
    function renderUrls() {
        urlsBox.innerHTML = '';
        const max = (S.ctx.limits && S.ctx.limits.maxPlaylist) || 10;
        const list = content.mode === 'playlist' ? content.urls : content.urls.slice(0, 1);
        list.forEach((u, i) => {
            // An uploaded image lives in urls[0] as a huge data: string —
            // showing it in a text box would be useless (and unusable), so
            // that slot is represented by the upload chip instead.
            if (i === 0 && isDataUrl(u)) return;

            const row = document.createElement('div');
            row.className = 'url-row';
            row.innerHTML = `<input type="text" placeholder="${t('url_placeholder')}">
                             <button><i class="fa-solid fa-xmark"></i></button>`;
            const inp = row.querySelector('input');
            inp.value = u || '';
            inp.addEventListener('input', () => { content.urls[i] = inp.value; });
            // a YouTube/mp4 link unlocks the audio controls → re-sync;
            // a new image also reshapes the 'Image' board's ghost
            inp.addEventListener('change', () => {
                syncVisibility(); pushPreview();
                if (live) syncFreeAspect();
            });
            const del = row.querySelector('button');
            del.style.display = list.length > 1 ? '' : 'none';
            del.addEventListener('click', () => {
                content.urls.splice(i, 1);
                renderUrls(); syncVisibility(); pushPreview();
            });
            urlsBox.appendChild(row);
        });
        const addBtn = mount.querySelector('.url-add');
        addBtn.style.display =
            (content.mode === 'playlist' && content.urls.length < max) ? '' : 'none';
        mount.querySelector('.ce-plural').style.display =
            content.mode === 'playlist' ? '' : 'none';
    }
    mount.querySelector('.url-add').addEventListener('click', () => {
        content.urls.push('');
        renderUrls();
    });

    // ── upload (first slot only) ──
    const fileInput = mount.querySelector('.ce-file');
    const upBtn = mount.querySelector('.up-btn');
    const upInfo = mount.querySelector('.up-info');

    function syncUploadUI() {
        const allowed = S.ctx.allowUploads !== false;
        const uploaded = isDataUrl(content.urls[0]);
        mount.querySelector('.ce-upload').style.display = allowed ? '' : 'none';
        upBtn.style.display = uploaded ? 'none' : '';
        upInfo.classList.toggle('on', uploaded);
        if (uploaded) {
            const kb = Math.round(content.urls[0].length * 0.75 / 1024);
            mount.querySelector('.up-kb').textContent = t('uploaded', kb);
        }
    }

    upBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';           // so picking the same file twice re-fires
        if (!file) return;

        upBtn.classList.add('busy');
        upBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('processing')}`;
        fileToDataUrl(file).then((res) => {
            content.urls[0] = res.url;
            if (content.mode === 'single') content.urls = [res.url];
            renderUrls(); syncUploadUI(); syncVisibility(); pushPreview();
            if (live) syncFreeAspect();
            toast(t('image_ready', res.kb, `${res.w}×${res.h}`), 'success');
        }).catch((err) => {
            toast(err && err.message === 'too_big'
                ? t('image_too_big', S.ctx.maxUploadKB || 512)
                : t('image_unreadable'), 'error');
        }).finally(() => {
            upBtn.classList.remove('busy');
            upBtn.innerHTML =
                `<i class="fa-solid fa-arrow-up-from-bracket"></i> ${t('upload_image')}`;
        });
    });

    upInfo.querySelector('button').addEventListener('click', () => {
        content.urls[0] = '';
        renderUrls(); syncUploadUI(); syncVisibility(); pushPreview();
    });

    // ── generic pickers ──
    function bindSeg(sel, key, after) {
        mount.querySelectorAll(sel + ' > button, ' + sel + ' > .chip').forEach(b => {
            b.addEventListener('click', () => {
                mount.querySelectorAll(sel + ' > button, ' + sel + ' > .chip')
                    .forEach(x => x.classList.remove('on'));
                b.classList.add('on');
                content[key] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
                if (after) after();
                syncVisibility();
                pushPreview();
            });
        });
    }
    bindSeg('.ce-mode', 'mode', () => {
        if (content.mode === 'playlist' && content.urls.length < 2) content.urls.push('');
        renderUrls();
    });
    bindSeg('.ce-fit', 'fit');
    bindSeg('.ce-anim', 'anim');
    bindSeg('.ce-panels', 'panels');
    bindSeg('.ce-motion', 'motion');

    const lb = mount.querySelector('.ce-lb input');
    lb.addEventListener('input', () => { content.letterbox = lb.value; pushPreview(); });

    // Opting out of the backdrop: the wall shows through wherever the
    // content doesn't paint (alpha PNGs, and yes — between playlist items).
    const trans = mount.querySelector('.ce-trans');
    trans.addEventListener('change', () => {
        content.transparent = trans.checked;
        syncVisibility();
        pushPreview();
    });

    // ── audio ──
    // The wizard/edit previews stay MUTED (an iframe screaming in the
    // studio would be maddening); the real volume is driven in-world by
    // the Lua side, attenuated by distance.
    const audioBox = mount.querySelector('.ce-audio');
    const vol = mount.querySelector('.ce-vol');
    audioBox.addEventListener('change', () => {
        content.audio = audioBox.checked;
        syncVisibility();
        pushPreview();
    });
    vol.addEventListener('input', () => {
        content.volume = (+vol.value) / 100;
        mount.querySelector('.ce-vol-val').textContent = vol.value + '%';
        pushPreview();
    });

    const secs = mount.querySelector('.ce-secs');
    secs.addEventListener('input', () => {
        content.panelSeconds = +secs.value;
        mount.querySelector('.ce-secs-val').textContent = secs.value + 's';
        pushPreview();
    });
    const item = mount.querySelector('.ce-item');
    item.addEventListener('input', () => {
        content.itemSeconds = +item.value;
        mount.querySelector('.ce-item-val').textContent = item.value + 's';
        pushPreview();
    });

    // ── framing: drag to pan, scroll to zoom ──
    const drag = mount.querySelector('.drag');
    let dragging = null;
    drag.addEventListener('mousedown', (e) => {
        dragging = { x: e.clientX, y: e.clientY, panX: content.panX, panY: content.panY };
    });
    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const r = drag.getBoundingClientRect();
        content.panX = Math.max(-1, Math.min(1, dragging.panX + (e.clientX - dragging.x) / (r.width / 2)));
        content.panY = Math.max(-1, Math.min(1, dragging.panY + (e.clientY - dragging.y) / (r.height / 2)));
        pushPreview();
    });
    window.addEventListener('mouseup', () => { dragging = null; });
    drag.addEventListener('wheel', (e) => {
        e.preventDefault();
        const f = e.deltaY < 0 ? 1.07 : 1 / 1.07;
        content.zoom = Math.max(1, Math.min(4, (content.zoom || 1) * f));
        pushPreview();
    }, { passive: false });

    // Recommended source resolution for the current board aspect —
    // carousel multiplies the width by the panel count.
    function updatePx() {
        const p = pxFor(aspect);
        let txt = t('recommended', `${p.w}×${p.h} px`);
        if (content.anim === 'carousel') {
            const n = content.panels >= 2 ? content.panels : 0;
            txt += '  ·  ' + (n
                ? t('carousel_panels', n, `${p.w * n}×${p.h} px`)
                : t('carousel_auto'));
        }
        mount.querySelector('.ce-px span').textContent = txt;
    }

    function syncVisibility() {
        mount.querySelector('.ce-carousel').style.display =
            content.anim === 'carousel' ? '' : 'none';
        mount.querySelector('.ce-playlist').style.display =
            content.mode === 'playlist' ? '' : 'none';
        // The background colour is pointless on a see-through board
        mount.querySelector('.ce-lb').style.display =
            content.transparent ? 'none' : '';

        // Audio only makes sense for video/YouTube content, and the
        // server can veto it entirely (Config.audio.enabled = false).
        const hasSound = (content.urls || []).some(u =>
            ytId(u) || /\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(u || ''));
        const allowed = S.ctx.audio !== false;
        mount.querySelector('.ce-audio-row').style.display =
            (allowed && hasSound) ? '' : 'none';
        mount.querySelector('.ce-vol-box').style.display =
            (allowed && hasSound && content.audio) ? '' : 'none';
        mount.querySelector('.ce-vol-hint').textContent =
            t('hint_volume', S.ctx.audioDist || 30);

        updatePx();
    }

    function syncControls() {
        const pick = (sel, v) => mount.querySelectorAll(sel + ' > button, ' + sel + ' > .chip')
            .forEach(b => b.classList.toggle('on', b.dataset.v == v));
        pick('.ce-mode', content.mode);
        pick('.ce-fit', content.fit);
        pick('.ce-anim', content.anim);
        pick('.ce-panels', content.panels || 0);
        pick('.ce-motion', content.motion);
        lb.value = content.letterbox || '#000000';
        trans.checked = content.transparent === true;
        secs.value = content.panelSeconds || 8;
        mount.querySelector('.ce-secs-val').textContent = secs.value + 's';
        item.value = content.itemSeconds || 10;
        mount.querySelector('.ce-item-val').textContent = item.value + 's';
        audioBox.checked = content.audio === true;
        vol.value = Math.round((content.volume != null ? content.volume : 1) * 100);
        mount.querySelector('.ce-vol-val').textContent = vol.value + '%';
        renderUrls();
        syncUploadUI();
        syncVisibility();
    }

    // preview aspect box follows the real board shape
    function setAspect(a, m) {
        aspect = Math.max(0.2, Math.min(8, a || 16 / 6));
        mask = m || null;
        mount.querySelector('.ce-preview').style.aspectRatio =
            Math.max(1.2, Math.min(4, aspect)) + ' / 1';
        updatePx();
        pushPreview();
    }

    iframe.addEventListener('load', pushPreview);
    syncControls();

    return {
        get: () => cleanContent(content),
        raw: () => content,
        set(c, a, m) {
            content = Object.assign(defContent(), JSON.parse(JSON.stringify(c || {})));
            if (!Array.isArray(content.urls) || !content.urls.length) content.urls = [''];
            syncControls();
            if (a) setAspect(a, m); else pushPreview();
        },
        setAspect,
        push: pushPreview,
    };
}

let wizardEditor = null;
let editEditor = null;

// The content editors build their markup from the locale, but they are
// first mounted at boot — before the server has told us which language to
// use. Rebuilding them once the locale arrives is cheaper (and far less
// error-prone) than tagging every generated node with data-i18n.
function rebuildEditors() {
    wizardEditor = ContentEditor('#wizard-editor', {
        live: true,
        onChange: (c) => { if (S.wizard) S.wizard.content = c; },
    });
    editEditor = ContentEditor('#edit-editor', { live: false });
}

// ─── Wizard navigation (numbered accordion 01→04) ────────────
const STEPS = ['shape', 'place', 'content', 'create'];
function gotoStep(step) {
    S.step = step;
    const cur = STEPS.indexOf(step);
    $$('.sec').forEach(el => {
        const i = STEPS.indexOf(el.dataset.step);
        const done = i < cur;
        // forward sections are reachable once a surface is confirmed
        const reachable = i <= cur || (S.placed && !S.wizard.relocateId);
        el.classList.toggle('open', i === cur);
        el.classList.toggle('done', done);
        el.classList.toggle('locked', !reachable && i > cur);
    });
    $$('.step').forEach(el => el.classList.remove('active'));
    $('#step-' + step).classList.add('active');
    if (step === 'create') renderSummary();
}

function switchTab(tab) {
    S.tab = tab;
    $$('.st-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#view-create').classList.toggle('active', tab === 'create');
    $('#view-manage').classList.toggle('active', tab === 'manage');
}

const SHAPES = ['free', 'rect', 'circle', 'poly', 'wrap'];
const shapeHint = (s) => t('hint_shape_' + s);
const shapeLabel = (s) => t('shape_' + s);
function updateHints() {
    const w = S.wizard;

    // The placement selector is hidden entirely when the server turned
    // vehicle boards off (Config.vehicles.enabled = false).
    const vehOn = S.ctx.vehicles !== false;
    $('#seg-mode').style.display = vehOn ? '' : 'none';

    $('#mode-hint').textContent =
        t(w.mode === 'vehicle' ? 'hint_vehicle' : 'hint_world');
    $('#shape-hint').textContent = shapeHint(w.shape);

    const free = w.shape === 'free';
    $('#cta-title').textContent = t(free ? 'cta_free' : 'cta_trace');
    $('#cta-sub').textContent = t(free ? 'cta_free_sub' : 'cta_trace_sub');

    // Wrap needs two walls meeting at a corner — meaningless on a car.
    const wrapBtn = $('#shape-grid .shape[data-shape="wrap"]');
    wrapBtn.style.opacity = w.mode === 'vehicle' ? .35 : 1;
    wrapBtn.style.pointerEvents = w.mode === 'vehicle' ? 'none' : '';

    // Size sliders only make sense for the one-click image board
    $('#free-size').style.display = w.shape === 'free' ? '' : 'none';
}

function renderSummary() {
    const w = S.wizard, p = S.placed || {};
    const c = cleanContent(w.content);
    const rows = [
        [t('summary_name'), w.name || 'Untitled'],
        [t('summary_shape'), shapeLabel(p.shape || w.shape).toUpperCase()],
        [t('summary_size'), p.w ? `${p.w} m × ${p.h} m` : '—'],
        [t('summary_place'), t(w.mode === 'vehicle' ? 'vehicle' : 'world').toUpperCase()],
        [t('summary_content'), c.urls.length
            ? t('summary_urls', c.urls.length, t('anim_' + c.anim))
            : t('summary_ph')],
    ];
    if ((S.ctx.createCost || 0) > 0 && !S.ctx.manager) {
        rows.push([t('summary_fee'), '$' + S.ctx.createCost]);
    }
    $('#summary').innerHTML = rows
        .map(r => `<div class="row"><span>${r[0]}</span><b></b></div>`).join('');
    $$('#summary .row b').forEach((el, i) => el.textContent = rows[i][1]);
}

// ─── Placement flow ──────────────────────────────────────────
function startPlacement() {
    const w = S.wizard;
    post('bb:startPlace', {
        shape: w.shape, mode: w.mode,
        relocateId: w.relocateId || undefined,
        name: w.name || 'Untitled',
        content: cleanContent(w.content),
        offset: w.offset, doubleSided: w.doubleSided,
        size: w.size, aspect: w.aspect, rot: w.rot,   // 'Image' shape
    });
    $('#measure').classList.remove('has');
}

function onPlaceDone(d) {
    S.placed = d;
    $('#cc-dims').textContent = `${shapeLabel(d.shape)} · ${d.w} m × ${d.h} m`;
    const cpx = pxFor(d.w / Math.max(0.05, d.h));
    $('#cc-px').textContent = `${cpx.w} × ${cpx.h} px`;
    $('#cc-nodes').textContent = `${d.nodes}`;

    switchTab('create');
    gotoStep('place');
    if (wizardEditor) {
        wizardEditor.setAspect(d.w / Math.max(0.1, d.h),
            d.shape === 'circle' ? { type: 'circle' } : null);
    }
    // The image board takes its shape from the content — make sure the
    // ghost already matches whatever is loaded.
    syncFreeAspect();
}

function confirmSurface() {
    const w = S.wizard;
    if (w.relocateId && w.relocateBoard) {
        // Relocation keeps everything else — save immediately.
        const b = w.relocateBoard;
        post('bb:create', {
            name: b.name, content: b.content,
            offset: b.offset, doubleSided: b.doubleSided,
            renderDist: b.renderDist, enabled: b.enabled !== false,
        }).then(() => {
            resetWizard(); gotoStep('shape'); switchTab('manage');
        });
        return;
    }
    gotoStep('content');
    if (wizardEditor) wizardEditor.push();
}

function createBoard() {
    const w = S.wizard;
    $('#btn-create').disabled = true;
    post('bb:create', {
        name: w.name || 'Untitled',
        content: cleanContent(w.content),
        offset: w.offset, doubleSided: w.doubleSided,
        renderDist: w.renderDist, enabled: true,
    }).then((r) => {
        $('#btn-create').disabled = false;
        if (r && r.ok) {
            resetWizard(); gotoStep('shape'); switchTab('manage');
        }
    });
}

// ─── Manage dashboard ────────────────────────────────────────
function canManage(b) {
    return S.ctx.manager || b.owner === S.ctx.owner;
}

// The first url is NOT necessarily the one that plays: the editor seeds
// `urls: ['']` and a playlist can carry blank rows, so a board with real
// content would otherwise thumbnail as an empty icon. Take the first url that
// actually holds something.
function firstUrl(b) {
    const urls = (b.content && b.content.urls) || [];
    for (const u of urls) {
        const s = typeof u === 'string' ? u.trim() : '';
        if (s) return s;
    }
    return '';
}

function thumbFor(b) {
    const url = firstUrl(b);
    if (!url) return '<i class="fa-regular fa-image"></i>';

    const yt = ytId(url);
    if (yt) {
        // hqdefault is missing on a few uploads (and on some Shorts), which used
        // to drop straight to the icon. Walk down the sizes before giving up.
        const fallbacks = [
            `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`,
            `https://i.ytimg.com/vi/${yt}/default.jpg`,
        ];
        return `<img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg"
            referrerpolicy="no-referrer" data-fallbacks="${fallbacks.join('|')}"
            onerror="bbThumbFail(this)">`;
    }

    if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(url)) {
        // preload=metadata gets a first frame decoded even when autoplay is
        // throttled, so the tile is never just a black box.
        return `<video src="${encodeURI(url)}" preload="metadata"
            muted loop autoplay playsinline onerror="bbThumbFail(this)"></video>`;
    }

    // No loading="lazy": the Network panel is display:none until you open it,
    // and a lazy image inside a hidden ancestor can sit undecoded, which is
    // exactly the "thumbnail missing" case. These tiles are 74×46 — load them.
    return `<img src="${encodeURI(url)}" referrerpolicy="no-referrer"
        onerror="bbThumbFail(this)">`;
}

// Walk any remaining fallback urls, then settle on an icon. Global because the
// handlers live in markup built with innerHTML.
window.bbThumbFail = function (el) {
    const left = (el.dataset.fallbacks || '').split('|').filter(Boolean);
    if (left.length) {
        el.dataset.fallbacks = left.slice(1).join('|');
        el.src = left[0];
        return;
    }
    el.outerHTML = el.tagName === 'VIDEO'
        ? '<i class="fa-solid fa-film"></i>'
        : '<i class="fa-regular fa-image"></i>';
};

function renderList() {
    const q = ($('#mg-search').value || '').toLowerCase();
    const list = S.boards
        .filter(b => !q || (b.name || '').toLowerCase().includes(q))
        .sort((a, b) => b.id - a.id);

    $('#board-count').textContent = S.boards.length;
    $('#mg-count').textContent = t('placed', S.boards.length);
    $('#mg-empty').style.display = list.length ? 'none' : 'flex';

    const box = $('#mg-list');
    box.innerHTML = '';
    list.forEach(b => {
        const f = (b.faces && b.faces[0]) || { w: 0, h: 0 };
        let wTot = +f.w || 0;
        if (b.faces && b.faces[1]) wTot += +b.faces[1].w || 0;
        const card = document.createElement('div');
        card.className = 'bcard' + (b.enabled === false ? ' disabled' : '');
        card.innerHTML = `
            <div class="bthumb">${thumbFor(b)}</div>
            <div class="binfo">
                <div class="bname"></div>
                <div class="bmeta">
                    <span class="tag">${shapeLabel(b.shape)}</span>
                    ${b.kind === 'vehicle' ? `<span class="tag veh" title="${t('veh_board')}"><i class="fa-solid fa-car-side"></i></span>` : ''}
                    <span class="tag dim">${(+wTot).toFixed(1)}×${(+f.h).toFixed(1)}m</span>
                    <span class="tag px">${(() => { const p = pxFor(wTot / Math.max(0.05, +f.h || 1)); return p.w + '×' + p.h; })()} px</span>
                    ${b.content && b.content.audio ? '<span class="tag snd"><i class="fa-solid fa-volume-high"></i></span>' : ''}
                </div>
                <div class="bacts"></div>
            </div>`;
        card.querySelector('.bname').textContent = b.name || 'Untitled';

        const acts = card.querySelector('.bacts');
        const mk = (icon, title, fn, danger) => {
            const btn = document.createElement('button');
            btn.className = 'bact' + (danger ? ' danger' : '');
            btn.title = title;
            btn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
            btn.addEventListener('click', fn);
            acts.appendChild(btn);
        };
        mk('fa-location-arrow', t('act_goto'), () => post('bb:teleport', { id: b.id }));
        if (canManage(b)) {
            mk('fa-pen', t('act_edit'), () => openEdit(b));
            mk('fa-arrows-up-down-left-right', t('act_relocate'), () => startRelocate(b));
            mk('fa-clone', t('act_duplicate'), () => post('bb:duplicate', { id: b.id }));
            mk('fa-power-off', t(b.enabled === false ? 'act_enable' : 'act_disable'), () =>
                post('bb:update', { id: b.id, enabled: b.enabled === false }));
            mk('fa-trash', t('act_delete'), () => askConfirm(
                t('confirm_delete', b.name || 'Untitled'),
                () => post('bb:delete', { id: b.id })), true);
        }
        box.appendChild(card);
    });
}

function startRelocate(b) {
    resetWizard();
    S.wizard.relocateId = b.id;
    S.wizard.relocateBoard = b;
    S.wizard.shape = b.shape;
    S.wizard.mode = b.kind === 'vehicle' ? 'vehicle' : 'world';
    S.wizard.name = b.name;
    S.wizard.content = Object.assign(defContent(), b.content || {});
    S.wizard.offset = b.offset || 0.03;
    S.wizard.doubleSided = !!b.doubleSided;
    startPlacement();
}

// ─── Edit modal ──────────────────────────────────────────────
function openEdit(b) {
    S.editId = b.id;
    $('#ed-name').value = b.name || '';
    // seed the depth controls WITHOUT pushing a preview (nothing changed yet)
    const off = (b.offset != null) ? b.offset : 0.03;
    $('#ed-offset').value = Math.max(-200, Math.min(200, Math.round(off * 100)));
    $('#ed-offset-num').value = off;
    $('#ed-off-val').textContent = fmtDepth(off);
    $('#ed-dist').value = b.renderDist || 400;
    $('#ed-dist-val').textContent = (b.renderDist || 400) + ' m';
    $('#ed-double').checked = !!b.doubleSided;
    $('#ed-enabled').checked = b.enabled !== false;

    const f = (b.faces && b.faces[0]) || { w: 16, h: 6 };
    let aspect = f.w / Math.max(0.1, f.h);
    if (b.shape === 'wrap' && b.faces[1]) aspect = (f.w + b.faces[1].w) / Math.max(0.1, f.h);
    editEditor.set(b.content, aspect, f.mask || null);

    $('#modal-edit').classList.add('open');
}

// Depth of the board being edited: same metres-everywhere model as the
// wizard, previewed live on that one board.
function setEditDepth(metres) {
    const lim = depthLimit();
    let m = +metres;
    if (!isFinite(m)) m = 0;
    m = Math.max(-lim, Math.min(lim, Math.round(m * 1000) / 1000));

    $('#ed-offset').value = Math.max(-200, Math.min(200, Math.round(m * 100)));
    $('#ed-offset-num').value = m;
    $('#ed-off-val').textContent = fmtDepth(m);

    if (S.editId) post('bb:previewDepth', { id: S.editId, offset: m });
}

// Leaving the modal (Save or Cancel) always drops the live depth override
// so the board goes back to being drawn from its stored value.
function closeEdit() {
    post('bb:previewDepth', {});
    S.editId = null;
}

function saveEdit() {
    post('bb:update', {
        id: S.editId,
        name: $('#ed-name').value,
        content: editEditor.get(),
        offset: +$('#ed-offset-num').value,   // metres, the source of truth
        renderDist: +$('#ed-dist').value,
        doubleSided: $('#ed-double').checked,
        enabled: $('#ed-enabled').checked,
    }).then(() => {
        $('#modal-edit').classList.remove('open');
        closeEdit();
    });
}

// ─── Confirm modal ───────────────────────────────────────────
function askConfirm(text, fn) {
    $('#cf-text').textContent = text;
    S.confirm = fn;
    $('#modal-confirm').classList.add('open');
}

// ─── Wire up static controls ─────────────────────────────────
function bindUI() {
    $('#st-close').addEventListener('click', () => post('bb:close'));
    $$('.st-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // Accordion section headers navigate back (or forward once traced)
    $$('.sec .sec-head').forEach(h => h.addEventListener('click', () => {
        const sec = h.parentElement;
        const step = sec.dataset.step;
        if (sec.classList.contains('locked') || step === S.step) return;
        if (step === 'place' && !S.placed) return;
        gotoStep(step);
    }));

    // Dock collapse (map-builder idiom) — the noclip keeps flying with
    // the panel out of the way
    const setDock = (collapsed) => {
        $('#dock').classList.toggle('collapsed', collapsed);
        document.body.classList.toggle('dock-collapsed', collapsed);
        $('#dock-toggle i').className =
            'fa-solid ' + (collapsed ? 'fa-chevron-right' : 'fa-chevron-left');
    };
    $('#dock-toggle').addEventListener('click', () =>
        setDock(!$('#dock').classList.contains('collapsed')));
    $('#dock-reveal').addEventListener('click', () => setDock(false));

    // Freeze the noclip while typing into any text field (WASD ≠ fly)
    const isTextInput = (el) => el && el.matches && el.matches('input[type="text"]');
    document.addEventListener('focusin', (e) => {
        if (isTextInput(e.target)) post('bb:typing', { on: true });
    });
    document.addEventListener('focusout', (e) => {
        if (isTextInput(e.target)) post('bb:typing', { on: false });
    });

    $('#in-name').addEventListener('input', (e) => {
        S.wizard.name = e.target.value;
        $('#name-count').textContent = e.target.value.length + '/40';
    });

    $$('#seg-mode button').forEach(b => b.addEventListener('click', () => {
        $$('#seg-mode button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        S.wizard.mode = b.dataset.mode;
        // wrap is world-only; fall back to a rectangle when switching to a car
        if (S.wizard.mode === 'vehicle' && S.wizard.shape === 'wrap') {
            S.wizard.shape = 'rect';
            $$('#shape-grid .shape').forEach(x =>
                x.classList.toggle('on', x.dataset.shape === 'rect'));
        }
        updateHints();
    }));

    $$('#shape-grid .shape').forEach(b => b.addEventListener('click', () => {
        $$('#shape-grid .shape').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        S.wizard.shape = b.dataset.shape;
        updateHints();
    }));

    $('#btn-select-nodes').addEventListener('click', startPlacement);
    $('#btn-retry').addEventListener('click', startPlacement);
    $('#btn-confirm-surface').addEventListener('click', confirmSurface);

    $('#btn-content-back').addEventListener('click', () => gotoStep('place'));
    $('#btn-content-next').addEventListener('click', () => gotoStep('create'));
    $('#btn-create-back').addEventListener('click', () => gotoStep('content'));
    $('#btn-create').addEventListener('click', createBoard);

    $('#btn-cancel-wizard').addEventListener('click', () => {
        post('bb:cancelPlace');
        resetWizard();
        gotoStep('shape');
    });

    // Depth: sliders are in centimetres, number boxes in metres — both feed
    // the same value and the ghost follows live.
    $('#in-depth').addEventListener('input', (e) => setDepth((+e.target.value) / 100));
    $('#in-offset').addEventListener('input', (e) => setDepth((+e.target.value) / 100));
    $('#in-depth-num').addEventListener('input', (e) => setDepth(e.target.value));
    $('#in-offset-num').addEventListener('input', (e) => setDepth(e.target.value));

    // 'Image' shape: size + rotation reshape the ghost live (the height
    // always follows the image's own aspect, so nothing ever stretches)
    $('#in-size').addEventListener('input', (e) => {
        S.wizard.size = (+e.target.value) / 10;   // slider is in decimetres
        $('#size-val').textContent = S.wizard.size.toFixed(1) + ' m';
        post('bb:freeSize', { size: S.wizard.size });
    });
    $('#in-rot').addEventListener('input', (e) => {
        S.wizard.rot = +e.target.value;
        $('#rot-val').textContent = S.wizard.rot + '°';
        post('bb:freeSize', { rot: S.wizard.rot });
    });

    $('#in-dist').addEventListener('input', (e) => {
        S.wizard.renderDist = +e.target.value;
        $('#dist-val').textContent = e.target.value + ' m';
    });
    $('#in-double').addEventListener('change', (e) => {
        S.wizard.doubleSided = e.target.checked;
        pushGhost();
    });

    $('#mg-search').addEventListener('input', renderList);

    // modals
    $$('[data-close]').forEach(b => b.addEventListener('click', () => {
        $('#' + b.dataset.close).classList.remove('open');
        if (b.dataset.close === 'modal-edit') closeEdit();
    }));
    $('#ed-save').addEventListener('click', saveEdit);
    $('#cf-yes').addEventListener('click', () => {
        if (S.confirm) S.confirm();
        S.confirm = null;
        $('#modal-confirm').classList.remove('open');
    });
    // Live depth on the board being edited — the renderer redraws that one
    // board at this offset while you drag; the override is dropped when
    // the modal closes (Save persists it, Cancel just discards it).
    $('#ed-offset').addEventListener('input', (e) => setEditDepth((+e.target.value) / 100));
    $('#ed-offset-num').addEventListener('input', (e) => setEditDepth(e.target.value));
    $('#ed-dist').addEventListener('input', (e) =>
        $('#ed-dist-val').textContent = e.target.value + ' m');

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const openModal = $$('.modal.open')[0];
        if (openModal) {
            openModal.classList.remove('open');
            if (openModal.id === 'modal-edit') closeEdit();
        } else if (S.open) post('bb:close');
    });
}

// ─── Messages from Lua ───────────────────────────────────────
window.addEventListener('message', (e) => {
    const d = e.data || {};
    switch (d.action) {
        case 'open':
            S.open = true;
            S.ctx = d.ctx || {};
            S.boards = d.boards || [];
            S.brand = d.brand || '#1F5EFF';
            // Locale first: everything rendered below reads from it.
            L = (S.ctx.locale && S.ctx.locale.ui) || {};
            applyLocale();
            rebuildEditors();
            document.documentElement.style.setProperty('--accent', S.brand);
            document.body.classList.remove('hidden-ui');
            resetWizard();
            gotoStep('shape');
            switchTab('create');
            renderList();
            break;
        case 'close':
            S.open = false;
            document.body.classList.add('hidden-ui');
            document.body.classList.remove('placing');
            break;
        case 'boards':
            S.boards = d.boards || [];
            renderList();
            break;
        case 'placing':
            document.body.classList.toggle('placing', !!d.on);
            if (!d.on) $('#measure').classList.remove('has');
            break;
        case 'hud':
            if (d.mode === 'hidden') break;
            $('#hud-text').textContent = d.text || '';
            break;
        case 'measure': {
            $('#measure').classList.add('has');
            const mpx = pxFor(d.w / Math.max(0.05, d.h));
            $('#measure-val').textContent = `${d.w} m × ${d.h} m  ·  ${mpx.w}×${mpx.h} px`;
            break;
        }
        case 'reticle':
            $('#reticle').classList.toggle('bad', !d.ok);
            break;
        case 'flySpeed':
            $('#hud-speed').textContent = `${t('key_speed')} ${Math.round(d.speed)}`;
            break;
        case 'placeDone':
            onPlaceDone(d);
            break;
        case 'freeSize':
            // the Lua side rebuilt the image quad — refresh the readouts
            $('#cc-dims').textContent = `${shapeLabel('free')} · ${d.w} m × ${d.h} m`;
            $('#cc-px').textContent = (() => {
                const p = pxFor(d.w / Math.max(0.05, d.h));
                return `${p.w} × ${p.h} px`;
            })();
            if (wizardEditor) wizardEditor.setAspect(d.w / Math.max(0.05, d.h), null);
            break;
        case 'placeCancelled':
            resetWizard();
            gotoStep('shape');
            if (d.relocateId) switchTab('manage');
            break;
        case 'toast':
            toast(d.msg, d.kind);
            break;
    }
});

// ─── Boot ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    bindUI();
    rebuildEditors();   // rebuilt again on 'open', once the locale is known
    resetWizard();
});
