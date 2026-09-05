/* ════════════════════════════════════════════════════════════
   APEX CLOTHING STUDIO — stage.js
   ------------------------------------------------------------
   The live ped viewport strip:
     • forwards drag / wheel / focus input from the transparent
       hole to the Lua orbit camera (batched per animation frame)
     • renders the component/prop chip strip from WardrobeState
     • drawable / texture steppers with wrap-around
     • preview toggle wired to previewEnable / previewClear
   ════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var Stage = {};

    var ICONS = {
        head: 'fa-user', berd: 'fa-mask', hair: 'fa-scissors',
        uppr: 'fa-hand', lowr: 'fa-socks', hand: 'fa-briefcase',
        feet: 'fa-shoe-prints', teef: 'fa-link', accs: 'fa-vest',
        task: 'fa-shield-halved', decl: 'fa-stamp', jbib: 'fa-shirt',
        p_head: 'fa-hat-cowboy', p_eyes: 'fa-glasses', p_ears: 'fa-ear-listen',
        p_lwrist: 'fa-clock', p_rwrist: 'fa-stopwatch'
    };

    /* Which camera focus zone frames each clothing slot, so picking a
       top frames the torso, picking shoes frames the feet, etc. */
    var ZONE_FOR_KEY = {
        head: 'head', hair: 'head', berd: 'head',
        uppr: 'torso', jbib: 'torso', accs: 'torso', task: 'torso',
        decl: 'torso', teef: 'torso', hand: 'torso',
        lowr: 'legs', feet: 'feet',
        p_head: 'head', p_eyes: 'head', p_ears: 'head',
        p_lwrist: 'torso', p_rwrist: 'torso'
    };

    /* ── input forwarding (batched per rAF) ───────────────── */

    var dragging = false;
    var accX = 0, accY = 0, flushQueued = false;

    function flushOrbit() {
        flushQueued = false;
        if (accX === 0 && accY === 0) { return; }
        var dx = accX, dy = accY;
        accX = 0; accY = 0;
        App.nui('stageOrbit', { dx: dx, dy: dy });
    }

    function bindHole() {
        var hole = document.getElementById('stage-hole');
        if (!hole) { return; }

        hole.addEventListener('pointerdown', function (e) {
            dragging = true;
            hole.setPointerCapture(e.pointerId);
            hole.classList.add('grabbing');
            e.preventDefault();
        });
        hole.addEventListener('pointermove', function (e) {
            if (!dragging) { return; }
            accX += e.movementX || 0;
            accY += e.movementY || 0;
            if (!flushQueued) {
                flushQueued = true;
                requestAnimationFrame(flushOrbit);
            }
        });
        function endDrag(e) {
            if (!dragging) { return; }
            dragging = false;
            hole.classList.remove('grabbing');
            try { hole.releasePointerCapture(e.pointerId); } catch (err) { /* fine */ }
        }
        hole.addEventListener('pointerup', endDrag);
        hole.addEventListener('pointercancel', endDrag);

        hole.addEventListener('wheel', function (e) {
            e.preventDefault();
            App.nui('stageZoom', { delta: e.deltaY > 0 ? 1 : -1 });
        }, { passive: false });

        hole.addEventListener('dblclick', function () {
            setFocus('full');
        });
    }

    /* ── focus buttons ────────────────────────────────────── */

    function setFocus(zone) {
        var btns = document.querySelectorAll('.focus-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].dataset.zone === zone);
        }
        App.nui('stageFocus', { zone: zone });
    }

    function bindFocus() {
        var btns = document.querySelectorAll('.focus-btn');
        for (var i = 0; i < btns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () { setFocus(btn.dataset.zone); });
            })(btns[i]);
        }
        var reset = document.getElementById('btn-reset-outfit');
        if (reset) {
            reset.addEventListener('click', function () {
                App.nui('wardrobeReset').then(function (state) {
                    if (state && state.components) {
                        App.state.wardrobe = state;
                        App.emit('wardrobe', state);
                    }
                    App.toast(t('outfit_reset', 'Outfit restored.'), 'info');
                });
            });
        }
    }

    /* ── slot helpers ─────────────────────────────────────── */

    function slotList() {
        var w = App.state.wardrobe;
        if (!w) { return []; }
        var out = [];
        (w.components || []).forEach(function (c) {
            out.push({ kind: 'component', id: c.comp, entry: c });
        });
        (w.props || []).forEach(function (p) {
            out.push({ kind: 'prop', id: p.prop, entry: p });
        });
        return out;
    }

    function findEntry(kind, id) {
        var list = slotList();
        for (var i = 0; i < list.length; i++) {
            if (list[i].kind === kind && list[i].id === id) { return list[i].entry; }
        }
        return null;
    }

    function activeEntry() {
        var slot = App.state.activeSlot;
        if (!slot) { return null; }
        return findEntry(slot.kind, slot.id);
    }

    function previewOn() {
        var toggle = document.getElementById('preview-toggle');
        return toggle ? toggle.classList.contains('on') : false;
    }

    /* ── strip rendering ──────────────────────────────────── */

    function renderStrip() {
        var strip = document.getElementById('component-strip');
        if (!strip) { return; }
        strip.innerHTML = '';
        var slot = App.state.activeSlot;

        slotList().forEach(function (item) {
            var chip = document.createElement('button');
            chip.className = 'comp-chip';
            chip.dataset.kind = item.kind;
            chip.dataset.id = String(item.id);
            if (slot && slot.kind === item.kind && slot.id === item.id) {
                chip.classList.add('active');
            }
            var none = item.kind === 'prop' && item.entry.drawable < 0;
            if (none) { chip.classList.add('none'); }

            var icon = document.createElement('i');
            icon.className = 'fa-solid ' + (ICONS[item.entry.key] || 'fa-shirt');
            var label = document.createElement('span');
            label.textContent = item.entry.label || item.entry.key;
            chip.appendChild(icon);
            chip.appendChild(label);

            chip.addEventListener('click', function () { selectSlot(item.kind, item.id); });
            strip.appendChild(chip);
        });
    }

    function updateReadouts() {
        var entry = activeEntry();
        var dv = document.getElementById('drawable-value');
        var tv = document.getElementById('texture-value');
        var tex = document.getElementById('tex-name-label');
        var badge = document.getElementById('collection-badge');
        var title = document.getElementById('canvas-title');
        var chip = document.getElementById('ped-model-chip');

        if (chip && App.state.wardrobe && App.state.wardrobe.model) {
            chip.textContent = App.state.wardrobe.model;
        }
        if (!entry) {
            if (dv) { dv.textContent = '—'; }
            if (tv) { tv.textContent = '—'; }
            if (tex) { tex.textContent = '—'; }
            if (badge) { badge.hidden = true; }
            return;
        }

        var draw = entry.drawable;
        if (dv) {
            dv.textContent = draw < 0 ? t('prop_none', 'none')
                : ('00' + draw).slice(-3);
        }
        if (tv) {
            tv.textContent = draw < 0 ? '—'
                : String.fromCharCode(97 + Math.min(entry.texture || 0, 25));
        }
        if (tex) { tex.textContent = entry.texName || '—'; }
        if (badge) {
            if (entry.collection && entry.collection !== '') {
                badge.textContent = entry.collection;
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }
        }
        if (title) {
            title.textContent = entry.texName || t('canvas_title', 'Canvas');
        }
    }

    /* ── slot selection / stepping ────────────────────────── */

    function focusForActive() {
        var entry = activeEntry();
        if (!entry) { return; }
        setFocus(ZONE_FOR_KEY[entry.key] || 'full');
    }

    function selectSlot(kind, id) {
        App.state.activeSlot = { kind: kind, id: id };
        App.emit('slotChanged', App.state.activeSlot);
        renderStrip();
        updateReadouts();
        focusForActive();                 /* frame the camera on this slot */
        if (previewOn()) { enablePreview(); }
    }

    function enablePreview() {
        var slot = App.state.activeSlot;
        if (!slot) { return; }
        App.nui('previewEnable', { kind: slot.kind, id: slot.id }).then(function (r) {
            setPreviewStatus(r && r.ok);
            /* push a frame right away so the ped updates instantly */
            if (r && r.ok && window.Editor && Editor.pushPreviewFrame) {
                Editor.pushPreviewFrame();
            }
        });
    }

    function setPreviewStatus(on) {
        var dot = document.getElementById('preview-status-dot');
        var label = document.getElementById('preview-status-label');
        if (dot) { dot.classList.toggle('live', !!on); }
        if (label) {
            label.textContent = on ? t('preview_live', 'Preview Live') : t('preview_off', 'Preview Off');
        }
    }

    function step(field, dir) {
        var slot = App.state.activeSlot;
        var entry = activeEntry();
        if (!slot || !entry) { return; }

        var drawable = entry.drawable;
        var texture = entry.texture || 0;

        if (field === 'drawable') {
            var maxD = entry.drawables || 0;
            if (maxD <= 0) { return; }
            if (slot.kind === 'prop') {
                /* props cycle through -1 (none) as well */
                drawable = drawable + dir;
                if (drawable >= maxD) { drawable = -1; }
                if (drawable < -1) { drawable = maxD - 1; }
            } else {
                drawable = (drawable + dir + maxD) % maxD;
            }
            texture = 0;
        } else {
            if (drawable < 0) { return; }
            var maxT = Math.max(entry.textures || 0, 1);
            texture = (texture + dir + maxT) % maxT;
        }

        App.nui('wardrobeSet', {
            kind: slot.kind, id: slot.id,
            drawable: drawable, texture: texture
        }).then(function (state) {
            if (state && state.components) {
                App.state.wardrobe = state;
                App.emit('wardrobe', state);
            }
        });
    }

    function bindSteppers() {
        var map = [
            ['drawable-prev', 'drawable', -1], ['drawable-next', 'drawable', 1],
            ['texture-prev', 'texture', -1], ['texture-next', 'texture', 1]
        ];
        map.forEach(function (def) {
            var el = document.getElementById(def[0]);
            if (el) {
                el.addEventListener('click', function () { step(def[1], def[2]); });
            }
        });

        var toggle = document.getElementById('preview-toggle');
        if (toggle) {
            toggle.addEventListener('click', function () {
                var on = !toggle.classList.contains('on');
                toggle.classList.toggle('on', on);
                toggle.setAttribute('aria-checked', on ? 'true' : 'false');
                App.state.previewOn = on;
                if (on) {
                    enablePreview();
                } else {
                    App.nui('previewClear');
                    setPreviewStatus(false);
                }
            });
        }
    }

    /* ── app bus wiring ───────────────────────────────────── */

    function onWardrobe() {
        /* default the active slot to the torso (jbib) on first open */
        if (!App.state.activeSlot) {
            var w = App.state.wardrobe;
            var jbib = null;
            ((w && w.components) || []).forEach(function (c) {
                if (c.key === 'jbib') { jbib = c; }
            });
            App.state.activeSlot = jbib
                ? { kind: 'component', id: jbib.comp }
                : { kind: 'component', id: 11 };
            App.emit('slotChanged', App.state.activeSlot);
            renderStrip();
            updateReadouts();
            focusForActive();             /* initial framing on the top */
            return;
        }
        renderStrip();
        updateReadouts();
    }

    Stage.init = function () {
        bindHole();
        bindFocus();
        bindSteppers();

        App.on('wardrobe', onWardrobe);

        App.on('previewStatus', function (p) {
            setPreviewStatus(p && p.active);
            if (p && p.throttled) {
                App.toast(t('preview_throttled_ui', 'Preview updates are throttled this session.'), 'warning');
            }
        });

        App.on('open', function () {
            /* studio (re)opened: preview follows the toggle state */
            if (previewOn() && App.state.activeSlot) { enablePreview(); }
        });
    };

    document.addEventListener('DOMContentLoaded', function () {
        Stage.init();
    });

    window.Stage = Stage;
})();
