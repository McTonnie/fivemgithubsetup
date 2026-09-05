/* ════════════════════════════════════════════════════════════
   APEX CLOTHING STUDIO — app.js
   ------------------------------------------------------------
   Application core: state store, NUI fetch bridge, i18n helper,
   tiny event bus, SendNUIMessage router, toasts, modal system
   (confirm / prompt / custom), project pill, global keyboard
   shortcuts and the ESC close flow.

   Load order: app.js → editor.js → stage.js → panels.js.
   Everything here is defensive about the other modules: Editor /
   Stage / Panels are ONLY resolved lazily inside handlers, never
   at the top level.

   KEYBOARD MAP (active while the studio is open and no text
   input is focused — documented here per contract):
     V = select/move   B = brush        E = eraser
     T = text          U = shape        G = fill
     I = eyedropper
     Ctrl+Z = undo     Ctrl+Y / Ctrl+Shift+Z = redo
     Ctrl+S = save (emits 'requestSave' on the App bus)
     ESC    = close (confirm first when the project is dirty)
   ════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var RESOURCE = 'apex_clothing';

    /* ────────────────────────────────────────────────────────
       State store (single source of truth for the UI shell)
       ──────────────────────────────────────────────────────── */
    var App = {
        state: {
            open: false,
            booted: false,
            config: {},
            locale: {},
            ped: {},
            wardrobe: null,
            activeSlot: null,                 /* { kind, id } — kept fresh by stage.js */
            /* null, NOT 'Untitled': a truthy name is written straight into
               #project-name and clobbers the translated markup, which also
               made the t() fallback further down unreachable. */
            project: { id: null, name: null, dirty: false },
            activeTemplate: null,             /* current 3D garment template (viewer.js) */
            previewOn: false,                 /* in-game ped preview off — the 3D viewer is the preview */
            previewStatus: null               /* last `previewStatus` payload from Lua */
        },
        /* true while a template's own texture/UV guide are loading, so
           those auto-loads don't mark the project "dirty" */
        loadingTemplate: false
    };

    /* ────────────────────────────────────────────────────────
       Tiny event bus
       ──────────────────────────────────────────────────────── */
    var listeners = {};

    App.on = function (event, cb) {
        if (typeof cb !== 'function') { return cb; }
        (listeners[event] = listeners[event] || []).push(cb);
        return cb;
    };

    App.off = function (event, cb) {
        var list = listeners[event];
        if (!list) { return; }
        var idx = list.indexOf(cb);
        if (idx !== -1) { list.splice(idx, 1); }
    };

    App.emit = function (event, payload) {
        var list = listeners[event];
        if (!list || !list.length) { return; }
        var copy = list.slice();
        for (var i = 0; i < copy.length; i++) {
            try {
                copy[i](payload);
            } catch (err) {
                console.error('[' + RESOURCE + '] listener for "' + event + '" failed:', err);
            }
        }
    };

    /* ────────────────────────────────────────────────────────
       NUI fetch wrapper — POST JSON to the resource callback.
       Never rejects: any network / parse error resolves {} so
       callers can chain without try/catch.
       ──────────────────────────────────────────────────────── */
    /* NUI callbacks: FiveM builds differ on WHICH origin serves the
       RegisterNUICallback endpoints — the classic
       https://<GetParentResourceName()>/<name> or the newer
       https://cfx-nui-<resource>/<name>. On some builds only the
       classic one answers (the other fails silently, which broke
       EVERY callback: AI "Generation rejected", stuck cursor…).
       Try the classic first, fall back to cfx-nui. */
    var NUI_HOST = (typeof window.GetParentResourceName === 'function')
        ? window.GetParentResourceName() : RESOURCE;

    function nuiPost(host, name, body) {
        return fetch('https://' + host + '/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(body || {})
        }).then(function (res) { return res.json(); });
    }

    App.nui = function (name, body) {
        return nuiPost(NUI_HOST, name, body)
            .catch(function () { return nuiPost('cfx-nui-' + RESOURCE, name, body); })
            .catch(function (err) {
                console.error('[' + RESOURCE + '] NUI callback "' + name + '" failed on both endpoints:', err);
                return {};
            });
    };

    /* ────────────────────────────────────────────────────────
       i18n — global t(key, fallback, ...args)
       The active locale map arrives in the `boot` payload.
       Placeholders use %s (string) and %d (integer), applied
       in order.
       ──────────────────────────────────────────────────────── */
    function formatStr(str, args) {
        var i = 0;
        return String(str).replace(/%[sd]/g, function (m) {
            if (i >= args.length) { return m; }
            var v = args[i++];
            if (m === '%d') {
                var n = parseInt(v, 10);
                return isNaN(n) ? String(v) : String(n);
            }
            return String(v);
        });
    }

    function t(key, fallback) {
        var map = App.state.locale || {};
        var s;
        if (Object.prototype.hasOwnProperty.call(map, key) && map[key] !== null && map[key] !== undefined && map[key] !== '') {
            s = map[key];
        } else if (fallback !== null && fallback !== undefined) {
            s = fallback;
        } else {
            s = key;
        }
        var extra = Array.prototype.slice.call(arguments, 2);
        if (extra.length) { s = formatStr(s, extra); }
        return s;
    }

    /* Messages coming from Lua may be pre-localized text OR a
       locale key prefixed with '#'. */
    function resolveText(msg) {
        if (typeof msg !== 'string') { return String(msg); }
        if (msg.charAt(0) === '#') {
            var key = msg.slice(1);
            return t(key, key);
        }
        return msg;
    }

    /* Walk the DOM and translate every data-i18n / data-i18n-tip /
       data-i18n-ph element. The pristine English markup value is
       captured once as the inline fallback so re-runs stay stable. */
    App.applyI18n = function (root) {
        root = root || document;
        var els, el, i;

        els = root.querySelectorAll('[data-i18n]');
        for (i = 0; i < els.length; i++) {
            el = els[i];
            if (!el.dataset.i18nFb) { el.dataset.i18nFb = el.textContent.trim(); }
            el.textContent = t(el.dataset.i18n, el.dataset.i18nFb);
        }
        els = root.querySelectorAll('[data-i18n-tip]');
        for (i = 0; i < els.length; i++) {
            el = els[i];
            if (!el.dataset.tipFb) { el.dataset.tipFb = el.getAttribute('data-tip') || ''; }
            el.setAttribute('data-tip', t(el.dataset.i18nTip, el.dataset.tipFb));
        }
        els = root.querySelectorAll('[data-i18n-ph]');
        for (i = 0; i < els.length; i++) {
            el = els[i];
            if (!el.dataset.phFb) { el.dataset.phFb = el.getAttribute('placeholder') || ''; }
            el.setAttribute('placeholder', t(el.dataset.i18nPh, el.dataset.phFb));
        }
    };

    /* ────────────────────────────────────────────────────────
       Toasts — #toast-root, auto-dismiss after 4 s, click to
       dismiss, capped stack of 6.
       ──────────────────────────────────────────────────────── */
    var TOAST_ICONS = {
        info: 'fa-circle-info',
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        warning: 'fa-triangle-exclamation'
    };

    App.toast = function (message, type) {
        if (!TOAST_ICONS[type]) { type = 'info'; }
        var root = document.getElementById('toast-root');
        if (!root) { return null; }

        while (root.children.length >= 6) {
            root.removeChild(root.firstChild);
        }

        var el = document.createElement('div');
        el.className = 'toast ' + type;

        var icon = document.createElement('i');
        icon.className = 'fa-solid ' + TOAST_ICONS[type];

        var text = document.createElement('span');
        text.textContent = resolveText(message);

        el.appendChild(icon);
        el.appendChild(text);
        root.appendChild(el);

        var gone = false;
        function dismiss() {
            if (gone) { return; }
            gone = true;
            el.classList.add('out');
            setTimeout(function () {
                if (el.parentNode) { el.parentNode.removeChild(el); }
            }, 220);
        }

        el.addEventListener('click', dismiss);
        setTimeout(dismiss, 4000);
        return el;
    };

    /* ────────────────────────────────────────────────────────
       Modal system — #modal-root
       .modal (scrim) > .modal-card > .modal-head/.modal-body/
       .modal-foot. Promise based; ESC and scrim-click cancel.
       ──────────────────────────────────────────────────────── */
    var modalStack = [];

    function modalCard(title, opts) {
        opts = opts || {};
        var card = document.createElement('div');
        card.className = 'modal-card' + (opts.wide ? ' wide' : '');

        var head = document.createElement('div');
        head.className = 'modal-head';

        var icon = document.createElement('div');
        icon.className = 'modal-icon' + (opts.danger ? ' danger' : '') + (opts.success ? ' success' : '');
        var iconGlyph = document.createElement('i');
        iconGlyph.className = 'fa-solid ' + (opts.icon || 'fa-shirt');
        icon.appendChild(iconGlyph);

        var titleEl = document.createElement('div');
        titleEl.className = 'modal-title';
        titleEl.textContent = title || '';

        var closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.type = 'button';
        var closeGlyph = document.createElement('i');
        closeGlyph.className = 'fa-solid fa-xmark';
        closeBtn.appendChild(closeGlyph);

        head.appendChild(icon);
        head.appendChild(titleEl);
        head.appendChild(closeBtn);

        var body = document.createElement('div');
        body.className = 'modal-body';

        var foot = document.createElement('div');
        foot.className = 'modal-foot';

        card.appendChild(head);
        card.appendChild(body);
        card.appendChild(foot);

        return { card: card, head: head, body: body, foot: foot, closeBtn: closeBtn };
    }

    function openModal(cardEl, opts) {
        opts = opts || {};
        var root = document.getElementById('modal-root');
        if (!root) { return null; }

        var overlay = document.createElement('div');
        overlay.className = 'modal';
        overlay.appendChild(cardEl);
        root.appendChild(overlay);

        var entry = {
            overlay: overlay,
            cancel: null,
            closed: false,
            close: function () {
                if (entry.closed) { return; }
                entry.closed = true;
                var idx = modalStack.indexOf(entry);
                if (idx !== -1) { modalStack.splice(idx, 1); }
                if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
                if (typeof opts.onClose === 'function') {
                    try { opts.onClose(); } catch (err) { console.error('[' + RESOURCE + '] modal onClose failed:', err); }
                }
            }
        };

        overlay.addEventListener('mousedown', function (e) {
            if (e.target === overlay) {
                if (entry.cancel) { entry.cancel(); } else { entry.close(); }
            }
        });

        modalStack.push(entry);
        return entry;
    }

    function makeButton(label, className) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = className;
        b.textContent = label;
        return b;
    }

    /* App.modal(contentEl, opts) → close fn.
       opts: { title, icon, danger, wide, onClose,
               buttons: [{ label, kind:'primary'|'ghost'|'danger', onClick(close) }] } */
    App.modal = function (contentEl, opts) {
        opts = opts || {};
        var parts = modalCard(opts.title || '', opts);

        if (typeof contentEl === 'string') {
            var p = document.createElement('div');
            p.textContent = contentEl;
            parts.body.appendChild(p);
        } else if (contentEl) {
            parts.body.appendChild(contentEl);
        }

        var entry = openModal(parts.card, opts);
        if (!entry) { return function () {}; }

        entry.cancel = function () { entry.close(); };
        parts.closeBtn.addEventListener('click', function () { entry.cancel(); });

        if (Array.isArray(opts.buttons) && opts.buttons.length) {
            opts.buttons.forEach(function (def) {
                var kind = def.kind === 'primary' ? 'btn btn-primary'
                    : def.kind === 'danger' ? 'btn btn-danger'
                    : 'btn btn-ghost';
                var btn = makeButton(def.label, kind);
                btn.addEventListener('click', function () {
                    if (typeof def.onClick === 'function') { def.onClick(entry.close); }
                    else { entry.close(); }
                });
                parts.foot.appendChild(btn);
            });
        } else if (parts.foot.parentNode) {
            parts.foot.parentNode.removeChild(parts.foot);
        }

        return entry.close;
    };

    /* App.confirm(title, message, opts?) → Promise<bool> */
    App.confirm = function (title, message, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var parts = modalCard(title, {
                icon: opts.icon || (opts.danger ? 'fa-triangle-exclamation' : 'fa-circle-question'),
                danger: opts.danger
            });

            var msg = document.createElement('div');
            msg.textContent = message || '';
            parts.body.appendChild(msg);

            var btnCancel = makeButton(t('btn_cancel', 'Cancel'), 'btn btn-ghost');
            var btnOk = makeButton(
                opts.confirmText || t('btn_confirm', 'Confirm'),
                'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary')
            );
            parts.foot.appendChild(btnCancel);
            parts.foot.appendChild(btnOk);

            var entry = openModal(parts.card);
            if (!entry) { resolve(false); return; }

            function done(val) {
                entry.close();
                resolve(val);
            }
            entry.cancel = function () { done(false); };
            parts.closeBtn.addEventListener('click', function () { done(false); });
            btnCancel.addEventListener('click', function () { done(false); });
            btnOk.addEventListener('click', function () { done(true); });
            setTimeout(function () { btnOk.focus(); }, 30);
        });
    };

    /* App.prompt(title, label, value, opts?) → Promise<string|null>
       opts.multiline → textarea (Ctrl+Enter submits). */
    App.prompt = function (title, label, value, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var parts = modalCard(title, { icon: opts.icon || 'fa-pen' });

            var lab = document.createElement('span');
            lab.className = 'micro-label';
            lab.textContent = label || '';
            parts.body.appendChild(lab);

            var input;
            if (opts.multiline) {
                input = document.createElement('textarea');
                input.className = 'input textarea';
                input.rows = opts.rows || 4;
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'input';
            }
            if (opts.maxLength) { input.maxLength = opts.maxLength; }
            if (opts.placeholder) { input.setAttribute('placeholder', opts.placeholder); }
            input.value = (value !== null && value !== undefined) ? String(value) : '';
            input.spellcheck = false;
            parts.body.appendChild(input);

            var btnCancel = makeButton(t('btn_cancel', 'Cancel'), 'btn btn-ghost');
            var btnOk = makeButton(opts.confirmText || t('btn_ok', 'OK'), 'btn btn-primary');
            parts.foot.appendChild(btnCancel);
            parts.foot.appendChild(btnOk);

            var entry = openModal(parts.card);
            if (!entry) { resolve(null); return; }

            function done(val) {
                entry.close();
                resolve(val);
            }
            entry.cancel = function () { done(null); };
            parts.closeBtn.addEventListener('click', function () { done(null); });
            btnCancel.addEventListener('click', function () { done(null); });
            btnOk.addEventListener('click', function () { done(input.value); });

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && (!opts.multiline || e.ctrlKey)) {
                    e.preventDefault();
                    done(input.value);
                }
                e.stopPropagation();
            });

            setTimeout(function () { input.focus(); input.select(); }, 30);
        });
    };

    /* ────────────────────────────────────────────────────────
       Project pill helpers
       ──────────────────────────────────────────────────────── */
    App.setDirty = function (dirty) {
        App.state.project.dirty = !!dirty;
        var dot = document.getElementById('project-dirty');
        if (dot) { dot.hidden = !App.state.project.dirty; }
    };

    App.setProject = function (meta) {
        meta = meta || {};
        if (meta.id !== undefined) { App.state.project.id = meta.id; }
        if (meta.name !== undefined && meta.name !== null && String(meta.name) !== '') {
            App.state.project.name = String(meta.name);
        }
        var nameEl = document.getElementById('project-name');
        if (nameEl) {
            nameEl.textContent = App.state.project.name || t('project_untitled', 'Untitled');
        }
        if (meta.dirty !== undefined) { App.setDirty(meta.dirty); }
    };

    /* ────────────────────────────────────────────────────────
       Close flow — ESC / close button. Confirms when dirty.
       ──────────────────────────────────────────────────────── */
    var closeConfirmOpen = false;

    function doClose() {
        App.state.open = false;
        var app = document.getElementById('app');
        if (app) { app.hidden = true; }
        // Tell Lua to drop NUI focus. Fire BOTH callback URL styles FiveM
        // supports — if this message is lost the cursor stays on screen
        // forever, so redundancy here is deliberate (Close() is idempotent).
        App.nui('uiClose');
        try {
            var res = (typeof window.GetParentResourceName === 'function')
                ? window.GetParentResourceName() : RESOURCE;
            fetch('https://' + res + '/uiClose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: '{}'
            }).catch(function () { /* other endpoint already fired */ });
        } catch (e) { /* other endpoint already fired */ }
    }

    App.requestClose = function () {
        if (closeConfirmOpen) { return; }
        if (App.state.project.dirty) {
            closeConfirmOpen = true;
            App.confirm(
                t('close_title', 'Discard changes?'),
                t('close_body', 'You have unsaved changes. Close the studio and discard them?'),
                { danger: true, confirmText: t('btn_discard', 'Discard') }
            ).then(function (ok) {
                closeConfirmOpen = false;
                if (ok) { doClose(); }
            });
        } else {
            doClose();
        }
    };

    /* ────────────────────────────────────────────────────────
       SendNUIMessage router — every action is re-emitted on the
       App bus (unknown actions are therefore handled gracefully:
       nobody listens, nothing breaks). Built-ins run first.
       ──────────────────────────────────────────────────────── */
    function showLoader(show) {
        var lo = document.getElementById('loading-overlay');
        if (!lo) { return; }
        if (show) {
            lo.hidden = false;
            lo.style.opacity = '';
            lo.style.transition = '';
        } else {
            lo.hidden = true;
        }
    }

    /* Hide the spinner with a fade once the studio content (first
       template texture / 3D) is ready. Guarded so it runs once. */
    var studioReadyDone = false;
    function hideStudioLoader() {
        if (studioReadyDone) { return; }
        studioReadyDone = true;
        var lo = document.getElementById('loading-overlay');
        if (!lo || lo.hidden) { return; }
        lo.style.transition = 'opacity 260ms ease';
        lo.style.opacity = '0';
        setTimeout(function () {
            lo.hidden = true; lo.style.opacity = ''; lo.style.transition = '';
        }, 280);
    }
    App.on('contentReady', hideStudioLoader);

    function handleBuiltin(action, p) {
        var appEl;
        switch (action) {
            case 'loading':
                /* studio is opening — show the loader while Lua checks
                   permission and prepares the boot payload */
                showLoader(true);
                break;

            case 'boot':
                App.state.locale = p.locale || {};
                App.state.config = p.config || {};
                App.state.ped = p.ped || {};
                App.state.booted = true;

                var chip = document.getElementById('ped-model-chip');
                if (chip && App.state.ped.model) { chip.textContent = App.state.ped.model; }

                App.applyI18n(document);

                /* keep the spinner up — it now stays over the (blurred)
                   studio until the first texture/3D is ready */
                break;

            case 'open':
                App.state.wardrobe = p.wardrobe || App.state.wardrobe;
                App.state.open = true;
                appEl = document.getElementById('app');
                if (appEl) { appEl.hidden = false; }
                studioReadyDone = false;
                showLoader(true);                 /* spinner over the blurred app */
                /* fallback: never leave the spinner stuck (no templates, etc.) */
                setTimeout(hideStudioLoader, 7000);
                if (p.wardrobe) { App.emit('wardrobe', p.wardrobe); }
                break;

            case 'close':
                App.state.open = false;
                showLoader(false);   /* also clears a loader shown on a denied open */
                /* Close any open modal — their onClose handlers re-home
                   reparented dock panes (Projects/Export), so nothing can
                   stay stranded over the game after a forced close. */
                while (modalStack.length) { modalStack[modalStack.length - 1].close(); }
                appEl = document.getElementById('app');
                if (appEl) { appEl.hidden = true; }
                break;

            case 'wardrobeState':
                App.state.wardrobe = p;
                App.emit('wardrobe', p);
                break;

            case 'previewStatus':
                App.state.previewStatus = p;
                break;

            case 'notify':
                App.toast(p.message, p.type);
                break;

            case 'projectSaved':
                /* Sent by client Lua after the chunked save round-trip. */
                if (p && p.ok) {
                    if (p.id !== undefined && p.id !== null) { App.state.project.id = p.id; }
                    App.setProject({ id: App.state.project.id, name: p.name });
                    App.setDirty(false);
                }
                break;

            default:
                break;
        }
    }

    window.addEventListener('message', function (e) {
        var data = e.data;
        if (!data || typeof data.action !== 'string') { return; }
        var payload = (data.payload !== undefined && data.payload !== null) ? data.payload : {};
        try {
            handleBuiltin(data.action, payload);
        } catch (err) {
            console.error('[' + RESOURCE + '] built-in handler for "' + data.action + '" failed:', err);
        }
        App.emit(data.action, payload);
    });

    /* ────────────────────────────────────────────────────────
       Global keyboard shortcuts (see map in header comment)
       ──────────────────────────────────────────────────────── */
    var TOOL_KEYS = {
        v: 'select',   /* V — select / move   */
        m: 'marquee',  /* M — select a region */
        b: 'brush',    /* B — brush           */
        e: 'eraser',   /* E — eraser          */
        t: 'text',     /* T — text            */
        s: 'shape',    /* S — shape           */
        f: 'fill',      /* F — fill            */
        /* U and G stay as aliases: they were the original bindings and
           some muscle memory exists, but the help modal and the rail
           tooltips have always advertised S and F. */
        u: 'shape',
        g: 'fill',
        i: 'eyedrop'   /* I — eyedropper      */
    };

    function isTyping(el) {
        if (!el) { return false; }
        var tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
    }

    document.addEventListener('keydown', function (e) {
        /* 1 — an open modal owns the keyboard (ESC cancels it). */
        if (modalStack.length) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                var top = modalStack[modalStack.length - 1];
                if (top.cancel) { top.cancel(); } else { top.close(); }
            }
            return;
        }

        if (!App.state.open) { return; }

        var typing = isTyping(document.activeElement);

        /* 2 — ESC: blur a focused field first, otherwise close. */
        if (e.key === 'Escape') {
            if (typing) {
                document.activeElement.blur();
                return;
            }
            e.preventDefault();
            App.requestClose();
            return;
        }

        var editor = window.Editor || null;

        /* 3 — Ctrl / Cmd chords. */
        if (e.ctrlKey || e.metaKey) {
            var k = (e.key || '').toLowerCase();
            if (k === 's') {
                e.preventDefault();
                App.emit('requestSave', {});
                return;
            }
            if (typing) { return; }   /* leave text-field undo alone */
            /* Region-selection chords, Photoshop-compatible:
                 Ctrl+A         select the whole canvas
                 Ctrl+Shift+D   deselect
                 Ctrl+Shift+I   invert the selection
               Ctrl+D stays "duplicate layer" (below) — it predates
               the selection tool and rebinding it would break muscle
               memory for everyone already using this studio. */
            if (k === 'a' && editor && editor.selectAll) {
                e.preventDefault();
                editor.selectAll();
                return;
            }
            if (e.shiftKey && k === 'd' && editor && editor.deselect) {
                e.preventDefault();
                editor.deselect();
                return;
            }
            if (e.shiftKey && k === 'i' && editor && editor.invertSelection) {
                e.preventDefault();
                editor.invertSelection();
                return;
            }
            if (k === 'z' && !e.shiftKey) {
                e.preventDefault();
                try { if (editor && editor.undo) { editor.undo(); } } catch (err) { console.error(err); }
                return;
            }
            if (k === 'y' || (k === 'z' && e.shiftKey)) {
                e.preventDefault();
                try { if (editor && editor.redo) { editor.redo(); } } catch (err) { console.error(err); }
                return;
            }
            if (k === 'c' && editor && editor.selectedId) {
                /* copy = remember the layer; Ctrl+V clones it */
                copiedLayerId = editor.selectedId;
                return;   /* no preventDefault — image copy elsewhere still works */
            }
            if (k === 'v' && editor && copiedLayerId && editor.getLayer(copiedLayerId)) {
                /* clipboard IMAGES are handled by the 'paste' event in
                   panels.js — this path clones a copied LAYER */
                var pasted = editor.duplicateLayer(copiedLayerId);
                if (pasted) {
                    editor.updateLayer(pasted.id, { x: (pasted.x || 0) + 24, y: (pasted.y || 0) + 24 });
                }
                return;
            }
            if (k === 'd' && editor && editor.selectedId) {
                e.preventDefault();
                editor.duplicateLayer(editor.selectedId);
                return;
            }
            if (k === '=' || k === '+') { e.preventDefault(); App.emit('zoomKey', { dir: 1 }); return; }
            if (k === '-') { e.preventDefault(); App.emit('zoomKey', { dir: -1 }); return; }
            return;
        }

        if (typing || e.altKey) { return; }

        /* 4 — selected-layer transforms. */
        var sel = editor && editor.selectedId ? editor.getLayer(editor.selectedId) : null;
        if (sel && !sel.locked) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                editor.removeLayer(sel.id);
                return;
            }
            var NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (NUDGE[e.key]) {
                e.preventDefault();
                var step = e.shiftKey ? 10 : 1;
                editor.updateLayer(sel.id, {
                    x: (sel.x || 0) + NUDGE[e.key][0] * step,
                    y: (sel.y || 0) + NUDGE[e.key][1] * step
                });
                return;
            }
            if ((e.key || '').toLowerCase() === 'r') {
                e.preventDefault();
                var delta = (e.shiftKey ? -15 : 15) * Math.PI / 180;
                editor.updateLayer(sel.id, { rotation: (sel.rotation || 0) + delta });
                return;
            }
        }

        /* 5 — single-key tool switching. */
        var toolName = TOOL_KEYS[(e.key || '').toLowerCase()];
        if (toolName) {
            try {
                if (editor && editor.setTool) {
                    e.preventDefault();
                    editor.setTool(toolName);
                }
            } catch (err) { console.error(err); }
        }
    });
    var copiedLayerId = null;

    /* ────────────────────────────────────────────────────────
       Project pill — opens the Projects modal (web parity;
       renaming lives on each project card inside it). panels.js
       listens for 'projectsOpen'.
       ──────────────────────────────────────────────────────── */
    function bindProjectPill() {
        var pill = document.getElementById('project-pill');
        if (!pill) { return; }
        pill.addEventListener('click', function () {
            App.emit('projectsOpen');
        });
    }

    /* ────────────────────────────────────────────────────────
       Boot handshake — loader is visible in the markup already;
       tell Lua the page is alive, it answers with boot + open.
       ──────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        /* The NUI page is loaded the whole time the player is on the
           server, so it must stay INVISIBLE until the studio opens:
           nothing is shown here — the loader appears only when Lua
           sends the `loading` action from Open(). */
        bindProjectPill();
        App.nui('uiReady');
    });

    /* ────────────────────────────────────────────────────────
       Exports
       ──────────────────────────────────────────────────────── */
    /* ────────────────────────────────────────────────────────
       Tooltips — a single fixed-position layer, clamped to the
       viewport. Replaces the old CSS ::after tooltips, which got
       clipped by overflow:hidden panels and ran off-screen.
       ──────────────────────────────────────────────────────── */
    (function tooltipLayer() {
        var tipEl = null;
        function ensure() {
            if (tipEl) { return tipEl; }
            tipEl = document.createElement('div');
            tipEl.id = 'tip-layer';
            document.body.appendChild(tipEl);
            return tipEl;
        }
        function show(target) {
            var txt = target.getAttribute('data-tip');
            if (!txt) { return; }
            var el = ensure();
            el.textContent = txt;
            el.style.display = 'block';
            var r = target.getBoundingClientRect();
            var tw = el.offsetWidth, th = el.offsetHeight;
            var pos = target.getAttribute('data-tip-pos') || 'bottom';
            var x, y;
            if (pos === 'right') {
                x = r.right + 8; y = r.top + (r.height - th) / 2;
                if (x + tw > window.innerWidth - 4) { x = r.left - tw - 8; }
            } else {
                x = r.left + (r.width - tw) / 2;
                y = r.bottom + 8;
                if (y + th > window.innerHeight - 4) { y = r.top - th - 8; }
            }
            if (pos === 'right') { y = Math.max(4, Math.min(y, window.innerHeight - th - 4)); }
            x = Math.max(4, Math.min(x, window.innerWidth - tw - 4));
            y = Math.max(4, Math.min(y, window.innerHeight - th - 4));
            el.style.left = x + 'px';
            el.style.top = y + 'px';
        }
        function hide() { if (tipEl) { tipEl.style.display = 'none'; } }
        document.addEventListener('mouseover', function (e) {
            var t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
            if (t) { show(t); } else { hide(); }
        });
        document.addEventListener('mousedown', hide);
        window.addEventListener('scroll', hide, true);
    })();

    App.resolveText = resolveText;
    window.App = App;
    window.t = t;
})();
