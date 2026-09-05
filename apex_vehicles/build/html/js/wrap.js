/* ════════════════════════════════════════════════════════════
   Apex Vehicle Studio — On-car controls (js/wrap.js)
   ------------------------------------------------------------
   Owns the four buttons in the 3D panel header:

     #preview-toggle  live preview on the REAL car (texture
                      replacement — needs the car to expose a
                      paintable texture name)
     #wrap-toggle     WRAP mode: projects the sheet onto the car's
                      body, so cars with no livery slot at all —
                      the ones that just spawn in a colour — can
                      still be painted (client/wrap.lua)
     #wrap-apply      push this wrap to every player, bound to the
                      car's plate, persisted server-side
     #wrap-remove     take the wrap off this car again

   Both toggles feed the SAME canvas frame transport: Lua only
   receives frames while App.state.previewOn is true, so turning
   either one on flips it (and turning both off clears it).

   While wrap mode is on, a guide is drawn over the canvas showing
   which region of the sheet lands on which body panel — the layout
   comes from Config.wrap.panels through the boot payload, so
   editing the config re-labels the guide with no JS change.
   ════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var Wrap = { on: false, building: false, plate: '' };

    /* app.js publishes the i18n helper as window.t */
    function t(key, fb) {
        if (window.t) { return window.t.apply(null, arguments); }
        return fb || key;
    }
    function byId(id) { return document.getElementById(id); }

    /* ── frame transport ──────────────────────────────────── */

    /* Lua pushes canvas frames to the DUI only while previewOn is
       true; both the car preview and the wrap need that stream. */
    function setFrames(on) {
        if (!window.App) { return; }
        App.state.previewOn = !!on;
        if (on && window.Editor && Editor.pushPreviewFrame) {
            Editor.pushPreviewFrame();
        }
    }
    function anyOn() {
        var pv = byId('preview-toggle');
        return Wrap.on || (pv && pv.classList.contains('on'));
    }

    function setToggle(el, on) {
        if (!el) { return; }
        el.classList.toggle('on', !!on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    /* ── car preview (texture replacement) ────────────────── */

    function enableCarPreview() {
        var tpl = (App.state && App.state.activeTemplate) || {};
        var slot = (App.state && App.state.activeSlot) || { kind: 'component', id: 0 };
        return App.nui('previewEnable', {
            kind: slot.kind, id: slot.id,
            txd: tpl.txd || '', txn: tpl.txn || ''
        }).then(function (r) {
            if (r && r.ok) {
                setFrames(true);
            } else {
                setToggle(byId('preview-toggle'), false);
                if (!anyOn()) { setFrames(false); }
            }
            return r;
        });
    }

    /* ── wrap mode ────────────────────────────────────────── */

    function showWrapActions(on) {
        var apply = byId('wrap-apply');
        var remove = byId('wrap-remove');
        if (apply) { apply.hidden = !on; }
        if (remove) { remove.hidden = !on; }
    }

    function enableWrap() {
        setFrames(true);                    /* frames first: the DUI must exist */
        return App.nui('wrapEnable', {}).then(function (r) {
            if (!r || !r.ok) {
                Wrap.on = false;
                setToggle(byId('wrap-toggle'), false);
                showWrapActions(false);
                guide(false);
                if (!anyOn()) { setFrames(false); }
                return r;
            }
            Wrap.on = true;
            Wrap.plate = r.plate || '';
            Wrap.building = !!r.building;
            showWrapActions(true);
            guide(true);
            if (Wrap.building) {
                App.toast(t('wrap_scanning', 'Reading the car\'s shape…'), 'info');
            }
            return r;
        });
    }

    function disableWrap() {
        Wrap.on = false;
        Wrap.building = false;
        showWrapActions(false);
        guide(false);
        App.nui('wrapClear', {});
        if (!anyOn()) { setFrames(false); }
    }

    /* ── apply / remove ───────────────────────────────────── */

    var CHUNK = 200000;                     /* one giant NUI POST fails in CEF */

    function uploadPng(png, done) {
        var total = Math.max(1, Math.ceil(png.length / CHUNK));
        var seq = 1;                        /* 1-based: Lua table.concat starts at 1 */
        function next() {
            if (seq > total) { done(); return; }
            var from = (seq - 1) * CHUNK;
            App.nui('wrapChunk', { seq: seq, data: png.substr(from, CHUNK) })
                .then(function () { seq++; next(); });
        }
        next();
    }

    function applyWrap() {
        if (!Wrap.on) { return; }
        var btn = byId('wrap-apply');
        if (btn) { btn.classList.add('busy'); btn.disabled = true; }

        var png = (window.Editor && Editor.compositeDataURL) ? Editor.compositeDataURL() : '';
        if (!png) {
            if (btn) { btn.classList.remove('busy'); btn.disabled = false; }
            return;
        }
        var name = (App.state.project && App.state.project.name) || 'wrap';
        uploadPng(png, function () {
            App.nui('wrapApply', { name: name }).then(function (r) {
                if (!r || !r.ok) {
                    if (btn) { btn.classList.remove('busy'); btn.disabled = false; }
                }
            });
        });
    }

    function removeWrap() {
        App.nui('wrapRemove', {}).then(function (r) {
            if (r && r.ok) {
                App.toast(t('wrap_removed_ui', 'Wrap removed from this car.'), 'success');
            }
        });
    }

    /* ── canvas layout guide ──────────────────────────────── */
    /* A non-interactive canvas stacked over the editor, kept in the
       exact same transform/size as #editor-canvas so it tracks zoom
       and pan without hooking into the editor's internals. */

    var guideEl = null, guideRaf = null, lastKey = '';

    function panels() {
        var cfg = (window.App && App.state && App.state.config) || {};
        return cfg.wrapPanels || [];
    }

    function ensureGuideEl() {
        if (guideEl) { return guideEl; }
        var wrapEl = byId('canvas-wrap');
        var base = byId('editor-canvas');
        if (!wrapEl || !base) { return null; }
        guideEl = document.createElement('canvas');
        guideEl.id = 'wrap-guide';
        guideEl.style.position = 'absolute';
        guideEl.style.left = '0';
        guideEl.style.top = '0';
        guideEl.style.transformOrigin = '0 0';
        guideEl.style.pointerEvents = 'none';
        guideEl.style.zIndex = '3';         /* over #overlay-canvas (2) */
        wrapEl.appendChild(guideEl);
        return guideEl;
    }

    function paintGuide() {
        var base = byId('editor-canvas');
        if (!guideEl || !base) { return; }
        var w = base.width, h = base.height;
        if (guideEl.width !== w || guideEl.height !== h) {
            guideEl.width = w; guideEl.height = h;
        }
        guideEl.style.transform = base.style.transform;
        guideEl.style.width = base.style.width || (w + 'px');
        guideEl.style.height = base.style.height || (h + 'px');

        var g = guideEl.getContext('2d');
        g.clearRect(0, 0, w, h);

        var list = panels();
        if (!list.length) { return; }

        var font = Math.max(11, Math.round(w / 42));
        g.lineWidth = Math.max(1, Math.round(w / 512));
        g.font = '600 ' + font + 'px system-ui, sans-serif';
        g.textBaseline = 'top';

        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var uv = p.uv || [0, 0, 1, 1];
            var x = uv[0] * w, y = uv[1] * h;
            var rw = (uv[2] - uv[0]) * w, rh = (uv[3] - uv[1]) * h;

            g.fillStyle = 'rgba(31,94,255,.07)';
            g.fillRect(x, y, rw, rh);
            g.setLineDash([Math.round(w / 96), Math.round(w / 128)]);
            g.strokeStyle = 'rgba(120,155,255,.85)';
            g.strokeRect(x + 0.5, y + 0.5, rw - 1, rh - 1);
            g.setLineDash([]);

            var label = (p.label || p.id || '').toUpperCase();
            var pad = Math.round(font * 0.45);
            var tw = g.measureText(label).width;
            g.fillStyle = 'rgba(10,12,18,.72)';
            g.fillRect(x + pad, y + pad, tw + pad * 2, font + pad * 2);
            g.fillStyle = 'rgba(236,240,255,.95)';
            g.fillText(label, x + pad * 2, y + pad * 2);
        }
    }

    function guideLoop() {
        if (!Wrap.on) { guideRaf = null; return; }
        var base = byId('editor-canvas');
        if (base && guideEl) {
            var key = base.style.transform + '|' + base.width + 'x' + base.height +
                '|' + base.style.width + '|' + base.style.height;
            if (key !== lastKey) { lastKey = key; paintGuide(); }
        }
        guideRaf = window.requestAnimationFrame(guideLoop);
    }

    function guide(on) {
        if (on) {
            if (!ensureGuideEl()) { return; }
            guideEl.hidden = false;
            lastKey = '';
            paintGuide();
            if (!guideRaf) { guideRaf = window.requestAnimationFrame(guideLoop); }
        } else if (guideEl) {
            guideEl.hidden = true;
            var g = guideEl.getContext('2d');
            g.clearRect(0, 0, guideEl.width, guideEl.height);
        }
    }

    /* ── wiring ───────────────────────────────────────────── */

    function bind() {
        var pv = byId('preview-toggle');
        if (pv) {
            pv.addEventListener('click', function () {
                var on = !pv.classList.contains('on');
                setToggle(pv, on);
                if (on) {
                    enableCarPreview();
                } else {
                    App.nui('previewClear', {});
                    if (!anyOn()) { setFrames(false); }
                }
            });
        }

        var wt = byId('wrap-toggle');
        if (wt) {
            wt.addEventListener('click', function () {
                var on = !wt.classList.contains('on');
                setToggle(wt, on);
                if (on) { enableWrap(); } else { disableWrap(); }
            });
        }

        var ap = byId('wrap-apply');
        if (ap) { ap.addEventListener('click', applyWrap); }

        var rm = byId('wrap-remove');
        if (rm) { rm.addEventListener('click', removeWrap); }

        var pk = byId('peek-toggle');
        if (pk) {
            pk.addEventListener('click', function () {
                /* Lua hides the page, frees the cursor and waits for E.
                   Push a frame first so the car shows the CURRENT sheet
                   the instant the UI disappears. */
                if (window.Editor && Editor.pushPreviewFrame && App.state.previewOn) {
                    Editor.pushPreviewFrame();
                }
                App.nui('studioPeek', {});
            });
        }
    }

    /* Lua drives the page visibility for peek mode: it owns the E key
       that brings the studio back, so the UI only mirrors the state. */
    function bindPeek() {
        App.on('peek', function (p) {
            var appEl = byId('app');
            if (appEl) { appEl.hidden = !!(p && p.on); }
        });
    }

    /* Hide the wrap controls entirely when the feature is off in the
       config — a dead button is worse than no button. */
    function applyConfig() {
        var cfg = (App.state && App.state.config) || {};
        if (cfg.wrapEnabled === false) {
            ['wrap-toggle', 'wrap-apply', 'wrap-remove'].forEach(function (id) {
                var el = byId(id);
                if (el) { el.hidden = true; }
            });
        }
    }

    function init() {
        bind();
        bindPeek();

        App.on('boot', function () { applyConfig(); });

        App.on('wrapStatus', function (p) {
            p = p || {};
            var wt = byId('wrap-toggle');
            Wrap.building = !!p.building;
            if (wt) {
                wt.classList.toggle('busy', !!p.building);
                if (p.building && typeof p.progress === 'number') {
                    wt.setAttribute('data-tip',
                        t('wrap_scanning_pct', 'Reading the car\'s shape… %d%%',
                            Math.round(p.progress * 100)));
                }
            }
            if (!p.building && p.ok) {
                if (wt) {
                    wt.setAttribute('data-tip',
                        t('wrap_ready_ui', 'Wrap live on this car (%d panels)', p.cells || 0));
                }
                if (window.Editor && Editor.pushPreviewFrame) { Editor.pushPreviewFrame(); }
            }
            if (!p.building && p.ok === false && p.error === 'mesh') {
                Wrap.on = false;
                setToggle(byId('wrap-toggle'), false);
                showWrapActions(false);
                guide(false);
                if (!anyOn()) { setFrames(false); }
            }
        });

        App.on('wrapApplied', function () {
            var btn = byId('wrap-apply');
            if (btn) { btn.classList.remove('busy'); btn.disabled = false; }
        });

        /* The studio closing must not leave frames streaming. */
        App.on('close', function () {
            if (Wrap.on) { disableWrap(); }
            setToggle(byId('preview-toggle'), false);
            setFrames(false);
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (window.App) { init(); }
    });

    window.WrapUI = Wrap;
})();
