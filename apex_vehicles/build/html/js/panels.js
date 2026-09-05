/* ════════════════════════════════════════════════════════════
   APEX CLOTHING STUDIO — panels.js
   ------------------------------------------------------------
   Everything around the canvas: tool rail bindings, contextual
   tool options, the right dock (layers + inspector, projects,
   AI, export), topbar actions, Quick AI Fit modal and the
   statusbar controls. Uses only the public App/Editor/Stage
   APIs defined by the contract.
   ════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var Panels = {};

    var BLEND_MODES = [
        'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
        'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
        'exclusion', 'hue', 'saturation', 'color', 'luminosity'
    ];

    var TYPE_ICONS = {
        image: 'fa-image', text: 'fa-font', shape: 'fa-shapes',
        fill: 'fa-fill-drip', raster: 'fa-paintbrush', pattern: 'fa-swatchbook'
    };

    /* fonts available to text layers (loaded in index.html <link>) */
    var TEXT_FONTS = ['Inter', 'Montserrat', 'Oswald', 'Bebas Neue', 'Anton',
        'Roboto Condensed', 'Teko', 'Righteous', 'Archivo Black',
        'Permanent Marker', 'Pacifico', 'Lobster', 'JetBrains Mono'];

    var AI_HIST_KEY = 'apex_vehicles_ai_history';
    var aiHistory = [];        /* [{ image }] most recent first — persisted */
    var lastShareCodes = {};   /* projectId → code */
    var suppressDirty = false; /* true while loading a project    */

    function loadAiHistory() {
        try {
            var raw = localStorage.getItem(AI_HIST_KEY);
            aiHistory = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(aiHistory)) { aiHistory = []; }
        } catch (e) { aiHistory = []; }
    }
    function saveAiHistory() {
        try { localStorage.setItem(AI_HIST_KEY, JSON.stringify(aiHistory.slice(0, 12))); }
        catch (e) { /* quota — drop the oldest and retry once */
            try { aiHistory = aiHistory.slice(0, 6); localStorage.setItem(AI_HIST_KEY, JSON.stringify(aiHistory)); }
            catch (e2) { /* give up silently */ }
        }
    }

    /* ────────────────────────────────────────────────────────
       Small DOM builders
       ──────────────────────────────────────────────────────── */

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text !== undefined && text !== null) { node.textContent = text; }
        return node;
    }

    function icon(cls) {
        var i = el('i');
        i.className = 'fa-solid ' + cls;
        return i;
    }

    function labeled(labelText, control) {
        var box = el('div', 'field');
        box.appendChild(el('span', 'micro-label', labelText));
        box.appendChild(control);
        return box;
    }

    function makeInput(type, value) {
        var input = el('input', 'input');
        input.type = type;
        if (value !== undefined) { input.value = value; }
        if (type === 'number') { input.classList.add('mono'); }
        return input;
    }

    function makeRange(min, max, step, value) {
        var input = el('input');
        input.type = 'range';
        input.min = min; input.max = max; input.step = step; input.value = value;
        /* keep the coloured fill in sync with the value (the CSS track uses
           --val); without this the bar looked frozen even though it worked */
        function syncFill() {
            var pct = (max - min) ? ((parseFloat(input.value) - min) / (max - min)) * 100 : 0;
            input.style.setProperty('--val', Math.max(0, Math.min(100, pct)) + '%');
        }
        syncFill();
        input.addEventListener('input', syncFill);
        return input;
    }

    function makeSelect(options, value) {
        var sel = el('select', 'input');
        options.forEach(function (opt) {
            var o = el('option', null, opt.label);
            o.value = opt.value;
            if (opt.value === value) { o.selected = true; }
            sel.appendChild(o);
        });
        return sel;
    }

    /* ════════════════════════════════════════════════════════
       §CUSTOM SELECT — the studio's own dropdown
       --------------------------------------------------------
       Chromium/CEF gives almost no control over a native
       <select>'s POPUP list (padding, hover, radius, colours),
       so it always looked like the OS default. This wraps every
       <select> in a fully-styled control: the native element
       stays in the DOM as the source of truth (value + 'change'
       events keep working for all existing code), but it is
       hidden and driven by a custom button + floating menu.

       A MutationObserver enhances selects the moment they enter
       the DOM, so dynamically-built ones (tool options, the
       inspector, modals) get the treatment automatically.
       ════════════════════════════════════════════════════════ */

    var openCsel = null;   /* { close } of the menu currently open */

    function closeCsel() {
        if (openCsel) { openCsel.close(); openCsel = null; }
    }

    function enhanceSelect(select) {
        if (!select || select.dataset.csel || !select.parentNode) { return; }
        select.dataset.csel = '1';

        var wrap = document.createElement('div');
        wrap.className = 'csel';
        /* inherit the caller's width intent: block selects (inspector)
           set width:100%, inline ones keep their natural size */
        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);
        select.classList.add('csel-native');

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'csel-btn';
        var label = el('span', 'csel-label');
        var caret = document.createElement('i');
        caret.className = 'fa-solid fa-chevron-down csel-caret';
        btn.appendChild(label);
        btn.appendChild(caret);
        wrap.appendChild(btn);

        function optText() {
            var o = select.options[select.selectedIndex];
            return o ? o.textContent : '';
        }
        function syncLabel() { label.textContent = optText(); }
        syncLabel();

        function openMenu() {
            closeCsel();
            var menu = el('div', 'csel-menu');
            Array.prototype.forEach.call(select.options, function (opt, i) {
                var it = el('button', 'csel-item' + (i === select.selectedIndex ? ' active' : ''));
                it.type = 'button';
                it.appendChild(el('span', 'csel-item-label', opt.textContent));
                it.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (select.selectedIndex !== i) {
                        select.selectedIndex = i;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    syncLabel();
                    closeCsel();
                });
                menu.appendChild(it);
            });
            document.body.appendChild(menu);

            /* fixed-position, clamped to the viewport, flips up when the
               list would run off the bottom — same idea as the tooltip
               layer so it's never clipped by a scroll container */
            var r = btn.getBoundingClientRect();
            menu.style.minWidth = r.width + 'px';
            var mh = menu.offsetHeight, mw = menu.offsetWidth;
            var below = window.innerHeight - r.bottom;
            var top = (mh <= below || below >= r.top) ? (r.bottom + 4) : Math.max(6, r.top - mh - 4);
            var left = Math.min(r.left, window.innerWidth - mw - 6);
            menu.style.top = top + 'px';
            menu.style.left = Math.max(6, left) + 'px';
            var act = menu.querySelector('.csel-item.active');
            if (act && act.scrollIntoView) { act.scrollIntoView({ block: 'nearest' }); }

            btn.classList.add('open');
            function onDoc(e) {
                if (!menu.contains(e.target) && !btn.contains(e.target)) { closeCsel(); }
            }
            function onScroll() { closeCsel(); }
            setTimeout(function () { document.addEventListener('mousedown', onDoc, true); }, 0);
            window.addEventListener('scroll', onScroll, true);

            openCsel = {
                close: function () {
                    document.removeEventListener('mousedown', onDoc, true);
                    window.removeEventListener('scroll', onScroll, true);
                    if (menu.parentNode) { menu.parentNode.removeChild(menu); }
                    btn.classList.remove('open');
                }
            };
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (openCsel) { closeCsel(); return; }
            openMenu();
        });
        /* stay in sync when code (not the user) changes the value… */
        select.addEventListener('change', syncLabel);
        /* …and when code rebuilds the <option> list (e.g. the boot
           handler refills the canvas-size picker from the config). */
        if (typeof MutationObserver === 'function') {
            new MutationObserver(syncLabel).observe(select, { childList: true });
        }
    }

    function enhanceSelects(root) {
        var list = (root || document).querySelectorAll('select:not([data-csel])');
        Array.prototype.forEach.call(list, enhanceSelect);
    }

    function watchSelects() {
        enhanceSelects(document);
        if (typeof MutationObserver !== 'function') { return; }
        var mo = new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                var added = muts[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var n = added[j];
                    if (n.nodeType !== 1) { continue; }
                    if (n.tagName === 'SELECT') { enhanceSelect(n); }
                    else if (n.querySelectorAll) { enhanceSelects(n); }
                }
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    /* ────────────────────────────────────────────────────────
       Dock tabs
       ──────────────────────────────────────────────────────── */

    function activateTab(name) {
        document.querySelectorAll('.dock-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.tab === name);
        });
        document.querySelectorAll('.dock-pane').forEach(function (pane) {
            pane.classList.toggle('active', pane.dataset.pane === name);
        });
        if (name === 'projects') { requestProjects(); }
        if (name === 'templates') {
            if (!templatesLoaded) { requestTemplates(); }
            else { ensureVisibleGender(); }
        }
        if (name === 'export') { renderExportSummary(); }
    }

    function bindTabs() {
        document.querySelectorAll('.dock-tab').forEach(function (tab) {
            tab.addEventListener('click', function () { activateTab(tab.dataset.tab); });
        });
    }

    /* ────────────────────────────────────────────────────────
       Tool rail + tool options
       ──────────────────────────────────────────────────────── */

    function bindToolRail() {
        document.querySelectorAll('#tool-rail .tool-btn[data-tool]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var tool = btn.dataset.tool;
                /* FiveM's CEF can't open file dialogs — the image tool
                   opens our URL/paste importer instead */
                if (tool === 'image') { openImageImport(); return; }
                if (tool === 'ai') { activateTab('ai'); }
                Editor.setTool(tool);
            });
        });
        var undo = document.getElementById('btn-undo');
        var redo = document.getElementById('btn-redo');
        if (undo) { undo.addEventListener('click', function () { Editor.undo(); }); }
        if (redo) { redo.addEventListener('click', function () { Editor.redo(); }); }
        var collapse = document.getElementById('rail-collapse');
        if (collapse) {
            collapse.addEventListener('click', function () {
                var rail = document.getElementById('tool-rail');
                if (rail) { rail.classList.toggle('collapsed'); }
            });
        }
    }

    /* ── image import (URL / clipboard paste) ─────────────────
       CEF inside FiveM cannot open the OS file picker, so "add
       image" imports via a direct URL (fetched as a blob → data
       URL, which never taints the canvas) or via Ctrl+V paste. */

    function baseCount() {
        var n = 0;
        for (var i = 0; i < Editor.layers.length; i++) {
            var l = Editor.layers[i];
            if (l && l.data && l.data.isBase) { n++; }
        }
        return n;
    }

    function addImageFromSrc(src, name) {
        var layer = Editor.addLayer('image', { src: src }, name || t('layer_image', 'Image'));
        if (layer) { App.toast(t('img_added', 'Image added as a layer.'), 'success'); }
        return layer;
    }

    /* Add an image that COVERS the whole canvas (0,0 → w,h) — used for
       generated/saved textures so they land ready-to-use, no manual
       stretching. Placing w=h=canvas keeps the base at (0,0). */
    function addImageFillCanvas(src, name) {
        return Editor.addLayer('image', {
            src: src,
            w: Editor.getWidth ? Editor.getWidth() : 1024,
            h: Editor.getHeight ? Editor.getHeight() : 1024
        }, name || t('layer_image', 'Image'));
    }

    var imgImportClose = null;

    /* Read a File object (from the PC picker or drag-drop) → new layer. */
    function addImageFromFile(file) {
        if (!file || (file.type && file.type.indexOf('image/') !== 0)) {
            App.toast(t('img_not_image', 'That file is not an image.'), 'error');
            return;
        }
        var fr = new FileReader();
        fr.onload = function () {
            addImageFromSrc(String(fr.result), t('layer_image', 'Image'));
            if (imgImportClose) { imgImportClose(); imgImportClose = null; }
        };
        fr.readAsDataURL(file);
    }

    /* The hidden <input type=file> — works on FiveM builds that allow the
       native picker; harmless elsewhere (URL/paste remain). */
    function bindFileImage() {
        var fi = document.getElementById('file-image');
        if (fi) {
            fi.addEventListener('change', function () {
                if (fi.files && fi.files[0]) { addImageFromFile(fi.files[0]); }
                fi.value = '';
            });
        }
    }

    function openImageImport() {
        var content = el('div', 'img-import');
        content.appendChild(el('p', 'pane-hint',
            t('img_import_hint2', 'Upload from your PC, paste with Ctrl+V, or add from a direct URL.')));

        /* Upload from PC */
        var uploadBtn = el('button', 'btn btn-primary btn-block');
        uploadBtn.appendChild(icon('fa-upload'));
        uploadBtn.appendChild(el('span', null, t('img_upload_pc', 'Upload from PC')));
        uploadBtn.addEventListener('click', function () {
            var fi = document.getElementById('file-image');
            if (fi) { fi.click(); }
        });
        content.appendChild(uploadBtn);

        content.appendChild(el('div', 'or-divider', t('img_or', 'or')));

        var urlIn = makeInput('text', '');
        urlIn.placeholder = t('img_url_ph', 'https://…/image.png');
        content.appendChild(labeled(t('img_url', 'Image URL'), urlIn));

        var closeRef = null;
        var addBtn = el('button', 'btn btn-primary btn-block');
        addBtn.appendChild(icon('fa-plus'));
        addBtn.appendChild(el('span', null, t('img_add_url', 'Add from URL')));
        addBtn.addEventListener('click', function () {
            var u = String(urlIn.value || '').trim();
            if (!/^https?:\/\//i.test(u)) {
                App.toast(t('img_bad_url', 'Paste a direct http(s) image link.'), 'error');
                return;
            }
            addBtn.disabled = true;
            fetch(u)
                .then(function (r) { if (!r.ok) { throw new Error('http ' + r.status); } return r.blob(); })
                .then(function (b) {
                    var fr = new FileReader();
                    fr.onload = function () {
                        addImageFromSrc(String(fr.result));
                        if (closeRef) { closeRef(); }
                    };
                    fr.readAsDataURL(b);
                })
                .catch(function () {
                    addBtn.disabled = false;
                    App.toast(t('img_fetch_fail', 'Could not download that image (host must allow CORS — imgur/discord links work).'), 'error');
                });
        });
        content.appendChild(addBtn);

        var pasteBox = el('div', 'paste-box');
        pasteBox.appendChild(icon('fa-clipboard'));
        pasteBox.appendChild(el('span', null,
            t('img_paste_hint', 'Or copy an image (print screen, right-click → copy image) and press Ctrl+V.')));
        content.appendChild(pasteBox);

        closeRef = App.modal(content, { title: t('img_import_title', 'Add image'), icon: 'fa-image' });
        imgImportClose = closeRef;
    }

    /* Ctrl+V anywhere: clipboard IMAGE becomes a new layer. */
    function bindClipboardPaste() {
        document.addEventListener('paste', function (e) {
            if (!App.state.open) { return; }
            var items = (e.clipboardData && e.clipboardData.items) || [];
            for (var i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf('image/') === 0) {
                    var file = items[i].getAsFile();
                    if (!file) { continue; }
                    var fr = new FileReader();
                    fr.onload = function () { addImageFromSrc(String(fr.result), t('layer_pasted', 'Pasted image')); };
                    fr.readAsDataURL(file);
                    e.preventDefault();
                    return;
                }
            }
        });
    }

    function syncRail(toolName) {
        document.querySelectorAll('#tool-rail .tool-btn[data-tool]').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });
    }

    /* ── brush-type strip (web LayeredEditor BRUSH_TYPES) ─────────
       normal / spray / marker are real engine variants (editor.js
       drawSegment + strokeTo). "Pixel" is an HONEST preset over real
       params: the normal engine brush at hardness 1 — no soft
       shadow-blur edge, so strokes land crisp (the engine has no
       square dab). Clicking a type selects it AND switches to the
       brush tool; the highlight shows only while the brush is the
       active tool (web behaviour). */
    var railBrushType = 'normal';

    function syncBrushTypes() {
        var isBrush = Editor.tool === 'brush';
        var btns = document.querySelectorAll('#tool-rail .rail-brush-type');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', isBrush && btns[i].dataset.btype === railBrushType);
        }
    }

    function bindBrushTypes() {
        var btns = document.querySelectorAll('#tool-rail .rail-brush-type');
        if (!btns.length) { return; }
        for (var i = 0; i < btns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var kind = btn.dataset.btype;
                    railBrushType = kind;
                    if (kind === 'spray' || kind === 'marker') {
                        Editor.brushType = kind;
                    } else if (kind === 'pixel') {
                        Editor.brushType = 'normal';
                        Editor.brush.hardness = 1;      /* crisp hard edge */
                    } else {
                        Editor.brushType = 'normal';
                        Editor.brush.hardness = 0.85;   /* engine default softness */
                    }
                    Editor.setTool('brush');            /* emits 'tool' → options re-render */
                    syncBrushTypes();
                });
            })(btns[i]);
        }
        Editor.on('tool', syncBrushTypes);
        syncBrushTypes();
    }

    /* ── marquee-mode strip ───────────────────────────────────────
       Same contract as the brush types above: the highlight shows
       only while the Region tool is active, and clicking a mode
       both picks it AND switches to the tool. */
    function syncMarqueeModes() {
        var isMarq = Editor.tool === 'marquee';
        var btns = document.querySelectorAll('#tool-rail .rail-marq-mode');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active',
                isMarq && btns[i].dataset.mmode === (Editor.marquee && Editor.marquee.mode));
        }
    }

    function bindMarqueeModes() {
        var btns = document.querySelectorAll('#tool-rail .rail-marq-mode');
        if (!btns.length) { return; }
        for (var i = 0; i < btns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    Editor.setMarquee({ mode: btn.dataset.mmode });
                    Editor.setTool('marquee');
                    syncMarqueeModes();
                });
            })(btns[i]);
        }
        Editor.on('tool', syncMarqueeModes);
        /* Making/clearing a selection flips half the buttons in the
           options bar between enabled and disabled — re-render them. */
        Editor.on('selectionMask', function () {
            if (Editor.tool === 'marquee') { renderToolOptions('marquee'); }
            syncSelectionUi();
        });
        syncMarqueeModes();
    }

    /* Anything outside the options bar that cares whether a region is
       selected: the AI target card and the statusbar hint. */
    function syncSelectionUi() {
        var has = Editor.hasSelection && Editor.hasSelection();
        var card = document.getElementById('ai-target-selection');
        if (card) {
            card.classList.toggle('disabled', !has);
            var radio = card.querySelector('input');
            if (radio) {
                radio.disabled = !has;
                /* never leave the pane on a target that can't run */
                if (!has && radio.checked) {
                    var sheet = document.querySelector('input[name="ai-target"][value="sheet"]');
                    if (sheet) { sheet.checked = true; }
                }
            }
        }
        var chip = document.getElementById('sel-status');
        if (chip) {
            var b = has ? Editor.selectionBounds() : null;
            chip.hidden = !has;
            if (b) {
                chip.textContent = t('sel_status', 'Region %d×%d', Math.round(b.w), Math.round(b.h));
            }
        }
    }

    var HINTS = {
        select: ['status_select', 'Drag layers to move — handles resize and rotate'],
        marquee: ['status_marquee', 'Drag to mark a region — Shift adds, Alt subtracts, Del clears it'],
        brush: ['status_brush', 'Paint on the canvas — B toggles, [ ] would be nice but use the slider'],
        eraser: ['status_eraser', 'Erase paint strokes on raster layers'],
        text: ['status_text', 'Click the canvas to place text — double-click to edit it'],
        shape: ['status_shape', 'Drag on the canvas to draw — hold Shift for a square/circle'],
        fill: ['status_fill', 'Click the canvas to lay a base color under everything'],
        pattern: ['status_pattern', 'Click the canvas to add a procedural pattern layer'],
        eyedrop: ['status_eyedrop', 'Click the canvas to pick a color'],
        ai: ['status_ai', 'Describe a texture and let the AI paint it']
    };

    function setHint(toolName) {
        var hint = document.getElementById('status-hint');
        var def = HINTS[toolName] || ['status_ready', 'Ready'];
        if (hint) { hint.textContent = t(def[0], def[1]); }
    }

    /* The web studio's 10 preset swatches (LayeredEditor SWATCHES). */
    var SWATCH_PRESETS = ['#1F5EFF', '#0A0A0B', '#ffffff', '#e11d48', '#f59e0b',
        '#22c55e', '#06b6d4', '#a855f7', '#64748b', '#7c3f1d'];

    function renderToolOptions(toolName) {
        var box = document.getElementById('tool-options');
        if (!box) { return; }
        box.innerHTML = '';
        box.classList.remove('open');

        /* colour input + preset swatches (web options-bar row) */
        function swatchRow(getColor, setColor) {
            var row = el('div', 'opt-row');
            var colorIn = makeInput('color', getColor());
            colorIn.classList.add('color');
            colorIn.addEventListener('input', function () { setColor(colorIn.value); });
            row.appendChild(colorIn);
            SWATCH_PRESETS.forEach(function (hex) {
                var s = el('button', 'opt-swatch');
                s.type = 'button';
                s.style.background = hex;
                s.addEventListener('click', function () {
                    setColor(hex);
                    colorIn.value = hex;
                });
                row.appendChild(s);
            });
            return row;
        }

        /* labelled slider cell for the bottom grid */
        function sliderCell(label, min, max, value, fmt, onInput) {
            var cell = el('div', 'opt-slider');
            var head = el('div', 'opt-slider-head');
            head.appendChild(el('span', 'micro-label', label));
            var out = el('span', 'mono opt-val', fmt(value));
            head.appendChild(out);
            cell.appendChild(head);
            var range = makeRange(min, max, 1, value);
            range.addEventListener('input', function () {
                var v = parseInt(range.value, 10);
                onInput(v);
                out.textContent = fmt(v);
            });
            cell.appendChild(range);
            return cell;
        }

        /* icon segment group */
        function segGroup(defs, isActive, onPick) {
            var group = el('div', 'seg-group');
            defs.forEach(function (def) {
                var b = el('button', 'seg-btn' + (isActive(def[0]) ? ' active' : ''));
                b.type = 'button';
                b.appendChild(icon(def[1]));
                if (def[2]) { b.setAttribute('data-tip', def[2]); }
                b.addEventListener('click', function () {
                    onPick(def[0]);
                    group.querySelectorAll('.seg-btn').forEach(function (sb) { sb.classList.remove('active'); });
                    b.classList.add('active');
                });
                group.appendChild(b);
            });
            return group;
        }

        if (toolName === 'brush' || toolName === 'eraser') {
            box.classList.add('open');

            var row = el('div', 'opt-row');
            if (toolName === 'brush') {
                /* brush TYPES live in the tool strip (web parity) — the
                   options bar keeps colour, symmetry and sliders only */
                row = swatchRow(function () { return Editor.brush.color; },
                    function (v) { Editor.brush.color = v; });
            }

            /* symmetry (brush + eraser) */
            if (row.children.length) { row.appendChild(el('span', 'head-sep')); }
            var symLab = el('span', 'micro-label', t('opt_symmetry', 'Symmetry'));
            row.appendChild(symLab);
            row.appendChild(segGroup(
                [['none', 'fa-ban', t('sym_off', 'Off')],
                 ['x', 'fa-arrows-left-right', t('sym_x', 'Horizontal')],
                 ['y', 'fa-arrows-up-down', t('sym_y', 'Vertical')],
                 ['xy', 'fa-plus', t('sym_xy', 'Both')]],
                function (v) { return Editor.symmetry === v; },
                function (v) {
                    Editor.symmetry = v;
                    if (Editor.requestOverlay) { Editor.requestOverlay(); }
                }));
            box.appendChild(row);

            /* Size / Hardness slider grid (web bottom row; the editor has
               no live flow control, so no fake third slider) */
            var sliders = el('div', 'opt-sliders');
            sliders.appendChild(sliderCell(t('opt_size', 'Size'), 1, 200, Editor.brush.size,
                function (v) { return String(v); },
                function (v) { Editor.brush.size = v; }));
            sliders.appendChild(sliderCell(t('opt_hardness', 'Hardness'), 0, 100,
                Math.round(Editor.brush.hardness * 100),
                function (v) { return v + '%'; },
                function (v) { Editor.brush.hardness = v / 100; }));
            box.appendChild(sliders);
        } else if (toolName === 'shape') {
            box.classList.add('open');
            var sRow = swatchRow(function () { return Editor.brush.color; },
                function (v) { Editor.brush.color = v; });
            sRow.appendChild(el('span', 'head-sep'));
            sRow.appendChild(el('span', 'micro-label', t('opt_shape', 'Shape')));
            sRow.appendChild(segGroup(
                [['rect', 'fa-square'], ['ellipse', 'fa-circle'], ['line', 'fa-slash']],
                function (v) { return Editor.shapeKind === v; },
                function (v) { Editor.shapeKind = v; }));
            box.appendChild(sRow);
        } else if (toolName === 'text') {
            box.classList.add('open');
            var tRow = swatchRow(function () { return Editor.textDefaults.color; },
                function (v) { Editor.textDefaults.color = v; });
            tRow.appendChild(el('span', 'head-sep'));

            var tSize = makeInput('number', Editor.textDefaults.size);
            tSize.min = 8; tSize.max = 400;
            tSize.addEventListener('input', function () {
                Editor.textDefaults.size = parseInt(tSize.value, 10) || 96;
            });
            var szField = labeled(t('opt_size', 'Size'), tSize);
            tRow.appendChild(szField);

            var tFont = makeSelect(TEXT_FONTS.map(function (f) { return { value: f, label: f }; }),
                Editor.textDefaults.font || 'Inter');
            tFont.addEventListener('change', function () { Editor.textDefaults.font = tFont.value; });
            tRow.appendChild(labeled(t('opt_font', 'Font'), tFont));
            box.appendChild(tRow);
        } else if (toolName === 'fill' || toolName === 'pattern') {
            box.classList.add('open');
            box.appendChild(swatchRow(function () { return Editor.brush.color; },
                function (v) { Editor.brush.color = v; }));
        } else if (toolName === 'marquee') {
            box.classList.add('open');
            var mq = Editor.marquee;
            var has = Editor.hasSelection();

            /* row 1 — shape, boolean op, and the always-available
               Select all / Invert / Deselect trio */
            var mRow = el('div', 'opt-row');
            mRow.appendChild(el('span', 'micro-label', t('opt_marq_mode', 'Shape')));
            mRow.appendChild(segGroup(
                [['rect', 'fa-square', t('marq_rect', 'Rectangle')],
                 ['ellipse', 'fa-circle', t('marq_ellipse', 'Ellipse')],
                 ['lasso', 'fa-draw-polygon', t('marq_lasso', 'Free lasso')],
                 ['wand', 'fa-wand-sparkles', t('marq_wand', 'Magic wand')]],
                function (v) { return mq.mode === v; },
                function (v) { Editor.setMarquee({ mode: v }); }));

            mRow.appendChild(el('span', 'head-sep'));
            mRow.appendChild(el('span', 'micro-label', t('opt_marq_op', 'Mode')));
            mRow.appendChild(segGroup(
                [['new', 'fa-square-plus', t('marq_op_new', 'Replace the selection')],
                 ['add', 'fa-plus', t('marq_op_add', 'Add (Shift)')],
                 ['sub', 'fa-minus', t('marq_op_sub', 'Subtract (Alt)')]],
                function (v) { return (mq.op || 'new') === v; },
                function (v) { Editor.setMarquee({ op: v }); }));

            mRow.appendChild(el('span', 'head-sep'));
            [
                ['fa-object-group', t('marq_all', 'Select all'), function () { Editor.selectAll(); }, true],
                ['fa-repeat', t('marq_invert', 'Invert'), function () { Editor.invertSelection(); }, true],
                ['fa-circle-xmark', t('marq_none', 'Deselect'), function () { Editor.deselect(); }, has]
            ].forEach(function (def) {
                var b = el('button', 'btn-icon sm');
                b.type = 'button';
                b.appendChild(icon(def[0]));
                b.setAttribute('data-tip', def[1]);
                b.disabled = !def[3];
                b.addEventListener('click', def[2]);
                mRow.appendChild(b);
            });
            box.appendChild(mRow);

            /* row 2 — what to DO with the region. Everything here needs a
               selection, so the whole row is disabled without one. */
            var aRow = el('div', 'opt-row');
            aRow.appendChild(el('span', 'micro-label', t('opt_marq_actions', 'With the region')));
            [
                ['fa-eraser', t('marq_delete', 'Delete the pixels inside (Del)'),
                    function () { Editor.deleteSelection(); }],
                ['fa-fill-drip', t('marq_fill', 'Fill with the brush colour'),
                    function () { Editor.fillSelection(Editor.brush.color); }],
                ['fa-clone', t('marq_copy', 'Copy to a new layer'),
                    function () { Editor.selectionToLayer(false); }],
                ['fa-scissors', t('marq_cut', 'Cut to a new layer'),
                    function () { Editor.selectionToLayer(true); }],
                ['fa-wand-magic-sparkles', t('marq_ai', 'Generate with AI inside this region'),
                    function () { App.emit('aiForSelection', {}); }],
                ['fa-download', t('marq_png', 'Download the region as a PNG'),
                    function () { downloadDataUrl(Editor.selectionDataURL(), 'apex_selection.png'); }]
            ].forEach(function (def) {
                var b = el('button', 'btn-icon sm');
                b.type = 'button';
                b.appendChild(icon(def[0]));
                b.setAttribute('data-tip', def[1]);
                b.disabled = !has;
                b.addEventListener('click', def[2]);
                aRow.appendChild(b);
            });

            /* grow / shrink nudges the stencil outward or inward — the
               quickest fix for a wand selection that stops one pixel short */
            aRow.appendChild(el('span', 'head-sep'));
            aRow.appendChild(el('span', 'micro-label', t('opt_marq_size', 'Edge')));
            [['fa-maximize', t('marq_grow', 'Grow by 2px'), 2],
             ['fa-minimize', t('marq_shrink', 'Shrink by 2px'), -2]].forEach(function (def) {
                var b = el('button', 'btn-icon sm');
                b.type = 'button';
                b.appendChild(icon(def[0]));
                b.setAttribute('data-tip', def[1]);
                b.disabled = !has;
                b.addEventListener('click', function () { Editor.expandSelection(def[2]); });
                aRow.appendChild(b);
            });
            box.appendChild(aRow);

            /* row 3 — feather always applies; tolerance only makes sense
               for the wand, so it is hidden for the geometric shapes */
            var mSliders = el('div', 'opt-sliders');
            mSliders.appendChild(sliderCell(t('opt_feather', 'Feather'), 0, 60, mq.feather,
                function (v) { return v + 'px'; },
                function (v) { Editor.marquee.feather = v; }));
            if (mq.mode === 'wand') {
                mSliders.appendChild(sliderCell(t('opt_tolerance', 'Tolerance'), 1, 128, mq.tolerance,
                    function (v) { return String(v); },
                    function (v) { Editor.marquee.tolerance = v; }));
            }
            box.appendChild(mSliders);

            if (mq.mode === 'wand') {
                var cRow = el('div', 'opt-row');
                var cLab = el('label', 'check-row');
                var cIn = makeInput('checkbox');
                cIn.checked = !!mq.contiguous;
                cIn.addEventListener('change', function () {
                    Editor.marquee.contiguous = cIn.checked;
                });
                cLab.appendChild(cIn);
                cLab.appendChild(el('span', null,
                    t('marq_contiguous', 'Contiguous only (untick to grab that colour everywhere)')));
                cRow.appendChild(cLab);
                box.appendChild(cRow);
            }
        }
    }

    /* Trigger a browser download for a data: URL. CEF honours the
       download attribute, so this lands in the user's Downloads folder. */
    function downloadDataUrl(url, filename) {
        if (!url) {
            App.toast(t('dl_nothing', 'Nothing to download.'), 'error');
            return;
        }
        var a = document.createElement('a');
        a.href = url;
        a.download = filename || 'apex_texture.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { a.remove(); }, 0);
        App.toast(t('dl_done', 'PNG downloaded.'), 'success');
    }

    /* ────────────────────────────────────────────────────────
       Layers pane
       ──────────────────────────────────────────────────────── */

    var dragLayerId = null;

    /* ── pointer-based layer drag reorder (CEF-safe) ─────────── */
    var layerDrag = null;       /* { id, startY, moved } while dragging */
    var layerDragMoved = false; /* true if the last gesture was a real drag
                                   (so the row's click doesn't also fire) */

    function layerRowUnder(clientY) {
        var rows = document.querySelectorAll('#layer-list .layer-row');
        for (var i = 0; i < rows.length; i++) {
            var rc = rows[i].getBoundingClientRect();
            if (clientY >= rc.top && clientY <= rc.bottom) { return rows[i]; }
        }
        return null;
    }

    function clearDropMarks() {
        document.querySelectorAll('#layer-list .layer-row.drop-above, #layer-list .layer-row.drop-below, #layer-list .layer-row.dragging')
            .forEach(function (r) { r.classList.remove('drop-above', 'drop-below', 'dragging'); });
    }

    function startLayerDrag(id, index, row, e) {
        layerDrag = { id: id, startY: e.clientY, moved: false };
        layerDragMoved = false;
        row.classList.add('dragging');
        e.preventDefault();
    }

    function onLayerDragMove(e) {
        if (!layerDrag) { return; }
        if (!layerDrag.moved && Math.abs(e.clientY - layerDrag.startY) < 4) { return; }
        layerDrag.moved = true;
        var over = layerRowUnder(e.clientY);
        document.querySelectorAll('#layer-list .layer-row.drop-above, #layer-list .layer-row.drop-below')
            .forEach(function (r) { r.classList.remove('drop-above', 'drop-below'); });
        if (over && over.dataset.layerId !== layerDrag.id && over.dataset.base !== '1') {
            var rc = over.getBoundingClientRect();
            over.classList.add((e.clientY < rc.top + rc.height / 2) ? 'drop-above' : 'drop-below');
        }
    }

    function onLayerDragUp(e) {
        if (!layerDrag) { return; }
        var drag = layerDrag; layerDrag = null;
        if (drag.moved) {
            layerDragMoved = true;
            setTimeout(function () { layerDragMoved = false; }, 0);
            var over = layerRowUnder(e.clientY);
            if (over && over.dataset.layerId !== drag.id && over.dataset.base !== '1') {
                var targetIdx = parseInt(over.dataset.index, 10);
                var rc = over.getBoundingClientRect();
                /* dropping on the lower half = below that layer (lower index) */
                if (e.clientY >= rc.top + rc.height / 2) { targetIdx = Math.max(baseCount(), targetIdx); }
                Editor.moveLayer(drag.id, Math.max(baseCount(), targetIdx));
            }
        }
        clearDropMarks();
    }

    function bindLayerDnd() {
        document.addEventListener('mousemove', onLayerDragMove);
        document.addEventListener('mouseup', onLayerDragUp);
    }

    function renderLayers() {
        var list = document.getElementById('layer-list');
        if (!list) { return; }
        list.innerHTML = '';

        /* spine tab layer count (web console parity) */
        var cnt = document.querySelector('.dock-tab[data-tab="layers"] .tab-count');
        if (cnt) { cnt.textContent = Editor.layers.length ? String(Editor.layers.length) : ''; }

        if (!Editor.layers.length) {
            var empty = el('div', 'empty-state');
            empty.appendChild(icon('fa-layer-group'));
            empty.appendChild(el('span', null, t('layers_empty', 'No layers yet — pick a tool to start designing')));
            list.appendChild(empty);
            return;
        }

        /* top layer first — each row guarded so ONE bad layer can never
           blank the whole list */
        for (var i = Editor.layers.length - 1; i >= 0; i--) {
            try {
            (function (layer, index) {
                var row = el('div', 'layer-row' + (layer.id === Editor.selectedId ? ' active' : ''));
                row.dataset.layerId = layer.id;
                row.dataset.index = index;
                row.dataset.base = (layer.data && layer.data.isBase) ? '1' : '0';
                row.dataset.type = layer.type || '';   /* v25: type-coloured notch (CSS only) */

                var thumb = el('div', 'layer-thumb');
                var img = document.createElement('img');
                img.src = Editor.layerThumb(layer.id, 28);
                thumb.appendChild(img);

                /* name + type subtitle (web row anatomy) */
                var txt = el('div', 'layer-txt');
                var name = el('span', 'layer-name', layer.name);
                name.title = layer.name;
                txt.appendChild(name);
                txt.appendChild(el('span', 'layer-type', layer.type));

                /* always-visible row actions — duplicate · lock · eye · trash
                   (ordering moved to the keycap ops strip above the list) */
                var actions = el('div', 'layer-actions');

                var dup = el('button', 'layer-act');
                dup.appendChild(icon('fa-clone'));
                dup.setAttribute('data-tip', t('tip_duplicate', 'Duplicate'));
                dup.addEventListener('click', function (e) {
                    e.stopPropagation();
                    Editor.duplicateLayer(layer.id);
                });

                var lock = el('button', 'layer-lock' + (layer.locked ? ' on' : ''));
                lock.appendChild(icon(layer.locked ? 'fa-lock' : 'fa-lock-open'));
                lock.addEventListener('click', function (e) {
                    e.stopPropagation();
                    Editor.updateLayer(layer.id, { locked: !layer.locked });
                });

                var eye = el('button', 'layer-eye' + (layer.visible ? '' : ' off'));
                eye.appendChild(icon(layer.visible ? 'fa-eye' : 'fa-eye-slash'));
                eye.addEventListener('click', function (e) {
                    e.stopPropagation();
                    Editor.updateLayer(layer.id, { visible: !layer.visible });
                });

                var del = el('button', 'layer-act danger');
                del.appendChild(icon('fa-trash'));
                del.setAttribute('data-tip', t('tip_delete', 'Delete'));
                del.addEventListener('click', function (e) {
                    e.stopPropagation();
                    Editor.removeLayer(layer.id);
                });

                actions.appendChild(dup);
                actions.appendChild(lock);
                actions.appendChild(eye);
                actions.appendChild(del);

                row.appendChild(thumb);
                row.appendChild(txt);
                row.appendChild(actions);

                row.addEventListener('click', function () {
                    if (!layerDragMoved) { Editor.select(layer.id); }
                });

                name.addEventListener('dblclick', function (e) {
                    e.stopPropagation();
                    App.prompt(t('rename_layer', 'Rename layer'), t('rename_label', 'Name'), layer.name,
                        { maxLength: 40 }).then(function (val) {
                        if (val === null) { return; }
                        val = String(val).trim();
                        if (val) { Editor.updateLayer(layer.id, { name: val }); }
                    });
                });

                /* pointer-based drag re-order (HTML5 DnD is unreliable in
                   FiveM's CEF). Skip when the base texture is the row (it is
                   pinned) or when grabbing an action button. */
                row.addEventListener('mousedown', function (e) {
                    if (e.button !== 0) { return; }
                    if (e.target.closest('button')) { return; }
                    if (row.dataset.base === '1') { return; }
                    startLayerDrag(layer.id, index, row, e);
                });

                list.appendChild(row);   /* ← the row must actually enter the DOM */
            })(Editor.layers[i], i);
            } catch (err) { console.error('[panels] layer row failed:', err); }
        }
    }

    function bindAddLayer() {
        var btn = document.getElementById('btn-add-layer');
        if (!btn) { return; }
        btn.addEventListener('click', openAddLayerMenu);
    }

    function openAddLayerMenu() {
        var menu = el('div', 'add-layer-menu');
        var defs = [
            ['image', 'fa-image', t('add_image', 'Image'), t('add_image_d', 'Paste or add from a URL')],
            ['paint', 'fa-paintbrush', t('add_paint', 'Paint layer'), t('add_paint_d', 'Blank layer to brush on')],
            ['text', 'fa-font', t('add_text', 'Text'), t('add_text_d', 'Editable text with outline')],
            ['shape', 'fa-shapes', t('add_shape', 'Shape'), t('add_shape_d', 'Rectangle, circle or line')],
            ['fill', 'fa-fill-drip', t('add_fill', 'Solid fill'), t('add_fill_d', 'Flat colour underlay')],
            ['gradient', 'fa-droplet', t('add_gradient', 'Gradient'), t('add_gradient_d', 'Smooth colour blend')],
            ['pattern', 'fa-swatchbook', t('add_pattern', 'Pattern'), t('add_pattern_d', 'Stripes, dots, camo…')],
            ['noise', 'fa-hurricane', t('add_noise', 'Camo / noise'), t('add_noise_d', 'Procedural camouflage')]
        ];
        var close;
        defs.forEach(function (def) {
            var item = el('button', 'menu-item');
            item.appendChild(icon(def[1]));
            var txt = el('div', 'mi-text');
            txt.appendChild(el('div', 'mi-name', def[2]));
            txt.appendChild(el('div', 'mi-desc', def[3]));
            item.appendChild(txt);
            item.addEventListener('click', function () {
                close();
                addLayerOfKind(def[0]);
            });
            menu.appendChild(item);
        });
        close = App.modal(menu, { title: t('add_layer_title', 'Add layer'), icon: 'fa-plus' });
    }

    function addLayerOfKind(kind) {
        if (kind === 'image') {
            openImageImport();
        } else if (kind === 'paint') {
            var r = Editor.addLayer('raster', {}, t('layer_paint', 'Paint'));
            if (r) { Editor.setTool('brush'); }
        } else if (kind === 'text') {
            Editor.addLayer('text', {
                text: t('text_default', 'Your text'), font: Editor.textDefaults.font || 'Inter',
                size: Editor.textDefaults.size, weight: Editor.textDefaults.weight,
                color: Editor.textDefaults.color, stroke: null, align: 'center'
            });
        } else if (kind === 'shape') {
            Editor.addLayer('shape', {
                shape: Editor.shapeKind, w: 320, h: 320,
                fill: { type: 'solid', color: Editor.brush.color }, stroke: null
            });
        } else if (kind === 'fill') {
            var f = Editor.addLayer('fill', { fill: { type: 'solid', color: Editor.brush.color } });
            if (f) { Editor.moveLayer(f.id, baseCount()); }
        } else if (kind === 'gradient') {
            var g = Editor.addLayer('fill', { fill: {
                type: 'linear', angle: 45,
                stops: [{ pos: 0, color: Editor.brush.color }, { pos: 1, color: '#0A0A0B' }]
            } }, t('layer_gradient', 'Gradient'));
            if (g) { Editor.moveLayer(g.id, baseCount()); }
        } else if (kind === 'pattern') {
            Editor.addLayer('pattern', {
                kind: 'stripes', colors: ['#131314', Editor.brush.color, '#F4F4F5'],
                scale: 1, angle: 45, seed: Math.floor(Math.random() * 1e9)
            });
        } else if (kind === 'noise') {
            Editor.addLayer('pattern', {
                kind: 'camo', colors: ['#3d4a2a', '#6b7a4a', '#2a2f1c', '#8a9a63'],
                scale: 1.4, angle: 0, seed: Math.floor(Math.random() * 1e9)
            });
        }
    }

    /* ────────────────────────────────────────────────────────
       Inspector
       ──────────────────────────────────────────────────────── */

    function fillControls(box, layer, fillObj, apply) {
        var typeSel = makeSelect([
            { value: 'solid', label: t('fill_solid', 'Solid') },
            { value: 'linear', label: t('fill_linear', 'Linear gradient') },
            { value: 'radial', label: t('fill_radial', 'Radial gradient') }
        ], fillObj.type || 'solid');
        typeSel.addEventListener('change', function () {
            fillObj.type = typeSel.value;
            if (typeSel.value !== 'solid' && !fillObj.stops) {
                fillObj.stops = [
                    { pos: 0, color: fillObj.color || '#1F5EFF' },
                    { pos: 1, color: '#0A0A0B' }
                ];
            }
            apply();
            renderInspector();   /* re-render to show/hide stop rows */
        });
        box.appendChild(labeled(t('ins_fill_type', 'Fill type'), typeSel));

        if ((fillObj.type || 'solid') === 'solid') {
            var color = makeInput('color', fillObj.color || '#1F5EFF');
            color.classList.add('color');
            color.addEventListener('input', function () {
                fillObj.color = color.value;
                apply();
            });
            box.appendChild(labeled(t('opt_color', 'Color'), color));
        } else {
            var stops = fillObj.stops || [];
            stops.forEach(function (stop, idx) {
                var row = el('div', 'stop-row');
                var c = makeInput('color', stop.color || '#FFFFFF');
                c.classList.add('color');
                c.addEventListener('input', function () { stop.color = c.value; apply(); });
                var pos = makeRange(0, 100, 1, Math.round((stop.pos || 0) * 100));
                pos.addEventListener('input', function () { stop.pos = parseInt(pos.value, 10) / 100; apply(); });
                row.appendChild(c);
                row.appendChild(pos);
                box.appendChild(labeled(t('ins_stop', 'Stop %d', idx + 1), row));
            });
            if (fillObj.type === 'linear') {
                var angle = makeRange(0, 360, 1, fillObj.angle || 0);
                angle.addEventListener('input', function () { fillObj.angle = parseInt(angle.value, 10); apply(); });
                box.appendChild(labeled(t('ins_angle', 'Angle'), angle));
            }
        }
    }

    /* Web-parity switch: the web studio's properties panel has no
       position boxes, drop shadow, text curve/outline, pattern reseed
       or image placement/px controls. The code paths stay compiled and
       harmless — flip to true to bring them back. */
    var SHOW_EXTENDED_PROPS = false;

    function renderInspector() {
        var box = document.getElementById('inspector');
        if (!box) { return; }
        box.innerHTML = '';

        var layer = Editor.getLayer(Editor.selectedId);

        /* layer-ops keycap strip follows the selection (base stays pinned) */
        var ops = document.getElementById('layer-ops');
        if (ops) { ops.hidden = !layer || !!(layer && layer.data && layer.data.isBase); }

        if (!layer) {
            var empty = el('div', 'empty-state small');
            empty.appendChild(icon('fa-crosshairs'));
            empty.appendChild(el('span', null, t('inspector_empty', 'Select a layer to edit its properties')));
            box.appendChild(empty);
            return;
        }

        function patchData(partial) {
            Editor.updateLayer(layer.id, { data: partial });
        }

        /* ── identity strip: type-coloured square + name + type readout ── */
        var ident = el('div', 'insp-identity');
        ident.dataset.type = layer.type || '';
        ident.appendChild(el('span', 'insp-type-dot'));
        var identName = el('span', 'insp-id-name', layer.name || '');
        identName.title = layer.name || '';
        ident.appendChild(identName);
        ident.appendChild(el('span', 'insp-id-type mono', layer.type || ''));
        box.appendChild(ident);

        var opacity = makeRange(0, 100, 1, Math.round((layer.opacity === undefined ? 1 : layer.opacity) * 100));
        opacity.addEventListener('input', function () {
            Editor.updateLayer(layer.id, { opacity: parseInt(opacity.value, 10) / 100 }, { noCommit: true });
        });
        opacity.addEventListener('change', function () {
            Editor.updateLayer(layer.id, { opacity: parseInt(opacity.value, 10) / 100 });
        });
        box.appendChild(labeled(t('ins_opacity', 'Opacity'), opacity));

        var blend = makeSelect(BLEND_MODES.map(function (m) {
            return { value: m, label: m === 'source-over' ? t('blend_normal', 'normal') : m };
        }), layer.blend || 'source-over');
        blend.addEventListener('change', function () {
            Editor.updateLayer(layer.id, { blend: blend.value });
        });
        box.appendChild(labeled(t('ins_blend', 'Blend'), blend));

        /* rotation — movable layers only (web parity) */
        if (['image', 'text', 'shape'].indexOf(layer.type) !== -1) {
            var rot = makeRange(-180, 180, 1, Math.round(((layer.rotation || 0) * 180) / Math.PI));
            rot.addEventListener('input', function () {
                Editor.updateLayer(layer.id, { rotation: (parseInt(rot.value, 10) * Math.PI) / 180 }, { noCommit: true });
            });
            rot.addEventListener('change', function () {
                Editor.updateLayer(layer.id, { rotation: (parseInt(rot.value, 10) * Math.PI) / 180 });
            });
            box.appendChild(labeled(t('ins_rotation', 'Rotation'), rot));
        }

        /* ── position + size (drag-to-scrub) — hidden, web has none ── */
        if (SHOW_EXTENDED_PROPS && !(layer.data && layer.data.isBase)) {
            var posCard = el('div', 'insp-card');
            posCard.appendChild(el('span', 'micro-label section', t('ins_transform', 'Position')));
            var grid = el('div', 'insp-grid2');
            var xIn = makeScrub(makeInput('number', Math.round(layer.x || 0)), 1);
            var yIn = makeScrub(makeInput('number', Math.round(layer.y || 0)), 1);
            xIn.addEventListener('change', function () { Editor.updateLayer(layer.id, { x: parseInt(xIn.value, 10) || 0 }); });
            yIn.addEventListener('change', function () { Editor.updateLayer(layer.id, { y: parseInt(yIn.value, 10) || 0 }); });
            grid.appendChild(labeled('X', xIn));
            grid.appendChild(labeled('Y', yIn));
            posCard.appendChild(grid);
            var center = el('button', 'btn btn-ghost btn-block');
            center.appendChild(icon('fa-crop-simple'));
            center.appendChild(el('span', null, t('ins_center', 'Center on canvas')));
            center.addEventListener('click', function () {
                var s = (window.Editor && Editor.getWidth) ? Editor.getWidth() : 1024;
                var sh = (window.Editor && Editor.getHeight) ? Editor.getHeight() : 1024;
                var lw = (layer.data && layer.data.w) || s, lh = (layer.data && layer.data.h) || sh;
                Editor.updateLayer(layer.id, {
                    x: Math.round((s - lw * Math.abs(layer.scaleX || 1)) / 2),
                    y: Math.round((sh - lh * Math.abs(layer.scaleY || 1)) / 2)
                });
            });
            posCard.appendChild(center);
            box.appendChild(posCard);
        }

        /* ── drop shadow / glow — hidden, web has none ── */
        if (SHOW_EXTENDED_PROPS) {
        var sh = layer.data && layer.data.shadow;
        var shCard = el('div', 'insp-card');
        var shHead = el('label', 'check-row');
        var shOn = document.createElement('input'); shOn.type = 'checkbox'; shOn.checked = !!sh;
        shHead.appendChild(shOn);
        shHead.appendChild(el('span', null, t('ins_shadow', 'Drop shadow / glow')));
        shCard.appendChild(shHead);
        shOn.addEventListener('change', function () {
            Editor.updateLayer(layer.id, { data: { shadow: shOn.checked
                ? { color: '#000000', blur: 12, dx: 0, dy: 6 } : null } });
            renderInspector();
        });
        if (sh) {
            var shColor = makeInput('color', sh.color || '#000000'); shColor.classList.add('color');
            shColor.addEventListener('input', function () { patchData({ shadow: Object.assign({}, sh, { color: shColor.value }) }); });
            shCard.appendChild(labeled(t('ins_shadow_color', 'Color'), shColor));
            var shBlur = makeRange(0, 60, 1, sh.blur || 0);
            shBlur.addEventListener('input', function () { patchData({ shadow: Object.assign({}, sh, { blur: parseInt(shBlur.value, 10) }) }); });
            shCard.appendChild(labeled(t('ins_shadow_blur', 'Blur'), shBlur));
            var shGrid = el('div', 'insp-grid2');
            var shx = makeScrub(makeInput('number', sh.dx || 0), 1);
            var shy = makeScrub(makeInput('number', sh.dy || 0), 1);
            shx.addEventListener('change', function () { patchData({ shadow: Object.assign({}, sh, { dx: parseInt(shx.value, 10) || 0 }) }); });
            shy.addEventListener('change', function () { patchData({ shadow: Object.assign({}, sh, { dy: parseInt(shy.value, 10) || 0 }) }); });
            shGrid.appendChild(labeled('X', shx));
            shGrid.appendChild(labeled('Y', shy));
            shCard.appendChild(shGrid);
        }
        box.appendChild(shCard);
        }

        /* ── per-type controls ── */
        var d = layer.data || {};

        if (layer.type === 'text') {
            box.appendChild(el('span', 'micro-label section', t('ins_text', 'Text')));
            var ta = el('textarea', 'input textarea');
            ta.rows = 3;
            ta.value = d.text || '';
            ta.addEventListener('change', function () { patchData({ text: ta.value }); });
            box.appendChild(ta);

            var fontSel = makeSelect(TEXT_FONTS.map(function (f) { return { value: f, label: f }; }), d.font || 'Inter');
            fontSel.addEventListener('change', function () { patchData({ font: fontSel.value }); });
            box.appendChild(labeled(t('opt_font', 'Font'), fontSel));

            /* curved text — hidden, web has none */
            if (SHOW_EXTENDED_PROPS) {
                var curve = makeRange(-100, 100, 1, Math.round((d.curve || 0) * 100));
                curve.addEventListener('input', function () { patchData({ curve: parseInt(curve.value, 10) / 100 }); });
                box.appendChild(labeled(t('ins_curve', 'Curve'), curve));
            }

            /* text size — slider, like the web's */
            var size = makeRange(8, 400, 1, d.size || 96);
            size.addEventListener('change', function () { patchData({ size: parseInt(size.value, 10) || 96 }); });
            box.appendChild(labeled(t('opt_size', 'Size'), size));

            var weight = makeSelect([400, 500, 600, 700, 800, 900].map(function (w) {
                return { value: String(w), label: String(w) };
            }), String(d.weight || 700));
            weight.addEventListener('change', function () { patchData({ weight: parseInt(weight.value, 10) }); });
            box.appendChild(labeled(t('ins_weight', 'Weight'), weight));

            var color = makeInput('color', d.color || '#FFFFFF');
            color.classList.add('color');
            color.addEventListener('input', function () { patchData({ color: color.value }); });
            box.appendChild(labeled(t('opt_color', 'Color'), color));

            /* outline — hidden, web has none */
            if (SHOW_EXTENDED_PROPS) {
                var strokeW = makeInput('number', (d.stroke && d.stroke.width) || 0);
                strokeW.min = 0; strokeW.max = 60;
                var strokeC = makeInput('color', (d.stroke && d.stroke.color) || '#000000');
                strokeC.classList.add('color');
                var applyStroke = function () {
                    var w = parseInt(strokeW.value, 10) || 0;
                    patchData({ stroke: w > 0 ? { width: w, color: strokeC.value } : null });
                };
                strokeW.addEventListener('change', applyStroke);
                strokeC.addEventListener('input', applyStroke);
                box.appendChild(labeled(t('ins_stroke_w', 'Outline width'), strokeW));
                box.appendChild(labeled(t('ins_stroke_c', 'Outline color'), strokeC));
            }
        } else if (layer.type === 'shape') {
            box.appendChild(el('span', 'micro-label section', t('ins_shape', 'Shape')));
            var kind = makeSelect([
                { value: 'rect', label: t('shape_rect', 'Rectangle') },
                { value: 'ellipse', label: t('shape_ellipse', 'Ellipse') },
                { value: 'line', label: t('shape_line', 'Line') }
            ], d.shape || 'rect');
            kind.addEventListener('change', function () { patchData({ shape: kind.value }); });
            box.appendChild(labeled(t('ins_kind', 'Kind'), kind));
            fillControls(box, layer, d.fill || (d.fill = { type: 'solid', color: '#1F5EFF' }), function () {
                patchData({ fill: d.fill });
            });
        } else if (layer.type === 'fill') {
            box.appendChild(el('span', 'micro-label section', t('ins_fill', 'Fill')));
            fillControls(box, layer, d.fill || (d.fill = { type: 'solid', color: '#1F5EFF' }), function () {
                patchData({ fill: d.fill });
            });
        } else if (layer.type === 'pattern') {
            box.appendChild(el('span', 'micro-label section', t('ins_pattern', 'Pattern')));
            var pk = makeSelect([
                { value: 'stripes', label: t('pat_stripes', 'Stripes') },
                { value: 'checker', label: t('pat_checker', 'Checker') },
                { value: 'dots', label: t('pat_dots', 'Dots') },
                { value: 'camo', label: t('pat_camo', 'Camo') }
            ], d.kind || 'stripes');
            pk.addEventListener('change', function () { patchData({ kind: pk.value }); });
            box.appendChild(labeled(t('ins_kind', 'Kind'), pk));

            (d.colors || []).forEach(function (colorHex, idx) {
                var c = makeInput('color', colorHex);
                c.classList.add('color');
                c.addEventListener('input', function () {
                    d.colors[idx] = c.value;
                    patchData({ colors: d.colors });
                });
                box.appendChild(labeled(t('ins_color_n', 'Color %d', idx + 1), c));
            });

            var scale = makeRange(20, 400, 5, Math.round((d.scale || 1) * 100));
            scale.addEventListener('change', function () { patchData({ scale: parseInt(scale.value, 10) / 100 }); });
            box.appendChild(labeled(t('ins_scale', 'Scale'), scale));

            var pAngle = makeRange(0, 360, 5, d.angle || 0);
            pAngle.addEventListener('change', function () { patchData({ angle: parseInt(pAngle.value, 10) }); });
            box.appendChild(labeled(t('ins_angle', 'Angle'), pAngle));

            /* reseed — hidden, web has none */
            if (SHOW_EXTENDED_PROPS) {
                var reseed = el('button', 'btn btn-ghost btn-block');
                reseed.appendChild(icon('fa-dice'));
                reseed.appendChild(el('span', null, t('ins_reseed', 'Reseed')));
                reseed.addEventListener('click', function () {
                    patchData({ seed: Math.floor(Math.random() * 1e9) });
                });
                box.appendChild(reseed);
            }
        } else if (layer.type === 'image') {
            box.appendChild(el('span', 'micro-label section', t('ins_image', 'Image')));
            /* placement + exact px sizing — hidden, web has none (the
               canvas handles move/resize directly) */
            if (SHOW_EXTENDED_PROPS) {
            var fitRow = el('div', 'seg-group');
            [
                ['fit', t('img_fit', 'Fit')],
                ['cover', t('img_cover', 'Cover')],
                ['center', t('img_center', 'Center')]
            ].forEach(function (def) {
                var b = el('button', 'seg-btn', def[1]);
                b.addEventListener('click', function () {
                    var cw = Editor.getWidth ? Editor.getWidth() : Editor.size;
                    var ch = Editor.getHeight ? Editor.getHeight() : Editor.size;
                    var w = d.w || cw, h = d.h || ch;
                    var scale = def[0] === 'fit' ? Math.min(cw / w, ch / h)
                        : def[0] === 'cover' ? Math.max(cw / w, ch / h) : 1;
                    Editor.updateLayer(layer.id, {
                        scaleX: scale, scaleY: scale, rotation: 0,
                        x: (cw - w * scale) / 2, y: (ch - h * scale) / 2
                    });
                });
                fitRow.appendChild(b);
            });
            box.appendChild(labeled(t('ins_fit', 'Placement'), fitRow));

            /* Exact size in px — scaling re-draws from the ORIGINAL source
               image every frame, so enlarging/shrinking never loses
               resolution (it's a transform, not a resample). */
            var curW = Math.max(1, Math.round((d.w || 1) * Math.abs(layer.scaleX || 1)));
            var curH = Math.max(1, Math.round((d.h || 1) * Math.abs(layer.scaleY || 1)));
            var wIn = makeInput('number', curW);
            var hIn = makeInput('number', curH);
            wIn.min = 1; hIn.min = 1;
            wIn.addEventListener('change', function () {
                var px = parseInt(wIn.value, 10);
                if (px > 0 && d.w) {
                    var sign = (layer.scaleX || 1) < 0 ? -1 : 1;
                    Editor.updateLayer(layer.id, { scaleX: sign * (px / d.w) });
                }
            });
            hIn.addEventListener('change', function () {
                var px = parseInt(hIn.value, 10);
                if (px > 0 && d.h) {
                    var sign = (layer.scaleY || 1) < 0 ? -1 : 1;
                    Editor.updateLayer(layer.id, { scaleY: sign * (px / d.h) });
                }
            });
            box.appendChild(labeled(t('ins_width', 'Width (px)'), wIn));
            box.appendChild(labeled(t('ins_height', 'Height (px)'), hIn));
            }

            var flipRow = el('div', 'seg-group');
            [['H', 'scaleX'], ['V', 'scaleY']].forEach(function (def) {
                var b = el('button', 'seg-btn', def[0]);
                b.addEventListener('click', function () {
                    var patch = {};
                    patch[def[1]] = -(layer[def[1]] || 1);
                    Editor.updateLayer(layer.id, patch);
                });
                flipRow.appendChild(b);
            });
            box.appendChild(labeled(t('ins_flip', 'Flip'), flipRow));
        } else if (layer.type === 'raster') {
            box.appendChild(el('span', 'micro-label section', t('ins_paint', 'Paint')));
            box.appendChild(el('p', 'pane-hint', t('ins_paint_hint', 'Use the brush and eraser tools to paint on this layer.')));
        }
    }

    /* ────────────────────────────────────────────────────────
       Projects pane
       ──────────────────────────────────────────────────────── */

    function requestProjects() {
        App.nui('projectList');
        requestGallery();
    }

    function timeAgo(value) {
        var then = new Date(value).getTime();
        if (isNaN(then)) { return ''; }
        var s = Math.max(Math.floor((Date.now() - then) / 1000), 0);
        if (s < 60) { return t('ago_now', 'just now'); }
        if (s < 3600) { return t('ago_m', '%dm ago', Math.floor(s / 60)); }
        if (s < 86400) { return t('ago_h', '%dh ago', Math.floor(s / 3600)); }
        return t('ago_d', '%dd ago', Math.floor(s / 86400));
    }

    function loadProject(id) {
        var go = function () { App.nui('projectLoad', { id: id }); };
        if (App.state.project.dirty) {
            App.confirm(t('load_title', 'Load project?'),
                t('load_body', 'Unsaved changes on the current canvas will be lost.'),
                { danger: true, confirmText: t('btn_load', 'Load') }
            ).then(function (ok) { if (ok) { go(); } });
        } else {
            go();
        }
    }

    function projectCard(meta, isMine) {
        var card = el('div', 'project-card');

        /* shared delete flow — used by the visible card trash */
        function confirmDelete() {
            App.confirm(t('delete_title', 'Delete project?'),
                t('delete_body', '"%s" will be permanently deleted.', meta.name),
                { danger: true, confirmText: t('btn_delete', 'Delete') }
            ).then(function (ok) {
                if (!ok) { return; }
                App.nui('projectDelete', { id: meta.id }).then(function () {
                    if (App.state.project.id === meta.id) {
                        App.setProject({ id: null });
                    }
                    requestProjects();
                });
            });
        }

        var thumbBox = el('div', 'project-thumb');
        if (meta.thumb) {
            var img = document.createElement('img');
            img.src = meta.thumb;
            thumbBox.appendChild(img);
        } else {
            thumbBox.appendChild(icon('fa-car'));
        }
        card.appendChild(thumbBox);

        var body = el('div', 'project-body');
        body.appendChild(el('div', 'project-name', meta.name));
        var sub = el('div', 'project-sub');
        var slotTag = meta.context && meta.context.txn ? meta.context.txn
            : (meta.ped_model || '');
        sub.appendChild(el('span', 'mono', slotTag));
        sub.appendChild(el('span', null, timeAgo(meta.updated_at)));
        if (!isMine && meta.owner_name) {
            sub.appendChild(el('span', null, t('by_owner', 'by %s', meta.owner_name)));
        }
        body.appendChild(sub);

        /* web draft-card footer: Continue primary + trash */
        var foot = el('div', 'project-foot');
        var cont = el('button', 'btn btn-primary project-continue');
        cont.appendChild(icon('fa-play'));
        cont.appendChild(el('span', null, t('btn_continue', 'Continue')));
        cont.addEventListener('click', function (e) {
            e.stopPropagation();
            loadProject(meta.id);
        });
        foot.appendChild(cont);
        if (isMine) {
            var footDel = el('button', 'btn-icon sm danger project-del');
            footDel.appendChild(icon('fa-trash'));
            footDel.setAttribute('data-tip', t('tip_delete', 'Delete'));
            footDel.addEventListener('click', function (e) {
                e.stopPropagation();
                confirmDelete();
            });
            foot.appendChild(footDel);
        }
        body.appendChild(foot);
        card.appendChild(body);

        var actions = el('div', 'project-actions');

        if (isMine) {
            var share = el('button', 'btn-icon sm');
            share.appendChild(icon('fa-share-nodes'));
            share.setAttribute('data-tip', t('tip_share', 'Share'));
            share.addEventListener('click', function (e) {
                e.stopPropagation();
                openShareModal(meta);
            });
            actions.appendChild(share);

            var ren = el('button', 'btn-icon sm');
            ren.appendChild(icon('fa-pen'));
            ren.setAttribute('data-tip', t('tip_rename', 'Rename'));
            ren.addEventListener('click', function (e) {
                e.stopPropagation();
                App.prompt(t('rename_title', 'Rename project'), t('rename_label', 'Project name'),
                    meta.name, { maxLength: 80 }).then(function (name) {
                    if (name === null) { return; }
                    name = String(name).trim();
                    if (!name) { return; }
                    App.nui('projectRename', { id: meta.id, name: name }).then(function (r) {
                        if (r && r.ok) {
                            if (App.state.project.id === meta.id) { App.setProject({ name: name }); }
                            requestProjects();
                        }
                    });
                });
            });
            actions.appendChild(ren);

            var pub = el('button', 'btn-icon sm' + (meta.public ? ' on' : ''));
            pub.appendChild(icon(meta.public ? 'fa-globe' : 'fa-earth-americas'));
            pub.setAttribute('data-tip', meta.public
                ? t('tip_unpublish', 'Remove from gallery') : t('tip_publish', 'Publish to gallery'));
            pub.addEventListener('click', function (e) {
                e.stopPropagation();
                App.nui('projectPublish', { id: meta.id, pub: !meta.public }).then(function (r) {
                    if (r && r.ok) {
                        meta.public = !meta.public;
                        App.toast(meta.public ? t('published', 'Published to the community gallery.')
                            : t('unpublished', 'Removed from the gallery.'), 'success');
                        requestProjects();
                        requestGallery();
                    }
                });
            });
            actions.appendChild(pub);

            var del = el('button', 'btn-icon sm danger');
            del.appendChild(icon('fa-trash'));
            del.setAttribute('data-tip', t('tip_delete', 'Delete'));
            del.addEventListener('click', function (e) {
                e.stopPropagation();
                App.confirm(t('delete_title', 'Delete project?'),
                    t('delete_body', '"%s" will be permanently deleted.', meta.name),
                    { danger: true, confirmText: t('btn_delete', 'Delete') }
                ).then(function (ok) {
                    if (!ok) { return; }
                    App.nui('projectDelete', { id: meta.id }).then(function () {
                        if (App.state.project.id === meta.id) {
                            App.setProject({ id: null });
                        }
                        requestProjects();
                    });
                });
            });
            actions.appendChild(del);
        }

        card.appendChild(actions);
        card.addEventListener('click', function () { loadProject(meta.id); });
        return card;
    }

    function renderProjects(payload) {
        var mineBox = document.getElementById('projects-mine');
        var sharedBox = document.getElementById('projects-shared');
        if (!mineBox || !sharedBox) { return; }

        function fill(box, list, isMine, emptyKey, emptyText, emptyIcon) {
            box.innerHTML = '';
            if (!list || !list.length) {
                var empty = el('div', 'empty-state small');
                empty.appendChild(icon(emptyIcon));
                empty.appendChild(el('span', null, t(emptyKey, emptyText)));
                box.appendChild(empty);
                return;
            }
            list.forEach(function (meta) { box.appendChild(projectCard(meta, isMine)); });
        }

        fill(mineBox, payload.mine, true, 'projects_empty', 'No projects saved yet', 'fa-regular fa-folder-open');
        fill(sharedBox, payload.shared, false, 'projects_shared_empty', 'Nothing shared with you yet', 'fa-share-nodes');
    }

    /* ── community gallery ── */
    function requestGallery() { App.nui('projectGallery'); }

    function renderGallery(payload) {
        var box = document.getElementById('projects-gallery');
        if (!box) { return; }
        box.innerHTML = '';
        var list = (payload && payload.items) || [];
        if (!list.length) {
            var empty = el('div', 'empty-state small');
            empty.appendChild(icon('fa-users'));
            empty.appendChild(el('span', null, t('gallery_empty', 'No public designs yet — publish one from "My Projects"')));
            box.appendChild(empty);
            return;
        }
        list.forEach(function (meta) { box.appendChild(projectCard(meta, false)); });
    }

    function openShareModal(meta) {
        var content = el('div', 'share-modal');

        var codeBox = el('div', 'code-display mono', lastShareCodes[meta.id] || '········');
        content.appendChild(el('span', 'micro-label', t('share_code_label', 'Share code')));
        content.appendChild(codeBox);

        var genBtn = el('button', 'btn btn-ghost btn-block');
        genBtn.appendChild(icon('fa-key'));
        genBtn.appendChild(el('span', null, t('share_gen', 'Get code')));
        genBtn.addEventListener('click', function () {
            App.nui('projectShareCode', { id: meta.id }).then(function (r) {
                if (r && r.ok && r.code) {
                    lastShareCodes[meta.id] = r.code;
                    codeBox.textContent = r.code;
                } else {
                    App.toast(t('share_code_fail', 'Could not create a share code.'), 'error');
                }
            });
        });
        content.appendChild(genBtn);

        var copyBtn = el('button', 'btn btn-ghost btn-block');
        copyBtn.appendChild(icon('fa-copy'));
        copyBtn.appendChild(el('span', null, t('btn_copy', 'Copy')));
        copyBtn.addEventListener('click', function () {
            var code = lastShareCodes[meta.id];
            if (!code) { return; }
            copyText(code);
            App.toast(t('copied', 'Copied to clipboard.'), 'success');
        });
        content.appendChild(copyBtn);

        content.appendChild(el('span', 'micro-label section', t('share_player_label', 'Share with an online player')));
        var idInput = makeInput('number', '');
        idInput.placeholder = t('share_player_ph', 'Server ID');
        content.appendChild(idInput);

        var sendBtn = el('button', 'btn btn-primary btn-block');
        sendBtn.appendChild(icon('fa-paper-plane'));
        sendBtn.appendChild(el('span', null, t('share_send', 'Send')));
        sendBtn.addEventListener('click', function () {
            var target = parseInt(idInput.value, 10);
            if (!target || target <= 0) { return; }
            App.nui('projectSharePlayer', { id: meta.id, target: target }).then(function (r) {
                if (r && r.ok) {
                    App.toast(t('share_sent', 'Project shared.'), 'success');
                } else {
                    App.toast((r && r.message) || t('share_no_player', 'Player not found.'), 'error');
                }
            });
        });
        content.appendChild(sendBtn);

        App.modal(content, { title: t('share_title', 'Share "%s"', meta.name), icon: 'fa-share-nodes' });
    }

    function copyText(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
                return;
            }
        } catch (e) { /* fall back below */ }
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* nothing else we can do */ }
        document.body.removeChild(ta);
    }

    /* ── save flow ── */

    /* The export target now comes from the selected 3D template
       (its in-game txd/txn), not from what the ped is wearing. */
    function slotContext() {
        var tpl = App.state.activeTemplate;
        if (tpl) {
            return {
                model: tpl.gender === 'female' ? 'mp_f_freemode_01' : 'mp_m_freemode_01',
                kind: 'component',
                id: (tpl.component !== undefined && tpl.component !== null) ? tpl.component : 11,
                drawable: null,
                texture: null,
                txd: tpl.txd || '',
                txn: tpl.txn || '',
                template: tpl.id
            };
        }
        return { model: '', kind: null, id: null, drawable: null, texture: null, txd: null, txn: null, template: null };
    }

    function saveProject() {
        var doSave = function (name) {
            App.nui('projectSave', {
                id: App.state.project.id,
                name: name,
                state: JSON.stringify(Editor.serialize()),
                thumb: Editor.thumbnail(256),
                wardrobe: slotContext()
            });
            App.toast(t('saving', 'Saving…'), 'info');
        };

        var current = App.state.project.name;
        if (!App.state.project.id && (!current || current === 'Untitled' || current === t('project_untitled', 'Untitled'))) {
            App.prompt(t('save_title', 'Save project'), t('rename_label', 'Project name'), '',
                { maxLength: 80, placeholder: t('save_ph', 'My first design') }).then(function (name) {
                if (name === null) { return; }
                name = String(name).trim();
                if (!name) { return; }
                App.setProject({ name: name });
                doSave(name);
            });
        } else {
            doSave(current);
        }
    }

    function bindProjectsPane() {
        var saveBtn = document.getElementById('btn-save-project');
        if (saveBtn) { saveBtn.addEventListener('click', saveProject); }

        var importBtn = document.getElementById('btn-import-code');
        var codeInput = document.getElementById('input-share-code');
        if (importBtn && codeInput) {
            importBtn.addEventListener('click', function () {
                var code = String(codeInput.value || '').trim().toUpperCase();
                if (!code) { return; }
                App.nui('projectImportCode', { code: code }).then(function (r) {
                    if (r && r.ok) {
                        codeInput.value = '';
                        App.toast(t('import_ok', 'Project added to "Shared With Me".'), 'success');
                    } else {
                        App.toast((r && r.message) || t('import_not_found', 'Code not found.'), 'error');
                    }
                });
            });
        }

        var galRefresh = document.getElementById('btn-gallery-refresh');
        if (galRefresh) { galRefresh.addEventListener('click', requestGallery); }
    }

    /* ────────────────────────────────────────────────────────
       AI pane
       ──────────────────────────────────────────────────────── */

    var aiPending = null;

    /* Diagnostics box in the AI tab — every step of a generation is
       logged here so failures are self-explanatory (no console needed). */
    function aiLog(msg, kind) {
        var box = document.getElementById('ai-debug');
        if (!box) { return; }
        var empty = box.querySelector('.ai-debug-empty');
        if (empty) { empty.remove(); }
        var line = el('div', kind === 'err' ? 'dbg-err' : (kind === 'ok' ? 'dbg-ok' : ''));
        var now = new Date();
        var hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2)
            + ':' + ('0' + now.getSeconds()).slice(-2);
        line.appendChild(el('span', 'dbg-time', hh));
        var text = (window.App && App.resolveText) ? App.resolveText(msg) : String(msg);
        line.appendChild(el('span', null, text));
        box.appendChild(line);
        while (box.children.length > 14) { box.removeChild(box.firstChild); }
        box.scrollTop = box.scrollHeight;
    }

    function setAiBusy(busy) {
        var chip = document.getElementById('ai-busy');
        if (chip) { chip.hidden = !busy; }
        var btn = document.getElementById('btn-ai-generate');
        if (btn) {
            btn.disabled = !!busy;
            btn.classList.toggle('busy', !!busy);
            var span = btn.querySelector('span');
            if (span) {
                span.textContent = busy
                    ? t('ai_generating', 'Generating…')
                    : t('ai_generate', 'Generate');
            }
            var ic = btn.querySelector('i');
            if (ic) {
                ic.className = busy
                    ? 'fa-solid fa-spinner fa-spin'
                    : 'fa-solid fa-wand-magic-sparkles';
            }
        }
    }

    var aiPendingFit = false;   /* result should cover the whole canvas */
    var aiJob = null;           /* options of the generation in flight */
    var aiQueue = 0;            /* variations still to run in this batch */

    /* Read every AI control in one place, so the run button, the
       Surprise button and the selection shortcut all behave the same. */
    function readAiOptions() {
        function on(id) {
            var e = document.getElementById(id);
            return !!(e && e.checked);
        }
        var target = document.querySelector('input[name="ai-target"]:checked');
        target = target ? target.value : 'sheet';
        /* the selection target is meaningless without a selection */
        if (target === 'selection' && !Editor.hasSelection()) { target = 'sheet'; }
        var negEl = document.getElementById('ai-negative');
        var cntEl = document.getElementById('ai-count');
        return {
            target: target,
            negative: negEl ? String(negEl.value || '').trim() : '',
            reference: on('ai-reference-toggle'),
            fitUv: on('ai-fit-toggle'),
            seamless: on('ai-seamless-toggle'),
            transparent: on('ai-transparent-toggle'),
            count: cntEl ? (parseInt(cntEl.value, 10) || 1) : 1
        };
    }

    function setAiProgress(show, label) {
        var box = document.getElementById('ai-progress');
        if (box) { box.hidden = !show; }
        var lab = document.getElementById('ai-progress-label');
        if (lab && label) { lab.textContent = label; }
    }

    /* Knock a flat background out of a generated image. Image models
       ignore "transparent background", so we do it here: sample the
       four corners, and clear every pixel close to that colour. Only
       runs when the user asks for it (logos/graphics), never on a
       full-sheet restyle where the fabric may legitimately be white. */
    function cutoutBackground(src, tol) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                try {
                    var c = document.createElement('canvas');
                    c.width = img.naturalWidth; c.height = img.naturalHeight;
                    var g = c.getContext('2d');
                    g.drawImage(img, 0, 0);
                    var data = g.getImageData(0, 0, c.width, c.height);
                    var d = data.data, W = c.width, H = c.height;
                    var corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
                    var r = 0, gg = 0, b = 0;
                    corners.forEach(function (i) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; });
                    r /= 4; gg /= 4; b /= 4;
                    var tolSq = (tol || 42) * (tol || 42) * 3;
                    for (var i = 0; i < d.length; i += 4) {
                        var dr = d[i] - r, dg = d[i + 1] - gg, db = d[i + 2] - b;
                        var dist = dr * dr + dg * dg + db * db;
                        if (dist <= tolSq) {
                            /* feather the cut: fully clear at the centre of
                               the range, partially clear at its edge */
                            d[i + 3] = Math.round(d[i + 3] * Math.min(1, dist / tolSq));
                        }
                    }
                    g.putImageData(data, 0, 0);
                    resolve(c.toDataURL('image/png'));
                } catch (e) {
                    console.error('[ai] cutout failed:', e);
                    resolve(src);
                }
            };
            img.onerror = function () { resolve(src); };
            img.src = src;
        });
    }

    /* Compose the final provider prompt from the user's words plus the
       options. Kept in one function so the debug log can show exactly
       what was sent. */
    function buildPrompt(userPrompt, opts) {
        var p = userPrompt;
        if (opts.target === 'selection') {
            /* the reference is the CROP, so the model only ever sees the
               region — asking it to fill edge-to-edge is what makes the
               result sit flush inside the marquee */
            p = 'A flat vehicle livery texture patch that completely fills the frame, edge to edge: '
                + p + '. No border, no margin, no drop shadow, no mockup.';
        } else if (opts.target === 'image') {
            p = 'A single clean graphic on a plain flat background, centred, '
                + 'high contrast, crisp edges, no text unless asked: ' + p;
        } else if (opts.fitUv) {
            /* Strong constraints — the model tends to (a) fill the
               transparent background and (b) invent/duplicate logos.
               The alpha mask handles (a) as a safety net; this wording
               tackles both up front. */
            p = 'This is a flat GAME VEHICLE UV TEXTURE SHEET (a car skin / livery) on a transparent background. It is an unwrapped UV layout, so panels, text and logos legitimately appear rotated, vertical, sideways, mirrored or upside-down and that is correct. Read the text in every orientation and keep each word, number and logo in its EXACT original orientation, angle, position and reading direction. Do NOT rotate, straighten, re-typeset, flip or re-flow any text or logo. '
                + 'Edit ONLY the paint of the vehicle body panels, keeping the EXACT same layout, '
                + 'UV island positions, seams, silhouette and framing. '
                + 'Keep the background FULLY TRANSPARENT — never fill it with any colour. '
                + 'Do NOT add, move, remove or duplicate any logos, badges, crests, emblems, numbers or text; '
                + 'leave every existing mark exactly where and as it is. '
                + 'Restyle the livery to: ' + p
                + '. Output the same dimensions, alignment and transparent framing as the input image.';
        }
        if (opts.seamless) {
            p += ' Seamless tileable repeating pattern with no visible seams at the edges.';
        }
        if (opts.negative) {
            p += ' Do NOT include: ' + opts.negative + '.';
        }
        return p;
    }

    function runGenerate(userPrompt, opts) {
        if (aiPending) {
            App.toast(t('ai_wait', 'A generation is already running.'), 'info');
            return;
        }
        opts = opts || readAiOptions();
        userPrompt = String(userPrompt || '').trim();
        if (userPrompt.length < 3) {
            App.toast(t('ai_prompt_short', 'Describe the texture first.'), 'error');
            return;
        }
        if (!(App.state.config && App.state.config.aiEnabled)) {
            App.toast(t('ai_disabled', 'AI generation is disabled on this server.'), 'error');
            return;
        }
        if (opts.target === 'selection' && !Editor.hasSelection()) {
            App.toast(t('ai_need_sel', 'Mark a region with the Region tool first.'), 'error');
            return;
        }

        var prompt = buildPrompt(userPrompt, opts);
        /* Selection mode ALWAYS sends the cropped region as reference —
           that is what makes the generation match its surroundings.
           A free image never does: it must not inherit the garment. */
        var sendReference = (opts.target === 'selection')
            || (opts.target === 'sheet' && (opts.reference || opts.fitUv));
        aiPendingFit = !!opts.fitUv && opts.target === 'sheet';
        opts.userPrompt = userPrompt;

        /* SMART FIT: snapshot the current sheet's SHAPE (its alpha) at
           full resolution now. When the result comes back we clip it to
           this exact silhouette — so the AI can only ever paint on the
           garment's UV islands and never bleeds into the transparent
           background (the #1 cause of "the texture bugs on the model").
           Only for whole-garment fit; free images/selections don't mask. */
        if (opts.target === 'sheet' && opts.fitUv && Editor.layers.length) {
            try {
                var mc = document.createElement('canvas');
                Editor.drawToCanvas(mc);                 /* full-res, keeps alpha */
                opts.maskSrc = mc.toDataURL('image/png');
            } catch (e) { opts.maskSrc = null; }
        }
        aiJob = opts;

        var requestId = 'ai_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        aiPending = requestId;
        setAiBusy(true);
        setAiProgress(true, t('ai_generating', 'Generating…'));
        aiLog(t('ai_dbg_sending', 'Sending request… (prompt %d chars, reference: %s)',
            prompt.length, sendReference ? 'yes' : 'no'));
        aiLog(t('ai_dbg_target', 'Target: %s', opts.target));

        /* The reference image is multi-MB — a single NUI POST that big
           FAILS silently in FiveM (instant "rejected"). Downscale it to
           1024px (plenty for the AI) and upload in 200KB pieces, then
           fire the actual generate call. */
        var ref = null;
        if (sendReference) {
            if (opts.target === 'selection') {
                /* just the marked region, on an opaque backdrop — alpha
                   confuses every image model we support. Already cropped
                   to the bbox, so it is small enough as-is. */
                ref = Editor.selectionDataURL('#808080', 1024);
            } else {
                var full = document.createElement('canvas');
                Editor.drawToCanvas(full);
                var rs = Math.min(1, 1024 / Math.max(full.width, full.height));
                var rc = document.createElement('canvas');
                rc.width = Math.max(1, Math.round(full.width * rs));
                rc.height = Math.max(1, Math.round(full.height * rs));
                rc.getContext('2d').drawImage(full, 0, 0, rc.width, rc.height);
                ref = rc.toDataURL('image/png');
            }
        }

        function fireGenerate() {
            App.nui('aiGenerate', {
                requestId: requestId,
                prompt: prompt,
                hasReference: !!ref,
                engine: currentEngine()
            }).then(function (r) {
                if (!r || !r.accepted) {
                    aiPending = null;
                    aiJob = null;
                    aiQueue = 0;
                    setAiBusy(false);
                    setAiProgress(false);
                    var msg = (r && r.message) || t('ai_rejected', 'Generation rejected.');
                    aiLog(t('ai_dbg_rejected', 'Rejected: %s',
                        (window.App && App.resolveText) ? App.resolveText(msg) : msg), 'err');
                    App.toast(msg, 'error');
                } else {
                    aiLog(t('ai_dbg_accepted', 'Accepted — the server is contacting the provider…'), 'ok');
                    /* never leave the button stuck busy */
                    setTimeout(function () {
                        if (aiPending === requestId) {
                            aiPending = null;
                            aiJob = null;
                            aiQueue = 0;
                            setAiBusy(false);
                            setAiProgress(false);
                            aiLog(t('ai_dbg_timeout', 'No result after 150s — check the server console for [gemini] lines.'), 'err');
                        }
                    }, 150000);
                }
            });
        }

        if (!ref) { fireGenerate(); return; }

        var CH = 200000;
        var total = Math.ceil(ref.length / CH);
        aiLog(t('ai_dbg_upref', 'Uploading reference image (%d parts)…', total));
        var seq = 0;
        (function next() {
            if (seq >= total) { fireGenerate(); return; }
            var piece = ref.substr(seq * CH, CH);
            seq++;
            App.nui('aiRefChunk', {
                requestId: requestId, seq: seq, total: total, data: piece
            }).then(next);
        })();
    }

    function renderAiHistory() {
        var box = document.getElementById('ai-history');
        if (!box) { return; }
        box.innerHTML = '';
        if (!aiHistory.length) {
            var empty = el('div', 'empty-state small');
            empty.appendChild(icon('fa-regular fa-image'));
            empty.appendChild(el('span', null, t('ai_history_empty', 'No generations yet')));
            box.appendChild(empty);
            return;
        }
        aiHistory.forEach(function (item, idx) {
            var cell = el('div', 'ai-thumb');
            var img = document.createElement('img');
            img.src = item.image;
            cell.appendChild(img);
            cell.setAttribute('data-tip', item.prompt
                ? item.prompt
                : t('ai_readd', 'Add to canvas'));
            cell.addEventListener('click', function () {
                addImageFillCanvas(item.image, t('ai_layer_name', 'AI Texture'));
            });

            /* delete this generation */
            var del = el('button', 'ai-thumb-del');
            del.appendChild(icon('fa-xmark'));
            del.setAttribute('data-tip', t('ai_delete', 'Delete'));
            del.addEventListener('click', function (e) {
                e.stopPropagation();
                aiHistory.splice(idx, 1);
                saveAiHistory();
                renderAiHistory();
            });
            cell.appendChild(del);

            /* new prompt ON TOP of this texture (uses it as reference) */
            var redo = el('button', 'ai-thumb-redo');
            redo.appendChild(icon('fa-wand-magic-sparkles'));
            redo.setAttribute('data-tip', t('ai_redo', 'New prompt on top of this'));
            redo.addEventListener('click', function (e) {
                e.stopPropagation();
                regenerateOnTop(item.image);
            });
            cell.appendChild(redo);

            /* save the raw generation as a PNG file on the player's PC */
            var dl = el('button', 'ai-thumb-dl');
            dl.appendChild(icon('fa-download'));
            dl.setAttribute('data-tip', t('ai_download', 'Download as PNG'));
            dl.addEventListener('click', function (e) {
                e.stopPropagation();
                downloadDataUrl(item.image, 'apex_ai_' + (idx + 1) + '.png');
            });
            cell.appendChild(dl);

            /* drop it straight into the marked region */
            if (Editor.hasSelection()) {
                var into = el('button', 'ai-thumb-sel');
                into.appendChild(icon('fa-vector-square'));
                into.setAttribute('data-tip', t('ai_into_sel', 'Place inside the selected region'));
                into.addEventListener('click', function (e) {
                    e.stopPropagation();
                    Editor.placeImageInSelection(item.image, t('sel_ai_layer', 'AI in selection'));
                });
                cell.appendChild(into);
            }

            box.appendChild(cell);
        });
    }

    /* Put a generated texture on the canvas and arm the AI to EDIT it:
       tick "use as reference", focus the prompt so the next Generate
       builds on top of this texture. */

    /* SMART FIT — clip an AI result to the garment's silhouette.
       `maskSrc` is a snapshot of the sheet BEFORE generating (its alpha
       = the UV islands). We scale the result over the canvas and keep it
       ONLY where the mask was opaque, so anything the model painted on
       the transparent background (the yellow-fill bug) is cut away and
       the layout stays exactly aligned. Resolves with a masked PNG; on
       any error it falls back to the raw result so a generation is never
       lost. */
    function applyGarmentMask(resultSrc, maskSrc) {
        return new Promise(function (resolve) {
            var mask = new Image(); mask.crossOrigin = 'anonymous';
            var res = new Image(); res.crossOrigin = 'anonymous';
            var loaded = 0, failed = false;
            function done() {
                if (failed) { resolve(resultSrc); return; }
                try {
                    var w = mask.naturalWidth || Editor.getWidth();
                    var h = mask.naturalHeight || Editor.getHeight();
                    var c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    var g = c.getContext('2d');
                    /* the generated fabric, stretched to the sheet */
                    g.drawImage(res, 0, 0, w, h);
                    /* keep it only inside the original garment shape */
                    g.globalCompositeOperation = 'destination-in';
                    g.drawImage(mask, 0, 0, w, h);
                    resolve(c.toDataURL('image/png'));
                } catch (e) {
                    console.error('[ai] garment mask failed:', e);
                    resolve(resultSrc);
                }
            }
            function tick() { if (++loaded === 2) { done(); } }
            mask.onload = tick; res.onload = tick;
            mask.onerror = function () { failed = true; tick(); };
            res.onerror = function () { failed = true; tick(); };
            mask.src = maskSrc; res.src = resultSrc;
        });
    }

    function regenerateOnTop(image) {
        addImageFillCanvas(image, t('ai_layer_name', 'AI Texture'));
        var ref = document.getElementById('ai-reference-toggle');
        if (ref) { ref.checked = true; }
        activateTab('ai');
        var promptEl = document.getElementById('ai-prompt');
        if (promptEl) {
            promptEl.focus();
            try { promptEl.scrollIntoView({ block: 'center' }); } catch (e) { /* ok */ }
        }
        App.toast(t('ai_redo_hint', 'Texture loaded — type what to change and press Generate.'), 'info');
    }

    /* One-click prompt starters. Appending (rather than replacing) lets
       the player stack a style, a motif and a palette into one prompt. */
    function renderAiChips() {
        var box = document.getElementById('ai-chips');
        if (!box) { return; }
        box.innerHTML = '';
        /* a small, stable slice of each bank — a wall of 30 chips is
           noise, and the dice button already covers "surprise me" */
        var picks = []
            .concat(QF_STYLES.slice(0, 5))
            .concat(QF_MATERIALS.slice(0, 3))
            .concat(QF_PALETTES.slice(0, 3));
        picks.forEach(function (phrase) {
            var c = el('button', 'ai-chip');
            c.type = 'button';
            c.textContent = phrase;
            c.addEventListener('click', function () {
                var p = document.getElementById('ai-prompt');
                if (!p) { return; }
                var cur = String(p.value || '').trim();
                p.value = cur ? (cur.replace(/[,\s]+$/, '') + ', ' + phrase) : phrase;
                p.focus();
            });
            box.appendChild(c);
        });
    }

    function bindAiPane() {
        var btn = document.getElementById('btn-ai-generate');
        var promptEl = document.getElementById('ai-prompt');

        function fire() {
            var opts = readAiOptions();
            /* the count select drives a chained batch: one request is
               in flight at a time, the rest queue behind it */
            aiQueue = Math.max(0, (opts.count || 1) - 1);
            if (aiQueue) {
                setAiProgress(true, t('ai_variation_left', '%d variation(s) left…', aiQueue + 1));
            }
            runGenerate(promptEl ? promptEl.value : '', opts);
        }
        if (btn && promptEl) {
            btn.addEventListener('click', fire);
            promptEl.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    fire();
                }
            });
        }

        /* dice — compose a fresh theme from the style banks and run it */
        var surprise = document.getElementById('btn-ai-surprise');
        if (surprise) {
            surprise.addEventListener('click', function () {
                var theme = generateTheme();
                if (promptEl) { promptEl.value = theme.prompt; }
                fire();
            });
        }

        var clearBtn = document.getElementById('btn-ai-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (!aiHistory.length) { return; }
                App.confirm(t('ai_clear_title', 'Clear generations?'),
                    t('ai_clear_body', 'The thumbnails are removed. Layers already on the canvas stay.'),
                    { danger: true, confirmText: t('btn_delete', 'Delete') }
                ).then(function (ok) {
                    if (!ok) { return; }
                    aiHistory.length = 0;
                    saveAiHistory();
                    renderAiHistory();
                });
            });
        }

        /* target cards: the "fit to garment" option only means something
           for a full-sheet restyle, so it greys out for the others */
        document.querySelectorAll('input[name="ai-target"]').forEach(function (r) {
            r.addEventListener('change', function () {
                var fit = document.getElementById('ai-fit-toggle');
                var ref = document.getElementById('ai-reference-toggle');
                var isSheet = r.value === 'sheet' && r.checked;
                if (fit) { fit.disabled = !isSheet; }
                if (ref) { ref.disabled = !isSheet; }
                renderAiHistory();
            });
        });

        /* the Region tool's "generate here" button lands here */
        App.on('aiForSelection', function () {
            activateTab('ai');
            var radio = document.querySelector('input[name="ai-target"][value="selection"]');
            if (radio && !radio.disabled) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            }
            var p = document.getElementById('ai-prompt');
            if (p) { p.focus(); }
            App.toast(t('ai_sel_ready', 'Describe what should fill the region, then Generate.'), 'info');
        });

        /* collapsible prompt-ideas: hide/show the chips, state persists */
        var chipsToggle = document.getElementById('ai-chips-toggle');
        var chipsBox = document.getElementById('ai-chips');
        if (chipsToggle && chipsBox) {
            var collapsed = false;
            try { collapsed = localStorage.getItem('apex_vehicles_ai_chips_hidden') === '1'; } catch (e) { /* ok */ }
            function applyChips() {
                chipsBox.hidden = collapsed;
                var ic = chipsToggle.querySelector('i');
                if (ic) { ic.className = 'fa-solid ' + (collapsed ? 'fa-chevron-down' : 'fa-chevron-up'); }
                var lab = document.getElementById('ai-chips-toggle-label');
                if (lab) {
                    lab.textContent = collapsed
                        ? t('ai_ideas_show', 'Show')
                        : t('ai_ideas_hide', 'Hide');
                }
            }
            applyChips();
            chipsToggle.addEventListener('click', function () {
                collapsed = !collapsed;
                try { localStorage.setItem('apex_vehicles_ai_chips_hidden', collapsed ? '1' : '0'); } catch (e) { /* ok */ }
                applyChips();
            });
        }

        renderAiChips();
        syncSelectionUi();

        /* Chunked image delivery — Lua splits multi-MB results into
           200KB NUI messages (one big SendNUIMessage dies silently). */
        var aiRx = {};   /* requestId → { total, parts: [] } */
        App.on('aiImageBegin', function (p) {
            if (!p || !p.requestId) { return; }
            aiRx[p.requestId] = { total: p.total || 1, parts: [] };
            aiLog(t('ai_dbg_receiving', 'Receiving image (%d parts)…', p.total || 1));
        });
        App.on('aiImageChunk', function (p) {
            var rx = p && aiRx[p.requestId];
            if (rx) { rx.parts[p.seq - 1] = p.data || ''; }
        });
        App.on('aiImageEnd', function (p) {
            var rx = p && aiRx[p.requestId];
            if (!rx) { return; }
            delete aiRx[p.requestId];
            App.emit('aiResult', { requestId: p.requestId, image: rx.parts.join('') });
        });

        App.on('aiResult', function (p) {
            if (aiPending && p.requestId !== aiPending) { return; }
            aiPending = null;
            setAiBusy(false);
            setAiProgress(false);
            aiLog(t('ai_dbg_done', 'Image received — added to the canvas.'), 'ok');

            var job = aiJob || { target: 'sheet' };
            aiJob = null;
            aiPendingFit = false;

            /* Optional background knockout runs BEFORE the image is
               stored, so the history thumb matches what landed. */
            var prep = job.transparent
                ? cutoutBackground(p.image, 46)
                : Promise.resolve(p.image);

            /* SMART FIT: clip a whole-garment result to the original UV
               silhouette so it can't fill the transparent background or
               shift the layout (fixes the "yellow background" bug). */
            if (job.target === 'sheet' && job.fitUv && job.maskSrc) {
                prep = prep.then(function (img) { return applyGarmentMask(img, job.maskSrc); });
            }

            prep.then(function (image) {
                aiHistory.unshift({ image: image, prompt: job.userPrompt || '', target: job.target });
                if (aiHistory.length > 12) { aiHistory.pop(); }
                saveAiHistory();
                renderAiHistory();

                if (job.target === 'selection' && Editor.hasSelection()) {
                    Editor.placeImageInSelection(image, t('sel_ai_layer', 'AI in selection'))
                        .then(function () {
                            App.toast(t('ai_done_sel', 'Generated inside the region.'), 'success');
                        });
                } else if (job.target === 'image') {
                    /* free graphic: a movable layer at its natural size,
                       NOT stretched over the whole sheet */
                    addImageFromSrc(image, t('ai_graphic_name', 'AI Graphic'));
                    App.toast(t('ai_done_img', 'Graphic generated — drag and scale it.'), 'success');
                } else {
                    /* AI textures are meant to dress the garment — drop
                       them covering the whole canvas, ready to use. */
                    addImageFillCanvas(image, t('ai_layer_name', 'AI Texture'));
                    App.toast(t('ai_done', 'Texture generated.'), 'success');
                }

                /* batch: chain the next variation once this one landed */
                if (aiQueue > 0) {
                    aiQueue--;
                    var promptEl = document.getElementById('ai-prompt');
                    setAiProgress(true, t('ai_variation_left', '%d variation(s) left…', aiQueue + 1));
                    setTimeout(function () {
                        runGenerate(promptEl ? promptEl.value : '', job);
                    }, 600);
                }
            });
        });

        App.on('aiError', function (p) {
            if (aiPending && p.requestId !== aiPending) { return; }
            aiPending = null;
            aiJob = null;
            aiQueue = 0;              /* abandon the rest of the batch */
            setAiBusy(false);
            setAiProgress(false);
            var msg = p.message || t('ai_failed', 'Generation failed.');
            aiLog(t('ai_dbg_failed', 'Provider failed: %s',
                (window.App && App.resolveText) ? App.resolveText(msg) : msg), 'err');
            App.toast(msg, 'error');
        });
    }

    /* ── Quick AI Fit modal — themes are GENERATED, not fixed ──
       Each shuffle composes a fresh, unique theme from large style
       banks (millions of combinations) so it never repeats a canned
       list. Reads as an AI idea generator; no fragile network call. */

    var QF_STYLES = [
        'gothic Victorian lace', 'retro 80s synthwave', 'traditional Japanese irezumi',
        'streetwear graffiti', 'luxury designer monogram', 'military multicam camo',
        'art deco geometric', 'psychedelic tie-dye', 'baroque damask', 'cyberpunk circuitry',
        'watercolour floral', 'tribal blackwork', 'vaporwave grid', 'paisley bandana',
        'houndstooth tweed', 'galaxy nebula', 'marble veining', 'liquid chrome',
        'stained-glass mosaic', 'pixel-art 8-bit', 'hand-drawn sketch ink', 'tartan plaid',
        'snakeskin scales', 'iridescent holographic', 'rustic denim patchwork',
        'minimal Scandinavian', 'ornate Persian carpet', 'coral reef underwater',
        'autumn forest camo', 'neon tiger stripes'
    ];
    var QF_MOTIFS = [
        'roses and filigree scrollwork', 'interlocked initials', 'palm silhouettes and scanlines',
        'koi fish and waves', 'spray-paint tags and drips', 'geometric sunbursts',
        'skulls and thorns', 'blooming peonies', 'circuit traces and glyphs',
        'stars and constellations', 'dragons and clouds', 'diamonds and chevrons',
        'feathers and arrows', 'hibiscus flowers', 'lightning bolts', 'moons and eyes',
        'vines and ivy', 'lotus mandalas', 'barbed wire', 'cracked gold veins'
    ];
    var QF_PALETTES = [
        'deep charcoal and gold', 'magenta and cyan neon', 'crimson and ivory',
        'emerald and black', 'pastel pink and mint', 'royal blue and silver',
        'burnt orange and teal', 'monochrome white on black', 'sunset purple and amber',
        'forest green and bronze', 'blood red and matte black', 'champagne and rose gold',
        'electric lime and violet', 'navy and burnt copper', 'ice blue and pearl'
    ];
    /* Automotive finishes — the clothing studio's fabrics (velvet,
       denim, knit wool, silk twill) made no sense on a car. */
    var QF_MATERIALS = [
        'on gloss vinyl wrap', 'on matte vinyl wrap', 'on satin metallic paint',
        'on brushed aluminium', 'on carbon fibre weave', 'on pearlescent paint',
        'on chrome mirror finish', 'on colour-shift chameleon film',
        'on textured forged carbon', 'on candy gloss lacquer'
    ];
    var QF_ADJ = ['seamless', 'high-detail', 'ultra-clean', 'richly textured', 'photoreal', 'sharp'];

    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function titleCase(s) { return s.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

    function generateTheme() {
        var style = pick(QF_STYLES), motif = pick(QF_MOTIFS),
            palette = pick(QF_PALETTES), mat = pick(QF_MATERIALS), adj = pick(QF_ADJ);
        return {
            label: titleCase(style),
            /* VEHICLE wording. This said "clothing texture, flat fabric
               print ... no mannequin" — inherited from the clothing
               studio when the front-end was ported, so Quick AI Fit was
               asking for garment prints inside a livery studio. */
            prompt: adj + ' ' + style + ' vehicle wrap texture, flat graphic print of '
                + motif + ' in ' + palette + ' ' + mat
                + ', seamless repeat, high detail, no car, no vehicle body, no background.'
        };
    }

    function openQuickFit() {
        if (!(App.state.config && App.state.config.aiEnabled)) {
            App.toast(t('ai_disabled', 'AI generation is disabled on this server.'), 'error');
            return;
        }
        var theme = generateTheme();

        var content = el('div', 'quickfit');

        /* which template we're theming (informational) */
        var tpl = App.state.activeTemplate;
        var tplRow = el('div', 'field');
        tplRow.appendChild(el('span', 'micro-label', t('qf_template', 'Template')));
        tplRow.appendChild(el('div', 'mono', tpl ? tpl.name : t('viewer_none', 'No template')));
        content.appendChild(tplRow);

        /* theme card */
        var card = el('div', 'theme-card');
        var themeName = el('div', 'theme-name');
        var themePrompt = el('div', 'theme-prompt');
        var promptLabel = el('div', 'micro-label',
            t('qf_prompt_sent', 'Prompt sent to the AI (English)'));
        function renderTheme() {
            themeName.textContent = theme.label;
            promptLabel.textContent = t('qf_prompt_sent', 'Prompt sent to the AI (English)');
            themePrompt.textContent = theme.prompt;
        }
        renderTheme();
        var shuffle = el('button', 'btn btn-ghost');
        shuffle.appendChild(icon('fa-shuffle'));
        shuffle.appendChild(el('span', null, t('qf_shuffle', 'Shuffle')));
        shuffle.addEventListener('click', function () {
            theme = generateTheme();
            renderTheme();
        });
        var cardHead = el('div', 'theme-head');
        cardHead.appendChild(el('span', 'micro-label', t('qf_theme', 'Generated theme')));
        cardHead.appendChild(shuffle);
        card.appendChild(cardHead);
        card.appendChild(themeName);
        card.appendChild(promptLabel);
        card.appendChild(themePrompt);
        content.appendChild(card);

        /* extra prompt */
        var extra = el('textarea', 'input textarea');
        extra.rows = 2;
        extra.placeholder = t('qf_extra_ph', 'Extra details (optional)…');
        content.appendChild(labeled(t('qf_extra', 'Extra prompt'), extra));

        App.modal(content, {
            title: t('qf_title', 'Quick AI Fit'),
            icon: 'fa-wand-magic-sparkles',
            buttons: [
                { label: t('btn_cancel', 'Cancel'), kind: 'ghost' },
                {
                    label: t('qf_generate', 'Generate'), kind: 'primary',
                    onClick: function (close) {
                        close();
                        var prompt = theme.prompt;
                        var extraTxt = String(extra.value || '').trim();
                        if (extraTxt) { prompt += ' ' + extraTxt; }
                        /* fit onto the garment texture by default */
                        activateTab('ai');
                        var qfOpts = readAiOptions();
                        qfOpts.target = 'sheet';
                        qfOpts.reference = true;
                        qfOpts.fitUv = true;
                        qfOpts.count = 1;
                        runGenerate(prompt, qfOpts);
                    }
                }
            ]
        });
    }

    /* ────────────────────────────────────────────────────────
       Templates tab — auto-discovered from stream/models/
       ──────────────────────────────────────────────────────── */

    var templateCatalog = [];
    var templatesLoaded = false;
    var tplGender = 'all';   /* 'all' | 'male' | 'female' — rail filter (web parity) */
    var tplComp = 'all';

    /* Plain data — deliberately NO t() inside this literal. A literal at
       module scope is evaluated at load, before the dictionary exists,
       which is exactly how the tutorial ended up blank. These are only
       the fallbacks; compLabel() resolves the real label at render time
       against the comp_* keys, which already ship translated nine ways. */
    var COMP_FALLBACK = {
        jbib: 'Tops', uppr: 'Arms', lowr: 'Legs', feet: 'Shoes', hand: 'Bags',
        teef: 'Neck', accs: 'Undershirt', task: 'Armor', decl: 'Decals',
        berd: 'Masks', hair: 'Hair', head: 'Head',
        p_head: 'Hats', p_eyes: 'Glasses', p_ears: 'Ears',
        p_lwrist: 'L.Wrist', p_rwrist: 'R.Wrist', skin: 'Vehicle Skin'
    };
    function compLabel(k) {
        if (!k) { return ''; }
        return t('comp_' + k, COMP_FALLBACK[k] || k.toUpperCase());
    }
    var TPL_BASE = 'https://cfx-nui-apex_vehicles/';

    function requestTemplates() {
        /* templates.json (written by tools/convert.js) is the single
           source of truth — it is complete and correct. The old server
           folder-scan is NOT used: it paired .ydd (with "^") to .glb
           (with "_") by name, failed to match, and wrongly reported
           every item as "NEEDS .GLB", masking the real catalog. */
        fetchLocalCatalog();
    }

    /* Normalize a raw templates.json entry into a catalog item. */
    function normalizeLocal(raw, i) {
        if (!raw || typeof raw !== 'object') { return null; }
        return {
            id: String(raw.id || ('local_' + i)),
            name: raw.name || raw.id || ('Template ' + (i + 1)),
            gender: raw.gender || 'male',
            component: (raw.component !== undefined && raw.component !== null) ? parseInt(raw.component, 10) : 11,
            componentKey: raw.componentKey || 'skin',
            glb: raw.glb || '',
            thumb: raw.thumb || raw.baseTexture || '',
            baseTexture: raw.baseTexture || raw.thumb || '',
            txd: raw.txd || '',
            txn: raw.txn || '',
            textures: Array.isArray(raw.textures) ? raw.textures : [],
            size: raw.size ? parseInt(raw.size, 10) : null,
            ready: !!raw.glb,
            needsConversion: !raw.glb
        };
    }

    /* Fetch the root templates.json directly (it's in files{}, so the
       NUI can always reach it) — the reliable path when the server's
       folder scan can't read files under stream/. */
    function fetchLocalCatalog() {
        /* cache-bust: FiveM's CEF caches templates.json, so after you
           run the converter the studio kept showing the OLD catalog
           (items stuck on "NEEDS .GLB"). A fresh query string forces a
           reload every time. */
        var bust = 'https://cfx-nui-apex_vehicles/templates.json?t=' + Date.now();
        fetch(bust, { method: 'GET', cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d) { return; }
                var raw = d.templates || d.models || [];
                var list = [];
                for (var i = 0; i < raw.length; i++) {
                    var n = normalizeLocal(raw[i], i);
                    if (n) { list.push(n); }
                }
                mergeCatalog(list);
            })
            .catch(function () { /* no templates.json — fine */ });
    }

    function findTemplate(id) {
        for (var i = 0; i < templateCatalog.length; i++) {
            if (templateCatalog[i].id === id) { return templateCatalog[i]; }
        }
        return null;
    }

    var tplSearch = '';

    function filteredTemplates() {
        return templateCatalog.filter(function (tpl) {
            if (tplGender !== 'all' && tpl.gender !== tplGender) { return false; }
            if (tplComp !== 'all' && tpl.componentKey !== tplComp) { return false; }
            if (tplSearch) {
                var hay = ((tpl.name || '') + ' ' + (tpl.componentKey || '') + ' '
                    + compLabel(tpl.componentKey) + ' ' + (tpl.txn || '')).toLowerCase();
                if (hay.indexOf(tplSearch) === -1) { return false; }
            }
            return true;
        });
    }

    function renderTemplateFilters() {
        var box = document.getElementById('tpl-components');
        if (!box) { return; }
        box.innerHTML = '';
        var comps = [];
        templateCatalog.forEach(function (tpl) {
            if ((tplGender === 'all' || tpl.gender === tplGender) && comps.indexOf(tpl.componentKey) === -1) {
                comps.push(tpl.componentKey);
            }
        });
        /* One category = nothing to filter → hide the chips entirely.
           (The lone "All" chip would just be noise.) */
        if (comps.length <= 1) {
            box.hidden = true;
            if (tplComp !== 'all') { tplComp = 'all'; }
            return;
        }
        box.hidden = false;
        var mk = function (key, label) {
            var b = el('button', 'tpl-filter-chip' + (tplComp === key ? ' active' : ''));
            b.textContent = label;
            b.addEventListener('click', function () {
                tplComp = key;
                renderTemplateFilters();
                renderTemplateGrid();
            });
            box.appendChild(b);
        };
        mk('all', t('tpl_all', 'All'));
        comps.forEach(function (k) { mk(k, compLabel(k).toUpperCase()); });
    }

    function selectTemplateItem(tpl) {
        if (window.Viewer && Viewer.show) {
            Viewer.show(tpl);
        } else {
            App.state.activeTemplate = tpl;
            App.emit('templateChanged', tpl);
        }
        if (!tpl.ready) {
            /* still fully editable + exportable — only the real 3D
               shape needs a .glb (the flat preview stands in) */
            App.toast(t('tpl_flat_preview', 'Flat preview — add a .glb next to it for the real 3D shape.'), 'info');
        }
        renderTemplateGrid();
        renderExportSummary();
    }

    function renderTemplateGrid() {
        var grid = document.getElementById('tpl-grid');
        if (!grid) { return; }
        grid.innerHTML = '';
        var list = filteredTemplates();
        if (!list.length) {
            var empty = el('div', 'empty-state small');
            empty.appendChild(icon('fa-car'));
            empty.appendChild(el('span', null, templateCatalog.length
                ? t('tpl_none_here', 'No templates for this gender/component yet')
                : t('tpl_empty', 'No vehicles yet — run tools/convert.js to add your cars, see the README')));
            grid.appendChild(empty);
            return;
        }
        var activeId = (window.Viewer && Viewer.activeId) ? Viewer.activeId()
            : (App.state.activeTemplate && App.state.activeTemplate.id);
        list.forEach(function (tpl) {
            var card = el('div', 'tpl-card' + (tpl.id === activeId ? ' active' : '') + (tpl.ready ? '' : ' pending'));
            var thumb = el('div', 'tpl-thumb');
            /* Static UNTEXTURED 3D render of the garment (no rotation),
               generated once and cached. Falls back to a shirt icon. */
            var ph = icon('fa-car'); ph.classList.add('tpl-thumb-ph');
            thumb.appendChild(ph);
            if (tpl.glb && window.Viewer && Viewer.garmentThumb) {
                (function (holder, placeholder) {
                    Viewer.garmentThumb(TPL_BASE + tpl.glb, function (url) {
                        if (!url) { return; }
                        var img = document.createElement('img');
                        img.src = url;
                        img.onload = function () { if (placeholder) { placeholder.remove(); } };
                        holder.insertBefore(img, holder.firstChild);
                    });
                })(thumb, ph);
            }
            /* web tiles carry no "selected"/"N textures" overlays — only the
               functional needs-.glb warning survives */
            if (!tpl.ready) { thumb.appendChild(el('span', 'tpl-badge', t('tpl_glb_badge', 'needs .glb'))); }
            card.appendChild(thumb);
            card.appendChild(el('div', 'tpl-name', tpl.name));
            var sub = el('div', 'tpl-sub', compLabel(tpl.componentKey));
            card.appendChild(sub);
            card.addEventListener('click', function () { selectTemplateItem(tpl); });
            grid.appendChild(card);
        });
    }

    /* Merge new items into the catalog (dedup by id), then render.
       Both the server auto-scan and the direct templates.json fetch
       feed through here. */
    function syncGenderButtons() {
        var g = document.querySelectorAll('.tpl-gender .seg-btn');
        for (var j = 0; j < g.length; j++) {
            var gender = g[j].dataset.gender;
            g[j].classList.toggle('active', gender === tplGender);
            /* mark genders that actually have templates ('all' = any) */
            var has = gender === 'all' ? templateCatalog.length > 0
                : templateCatalog.some(function (t) { return t.gender === gender; });
            g[j].classList.toggle('has-items', has);
        }
        /* Only one gender in the catalog → the gender switch is pointless,
           so hide the whole group and let the chips (or nothing) fill the
           row. Two genders → show it. */
        var genders = {};
        templateCatalog.forEach(function (t) { if (t.gender) { genders[t.gender] = true; } });
        var group = document.querySelector('#tpl-filterbar .tpl-gender');
        if (group) { group.hidden = Object.keys(genders).length < 2; }
    }

    /* Never show an empty tab when templates exist: if the current gender
       has none, switch to one that does (the #1 "templates don't work"
       cause — default was 'male' but the only item was female). */
    function ensureVisibleGender() {
        var have = {};
        templateCatalog.forEach(function (t) { have[t.gender] = true; });
        if (tplGender !== 'all' && !have[tplGender]) {
            tplGender = have.female ? 'female' : (have.male ? 'male' : tplGender);
            tplComp = 'all';
        }
        syncGenderButtons();
        renderTemplateFilters();
        renderTemplateGrid();
    }

    function mergeCatalog(list) {
        var added = 0;
        (list || []).forEach(function (tpl) {
            if (!tpl || !tpl.id) { return; }
            var existing = findTemplate(tpl.id);
            if (existing) {
                /* update in place — a re-fetch may have filled in the
                   glb/textures that were missing before (fixes cards
                   stuck on "NEEDS .GLB" after converting) */
                for (var k in tpl) { if (Object.prototype.hasOwnProperty.call(tpl, k)) { existing[k] = tpl[k]; } }
            } else {
                templateCatalog.push(tpl); added++;
            }
        });
        templatesLoaded = true;
        ensureVisibleGender();
        if (added) { autoSelectFirst(); }
    }

    function autoSelectFirst() {
        if (App.state.activeTemplate) { return; }
        var first = null;
        for (var i = 0; i < templateCatalog.length; i++) {
            if (templateCatalog[i].ready) { first = templateCatalog[i]; break; }
        }
        if (!first && templateCatalog.length) { first = templateCatalog[0]; }
        if (!first) { return; }
        /* 'all' already shows every gender — only narrow when a specific
           gender filter would hide the auto-selected item */
        if (tplGender !== 'all' && first.gender !== tplGender) { tplGender = first.gender; }
        var g = document.querySelectorAll('.tpl-gender .seg-btn');
        for (var j = 0; j < g.length; j++) {
            g[j].classList.toggle('active', g[j].dataset.gender === tplGender);
        }
        renderTemplateFilters();
        renderTemplateGrid();
        if (window.Viewer && Viewer.show) { Viewer.show(first); }
        renderExportSummary();
    }

    function onCatalog(payload) {
        mergeCatalog(payload && payload.templates);
    }

    function bindTemplatesPane() {
        var g = document.querySelectorAll('.tpl-gender .seg-btn');
        for (var i = 0; i < g.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    tplGender = btn.dataset.gender;
                    tplComp = 'all';
                    for (var k = 0; k < g.length; k++) { g[k].classList.toggle('active', g[k] === btn); }
                    renderTemplateFilters();
                    renderTemplateGrid();
                });
            })(g[i]);
        }
        var refresh = document.getElementById('btn-templates-refresh');
        if (refresh) {
            refresh.addEventListener('click', function () {
                templateCatalog = [];
                templatesLoaded = false;
                renderTemplateGrid();
                fetchLocalCatalog();           /* templates.json only (cache-busted) */
                App.toast(t('tpl_rescanning', 'Rescanning templates…'), 'info');
            });
        }

        /* search box — filters the grid by name / category / txn */
        var search = document.getElementById('tpl-search-input');
        var clear = document.getElementById('tpl-search-clear');
        if (search) {
            search.addEventListener('input', function () {
                tplSearch = String(search.value || '').trim().toLowerCase();
                if (clear) { clear.hidden = !tplSearch; }
                renderTemplateGrid();
            });
        }
        if (clear) {
            clear.addEventListener('click', function () {
                tplSearch = '';
                if (search) { search.value = ''; }
                clear.hidden = true;
                renderTemplateGrid();
                if (search) { search.focus(); }
            });
        }
    }

    /* ────────────────────────────────────────────────────────
       Texture variants — switch the garment's real textures
       (a / b / c … each is a real .ytd converted to PNG)
       ──────────────────────────────────────────────────────── */

    var activeVariant = null;
    var activeVariantData = null;   /* full {id,txn,png,w,h} of the shown texture */
    var baseLayerId = null;
    var pendingVariant = null;      /* waits for the glb's UV crop before loading */
    var loadSeq = 0;                /* discards stale async image loads */
    /* while a saved project is being restored, selecting its 3D template
       must NOT reload the default texture (which would wipe the design
       we just loaded). These flags make templateChanged map the variant
       without touching the canvas. */
    var loadingProject = false;
    var projectLoadTarget = null;   /* txn to re-activate after load */

    function setTexLoading(on) {
        var chip = document.getElementById('tex-loading');
        if (chip) { chip.hidden = !on; }
    }

    /* ── per-texture workspaces ───────────────────────────────
       Every template+variant keeps its OWN design. Switching
       texture stashes the current canvas and restores (or starts
       fresh) the target one — edits never bleed across textures. */
    var variantStore = {};      /* 'tplId::variantId' → Editor.serialize() */
    var currentWsKey = null;

    function wsKey(v) {
        var tpl = App.state.activeTemplate;
        return ((tpl && tpl.id) || 'tpl') + '::' + ((v && v.id) || 'a');
    }

    function stashCurrentWorkspace() {
        if (currentWsKey && Editor.layers.length) {
            try { variantStore[currentWsKey] = Editor.serialize(); } catch (e) { /* best effort */ }
        }
    }

    function findBaseLayerId() {
        for (var i = 0; i < Editor.layers.length; i++) {
            var l = Editor.layers[i];
            if (l && l.data && l.data.isBase) { return l.id; }
        }
        return null;
    }

    /* Start a synthetic (user-created) texture: an empty transparent
       sheet at the recorded size, with no base layer to protect —
       the whole canvas is the user's to paint. */
    function loadBlankVariant(v, mySeq) {
        var cw = Math.max(1, Math.min(2048, v.w || Editor.getWidth() || 1024));
        var ch = Math.max(1, Math.min(2048, v.h || Editor.getHeight() || 1024));
        if (Editor.setSize && (cw !== Editor.getWidth() || ch !== Editor.getHeight())) {
            Editor.setSize(cw, ch);
            if (window.Viewer && Viewer.rebuildUvGuide) { Viewer.rebuildUvGuide(); }
        }
        for (var li = Editor.layers.length - 1; li >= 0; li--) {
            Editor.removeLayer(Editor.layers[li].id);
        }
        baseLayerId = null;
        if (Editor.resetView) { Editor.resetView(); }
        setTexLoading(false);
        if (mySeq !== loadSeq) { return; }
        if (window.App) { App.setDirty(false); App.emit('contentReady', {}); }
    }

    function loadVariant(v) {
        if (!v) { return; }
        var mySeq = ++loadSeq;
        var crop = (window.Viewer && Viewer.uvCrop) ? Viewer.uvCrop() : null;
        setTexLoading(true);

        stashCurrentWorkspace();
        currentWsKey = wsKey(v);

        activeVariant = v.id;
        activeVariantData = v;
        var tpl = App.state.activeTemplate;
        if (tpl) {
            tpl.txn = v.txn;
            if (tpl.txd) { tpl.txd = tpl.txd.replace(/\/[^/]*$/, '/' + v.txn); }
        }
        var texLabel = document.getElementById('tex-name-label');
        if (texLabel) { texLabel.textContent = v.txn; }
        renderTextureVariants();
        renderExportSummary();

        /* this texture was edited before → restore ITS design */
        var saved = variantStore[currentWsKey];
        if (saved) {
            suppressDirty = true;
            Editor.load(saved, false).then(function () {
                suppressDirty = false;
                if (mySeq !== loadSeq) { return; }
                baseLayerId = findBaseLayerId();
                setTexLoading(false);
                if (window.App) { App.setDirty(true); App.emit('contentReady', {}); }
                if (window.Viewer && Viewer.rebuildUvGuide) { Viewer.rebuildUvGuide(); }
            });
            return;
        }

        /* no file behind this texture (user created it) → blank sheet */
        if (!v.png) { loadBlankVariant(v, mySeq); return; }

        /* fresh workspace: load + slice the texture, then rebuild */
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            if (mySeq !== loadSeq) { return; }   /* a newer switch already happened */
            /* Cut the region the garment actually uses (the mesh's UV
               bbox) at NATIVE resolution — pixels are copied 1:1, so the
               texture is NEVER stretched or squashed in the editor. */
            var sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
            if (crop) {
                sx = Math.round(crop.u0 * img.naturalWidth);
                sy = Math.round(crop.v0 * img.naturalHeight);
                sw = Math.max(1, Math.round((crop.u1 - crop.u0) * img.naturalWidth));
                sh = Math.max(1, Math.round((crop.v1 - crop.v0) * img.naturalHeight));
            }
            /* only ever SHRINK to fit the 2048 cap — same factor on both
               axes, so the aspect ratio is always preserved exactly */
            var scale = Math.min(1, 2048 / Math.max(sw, sh));
            var cw = Math.max(1, Math.round(sw * scale));
            var ch = Math.max(1, Math.round(sh * scale));
            var c = document.createElement('canvas');
            c.width = cw; c.height = ch;
            c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);

            if (Editor.setSize && (cw !== Editor.getWidth() || ch !== Editor.getHeight())) {
                Editor.setSize(cw, ch);
                if (window.Viewer && Viewer.rebuildUvGuide) { Viewer.rebuildUvGuide(); }
            }

            /* this variant starts clean — previous variant's layers were
               stashed above and will come back when it's re-selected */
            for (var li = Editor.layers.length - 1; li >= 0; li--) {
                Editor.removeLayer(Editor.layers[li].id);
            }

            /* RASTER base: the brush paints and the ERASER erases the
               garment texture itself. isBase = pinned (not draggable). */
            var layer = Editor.addLayer('raster',
                { src: c.toDataURL('image/png'), w: cw, h: ch, isBase: true },
                t('base_texture', 'Texture'));
            if (layer) {
                Editor.moveLayer(layer.id, 0);
                /* LOCKED by default: protects the garment texture so brush/
                   eraser land on YOUR layers, not on it. Unlock it in the
                   Layers panel (padlock) to paint/erase the garment itself. */
                Editor.updateLayer(layer.id, { locked: true });
                baseLayerId = layer.id;
                /* select nothing so the first stroke makes a fresh paint
                   layer instead of hitting the (now locked) base */
                Editor.select(null);
            }
            if (Editor.resetView) { Editor.resetView(); }   /* center H+V */
            setTexLoading(false);
            if (window.App) { App.setDirty(false); App.emit('contentReady', {}); }
        };
        img.onerror = function () {
            if (mySeq !== loadSeq) { return; }
            setTexLoading(false);
            if (window.App) { App.emit('contentReady', {}); }   /* don't hang the spinner */
            App.toast(t('tex_load_fail', 'Could not load that texture file.'), 'error');
        };
        img.src = TPL_BASE + v.png;
    }

    /* ── texture thumbnails (dropdown previews) ────────────────
       The dropdown used to show A/B/C letters, which say nothing
       about what the texture actually IS. These build a small square
       preview of each sheet ONCE and cache it as a data URL: the full
       sheet (often 2048px and several MB) is loaded, downscaled and
       thrown away, so the menu costs a few KB per texture instead of
       holding every sheet in memory. Built lazily — nothing loads
       until the menu is opened for the first time. */
    var TEX_THUMB_PX = 96;
    var texThumbCache = {};       /* key → dataURL ('' = no preview)   */
    var texThumbWaiting = {};     /* key → [callback, ...] while loading */

    function texThumbKey(tpl, v) {
        return ((tpl && tpl.id) || 'tpl') + '::' + (v.id || '?') + '::' + (v.png || '');
    }

    function loadTexThumb(tpl, v, done) {
        if (!v || !v.png) { done(''); return; }
        var key = texThumbKey(tpl, v);
        if (texThumbCache[key] !== undefined) { done(texThumbCache[key]); return; }
        if (texThumbWaiting[key]) { texThumbWaiting[key].push(done); return; }
        texThumbWaiting[key] = [done];

        function finish(url) {
            texThumbCache[key] = url;
            var list = texThumbWaiting[key] || [];
            delete texThumbWaiting[key];
            list.forEach(function (fn) { try { fn(url); } catch (e) { /* ignore */ } });
        }

        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            try {
                /* square canvas, sheet letterboxed inside it: the CSS
                   box can then use cover/contain without distorting a
                   non-square sheet (2048x1024 livery strips are common) */
                var S = TEX_THUMB_PX;
                var c = document.createElement('canvas');
                c.width = S; c.height = S;
                var g = c.getContext('2d');
                var scale = Math.min(S / img.naturalWidth, S / img.naturalHeight);
                var w = Math.max(1, Math.round(img.naturalWidth * scale));
                var h = Math.max(1, Math.round(img.naturalHeight * scale));
                g.drawImage(img, Math.round((S - w) / 2), Math.round((S - h) / 2), w, h);
                finish(c.toDataURL('image/png'));
            } catch (e) {
                finish('');
            }
        };
        img.onerror = function () { finish(''); };
        img.src = TPL_BASE + v.png;
    }

    /* Paint a preview into a badge, or fall back to its letter. */
    function setTexBadge(node, url, letter) {
        if (!node) { return; }
        if (url) {
            node.classList.add('has-thumb');
            node.style.backgroundImage = 'url(' + url + ')';
            node.textContent = '';
        } else {
            node.classList.remove('has-thumb');
            node.style.backgroundImage = '';
            node.textContent = letter;
        }
    }

    /* The ACTIVE texture previews what is on the canvas right now
       (edits included); the others preview their source file. */
    function liveTexThumb() {
        try {
            if (Editor.layers && Editor.layers.length && Editor.thumbnail) {
                return Editor.thumbnail(TEX_THUMB_PX);
            }
        } catch (e) { /* fall through to the file preview */ }
        return '';
    }

    /* A vehicle can expose a HUNDRED textures, and each sheet is a
       multi-MB PNG that costs far more decoded. So previews are built
       (a) only for rows scrolled into view and (b) a few at a time. */
    var THUMB_CONCURRENCY = 3;
    var thumbQueue = [];
    var thumbActive = 0;
    var texThumbObserver = null;

    function pumpThumbs() {
        while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length) {
            var job = thumbQueue.shift();
            thumbActive++;
            job(function () {
                thumbActive--;
                pumpThumbs();
            });
        }
    }

    function queueTexThumb(tpl, v, apply) {
        var key = texThumbKey(tpl, v);
        if (texThumbCache[key] !== undefined) {   /* already built */
            apply(texThumbCache[key]);
            return;
        }
        thumbQueue.push(function (release) {
            loadTexThumb(tpl, v, function (url) {
                apply(url);
                release();
            });
        });
        pumpThumbs();
    }

    /* Menu closed: stop watching rows and drop what never started, so
       a scroll through a 100-texture list does not keep decoding PNGs
       for a dropdown nobody is looking at. */
    function stopTexThumbs() {
        if (texThumbObserver) { texThumbObserver.disconnect(); texThumbObserver = null; }
        thumbQueue.length = 0;
    }

    /* Fill in the previews of an OPEN dropdown (see bindTexDropdown). */
    function hydrateTexThumbs() {
        var menu = document.getElementById('tex-dd-menu');
        if (!menu) { return; }
        var tpl = App.state.activeTemplate;
        var texs = (tpl && tpl.textures) || [];
        var byId = {};
        texs.forEach(function (v) { byId[String(v.id)] = v; });

        /* the menu was rebuilt: drop the old observations and the
           still-queued loads for rows that no longer exist */
        if (texThumbObserver) { texThumbObserver.disconnect(); texThumbObserver = null; }
        thumbQueue.length = 0;

        function hydrate(item) {
            var v = byId[item.getAttribute('data-tex-id')];
            if (!v || item.getAttribute('data-thumbed') === '1') { return; }
            item.setAttribute('data-thumbed', '1');
            var badge = item.querySelector('.tex-dd-letter');
            var letter = String(v.id || '?').toUpperCase();
            if (v.id === activeVariant) {
                var live = liveTexThumb();
                if (live) { setTexBadge(badge, live, letter); return; }
            }
            queueTexThumb(tpl, v, function (url) { setTexBadge(badge, url, letter); });
        }

        var nodes = menu.querySelectorAll('.tex-dd-item[data-tex-id]');
        if (!window.IntersectionObserver) {          /* paranoid fallback */
            for (var i = 0; i < Math.min(nodes.length, 12); i++) { hydrate(nodes[i]); }
            return;
        }
        /* captured in the closure, NOT read back off texThumbObserver:
           a late callback from a disconnected observer must not touch
           whatever observer replaced it (or a null one). */
        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) { return; }
                hydrate(entry.target);
                obs.unobserve(entry.target);
            });
        }, { root: menu, rootMargin: '140px 0px' });
        texThumbObserver = obs;
        for (var k = 0; k < nodes.length; k++) { obs.observe(nodes[k]); }
    }

    /* Texture variants live in the 3D panel's navbar as a dropdown —
       the active texture NAME is shown inside the control itself. */
    function renderTextureVariants() {
        var dd = document.getElementById('texture-variants');
        if (!dd) { return; }
        var tpl = App.state.activeTemplate;
        var texs = (tpl && tpl.textures) || [];

        /* The CRUD buttons follow the garment, not the texture count:
           a garment with zero textures is exactly when "New" matters. */
        var actions = document.getElementById('tex-actions');
        if (actions) {
            actions.hidden = !tpl;
            var delBtn = document.getElementById('btn-tex-del');
            if (delBtn) { delBtn.disabled = texs.length <= 1; }
            var renBtn = document.getElementById('btn-tex-rename');
            if (renBtn) { renBtn.disabled = !texs.length; }
            var dupBtn = document.getElementById('btn-tex-dup');
            if (dupBtn) { dupBtn.disabled = !texs.length; }
        }

        if (!texs.length) { dd.hidden = true; return; }
        dd.hidden = false;
        var active = null;
        for (var k = 0; k < texs.length; k++) {
            if (texs[k].id === activeVariant) { active = texs[k]; break; }
        }
        if (!active) { active = texs[0]; }
        var cur = document.getElementById('tex-dd-current');
        if (cur) {
            /* the closed control previews the texture it is showing —
               live canvas first, source sheet as the fallback */
            var curLetter = String(active.id || '?').toUpperCase();
            setTexBadge(cur, liveTexThumb(), curLetter);
            if (!cur.classList.contains('has-thumb')) {
                (function (a, letter) {
                    loadTexThumb(tpl, a, function (url) {
                        /* ignore a late answer for a texture we left */
                        if (activeVariant === a.id || a === active) {
                            setTexBadge(document.getElementById('tex-dd-current'), url, letter);
                        }
                    });
                })(active, curLetter);
            }
        }
        var nm = document.getElementById('tex-dd-name');
        if (nm) { nm.textContent = active.txn || '—'; }
        dd.classList.toggle('single', texs.length <= 1);   /* no caret when 1 */
        var menu = document.getElementById('tex-dd-menu');
        if (!menu) { return; }
        menu.innerHTML = '';
        texs.forEach(function (v) {
            var it = el('button', 'tex-dd-item' + (v.id === activeVariant ? ' active' : ''));
            it.setAttribute('data-tex-id', String(v.id));
            /* letter now, preview as soon as the menu is opened
               (hydrateTexThumbs swaps it for the real sheet) */
            it.appendChild(el('span', 'tex-dd-letter mono', String(v.id || '?').toUpperCase()));
            it.appendChild(el('span', 'tex-dd-txn mono', v.txn || ''));
            /* mark the ones the user created — they have no original
               file to fall back on, which changes what Reset does */
            if (v.synthetic) {
                it.appendChild(el('span', 'tex-dd-tag', t('tex_tag_new', 'new')));
            }
            /* a dot on textures carrying unsaved edits, so switching
               away never feels like the work vanished */
            if (variantStore[((tpl && tpl.id) || 'tpl') + '::' + v.id]) {
                it.appendChild(el('span', 'tex-dd-dot'));
            }
            it.addEventListener('click', function () {
                menu.hidden = true;
                loadVariant(v);
            });
            menu.appendChild(it);
        });

        /* footer action: add a texture without leaving the dropdown */
        var addIt = el('button', 'tex-dd-item tex-dd-add');
        addIt.appendChild(icon('fa-plus'));
        addIt.appendChild(el('span', 'tex-dd-txn', t('tex_new', 'New texture')));
        addIt.addEventListener('click', function () {
            menu.hidden = true;
            addTexture(false);
        });
        menu.appendChild(addIt);

        /* rebuilt while open (variant added/renamed) — repaint previews */
        if (!menu.hidden) { hydrateTexThumbs(); }
    }

    function bindTexDropdown() {
        var btn = document.getElementById('tex-dd-btn');
        var menu = document.getElementById('tex-dd-menu');
        if (!btn || !menu) { return; }
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.hidden = !menu.hidden;
            /* sheets are only loaded once the user actually looks */
            if (menu.hidden) { stopTexThumbs(); } else { hydrateTexThumbs(); }
        });
        document.addEventListener('click', function () {
            if (!menu.hidden) { stopTexThumbs(); }
            menu.hidden = true;
        });
    }

    /* ════════════════════════════════════════════════════════
       §TEXTURE MANAGER — create / duplicate / rename / delete
       --------------------------------------------------------
       A garment's textures are the a/b/c… variants that GTA
       streams as <comp>_diff_<NNN>_<letter>_<race>. The studio
       treats them as first-class documents: each one owns its
       workspace (variantStore), and this section lets the user
       add, copy, rename and remove them.

       Persistence: the edited catalog is written back to the
       resource's templates.json through the `templatesSave` NUI
       callback, so a new/renamed texture survives a restart. A
       NEW texture has no PNG on disk yet — it carries
       `synthetic: true` plus the size to start blank at, and
       loadVariant() builds the empty sheet for it.
       ════════════════════════════════════════════════════════ */

    /* Next free variant letter for a garment ('a'→'z'), or null when
       all 26 are taken (nobody will ever hit this, but a silent
       collision would overwrite someone's texture). */
    function nextVariantLetter(texs) {
        var used = {};
        (texs || []).forEach(function (v) { used[String(v.id || '').toLowerCase()] = true; });
        for (var i = 0; i < 26; i++) {
            var c = String.fromCharCode(97 + i);
            if (!used[c]) { return c; }
        }
        return null;
    }

    /* Build the in-game texture name for a new variant by swapping the
       letter in the sibling's name: jbib_diff_012_a_uni → …_c_uni.
       Falls back to appending when the name isn't the standard shape. */
    function txnForLetter(sample, letter) {
        var s = String(sample || '');
        var m = s.match(/^(.*_diff_\d+_)([a-z])(_.*)?$/i);
        if (m) { return m[1] + letter + (m[3] || ''); }
        return s ? (s + '_' + letter) : ('texture_' + letter);
    }

    /* Push the current catalog back to disk. Fire-and-forget: the UI
       has already updated, and a failed write only costs persistence
       (the studio still works for this session). */
    function persistTemplates(quiet) {
        App.nui('templatesSave', { templates: templateCatalog }).then(function (r) {
            if (r && r.ok) {
                if (!quiet) { App.toast(t('tex_saved', 'Saved to templates.json.'), 'success'); }
            } else {
                App.toast(t('tex_save_fail',
                    'Changed for this session only — templates.json could not be written.'), 'warning');
            }
        });
    }

    function activeTexList() {
        var tpl = App.state.activeTemplate;
        return (tpl && tpl.textures) || [];
    }

    /* Add a variant. `fromCurrent` copies the CURRENT canvas (design
       included) as the new texture's starting point; otherwise it
       starts as an empty transparent sheet the size of variant A. */
    function addTexture(fromCurrent) {
        var tpl = App.state.activeTemplate;
        if (!tpl) {
            App.toast(t('tex_no_tpl', 'Pick a garment first.'), 'error');
            return;
        }
        var texs = tpl.textures = tpl.textures || [];
        var letter = nextVariantLetter(texs);
        if (!letter) {
            App.toast(t('tex_full', 'This garment already has 26 textures.'), 'error');
            return;
        }
        var sample = texs[0] || {};
        var w = (activeVariantData && activeVariantData.w) || sample.w || Editor.getWidth();
        var h = (activeVariantData && activeVariantData.h) || sample.h || Editor.getHeight();

        var entry = {
            id: letter,
            txn: txnForLetter(sample.txn || tpl.txn, letter),
            png: '',
            w: w, h: h,
            synthetic: true,                 /* no file on disk — built in the browser */
            label: t('tex_new_name', 'Texture %s', letter.toUpperCase())
        };
        texs.push(entry);

        /* Seed its workspace. "Duplicate" hands over the current design;
           a fresh texture gets nothing and loadVariant() blanks it. */
        if (fromCurrent && Editor.layers.length) {
            stashCurrentWorkspace();
            try { variantStore[tpl.id + '::' + letter] = Editor.serialize(); }
            catch (e) { /* best effort — it just opens blank instead */ }
        }

        renderTextureVariants();
        persistTemplates(true);
        loadVariant(entry);
        App.toast(fromCurrent
            ? t('tex_dup_done', 'Texture duplicated as %s.', letter.toUpperCase())
            : t('tex_new_done', 'Texture %s created.', letter.toUpperCase()), 'success');
    }

    function renameTexture() {
        var tpl = App.state.activeTemplate;
        var v = activeVariantData;
        if (!tpl || !v) {
            App.toast(t('tex_no_tpl', 'Pick a garment first.'), 'error');
            return;
        }
        App.prompt(
            t('tex_rename_title', 'Rename texture'),
            t('tex_rename_label', 'In-game texture name (txn)'),
            v.txn || '',
            { maxLength: 64, placeholder: 'jbib_diff_000_a_uni' }
        ).then(function (val) {
            if (val === null) { return; }
            var name = String(val).trim().replace(/\.ytd$/i, '');
            if (!name) {
                App.toast(t('tex_rename_empty', 'The name cannot be empty.'), 'error');
                return;
            }
            /* The txn is what the exporter targets in game — a duplicate
               would make two textures fight over the same slot. */
            var clash = activeTexList().some(function (o) {
                return o !== v && String(o.txn || '').toLowerCase() === name.toLowerCase();
            });
            if (clash) {
                App.toast(t('tex_rename_clash', 'Another texture on this garment already uses that name.'), 'error');
                return;
            }

            v.txn = name;
            v.label = name;
            /* keep the template's own txd/txn pointing at the active one */
            tpl.txn = name;
            if (tpl.txd) { tpl.txd = tpl.txd.replace(/\/[^/]*$/, '/' + name); }

            renderTextureVariants();
            renderExportSummary();
            persistTemplates(false);
        });
    }

    function deleteTexture() {
        var tpl = App.state.activeTemplate;
        var v = activeVariantData;
        var texs = activeTexList();
        if (!tpl || !v) {
            App.toast(t('tex_no_tpl', 'Pick a garment first.'), 'error');
            return;
        }
        if (texs.length <= 1) {
            App.toast(t('tex_last', 'A garment needs at least one texture.'), 'error');
            return;
        }
        App.confirm(
            t('tex_del_title', 'Delete this texture?'),
            t('tex_del_body',
                'Texture "%s" and the design on it are removed from this garment. The original file on disk is left untouched.',
                v.txn || v.id),
            { danger: true, confirmText: t('btn_delete', 'Delete') }
        ).then(function (ok) {
            if (!ok) { return; }
            var idx = texs.indexOf(v);
            if (idx === -1) { return; }
            texs.splice(idx, 1);
            /* drop its workspace so a later texture reusing the letter
               doesn't inherit a stranger's layers */
            delete variantStore[tpl.id + '::' + v.id];
            currentWsKey = null;

            var next = texs[Math.min(idx, texs.length - 1)];
            renderTextureVariants();
            persistTemplates(true);
            if (next) { loadVariant(next); }
            App.toast(t('tex_del_done', 'Texture deleted.'), 'success');
        });
    }

    function bindTextureActions() {
        var defs = [
            ['btn-tex-new', function () { addTexture(false); }],
            ['btn-tex-dup', function () { addTexture(true); }],
            ['btn-tex-rename', renameTexture],
            ['btn-tex-del', deleteTexture]
        ];
        defs.forEach(function (d) {
            var b = document.getElementById(d[0]);
            if (b) { b.addEventListener('click', d[1]); }
        });
    }

    /* ════════════════════════════════════════════════════════
       §TEXTURE PROPERTIES PANEL — the right-hand column
       --------------------------------------------------------
       Live texture info + quick actions that fill the empty
       checker space. It reflects the ACTIVE texture and the
       SELECTED layer, and drives the non-destructive colour
       adjustments plus one-click background removal.
       ════════════════════════════════════════════════════════ */

    var PROPS_COLLAPSE_KEY = 'apex_vehicles_props_collapsed';

    /* which layer the panel edits: the selection, else the top
       image/raster (the thing a "remove background" most likely means) */
    function propsTargetLayer() {
        var sel = Editor.getLayer(Editor.selectedId);
        if (sel && (sel.type === 'image' || sel.type === 'raster') && !sel.data.isBase) { return sel; }
        for (var i = Editor.layers.length - 1; i >= 0; i--) {
            var l = Editor.layers[i];
            if ((l.type === 'image' || l.type === 'raster') && !l.data.isBase) { return l; }
        }
        /* fall back to the base texture so brightness/contrast still work
           on a plain garment with no extra layers */
        return sel || null;
    }

    function renderTexProps() {
        var panel = document.getElementById('tex-props');
        if (!panel) { return; }

        /* The thumbnail composites the FULL canvas and encodes it. The
           panel is collapsible and the choice is remembered, so this was
           running on every change to produce a picture behind a closed
           panel. Everything below it is cheap text, so only the
           thumbnail is skipped. */
        var collapsed = panel.classList.contains('collapsed');

        /* thumbnail + identity of the active texture */
        var thumb = document.getElementById('tex-props-thumb');
        if (thumb && !collapsed) {
            try { thumb.src = Editor.layers.length ? Editor.thumbnail(120) : ''; }
            catch (e) { thumb.src = ''; }
            thumb.style.visibility = Editor.layers.length ? 'visible' : 'hidden';
        }
        var tpl = App.state.activeTemplate;
        var nameEl = document.getElementById('tex-props-name');
        var subEl = document.getElementById('tex-props-sub');
        if (nameEl) {
            nameEl.textContent = (activeVariantData && activeVariantData.txn)
                || (tpl && tpl.txn) || t('props_none', 'No texture');
        }
        if (subEl) {
            if (tpl) {
                var vId = activeVariantData ? String(activeVariantData.id || 'a').toUpperCase() : '—';
                subEl.textContent = t('props_sub', '%s · %d×%dpx · variant %s',
                    tpl.name || '', Editor.getWidth(), Editor.getHeight(), vId);
            } else {
                subEl.textContent = '';
            }
        }

        /* selected-layer row + the adjust controls that follow it */
        var layer = propsTargetLayer();
        var layerEl = document.getElementById('tex-props-layer');
        if (layerEl) {
            layerEl.textContent = layer
                ? (layer.name || layer.type)
                : t('props_layer_none', 'Nothing selected');
            layerEl.classList.toggle('empty', !layer);
        }

        var canPixels = layer && (layer.type === 'image' || layer.type === 'raster');
        var removeBg = document.getElementById('tex-props-removebg');
        if (removeBg) { removeBg.disabled = !canPixels; }

        var adj = layer ? (layer.data.adjust || {}) : {};
        var sliders = [
            ['adj-brightness', 'brightness', 100],
            ['adj-saturate', 'saturate', 100],
            ['adj-contrast', 'contrast', 100]
        ];
        var canAdjust = !!layer && (layer.type === 'image' || layer.type === 'raster');
        sliders.forEach(function (s) {
            var input = document.getElementById(s[0]);
            var out = document.getElementById(s[0] + '-val');
            if (!input) { return; }
            var v = adj[s[1]] !== undefined ? adj[s[1]] : s[2];
            input.value = v;
            input.disabled = !canAdjust;
            if (out) { out.textContent = v + '%'; }
        });
        var invert = document.getElementById('adj-invert');
        if (invert) {
            invert.disabled = !canAdjust;
            invert.classList.toggle('on', !!adj.invert);
        }
        var reset = document.getElementById('adj-reset');
        if (reset) { reset.disabled = !canAdjust; }
    }

    function bindTexProps() {
        var panel = document.getElementById('tex-props');
        if (!panel) { return; }

        /* CRITICAL: the panel lives INSIDE #canvas-wrap, and the editor
           binds its pointer handlers on that wrap. Without this, every
           click/drag on the panel bubbles to the editor, which grabs the
           pointer (setPointerCapture) and drags the layer underneath —
           stealing the click from our buttons AND moving the texture.
           Swallow the editor-relevant events at the panel boundary so
           the controls work and the canvas stays put. */
        ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
            'wheel', 'dblclick', 'contextmenu'].forEach(function (ev) {
            panel.addEventListener(ev, function (e) { e.stopPropagation(); });
        });

        /* collapse state persists per player */
        var collapsed = false;
        try { collapsed = localStorage.getItem(PROPS_COLLAPSE_KEY) === '1'; } catch (e) { /* ok */ }
        panel.classList.toggle('collapsed', collapsed);
        var toggle = document.getElementById('tex-props-toggle');
        if (toggle) {
            toggle.addEventListener('click', function () {
                var now = !panel.classList.contains('collapsed');
                panel.classList.toggle('collapsed', now);
                try { localStorage.setItem(PROPS_COLLAPSE_KEY, now ? '1' : '0'); } catch (e) { /* ok */ }
            });
        }

        var removeBg = document.getElementById('tex-props-removebg');
        if (removeBg) {
            removeBg.addEventListener('click', function () {
                var layer = propsTargetLayer();
                if (!layer) { return; }
                var ok = Editor.removeBackground(layer.id, 46);
                App.toast(ok
                    ? t('props_removebg_done', 'Background removed.')
                    : t('props_removebg_none', 'No flat background found to remove.'),
                    ok ? 'success' : 'info');
                renderTexProps();
            });
        }

        [['adj-brightness', 'brightness'], ['adj-saturate', 'saturate'], ['adj-contrast', 'contrast']]
            .forEach(function (s) {
                var input = document.getElementById(s[0]);
                var out = document.getElementById(s[0] + '-val');
                if (!input) { return; }
                input.addEventListener('input', function () {
                    var layer = propsTargetLayer();
                    if (!layer) { return; }
                    var v = parseInt(input.value, 10);
                    if (out) { out.textContent = v + '%'; }
                    var patch = {}; patch[s[1]] = v;
                    /* Silent: the picture updates live, but nothing is
                       written to the undo history until the drag ends. */
                    Editor.setAdjust(layer.id, patch, true);
                });
                /* One undo entry per drag, not one per pixel. */
                input.addEventListener('change', function () {
                    var layer = propsTargetLayer();
                    if (!layer) { return; }
                    var patch = {}; patch[s[1]] = parseInt(input.value, 10);
                    Editor.setAdjust(layer.id, patch);
                });
            });

        var invert = document.getElementById('adj-invert');
        if (invert) {
            invert.addEventListener('click', function () {
                var layer = propsTargetLayer();
                if (!layer) { return; }
                var cur = (layer.data.adjust || {}).invert;
                Editor.setAdjust(layer.id, { invert: !cur });
                renderTexProps();
            });
        }
        var reset = document.getElementById('adj-reset');
        if (reset) {
            reset.addEventListener('click', function () {
                var layer = propsTargetLayer();
                if (!layer) { return; }
                Editor.setAdjust(layer.id, {
                    brightness: 100, saturate: 100, contrast: 100, hue: 0, invert: false
                });
                renderTexProps();
            });
        }

        /* keep the panel honest as the design changes. The thumbnail
           composite is heavy at 2048², so the high-frequency 'change'
           event (fires mid brush-stroke) is debounced; structural
           events refresh immediately. */
        var propsTimer = null;
        function renderTexPropsDebounced() {
            if (propsTimer) { return; }
            propsTimer = setTimeout(function () {
                propsTimer = null;
                if (!document.getElementById('tex-props').classList.contains('collapsed')) {
                    renderTexProps();
                }
            }, 300);
        }
        Editor.on('layers', renderTexProps);
        Editor.on('selection', renderTexProps);
        Editor.on('change', renderTexPropsDebounced);
        App.on('templateChanged', renderTexProps);
        renderTexProps();
    }

    /* ── reset the current texture to its default (discard edits) ── */
    function resetTexture() {
        if (!activeVariantData) {
            App.toast(t('reset_no_tex', 'Pick a garment first.'), 'error');
            return;
        }
        App.confirm(
            t('reset_title', 'Reset texture?'),
            t('reset_body', 'All your edits on this texture will be discarded and the original restored.'),
            { danger: true, confirmText: t('reset_confirm', 'Reset') }
        ).then(function (ok) {
            if (!ok) { return; }
            /* drop the saved workspace and reload the variant fresh —
               null out the key first so the current (edited) state is
               NOT stashed by loadVariant */
            if (currentWsKey) { delete variantStore[currentWsKey]; }
            currentWsKey = null;
            loadVariant(activeVariantData);
            App.toast(t('reset_done', 'Texture reset to default.'), 'success');
        });
    }

    function bindResetTexture() {
        var btn = document.getElementById('btn-reset-texture');
        if (btn) { btn.addEventListener('click', resetTexture); }
    }

    /* ── drag-to-scrub: click-drag any .scrub number field to change
          its value (premium touch — no tiny spinner arrows) ── */
    function makeScrub(input, step, min, max) {
        input.classList.add('scrub');
        var startX = 0, startVal = 0, dragging = false;
        input.addEventListener('mousedown', function (e) {
            dragging = true; startX = e.clientX;
            startVal = parseFloat(input.value) || 0;
            e.preventDefault();
            document.body.style.cursor = 'ew-resize';
        });
        window.addEventListener('mousemove', function (e) {
            if (!dragging) { return; }
            var v = startVal + Math.round((e.clientX - startX) / 3) * (step || 1);
            if (min !== undefined) { v = Math.max(min, v); }
            if (max !== undefined) { v = Math.min(max, v); }
            input.value = v;
            input.dispatchEvent(new Event('change'));
        });
        window.addEventListener('mouseup', function () {
            if (dragging) { dragging = false; document.body.style.cursor = ''; }
        });
        return input;
    }

    /* ── saved textures (snapshots) ───────────────────────────
       Save the current canvas and reuse it on ANY garment later.
       Persisted in localStorage (survives sessions). */
    var SNAP_KEY = 'apex_vehicles_snaps';

    function readSnaps() {
        try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); }
        catch (e) { return []; }
    }
    function writeSnaps(list) {
        try { localStorage.setItem(SNAP_KEY, JSON.stringify(list.slice(0, 8))); }
        catch (e) { App.toast(t('snap_full', 'Storage full — delete a saved texture first.'), 'error'); }
    }

    function renderSnaps() {
        var grid = document.getElementById('snap-grid');
        if (!grid) { return; }
        grid.innerHTML = '';
        var snaps = readSnaps();
        if (!snaps.length) {
            var empty = el('div', 'empty-state small');
            empty.appendChild(icon('fa-regular fa-images'));
            empty.appendChild(el('span', null, t('snaps_empty', 'Save the canvas here and reuse it on any garment')));
            grid.appendChild(empty);
            return;
        }
        snaps.forEach(function (snap, idx) {
            var cell = el('div', 'snap-cell');
            var img = document.createElement('img');
            img.src = snap.src;
            cell.appendChild(img);
            var del = el('button', 'snap-del');
            del.appendChild(icon('fa-xmark'));
            del.addEventListener('click', function (e) {
                e.stopPropagation();
                var list = readSnaps();
                list.splice(idx, 1);
                writeSnaps(list);
                renderSnaps();
            });
            cell.appendChild(del);
            cell.setAttribute('data-tip', t('snap_use', 'Add to the canvas as a layer'));
            cell.addEventListener('click', function () {
                addImageFillCanvas(snap.src, t('snap_layer', 'Saved texture'));
                App.toast(t('img_added', 'Image added as a layer.'), 'success');
            });
            grid.appendChild(cell);
        });
    }

    function bindSnaps() {
        var btn = document.getElementById('btn-snap-save');
        if (btn) {
            btn.addEventListener('click', function () {
                if (!Editor.layers.length) {
                    App.toast(t('export_nothing', 'Design something first.'), 'error');
                    return;
                }
                /* downscaled copy (localStorage is small) but big enough
                   to reuse as a texture base */
                var full = document.createElement('canvas');
                Editor.drawToCanvas(full);
                var s = Math.min(1, 768 / Math.max(full.width, full.height));
                var c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(full.width * s));
                c.height = Math.max(1, Math.round(full.height * s));
                c.getContext('2d').drawImage(full, 0, 0, c.width, c.height);
                var list = readSnaps();
                list.unshift({ src: c.toDataURL('image/png'), at: Date.now() });
                writeSnaps(list);
                renderSnaps();
                App.toast(t('snap_saved', 'Texture saved — find it under "Saved textures".'), 'success');
            });
        }
        renderSnaps();
    }


    /* ────────────────────────────────────────────────────────
       AI engines + support assistant

       The server owns both: which image engines exist (and whether
       each one has a key configured) and whether the assistant is
       available. Asking it once on open means the UI never offers an
       engine that would fail the moment it is used.
       ──────────────────────────────────────────────────────── */

    var aiEngines = [];
    var aiEngineId = null;

    function currentEngine() {
        var checked = document.querySelector('input[name="ai-engine"]:checked');
        return checked ? checked.value : (aiEngineId || '');
    }

    function renderEngines() {
        var box = document.getElementById('ai-engines');
        if (!box) { return; }
        box.innerHTML = '';

        /* One engine is not a choice — hide the picker entirely rather
           than show a radio group with a single option. */
        if (aiEngines.length < 2) {
            box.hidden = true;
            var lbl = box.previousElementSibling;
            if (lbl && lbl.classList.contains('micro-label')) { lbl.hidden = true; }
            return;
        }
        box.hidden = false;
        /* Put the heading back. The first call happens before the server
           has answered, when the list is empty and the branch above hides
           both — without this the picker returns with no label. */
        var shownLbl = box.previousElementSibling;
        if (shownLbl && shownLbl.classList.contains('micro-label')) { shownLbl.hidden = false; }

        aiEngines.forEach(function (eng) {
            var label = el('label', 'ai-engine' + (eng.ready ? '' : ' unavailable'));

            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'ai-engine';
            input.value = eng.id;
            input.checked = (eng.id === aiEngineId);
            input.disabled = !eng.ready;
            input.addEventListener('change', function () {
                if (input.checked) { aiEngineId = eng.id; }
            });
            label.appendChild(input);

            var body = el('span', 'ai-engine-body');
            body.appendChild(icon(eng.icon || 'fa-wand-magic-sparkles'));

            var textWrap = el('span', 'ai-engine-text');
            textWrap.appendChild(el('span', 'ai-engine-name', t(eng.labelKey, eng.id)));
            textWrap.appendChild(el('span', 'ai-engine-desc',
                eng.ready ? t(eng.descKey, '')
                          : t('ai_engine_nokey', 'No API key set for this engine')));
            body.appendChild(textWrap);
            body.appendChild(icon('fa-circle-check'));
            label.appendChild(body);
            box.appendChild(label);
        });
    }

    /* ────────────────────────────────────────────────────────
       SUPPORT ASSISTANT — a conversation, not a lookup

       This was one question in, one answer out: asking again wiped the
       previous answer, and the model was told nothing about what had
       already been said, so a natural follow-up ("and on Linux?") was
       meaningless to it.

       The CLIENT owns the transcript — the server stays stateless and
       receives a capped slice with each turn. That keeps server memory
       flat no matter how many players are chatting, and lets the history
       survive a studio close without anything to expire.
       ──────────────────────────────────────────────────────── */

    /* Openers, shown while the transcript is empty. Each is a whole
       sentence in the dictionary — never assembled from parts, which
       could never be translated. */
    var SUPPORT_QUICK = [
        { key: 'support_q_install', icon: 'fa-box-open' },
        { key: 'support_q_export',  icon: 'fa-file-export' },
        { key: 'support_q_access',  icon: 'fa-key' },
        { key: 'support_q_ai',      icon: 'fa-wand-magic-sparkles' },
        { key: 'support_q_lang',    icon: 'fa-language' }
    ];

    /* One-tap follow-ups. Multi-turn is only worth having if asking the
       next question costs nothing. */
    var SUPPORT_FOLLOWUPS = [
        { key: 'support_f_steps',   icon: 'fa-list-ol' },
        { key: 'support_f_more',    icon: 'fa-circle-info' },
        { key: 'support_f_example', icon: 'fa-lightbulb' }
    ];

    var SUPPORT_CHAT_KEY = 'apex_vehicles_support_chat';
    var SUPPORT_MAX_KEEP = 24;    /* messages kept in the transcript  */
    var SUPPORT_MAX_SEND = 8;     /* turns handed to the model        */
    var SUPPORT_MAX_CHARS = 600;  /* per message, when sent           */

    var supportChat = [];         /* [{ role:'user'|'bot', text, fail }] */
    var supportBusy = false;
    var supportReq = 0;

    function loadSupportChat() {
        try {
            var raw = localStorage.getItem(SUPPORT_CHAT_KEY);
            var arr = raw ? JSON.parse(raw) : null;
            if (!Array.isArray(arr)) { return; }
            /* Anything on disk is untrusted — it may be from an older
               build, or hand-edited. Keep only well-formed entries. */
            supportChat = arr.filter(function (m) {
                return m && typeof m.text === 'string' && m.text !== ''
                    && (m.role === 'user' || m.role === 'bot');
            }).slice(-SUPPORT_MAX_KEEP);
        } catch (e) { supportChat = []; }
    }

    function saveSupportChat() {
        try {
            localStorage.setItem(SUPPORT_CHAT_KEY,
                JSON.stringify(supportChat.slice(-SUPPORT_MAX_KEEP)));
        } catch (e) { /* quota / private mode — the chat still works */ }
    }

    /* Model output is TEXT and is never handed to innerHTML. Every line
       goes in through textContent; the only markup is the list structure
       built right here. */
    function formatAnswer(text) {
        var frag = document.createDocumentFragment();
        var lines = String(text || '').split(/\r?\n/);
        var list = null, listType = null;

        function closeList() {
            if (list) { frag.appendChild(list); list = null; listType = null; }
        }

        lines.forEach(function (raw) {
            var line = raw.replace(/\s+$/, '');
            if (!line.trim()) { closeList(); return; }

            var ordered = /^\s*\d+[.)]\s+/.test(line);
            var bulleted = /^\s*[-\u2022*]\s+/.test(line);

            if (ordered || bulleted) {
                var want = ordered ? 'ol' : 'ul';
                if (listType !== want) {
                    closeList();
                    list = el(want, 'support-list');
                    listType = want;
                }
                list.appendChild(el('li', null,
                    line.replace(/^\s*(?:\d+[.)]|[-\u2022*])\s+/, '')));
                return;
            }
            closeList();
            frag.appendChild(el('p', 'support-p', line));
        });
        closeList();
        return frag;
    }

    function markCopied(btn) {
        var label = btn.querySelector('span');
        if (!label) { return; }
        var was = label.textContent;
        label.textContent = t('support_copied', 'Copied');
        btn.classList.add('done');
        setTimeout(function () {
            label.textContent = was;
            btn.classList.remove('done');
        }, 1400);
    }

    function supportMessageEl(msg, index) {
        var isUser = msg.role === 'user';
        var wrap = el('div', 'support-msg ' + (isUser ? 'user' : 'bot')
            + (msg.fail ? ' fail' : ''));

        var av = el('div', 'support-av');
        av.appendChild(icon(isUser ? 'fa-user'
            : (msg.fail ? 'fa-triangle-exclamation' : 'fa-robot')));
        wrap.appendChild(av);

        var body = el('div', 'support-body');
        var bubble = el('div', 'support-bubble');
        if (isUser) { bubble.textContent = msg.text; }
        else { bubble.appendChild(formatAnswer(msg.text)); }
        body.appendChild(bubble);

        /* Actions belong to answers: copy what you were told, or ask the
           same thing again when it failed. */
        if (!isUser) {
            var acts = el('div', 'support-acts');

            var copy = el('button', 'support-act');
            copy.type = 'button';
            copy.appendChild(icon('fa-copy'));
            copy.appendChild(el('span', null, t('support_copy', 'Copy')));
            copy.addEventListener('click', function () {
                copyText(msg.text);
                markCopied(copy);
            });
            acts.appendChild(copy);

            if (msg.fail) {
                var again = el('button', 'support-act');
                again.type = 'button';
                again.appendChild(icon('fa-rotate-right'));
                again.appendChild(el('span', null, t('support_retry', 'Try again')));
                again.addEventListener('click', function () { retrySupport(index); });
                acts.appendChild(again);
            }
            body.appendChild(acts);
        }

        wrap.appendChild(body);
        return wrap;
    }

    function renderSupportChat() {
        var box = document.getElementById('support-chat');
        if (!box) { return; }
        box.innerHTML = '';

        if (!supportChat.length && !supportBusy) {
            var empty = el('div', 'support-empty');
            empty.appendChild(icon('fa-comments'));
            empty.appendChild(el('p', null,
                t('support_hint', 'Ask about this script and get an answer in your language.')));
            box.appendChild(empty);
        } else {
            supportChat.forEach(function (m, i) {
                box.appendChild(supportMessageEl(m, i));
            });
        }

        /* The thinking bubble is state, not a message — it never enters
           the transcript, so it can never be saved or sent to the model. */
        if (supportBusy) {
            var wait = el('div', 'support-msg bot');
            var av = el('div', 'support-av');
            av.appendChild(icon('fa-robot'));
            wait.appendChild(av);
            var body = el('div', 'support-body');
            var bubble = el('div', 'support-bubble typing');
            bubble.appendChild(el('span', 'dot'));
            bubble.appendChild(el('span', 'dot'));
            bubble.appendChild(el('span', 'dot'));
            bubble.setAttribute('aria-label', t('support_thinking', 'Looking that up…'));
            body.appendChild(bubble);
            wait.appendChild(body);
            box.appendChild(wait);
        }

        box.scrollTop = box.scrollHeight;

        var newBtn = document.getElementById('btn-support-new');
        if (newBtn) { newBtn.hidden = !supportChat.length; }
    }

    function setSupportBusy(busy) {
        supportBusy = busy;
        var btn = document.getElementById('btn-support-send');
        if (btn) {
            btn.disabled = busy;
            var ic = btn.querySelector('i');
            if (ic) {
                ic.className = busy ? 'fa-solid fa-spinner fa-spin'
                                    : 'fa-solid fa-paper-plane';
            }
        }
        var input = document.getElementById('support-input');
        if (input) { input.disabled = busy; }
        var quick = document.getElementById('support-quick');
        if (quick) {
            [].forEach.call(quick.querySelectorAll('button'), function (b) {
                b.disabled = busy;
            });
        }
    }

    /* What the model is allowed to see. Failed answers are skipped —
       they are not something the assistant said, and feeding an error
       string back teaches it to repeat the error. */
    function supportHistory() {
        var out = [];
        for (var i = 0; i < supportChat.length; i++) {
            var m = supportChat[i];
            if (m.role === 'bot' && m.fail) { continue; }
            out.push({
                role: m.role === 'bot' ? 'assistant' : 'user',
                text: String(m.text || '').slice(0, SUPPORT_MAX_CHARS)
            });
        }
        return out.slice(-SUPPORT_MAX_SEND);
    }

    function askSupport(question) {
        if (supportBusy) { return; }
        question = String(question || '').trim();
        if (question.length < 3) {
            App.toast(t('support_err_short', 'Type a question first.'), 'error');
            return;
        }

        /* Built BEFORE the new question is pushed, or it would arrive
           twice — once as history, once as the question. */
        var history = supportHistory();

        supportChat.push({ role: 'user', text: question });
        if (supportChat.length > SUPPORT_MAX_KEEP) {
            supportChat = supportChat.slice(-SUPPORT_MAX_KEEP);
        }
        saveSupportChat();

        supportReq++;
        setSupportBusy(true);
        renderSupportChat();
        renderSupportQuick();

        var input = document.getElementById('support-input');
        if (input) { input.value = ''; autoGrowSupport(); }

        App.nui('aiSupport', {
            requestId: String(supportReq),
            question: question,
            history: history
        });

        /* The server always answers, but never let the panel hang if a
           provider stalls past its own timeout. */
        var mine = supportReq;
        setTimeout(function () {
            if (supportBusy && mine === supportReq) {
                receiveSupportAnswer({
                    ok: false,
                    text: t('support_err_timeout', 'No answer came back. Try again in a moment.')
                });
            }
        }, 45000);
    }

    function receiveSupportAnswer(p) {
        if (!supportBusy) { return; }        /* a late duplicate */
        setSupportBusy(false);
        var ok = !!(p && p.ok);
        var text = (p && p.text) || t('ai_err_provider', 'The AI provider returned an error.');
        supportChat.push({ role: 'bot', text: text, fail: !ok });
        if (supportChat.length > SUPPORT_MAX_KEEP) {
            supportChat = supportChat.slice(-SUPPORT_MAX_KEEP);
        }
        saveSupportChat();
        renderSupportChat();
        renderSupportQuick();
    }

    /* Re-ask the question that produced a failed answer. Drops the failed
       reply AND the question, because askSupport re-adds the question. */
    function retrySupport(index) {
        if (supportBusy) { return; }
        var q = null;
        for (var i = index - 1; i >= 0; i--) {
            if (supportChat[i].role === 'user') { q = supportChat[i].text; break; }
        }
        if (!q) { return; }
        supportChat.splice(i, index - i + 1);
        saveSupportChat();
        renderSupportChat();
        askSupport(q);
    }

    function clearSupportChat() {
        supportChat = [];
        saveSupportChat();
        renderSupportChat();
        renderSupportQuick();
    }

    /* Openers while the chat is empty, follow-ups once there is something
       to follow up on. */
    function renderSupportQuick() {
        var box = document.getElementById('support-quick');
        if (!box) { return; }
        box.innerHTML = '';

        var lastIsAnswer = supportChat.length
            && supportChat[supportChat.length - 1].role === 'bot'
            && !supportChat[supportChat.length - 1].fail;
        var set = lastIsAnswer ? SUPPORT_FOLLOWUPS
            : (supportChat.length ? [] : SUPPORT_QUICK);

        set.forEach(function (q) {
            var text = t(q.key, '');
            if (!text) { return; }
            var b = el('button', 'support-chip');
            b.type = 'button';
            b.disabled = supportBusy;
            b.appendChild(icon(q.icon));
            b.appendChild(el('span', null, text));
            b.addEventListener('click', function () { askSupport(text); });
            box.appendChild(b);
        });
        box.hidden = !box.children.length;
    }

    /* A one-line box that grows with what you type, up to four lines. */
    function autoGrowSupport() {
        var input = document.getElementById('support-input');
        if (!input) { return; }
        /* ⚠ An EMPTY box is one line, full stop. Chromium counts a
           wrapping placeholder in scrollHeight, so measuring here would
           size the composer to fit text nobody typed — and every
           language whose placeholder is longer than the English one
           would open two lines tall. Hand the height back to the CSS. */
        if (!input.value) { input.style.height = ''; return; }
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 78) + 'px';
    }

    function wireSupportChat() {
        var sendBtn = document.getElementById('btn-support-send');
        var input = document.getElementById('support-input');
        if (sendBtn && input) {
            sendBtn.addEventListener('click', function () { askSupport(input.value); });
            input.addEventListener('input', autoGrowSupport);
            input.addEventListener('keydown', function (e) {
                e.stopPropagation();      /* canvas shortcuts must not fire */
                /* Enter sends, Shift+Enter is a new line — what every
                   chat box on earth does. */
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    askSupport(input.value);
                }
            });
        }
        var newBtn = document.getElementById('btn-support-new');
        if (newBtn) {
            newBtn.addEventListener('click', function () { clearSupportChat(); });
        }
        loadSupportChat();
        renderSupportChat();
        renderSupportQuick();
    }

    /* Which half of the AI pane is showing. Remembered per player so
       someone who lives in the assistant does not land on Design every
       time they reopen the studio. */
    var AI_MODE_KEY = 'apex_ai_pane_mode';
    var aiMode = 'design';
    var aiModeWanted = 'design';   /* what the player last chose */

    function setAiMode(mode, remember) {
        if (mode !== 'support') { mode = 'design'; }
        /* Never strand the player on a side the server turned off. */
        var supportBtn = document.getElementById('btn-ai-mode-support');
        if (mode === 'support' && supportBtn && supportBtn.hidden) { mode = 'design'; }
        aiMode = mode;

        var design = document.getElementById('ai-mode-design');
        var support = document.getElementById('ai-mode-support');
        if (design) { design.hidden = (mode !== 'design'); }
        if (support) { support.hidden = (mode !== 'support'); }

        var modes = document.getElementById('ai-modes');
        if (modes) {
            [].forEach.call(modes.querySelectorAll('[data-ai-mode]'), function (b) {
                var on = b.getAttribute('data-ai-mode') === mode;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }
        /* The pane head labels whichever side is open. */
        var head = document.querySelector('.dock-pane[data-pane="ai"] .pane-head .micro-label');
        if (head) {
            head.textContent = (mode === 'support')
                ? t('support_label', 'Need help?')
                : t('ai_target_label', 'What to generate');
        }
        if (remember) {
            try { localStorage.setItem(AI_MODE_KEY, mode); } catch (e) { /* ok */ }
        }
        if (mode === 'support') {
            var input = document.getElementById('support-input');
            if (input) { input.focus(); }
        }
    }

    function wireAiModes() {
        var modes = document.getElementById('ai-modes');
        if (!modes) { return; }
        [].forEach.call(modes.querySelectorAll('[data-ai-mode]'), function (b) {
            b.addEventListener('click', function () {
                setAiMode(b.getAttribute('data-ai-mode'), true);
            });
        });
        var saved = null;
        try { saved = localStorage.getItem(AI_MODE_KEY); } catch (e) { /* ok */ }
        /* Kept, because this runs BEFORE the server says whether the
           assistant exists — at which point the Assistance tab is still
           hidden and setAiMode's guard can only answer Design. The
           availability handler replays it once the tab is real. */
        aiModeWanted = (saved === 'support') ? 'support' : 'design';
        setAiMode(aiModeWanted, false);
    }

    function wireAiExtras() {
        wireAiModes();
        wireSupportChat();

        App.on('aiSupportResult', function (p) {
            receiveSupportAnswer(p);
        });

        /* Ask the server what it actually supports, once per open. */
        App.on('open', function () {
            App.nui('aiEngines').then(function (info) {
                info = info || {};
                aiEngines = info.engines || [];
                aiEngineId = info.defaultEngine
                    || (aiEngines[0] && aiEngines[0].id) || null;
                /* Never preselect an engine that has no key. */
                var chosen = null;
                aiEngines.forEach(function (e) {
                    if (!chosen && e.ready) { chosen = e.id; }
                    if (e.id === aiEngineId && e.ready) { chosen = e.id; }
                });
                if (chosen) { aiEngineId = chosen; }
                renderEngines();

                /* Hide the whole Assistance tab when the server has no
                   key — a tab that opens onto an explanation of why it
                   does not work is worse than no tab. */
                var supportBtn = document.getElementById('btn-ai-mode-support');
                if (supportBtn) { supportBtn.hidden = !info.support; }
                /* One tab is not a choice — drop the switch entirely. */
                var modesBar = document.getElementById('ai-modes');
                if (modesBar) { modesBar.hidden = !info.support; }
                var block = document.getElementById('support-block');
                if (block) { block.hidden = !info.support; }
                if (info.support) {
                    renderSupportQuick();
                    /* The tab exists now, so the remembered choice can
                       finally be honoured. */
                    setAiMode(aiModeWanted, false);
                } else if (aiMode === 'support') {
                    setAiMode('design', false);
                }
            });
        });

        /* Language changes rebuild the dictionary, so redraw the parts
           that were built from it. */
        App.on('boot', function () {
            renderEngines();
            /* Re-label the pane head in the new language. */
            setAiMode(aiMode, false);
            /* Bubbles keep the words they were written with; the chips,
               the empty state and the per-answer actions must not. */
            renderSupportChat();
            /* innerHTML='' wipes the translatable span that ships in the
               markup, so this has to be rebuilt, not repaired. */
            renderAiHistory();
            /* The chip PHRASES stay English on purpose — clicking one
               pastes it verbatim into the prompt, and the model reads
               English. Only their section label is translated, and this
               redraw keeps that label in step with the language. */
            try { renderAiChips(); } catch (e) { /* ok */ }
            if (document.getElementById('support-quick')) { renderSupportQuick(); }
        });
    }

    /* ────────────────────────────────────────────────────────
       Export pane
       ──────────────────────────────────────────────────────── */

    var exportBusy = false;
    var exportSeq = 0;         /* so a late timeout cannot fire on a new run */

    function exportMode() {
        var checked = document.querySelector('input[name="export-mode"]:checked');
        return checked ? checked.value : 'live';
    }

    /* Which textures of the active garment have a design on them.
       The one on screen counts if the canvas has layers; the others
       count if they left a workspace behind in variantStore. */
    var exportSkip = {};    /* 'tplId::variantId' → true when unchecked */

    function editedVariants() {
        var tpl = App.state.activeTemplate;
        if (!tpl) { return []; }
        var texs = (tpl.textures && tpl.textures.length)
            ? tpl.textures
            : [{ id: 'a', txn: tpl.txn, w: Editor.getWidth(), h: Editor.getHeight() }];
        var out = [];
        texs.forEach(function (v) {
            var key = tpl.id + '::' + v.id;
            var isCurrent = (activeVariantData && v.id === activeVariantData.id)
                || (!activeVariantData && v === texs[0]);
            var edited = isCurrent ? Editor.layers.length > 0 : !!variantStore[key];
            if (edited) { out.push({ v: v, key: key, current: isCurrent }); }
        });
        return out;
    }

    function exportSelection() {
        return editedVariants().filter(function (e) { return !exportSkip[e.key]; });
    }

    function renderExportSummary() {
        var box = document.getElementById('export-summary');
        if (!box) { return; }
        box.innerHTML = '';

        var tpl = App.state.activeTemplate;
        if (!tpl || !tpl.txn) {
            var noTpl = el('div', 'empty-state small');
            noTpl.appendChild(icon('fa-cube'));
            noTpl.appendChild(el('span', null, t('export_no_template', 'Pick a 3D template on the left to set the export target')));
            box.appendChild(noTpl);
            return;
        }

        var list = editedVariants();
        if (!list.length) {
            var empty = el('div', 'empty-state small');
            empty.appendChild(icon('fa-car'));
            empty.appendChild(el('span', null, t('export_summary_empty', 'Nothing to export yet — design something first')));
            box.appendChild(empty);
            return;
        }

        var allToggle = document.getElementById('export-all-toggle');
        var showAll = !allToggle || allToggle.checked;

        list.forEach(function (entry) {
            var v = entry.v;
            var row = el('label', 'export-tex-row' + (entry.current ? ' current' : ''));

            /* With "All edited" off, only the texture on screen goes out —
               the checkboxes are then meaningless, so they're hidden. */
            var check = null;
            if (showAll) {
                check = makeInput('checkbox');
                check.checked = !exportSkip[entry.key];
                check.addEventListener('change', function () {
                    exportSkip[entry.key] = !check.checked;
                    updateExportButton();
                });
                row.appendChild(check);
            } else if (!entry.current) {
                return;
            }

            var thumb = el('div', 'export-thumb');
            var img = document.createElement('img');
            /* only the live canvas can be thumbnailed cheaply; stashed
               variants show their letter instead of a stale picture */
            if (entry.current) {
                img.src = Editor.thumbnail(96);
                thumb.appendChild(img);
            } else {
                thumb.appendChild(el('span', 'export-thumb-letter mono',
                    String(v.id || '?').toUpperCase()));
            }
            row.appendChild(thumb);

            var info = el('div', 'export-info');
            info.appendChild(el('div', 'mono', v.txn || tpl.txn));
            var w = entry.current ? Editor.getWidth() : (v.w || Editor.getWidth());
            var h = entry.current ? Editor.getHeight() : (v.h || Editor.getHeight());
            info.appendChild(el('div', 'export-sub',
                t('export_target', '%s · %d×%dpx', tpl.name, w, h)));
            if (entry.current) {
                info.appendChild(el('span', 'export-badge', t('export_on_screen', 'on screen')));
            }
            row.appendChild(info);
            box.appendChild(row);
        });

        updateExportButton();

        /* prefill the export name from the template / project name */
        var nameInput = document.getElementById('export-name');
        if (nameInput && !nameInput.value) {
            nameInput.value = String(tpl.id || App.state.project.name || 'my_design')
                .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
        }
    }

    /* Label the run button with what it will actually do, so a
       multi-texture export is never a surprise. */
    function updateExportButton() {
        var btn = document.getElementById('btn-export-run');
        if (!btn) { return; }
        var span = btn.querySelector('span');
        if (!span) { return; }
        var allToggle = document.getElementById('export-all-toggle');
        var n = (allToggle && allToggle.checked) ? exportSelection().length
            : (editedVariants().some(function (e) { return e.current; }) ? 1 : 0);
        span.textContent = n > 1
            ? t('export_run_n', 'Export %d textures', n)
            : t('export_run', 'Run Export');
        btn.disabled = exportBusy || n === 0;
    }

    /* Per-mode guidance under the mode cards — each mode has a real
       prerequisite, and silently failing on it is the #1 support ask. */
    var EXPORT_NOTES = {
        package: ['export_note_package',
            'Creates exports/<name>/ — a runtime retexture resource. Copy it into your server and add "ensure <name>".'],
        vehicle: ['export_note_vehicle',
            'Stages the skin, then run tools/build_vehicle.bat on this PC. It rebuilds the ORIGINAL car resource (model, extras & meta) with your skin baked in — the vehicle keeps all its parts.'],
        live: ['export_note_live',
            'Applies instantly to everyone online — no restart, nothing to install. It also persists, so players who join later get it too.']
    };

    function renderExportNote() {
        var box = document.getElementById('export-mode-note');
        if (!box) { return; }
        var def = EXPORT_NOTES[exportMode()] || EXPORT_NOTES.package;
        box.innerHTML = '';
        box.appendChild(icon('fa-circle-info'));
        box.appendChild(el('span', null, t(def[0], def[1])));
    }

    /* Build the FULL game texture: the original sheet at native
       resolution with the editor's design placed into the UV-crop
       region (1:1 pixels). Without a crop, the canvas IS the sheet. */
    function buildExportPng(done) {
        var crop = (window.Viewer && Viewer.uvCrop) ? Viewer.uvCrop() : null;
        var v = activeVariantData;
        if (!crop || !v || !v.png) { done(Editor.compositeDataURL()); return; }
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            try {
                var c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                var g = c.getContext('2d');
                g.drawImage(img, 0, 0);                       /* original, untouched */
                var over = document.createElement('canvas');
                Editor.drawToCanvas(over);                    /* the design (crop-sized) */
                g.drawImage(over,
                    Math.round(crop.u0 * c.width), Math.round(crop.v0 * c.height),
                    Math.round((crop.u1 - crop.u0) * c.width),
                    Math.round((crop.v1 - crop.v0) * c.height));
                done(c.toDataURL('image/png'));
            } catch (e) {
                console.error('[export] full-sheet rebuild failed:', e);
                done(Editor.compositeDataURL());
            }
        };
        img.onerror = function () { done(Editor.compositeDataURL()); };
        img.src = TPL_BASE + v.png;
    }

    /* Downscale an exported sheet when the user picked a fixed output
       size. 'native' returns the PNG untouched — the only safe choice
       for the real-.ytd path, which needs the original dimensions. */
    function applyExportRes(png, done) {
        var sel = document.getElementById('export-res');
        var want = sel ? sel.value : 'native';
        if (want === 'native') { done(png); return; }
        var px = parseInt(want, 10);
        if (!px) { done(png); return; }
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            /* contain-fit: never distort, never upscale past native */
            var s = Math.min(px / img.naturalWidth, px / img.naturalHeight, 1);
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.naturalWidth * s));
            c.height = Math.max(1, Math.round(img.naturalHeight * s));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            done(c.toDataURL('image/png'));
        };
        img.onerror = function () { done(png); };
        img.src = png;
    }

    /* Switch the editor to a variant and resolve once its canvas is
       ready. Used to walk every edited texture during a multi-texture
       export — loadVariant already restores each one's own workspace,
       so this reuses the exact code path the user sees. */
    function switchToVariant(v) {
        return new Promise(function (resolve) {
            var settled = false;
            function fin() {
                if (settled) { return; }
                settled = true;
                App.off('contentReady', fin);
                /* one frame so the composite reflects the new layers */
                setTimeout(resolve, 40);
            }
            App.on('contentReady', fin);
            loadVariant(v);
            setTimeout(fin, 8000);   /* never hang the export on a bad texture */
        });
    }

    function runExport() {
        if (exportBusy) { return; }
        var ctxInfo = slotContext();
        var tpl = App.state.activeTemplate;
        if (!tpl || !ctxInfo.txn) {
            App.toast(t('export_pick_template', 'Pick a 3D template first — it sets what gets retextured.'), 'error');
            return;
        }
        var allToggle = document.getElementById('export-all-toggle');
        var jobs = (allToggle && allToggle.checked)
            ? exportSelection()
            : editedVariants().filter(function (e) { return e.current; });
        if (!jobs.length) {
            App.toast(t('export_nothing', 'Design something first.'), 'error');
            return;
        }
        var nameInput = document.getElementById('export-name');
        var name = String((nameInput && nameInput.value) || '').trim();
        if (!name) {
            App.toast(t('export_need_name', 'Give the export a name.'), 'error');
            return;
        }

        exportBusy = true;
        exportSeq++;
        /* A server that never answers must not disable the button for
           the rest of the session. The flag is module-scope, so closing
           and reopening the studio would not clear it either. */
        (function (mine) {
            setTimeout(function () {
                if (exportBusy && mine === exportSeq) {
                    exportBusy = false;
                    var stuck = document.getElementById('btn-export-run');
                    if (stuck) { stuck.disabled = false; }
                    updateExportButton();
                    App.toast(t('export_err_timeout',
                        'The export did not answer. Check the server console and try again.'), 'error');
                }
            }, 120000);
        }(exportSeq));

        var btn = document.getElementById('btn-export-run');
        if (btn) { btn.disabled = true; }
        var result = document.getElementById('export-result');
        if (result) { result.hidden = true; }
        var wantDownload = document.getElementById('export-download-toggle');
        wantDownload = wantDownload && wantDownload.checked;

        /* Remember what was on screen so a multi-texture run puts the
           user back exactly where they were when it finishes. */
        var restoreTo = activeVariantData;
        var textures = [];

        function finish() {
            /* txd holds the FULL original path; only its last segment
               (the texture name) differs per variant, so rebuild it
               from the template's txd for each one. */
            App.nui('exportRun', {
                mode: exportMode(),
                name: name,
                slot: { kind: ctxInfo.kind, id: ctxInfo.id },
                textures: textures
            });
            App.toast(textures.length > 1
                ? t('export_started_n', 'Exporting %d textures…', textures.length)
                : t('export_started', 'Export started…'), 'info');

            if (restoreTo && (!activeVariantData || activeVariantData.id !== restoreTo.id)) {
                switchToVariant(restoreTo);
            }
        }

        function step(i) {
            if (i >= jobs.length) { finish(); return; }
            var entry = jobs[i];
            var v = entry.v;

            function capture() {
                buildExportPng(function (png) {
                    applyExportRes(png, function (finalPng) {
                        var txn = v.txn || ctxInfo.txn;
                        var txd = String(ctxInfo.txd || '').replace(/\/[^/]*$/, '/' + txn);
                        textures.push({ txd: txd, txn: txn, png: finalPng });
                        if (wantDownload) { downloadDataUrl(finalPng, txn + '.png'); }
                        step(i + 1);
                    });
                });
            }

            if (entry.current || (activeVariantData && activeVariantData.id === v.id)) {
                capture();
            } else {
                switchToVariant(v).then(capture);
            }
        }

        step(0);
    }

    function bindExportPane() {
        var btn = document.getElementById('btn-export-run');
        if (btn) { btn.addEventListener('click', runExport); }

        /* the note and the run-button label both follow the mode */
        document.querySelectorAll('input[name="export-mode"]').forEach(function (r) {
            r.addEventListener('change', function () {
                renderExportNote();
                updateExportButton();
            });
        });
        renderExportNote();
        /* Built at DOMContentLoaded, i.e. before the boot payload brings
           the dictionary — so redraw once it exists. Boot is re-emitted
           on a language change, which covers that too. */
        App.on('boot', function () { renderExportNote(); updateExportButton(); });

        var allToggle = document.getElementById('export-all-toggle');
        if (allToggle) {
            allToggle.addEventListener('change', function () {
                renderExportSummary();
            });
        }

        /* ────────────────────────────────────────────────────────
           Export result — the "what now?" panel

           A toast saying "Export complete" leaves the owner guessing
           the path, the folder name and the server.cfg line. This
           shows all three ready to copy, the numbered steps that turn
           what was written into a running resource, and how to see the
           design in game.

           ⚠ Every sentence is a WHOLE, STATIC string passed through
           t(): the dictionary is an exact-key lookup, so a sentence
           built with + around a slug could never match a translation.
           The slug and the path are DATA and get their own rows.
           ──────────────────────────────────────────────────────── */

        function resultLabel(text) { return el('div', 'result-label', text); }

        /* A real <input> so CEF's copy path can reach the text, styled
           to read as a value rather than a form field. */
        function copyRow(value) {
            var row = el('div', 'result-copy');
            var input = document.createElement('input');
            input.type = 'text';
            input.readOnly = true;
            input.value = value;
            input.className = 'result-copy-value mono';
            /* The editor listens for keys globally — without this, typing
               here would fire canvas shortcuts. */
            input.addEventListener('keydown', function (e) { e.stopPropagation(); });
            input.addEventListener('focus', function () { input.select(); });
            row.appendChild(input);

            var btn = el('button', 'btn btn-ghost result-copy-btn');
            btn.type = 'button';
            btn.appendChild(icon('fa-copy'));
            btn.appendChild(el('span', null, t('btn_copy', 'Copy')));
            btn.addEventListener('click', function () {
                copyText(value);
                App.toast(t('copied', 'Copied to clipboard.'), 'success');
            });
            row.appendChild(btn);
            return row;
        }

        function resultStep(n, title, detail) {
            var row = el('div', 'result-step');
            row.appendChild(el('span', 'result-step-n mono', String(n)));
            var body = el('div', 'result-step-body');
            body.appendChild(el('div', 'result-step-title', title));
            if (detail) { body.appendChild(el('div', 'result-step-detail', detail)); }
            row.appendChild(body);
            return row;
        }

        function renderExportResult(p) {
            var box = document.getElementById('export-result');
            if (!box) { return; }
            box.innerHTML = '';
            box.hidden = false;
            box.classList.toggle('ok', !!p.ok);
            box.classList.toggle('fail', !p.ok);

            var head = el('div', 'result-head');
            head.appendChild(icon(p.ok ? 'fa-circle-check' : 'fa-circle-exclamation'));
            head.appendChild(el('span', 'result-msg', p.message || ''));
            box.appendChild(head);
            if (!p.ok) { return; }

            /* ── LIVE: nothing to install, so say what happened, where
                  it applies, and how to take it back off. ── */
            if (p.mode === 'live') {
                box.appendChild(el('div', 'result-note',
                    t('export_live_applied', 'It is on every player right now, and it survives a restart.')));

                if (typeof p.players === 'number') {
                    var stats = el('div', 'result-stats mono');
                    stats.appendChild(el('span', null,
                        String(p.players) + ' ' + t('export_stat_players', 'players')));
                    stats.appendChild(el('span', null,
                        String(p.textures || 0) + ' ' + t('export_stat_textures', 'textures')));
                    box.appendChild(stats);
                }

                box.appendChild(resultLabel(t('export_how_label', 'HOW TO SEE IT')));
                box.appendChild(el('div', 'result-note',
                    t('export_wear_live', "Spawn the vehicle and the design is already on it. A car that is already spawned picks it up when it next streams in.")));
                box.appendChild(resultLabel(t('export_undo_label', 'TO UNDO IT')));
                box.appendChild(copyRow('/vehicleliveclear'));
                return;
            }

            /* ── PACKAGE: a folder the owner still has to install. ── */
            var slug = p.slug || 'my_export';

            box.appendChild(resultLabel(t('export_where_label', 'WHERE IT WAS WRITTEN')));
            box.appendChild(copyRow(p.path || ''));
            box.appendChild(resultLabel(t('export_folder_label', 'FOLDER NAME')));
            box.appendChild(copyRow(slug));
            box.appendChild(resultLabel(t('export_cfg_label', 'ADD TO SERVER.CFG')));
            box.appendChild(copyRow('ensure ' + slug));

            box.appendChild(resultLabel(t('export_steps_label', 'WHAT TO DO NOW')));
            var steps = el('div', 'result-steps');
            if (p.nested) {
                steps.appendChild(resultStep(1,
                    t('export_step_move_folder', 'Copy the folder into resources/'),
                    t('export_step_move_folder_d', 'The whole folder, exactly as it is.')));
                steps.appendChild(resultStep(2,
                    t('export_step_cfg', 'Add the line above to server.cfg'),
                    t('export_step_cfg_d', 'Anywhere after your framework.')));
                steps.appendChild(resultStep(3,
                    t('export_step_restart', 'Restart the server'),
                    t('export_step_restart_d', 'Or run refresh, then the line above, in the console.')));
            } else {
                steps.appendChild(resultStep(1,
                    t('export_step_make_folder', 'Make a folder with the name above'),
                    t('export_step_make_folder_d', 'Anywhere inside resources/.')));
                steps.appendChild(resultStep(2,
                    t('export_step_move_files', 'Move the files into it and drop the prefix'),
                    t('export_step_move_files_d', 'They are together in the folder above and all share the same prefix.')));
                steps.appendChild(resultStep(3,
                    t('export_step_cfg', 'Add the line above to server.cfg'),
                    t('export_step_cfg_d', 'Anywhere after your framework.')));
                steps.appendChild(resultStep(4,
                    t('export_step_restart', 'Restart the server'),
                    t('export_step_restart_d', 'Or run refresh, then the line above, in the console.')));
            }
            box.appendChild(steps);

            /* The files named exactly as they are on disk, so the owner
               matches them one by one instead of guessing. */
            if (p.files && p.files.length) {
                var det = el('details', 'result-files');
                det.appendChild(el('summary', null,
                    String(p.files.length) + ' ' + t('export_files_label', 'files written')));
                var list = el('div', 'result-file-list mono');
                p.files.forEach(function (f) {
                    list.appendChild(el('div', null, (p.prefix || '') + f));
                });
                det.appendChild(list);
                box.appendChild(det);
            }

            box.appendChild(resultLabel(t('export_how_label', 'HOW TO SEE IT')));
            box.appendChild(el('div', 'result-note',
                t('export_wear_package', "The pack holds only the texture — the car itself must already be streamed by your server, so install this next to the vehicle pack, not instead of it. It also selects the right livery slot for you.")));
        }

        wireAiExtras();

        App.on('exportResult', function (p) {
            exportBusy = false;
            exportSeq++;              /* stands the watchdog down */
            var runBtn = document.getElementById('btn-export-run');
            if (runBtn) { runBtn.disabled = false; }
            updateExportButton();

            try { renderExportResult(p); }
            catch (e) { console.error('[export] result panel', e); }

            App.toast(p.message || (p.ok ? t('export_done', 'Export complete.') : t('export_failed', 'Export failed.')),
                p.ok ? 'success' : 'error');
        });
    }

    /* ────────────────────────────────────────────────────────
       Pane → modal bridge (web parity): the Projects and Export
       dock panes became MODALS. The pane element (with every id
       the render functions and NUI flows target) is REPARENTED
       into the modal body on open and moved back home on close,
       so all bindings survive untouched.
       ──────────────────────────────────────────────────────── */

    function openPaneModal(pane, opts, onOpen) {
        var paneEl = document.querySelector('.dock-pane[data-pane="' + pane + '"]');
        if (!paneEl) { return; }
        var home = paneEl.parentNode;
        paneEl.classList.add('in-modal');
        App.modal(paneEl, {
            title: opts.title,
            icon: opts.icon,
            wide: !!opts.wide,
            onClose: function () {
                paneEl.classList.remove('in-modal');
                if (home) { home.appendChild(paneEl); }
            }
        });
        if (onOpen) { onOpen(); }
    }

    function openProjectsModal() {
        openPaneModal('projects',
            { title: t('dock_projects', 'Projects'), icon: 'fa-folder-open', wide: true },
            requestProjects);
    }

    function openExportModal() {
        openPaneModal('export',
            { title: t('topbar_export', 'Export'), icon: 'fa-file-export' },
            renderExportSummary);
    }

    /* ────────────────────────────────────────────────────────
       Topbar + statusbar
       ──────────────────────────────────────────────────────── */

    /* Reset EVERYTHING back to a clean slate: drop every layer, wipe
       each texture's saved workspace, clear the selection and the
       project identity. If a garment is loaded, reload its original
       texture so you're back to the pristine sheet (not a blank one). */
    function resetAll() {
        App.confirm(
            t('reset_all_title', 'Reset everything?'),
            t('reset_all_body', 'This clears the whole design on every texture and starts over. It cannot be undone.'),
            { danger: true, confirmText: t('reset_all_confirm', 'Reset all') }
        ).then(function (ok) {
            if (!ok) { return; }

            if (Editor.deselect) { Editor.deselect(); }
            /* forget every per-texture workspace so nothing comes back */
            variantStore = {};
            currentWsKey = null;

            App.setProject({ id: null, name: t('project_untitled', 'Untitled') });

            if (activeVariantData) {
                loadVariant(activeVariantData);      /* pristine garment sheet */
            } else if (Editor.clear) {
                Editor.clear();                      /* no garment → blank canvas */
            }
            App.setDirty(false);
            App.toast(t('reset_all_done', 'Everything reset.'), 'success');
        });
    }

    /* ════════════════════════════════════════════════════════
       §LIVE MANAGER — clothes currently applied server-wide
       --------------------------------------------------------
       Lists every outfit pushed with Export → Live, lets you
       remove them one by one or clear them all. Backed by the
       liveList / liveRemove / liveClear NUI callbacks.
       ════════════════════════════════════════════════════════ */

    var liveListEl = null;

    function renderLiveList(items) {
        if (!liveListEl) { return; }
        liveListEl.innerHTML = '';
        items = items || [];
        if (!items.length) {
            var empty = el('div', 'empty-state small');
            empty.appendChild(icon('fa-tower-broadcast'));
            empty.appendChild(el('span', null, t('live_empty', 'No live textures active. Export a design as "Live on Server" to apply one.')));
            liveListEl.appendChild(empty);
            return;
        }
        items.forEach(function (item) {
            var row = el('div', 'live-row');

            var info = el('div', 'live-info');
            info.appendChild(el('div', 'live-name', item.name || '?'));
            var sub = el('div', 'live-sub');
            var txns = (item.txns || []).slice(0, 4);
            sub.textContent = t('live_count', '%d texture(s)', item.count || 0)
                + (txns.length ? ' · ' + txns.join(', ') : '');
            info.appendChild(sub);
            row.appendChild(info);

            var del = el('button', 'btn btn-ghost live-del');
            del.appendChild(icon('fa-trash'));
            del.appendChild(el('span', null, t('live_remove', 'Remove')));
            del.addEventListener('click', function () {
                del.disabled = true;
                App.nui('liveRemove', { name: item.name }).then(function (r) {
                    if (r && r.ok) {
                        App.toast(t('live_removed', 'Removed — originals restored for everyone.'), 'success');
                    } else {
                        App.toast(t('live_remove_fail', 'Could not remove that one.'), 'error');
                    }
                    App.nui('liveList');   /* refresh the list */
                });
            });
            row.appendChild(del);

            liveListEl.appendChild(row);
        });
    }

    function openLiveModal() {
        var box = el('div', 'live-modal');
        var hint = el('p', 'pane-hint');
        hint.textContent = t('live_hint', 'These retextures are applied to everyone on the server right now.');
        box.appendChild(hint);
        liveListEl = el('div', 'live-list');
        box.appendChild(liveListEl);

        renderLiveList([]);   /* placeholder until the list arrives */

        var onList = function (p) { renderLiveList(p && p.items); };
        App.on('liveList', onList);

        App.modal(box, {
            title: t('live_title', 'Live textures'),
            icon: 'fa-tower-broadcast',
            wide: true,
            onClose: function () { App.off('liveList', onList); liveListEl = null; },
            buttons: [
                {
                    label: t('live_clear_all', 'Clear all'), kind: 'danger',
                    onClick: function (close) {
                        App.confirm(
                            t('live_clear_title', 'Clear all live textures?'),
                            t('live_clear_body', 'Every live retexture is removed for everyone and the originals come back.'),
                            { danger: true, confirmText: t('live_clear_all', 'Clear all') }
                        ).then(function (ok) {
                            if (!ok) { return; }
                            App.nui('liveClear').then(function (r) {
                                App.toast(r && r.ok
                                    ? t('live_cleared', 'All live textures cleared.')
                                    : t('live_clear_fail', 'Could not clear (no permission?).'),
                                    r && r.ok ? 'success' : 'error');
                                App.nui('liveList');
                            });
                        });
                    }
                },
                {
                    label: t('live_refresh', 'Refresh'), kind: 'ghost',
                    onClick: function () { App.nui('liveList'); }
                },
                { label: t('btn_close', 'Close'), kind: 'primary', onClick: function (close) { close(); } }
            ]
        });

        App.nui('liveList');   /* fetch the current set */
    }

    function bindTopbar() {
        var reset = document.getElementById('btn-reset-all');
        if (reset) { reset.addEventListener('click', resetAll); }

        var live = document.getElementById('btn-live');
        if (live) { live.addEventListener('click', openLiveModal); }

        var save = document.getElementById('btn-save');
        if (save) { save.addEventListener('click', saveProject); }

        var exp = document.getElementById('btn-export');
        if (exp) {
            exp.addEventListener('click', openExportModal);
        }

        var close = document.getElementById('btn-close');
        if (close) { close.addEventListener('click', function () { App.requestClose(); }); }

        var aiFit = document.getElementById('btn-ai-fit');
        if (aiFit) { aiFit.addEventListener('click', openQuickFit); }
    }

    /* Canvas-head download — the composited design as a PNG (the
       full game sheet when a UV crop is known), pure NUI. */
    function bindDownloadPng() {
        var btn = document.getElementById('btn-download-png');
        if (!btn) { return; }
        /* ⚠ NOT an <a download>. FiveM's CEF has no downloads folder and
           opens no file dialog, so the browser path silently did nothing
           in game while cheerfully reporting success. The PNG goes to
           the server in 200KB pieces (a single NUI post above ~1MB fails
           without a word) and the server writes the real file. */
        var dlBusy = false;
        btn.addEventListener('click', function () {
            if (dlBusy) { return; }
            if (!Editor.layers.length) {
                App.toast(t('dl_no_tex', 'Pick a template and design something first.'), 'error');
                return;
            }
            dlBusy = true;
            btn.disabled = true;
            App.toast(t('dl_saving', 'Saving the PNG…'), 'info');

            buildExportPng(function (png) {
                var tpl = App.state.activeTemplate;
                var name = (activeVariantData && activeVariantData.txn)
                    || (tpl && tpl.txn) || 'texture';
                var CH = 200000;
                var total = Math.ceil(png.length / CH);
                var seq = 0;
                (function next() {
                    if (seq >= total) {
                        App.nui('textureDownload', { name: name }).then(function (r) {
                            if (!r || r.ok === false) {
                                dlBusy = false;
                                btn.disabled = false;
                                App.toast(t('dl_fail',
                                    'Could not save the PNG — check the server console.'), 'error');
                            }
                            /* On success the server answers with
                               downloadDone, handled below. */
                        });
                        return;
                    }
                    var piece = png.substr(seq * CH, CH);
                    seq++;
                    App.nui('dlChunk', { seq: seq, total: total, data: piece }).then(next);
                }());
            });
        });

        /* The server always answers, but never leave the button dead if
           it does not. */
        App.on('downloadDone', function (p) {
            dlBusy = false;
            btn.disabled = false;
            if (p && p.ok) {
                App.toast(t('dl_ok', 'PNG saved: %s', p.path || ''), 'success');
            } else {
                App.toast((p && p.message) || t('dl_fail',
                    'Could not save the PNG — check the server console.'), 'error');
            }
        });
    }

    /* Layer-ops keycap strip (web console) — acts on the active layer. */
    function bindLayerOps() {
        function activeLayer() { return Editor.getLayer(Editor.selectedId); }
        function idxOf(id) {
            for (var i = 0; i < Editor.layers.length; i++) {
                if (Editor.layers[i].id === id) { return i; }
            }
            return -1;
        }
        var up = document.getElementById('lop-up');
        var down = document.getElementById('lop-down');
        var dup = document.getElementById('lop-dup');
        var del = document.getElementById('lop-del');
        if (up) {
            up.addEventListener('click', function () {
                var l = activeLayer();
                if (l) { Editor.moveLayer(l.id, idxOf(l.id) + 1); }
            });
        }
        if (down) {
            down.addEventListener('click', function () {
                var l = activeLayer();
                if (!l) { return; }
                Editor.moveLayer(l.id, Math.max(baseCount(), idxOf(l.id) - 1));
            });
        }
        if (dup) {
            dup.addEventListener('click', function () {
                var l = activeLayer();
                if (l) { Editor.duplicateLayer(l.id); }
            });
        }
        if (del) {
            del.addEventListener('click', function () {
                var l = activeLayer();
                if (l) { Editor.removeLayer(l.id); }
            });
        }
    }

    function bindStatusbar() {
        var sizeSel = document.getElementById('canvas-size-select');
        if (sizeSel) {
            sizeSel.addEventListener('change', function () {
                var px = parseInt(sizeSel.value, 10);
                var apply = function () { Editor.setSize(px); };
                if (Editor.layers.length) {
                    App.confirm(t('size_title', 'Change canvas size?'),
                        t('size_body', 'Layers keep their positions — check the result on the ped.'))
                        .then(function (ok) {
                            if (ok) { apply(); } else { sizeSel.value = String(Editor.size); }
                        });
                } else {
                    apply();
                }
            });
        }

        var zoomIn = document.getElementById('zoom-in');
        var zoomOut = document.getElementById('zoom-out');
        var zoomFit = document.getElementById('btn-zoom-fit');
        if (zoomIn) { zoomIn.addEventListener('click', function () { Editor.setZoom(Editor.zoom * 1.25); }); }
        if (zoomOut) { zoomOut.addEventListener('click', function () { Editor.setZoom(Editor.zoom / 1.25); }); }
        App.on('zoomKey', function (p) {
            Editor.setZoom(p && p.dir > 0 ? Editor.zoom * 1.25 : Editor.zoom / 1.25);
        });
        if (zoomFit) { zoomFit.addEventListener('click', function () { Editor.resetView(); }); }

        var uvToggle = document.getElementById('uv-toggle');
        var uvOpacity = document.getElementById('uv-opacity');
        var uvControl = document.getElementById('uv-control');
        var fileUv = document.getElementById('file-uv');
        /* Fold the opacity slider out only while the guide is on, so the
           head bar stays compact when UV is off. */
        function syncUvControl() {
            if (uvControl) { uvControl.classList.toggle('on', !!(uvToggle && uvToggle.checked)); }
        }
        if (uvToggle) {
            uvToggle.addEventListener('change', function () {
                if (uvToggle.checked && !(Editor.hasUvGuide && Editor.hasUvGuide())) {
                    /* No guide yet. This used to call fileUv.click(), but
                       CEF inside FiveM cannot open an OS file picker — so
                       the box just unticked itself and looked broken. The
                       guide is built from the 3D model, so say so. */
                    uvToggle.checked = false;
                    syncUvControl();
                    App.toast(t('uv_no_guide',
                        'The UV guide is built from the 3D model — pick one on the left first.'), 'info');
                    return;
                }
                Editor.setUvVisible(uvToggle.checked);
                syncUvControl();
            });
            syncUvControl();
        }

        /* auto-generated UV template arrived from the 3D model → show it */
        App.on('uvGuideReady', function () {
            if (uvToggle) { uvToggle.checked = true; }
            syncUvControl();
        });
        if (fileUv) {
            fileUv.addEventListener('change', function () {
                var file = fileUv.files && fileUv.files[0];
                fileUv.value = '';
                if (!file || String(file.type).indexOf('image/') !== 0) { return; }
                var reader = new FileReader();
                reader.onload = function () {
                    Editor.setUvGuide(String(reader.result));
                    if (uvToggle) { uvToggle.checked = true; }
                    syncUvControl();
                    App.toast(t('uv_loaded', 'UV guide loaded (never exported).'), 'success');
                };
                reader.readAsDataURL(file);
            });
        }
        if (uvOpacity) {
            uvOpacity.addEventListener('input', function () {
                Editor.setUvOpacity(parseInt(uvOpacity.value, 10) / 100);
            });
        }

        var grid = document.getElementById('grid-toggle');
        if (grid) {
            grid.addEventListener('change', function () {
                Editor.gridOn = grid.checked;
                Editor.setZoom(Editor.zoom); /* cheap re-render */
            });
        }
    }

    /* ────────────────────────────────────────────────────────
       App bus wiring
       ──────────────────────────────────────────────────────── */

    function bindBus() {
        Editor.on('layers', function () {
            renderLayers();
            renderInspector();
            if (!suppressDirty && !App.loadingTemplate) { App.setDirty(true); }
        });
        Editor.on('selection', function () {
            renderLayers();
            renderInspector();
        });
        Editor.on('tool', function (name) {
            if (name === 'ai') {
                activateTab('ai');
                var promptEl = document.getElementById('ai-prompt');
                if (promptEl) { promptEl.focus(); }
                return;
            }
            syncRail(name);
            setHint(name);
            renderToolOptions(name);
        });
        Editor.on('change', function () {
            if (!suppressDirty && !App.loadingTemplate) { App.setDirty(true); }
        });

        App.on('projectsList', renderProjects);
        App.on('galleryList', renderGallery);

        App.on('projectLoaded', function (p) {
            var state;
            try { state = JSON.parse(p.state); } catch (e) { state = null; }
            if (!state) {
                App.toast(t('err_project_load', 'Could not load that project.'), 'error');
                return;
            }
            suppressDirty = true;
            Editor.load(state).then(function () {
                suppressDirty = false;
                App.setDirty(false);
                App.setProject({
                    id: p.meta && p.meta.owner ? p.meta.id : null,   /* shared projects save as copies */
                    name: (p.meta && p.meta.name) || 'Untitled'
                });

                /* re-select the 3D template the design was made for.
                   Guard the reload so templateChanged maps the variant
                   WITHOUT clobbering the design we just restored. */
                var ctxInfo = p.wardrobe;
                if (ctxInfo && ctxInfo.template) {
                    var tpl = findTemplate(ctxInfo.template);
                    if (tpl && window.Viewer && Viewer.show) {
                        loadingProject = true;
                        projectLoadTarget = ctxInfo.txn || null;
                        Viewer.show(tpl);   /* emits templateChanged synchronously */
                        /* safety net if the template was already active and
                           templateChanged didn't fire (so the guard cleared) */
                        loadingProject = false;
                        projectLoadTarget = null;
                    }
                }
                renderExportSummary();
                App.toast(t('project_loaded', 'Project loaded.'), 'success');
            });
        });

        App.on('projectSaved', function () { requestProjects(); });
        App.on('shareCode', function (p) {
            if (p && p.id && p.code) { lastShareCodes[p.id] = p.code; }
        });

        /* the 3D template drives the export target — refresh the
           export pane (and the grid highlight) whenever it changes */
        App.on('templateChanged', function (tpl) {
            renderExportSummary();
            renderTemplateGrid();
            /* set up switchable textures for this garment. When the
               template has a 3D model, WAIT for its UV crop (uvGuideReady)
               so the texture loads already cut to the used region — with a
               timeout fallback so a failed glb never blocks the editor */
            baseLayerId = null;
            activeVariant = null;
            activeVariantData = null;
            pendingVariant = null;
            var texs = (tpl && tpl.textures) || [];

            /* PROJECT LOAD: the canvas already holds the restored design —
               do NOT reload any variant (that wipes it). Just map the
               active texture so the dropdown/export point at the right one
               and rebuild the UV guide for the newly-shown model. */
            if (loadingProject) {
                var chosen = null;
                for (var pi = 0; pi < texs.length; pi++) {
                    if (projectLoadTarget && texs[pi].txn === projectLoadTarget) { chosen = texs[pi]; break; }
                }
                if (!chosen) { chosen = texs[0] || null; }
                if (chosen) {
                    activeVariant = chosen.id;
                    activeVariantData = chosen;
                    currentWsKey = wsKey(chosen);
                }
                baseLayerId = findBaseLayerId();
                renderTextureVariants();
                renderExportSummary();
                if (window.Viewer && Viewer.rebuildUvGuide) { Viewer.rebuildUvGuide(); }
                loadingProject = false;      /* self-clear: guard done */
                projectLoadTarget = null;
                return;
            }

            if (texs.length) {
                if (tpl.glb && window.Viewer) {
                    var pv = texs[0];
                    pendingVariant = pv;
                    setTimeout(function () {
                        if (pendingVariant === pv) {   /* glb never delivered a crop */
                            pendingVariant = null;
                            loadVariant(pv);
                        }
                    }, 6000);
                } else {
                    loadVariant(texs[0]);
                }
            }
            renderTextureVariants();
        });

        /* the glb finished loading and its UV crop is known — NOW load
           the texture, already cut to the used region */
        App.on('uvGuideReady', function () {
            if (pendingVariant) {
                var pv = pendingVariant;
                pendingVariant = null;
                loadVariant(pv);
            }
        });

        /* server folder-scan disabled — templates.json is authoritative.
           (It mis-reported "^"-named .ydd as needing a .glb.) */
        // App.on('templatesList', onCatalog);

        App.on('requestSave', saveProject);
        App.on('projectsOpen', openProjectsModal);   /* sidebar folder button */
        App.on('projectRenamed', function (p) {
            if (p.id) {
                App.nui('projectRename', { id: p.id, name: p.name }).then(function () {
                    requestProjects();
                });
            }
        });

        App.on('boot', function () {
            /* These were all built before the dictionary arrived, and
               nothing else redraws them — so after a language change the
               active tool's options bar, the status hint and the texture
               dropdown would keep the previous language until the player
               happened to click something else. */
            var activeTool = (window.Editor && Editor.tool) || null;
            if (activeTool && activeTool !== 'ai') {
                /* Call the renderers directly: going through the 'tool'
                   event would force the AI tab open and steal focus. */
                try { syncRail(activeTool); } catch (e) { /* ok */ }
                try { setHint(activeTool); } catch (e) { /* ok */ }
                try { renderToolOptions(activeTool); } catch (e) { /* ok */ }
            }
            try { renderTextureVariants(); } catch (e) { /* ok */ }

            /* empty project follows the server's default canvas size */
            var defSize = App.state.config && App.state.config.defaultSize;
            if (defSize && defSize !== Editor.size && !Editor.layers.length) {
                suppressDirty = true;
                Editor.setSize(defSize);
                suppressDirty = false;
                App.setDirty(false);
            }

            /* size selector reflects config */
            var sizeSel = document.getElementById('canvas-size-select');
            var sizes = (App.state.config && App.state.config.canvasSizes) || [512, 1024, 2048];
            if (sizeSel) {
                sizeSel.innerHTML = '';
                sizes.forEach(function (px) {
                    var o = el('option', null, String(px));
                    o.value = String(px);
                    if (px === Editor.size) { o.selected = true; }
                    sizeSel.appendChild(o);
                });
            }
            var aiBtns = [document.getElementById('btn-ai-fit'), document.getElementById('btn-ai-generate')];
            aiBtns.forEach(function (b) {
                if (b) { b.disabled = !(App.state.config && App.state.config.aiEnabled); }
            });

            /* AI tab meta line: which provider the server is configured
               to use (diagnoses "old config still loaded" instantly) */
            var meta = document.getElementById('ai-meta');
            if (meta) {
                meta.textContent = t('ai_meta', 'Provider: %s · enabled: %s',
                    (App.state.config && App.state.config.aiProvider) || '?',
                    (App.state.config && App.state.config.aiEnabled) ? 'yes' : 'no');
            }
        });

        App.on('open', function () {
            Editor.resetView();
            renderLayers();
            renderInspector();
            /* fetch the scanned template catalog so the 3D viewer
               auto-loads the first garment without opening the tab */
            requestTemplates();
        });
    }

    /* ────────────────────────────────────────────────────────
       Init
       ──────────────────────────────────────────────────────── */

    /* ────────────────────────────────────────────────────────
       Controls / shortcuts modal (topbar keyboard button)
       ──────────────────────────────────────────────────────── */

    function openHelpModal() {
        var grid = el('div', 'help-grid');
        function sect(label) { grid.appendChild(el('div', 'help-sect', label)); }
        function row(keys, what) {
            var r = el('div', 'help-row');
            r.appendChild(el('span', null, what));
            var kbd = document.createElement('kbd');
            kbd.textContent = keys;
            r.appendChild(kbd);
            grid.appendChild(r);
        }
        sect(t('help_tools', 'Tools'));
        row('V', t('tool_select', 'Select / Move'));
        row('B', t('tool_brush', 'Brush'));
        row('E', t('tool_eraser', 'Eraser'));
        row('T', t('tool_text', 'Text'));
        row('S', t('tool_shape', 'Shape'));
        row('F', t('tool_fill', 'Fill'));
        row('I', t('tool_eyedrop', 'Eyedropper'));
        sect(t('help_edit', 'Editing'));
        row('Ctrl+Z / Ctrl+Y', t('help_undo', 'Undo / Redo'));
        row('Ctrl+C / Ctrl+V', t('help_copy', 'Copy / paste the selected layer'));
        row('Ctrl+V', t('help_paste_img', 'Paste an image from the clipboard'));
        row('Ctrl+D', t('help_dup', 'Duplicate the selected layer'));
        row('Del', t('help_del', 'Delete the selected layer'));
        sect(t('help_transform', 'Transform (selected layer)'));
        row('← ↑ → ↓', t('help_nudge', 'Nudge 1px (Shift = 10px)'));
        row('R / Shift+R', t('help_rotate', 'Rotate +15° / −15°'));
        row(t('help_drag', 'Drag handles'), t('help_scale', 'Resize / rotate (never loses quality)'));
        sect(t('help_view', 'View'));
        row('Ctrl+= / Ctrl+-', t('help_zoom', 'Zoom in / out'));
        row(t('help_wheel', 'Wheel'), t('help_zoom_wheel', 'Zoom the canvas / 3D'));
        row('Ctrl+S', t('help_save', 'Save project'));
        row('Esc', t('help_close', 'Close the studio'));
        App.modal(grid, { title: t('help_title', 'Controls & shortcuts'), icon: 'fa-keyboard', wide: true });
    }

    function bindHelp() {
        var btn = document.getElementById('btn-help');
        if (btn) { btn.addEventListener('click', openHelpModal); }
        App.on('showHelp', openHelpModal);
    }

    /* ────────────────────────────────────────────────────────
       Settings — live UI theming (brand + background + more).
       Persisted in localStorage, applied via CSS variables.
       ──────────────────────────────────────────────────────── */

    var THEME_KEY = 'apex_vehicles_theme';
    var THEME_DEFAULT = { brand: '#1F5EFF', bg: '#0A0A0B', glow: 1, compact: false };

    function hexToRgb(h) {
        h = String(h || '').replace('#', '');
        if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
        var n = parseInt(h, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function mix(c, t, amt) {
        return {
            r: Math.round(c.r + (t.r - c.r) * amt),
            g: Math.round(c.g + (t.g - c.g) * amt),
            b: Math.round(c.b + (t.b - c.b) * amt)
        };
    }
    function rgbStr(c) { return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; }
    function rgbaStr(c, a) { return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }

    function readTheme() {
        try {
            var raw = JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
            return {
                brand: raw.brand || THEME_DEFAULT.brand,
                bg: raw.bg || THEME_DEFAULT.bg,
                glow: (raw.glow === undefined) ? 1 : raw.glow,
                compact: !!raw.compact
            };
        } catch (e) { return Object.assign({}, THEME_DEFAULT); }
    }
    function writeTheme(th) {
        try { localStorage.setItem(THEME_KEY, JSON.stringify(th)); } catch (e) { /* ok */ }
    }

    function applyTheme(th) {
        var root = document.documentElement.style;
        var white = { r: 255, g: 255, b: 255 }, black = { r: 0, g: 0, b: 0 };
        var b = hexToRgb(th.brand);
        root.setProperty('--brand-500', rgbStr(b));
        root.setProperty('--brand-600', rgbStr(mix(b, black, 0.18)));
        root.setProperty('--brand-400', rgbStr(mix(b, white, 0.22)));
        root.setProperty('--brand-300', rgbStr(mix(b, white, 0.42)));
        root.setProperty('--brand-200', rgbStr(mix(b, white, 0.6)));
        var g = th.glow === undefined ? 1 : th.glow;
        [['a05', 0.05], ['a08', 0.08], ['a12', 0.12], ['a18', 0.18], ['a25', 0.25], ['a40', 0.40]]
            .forEach(function (p) { root.setProperty('--brand-' + p[0], rgbaStr(b, p[1] * g)); });

        var bg = hexToRgb(th.bg);
        root.setProperty('--surface-0', rgbStr(bg));
        root.setProperty('--surface-1', rgbStr(mix(bg, white, 0.045)));
        root.setProperty('--surface-2', rgbStr(mix(bg, white, 0.075)));
        root.setProperty('--surface-3', rgbStr(mix(bg, white, 0.125)));
        root.setProperty('--surface-4', rgbStr(mix(bg, white, 0.18)));
        root.setProperty('--surface-5', rgbStr(mix(bg, white, 0.24)));
        root.setProperty('--line-1', rgbStr(mix(bg, white, 0.09)));
        root.setProperty('--line-2', rgbStr(mix(bg, white, 0.14)));
        root.setProperty('--line-3', rgbStr(mix(bg, white, 0.22)));
        root.setProperty('--line-4', rgbStr(mix(bg, white, 0.32)));

        root.setProperty('--fs-base', th.compact ? '12px' : '13px');
        document.body.classList.toggle('compact', !!th.compact);
    }

    function loadTheme() { applyTheme(readTheme()); }

    var BRAND_PRESETS = ['#1F5EFF', '#7C5CFF', '#02CC04', '#FF4D6D', '#FF8A00', '#00C2C7', '#E4C24A', '#FF3EA5'];
    var BG_PRESETS = [
        { k: 'bg_obsidian', label: 'Obsidian', v: '#0A0A0B' }, { k: 'bg_charcoal', label: 'Charcoal', v: '#121316' },
        { k: 'bg_midnight', label: 'Midnight', v: '#0B1020' }, { k: 'bg_forest', label: 'Forest', v: '#0A140F' },
        { k: 'bg_wine', label: 'Wine', v: '#160A10' }, { k: 'bg_slate', label: 'Slate', v: '#14171C' }
    ];

    function openSettings() {
        var th = readTheme();
        var content = el('div', 'settings-modal');

        /* brand color */
        content.appendChild(el('span', 'micro-label section', t('set_brand', 'Brand / accent color')));
        var brandRow = el('div', 'swatch-row');
        var brandInput = makeInput('color', th.brand); brandInput.classList.add('color');
        function setBrand(v) { th.brand = v; brandInput.value = v; applyTheme(th); markActive(); }
        BRAND_PRESETS.forEach(function (hex) {
            var s = el('button', 'swatch');
            s.style.background = hex;
            s.setAttribute('data-hex', hex);
            s.addEventListener('click', function () { setBrand(hex); });
            brandRow.appendChild(s);
        });
        brandRow.appendChild(brandInput);
        brandInput.addEventListener('input', function () { setBrand(brandInput.value); });
        content.appendChild(brandRow);

        /* background */
        content.appendChild(el('span', 'micro-label section', t('set_bg', 'Background')));
        var bgRow = el('div', 'swatch-row');
        var bgInput = makeInput('color', th.bg); bgInput.classList.add('color');
        function setBg(v) { th.bg = v; bgInput.value = v; applyTheme(th); markActive(); }
        BG_PRESETS.forEach(function (p) {
            var s = el('button', 'swatch bg-swatch');
            s.style.background = p.v;
            s.setAttribute('data-hex', p.v);
            /* openSettings only runs on click, long after boot, so t()
                   resolves properly here. */
                s.setAttribute('data-tip', t(p.k, p.label));
                s.setAttribute('data-i18n-tip', p.k);
            s.addEventListener('click', function () { setBg(p.v); });
            bgRow.appendChild(s);
        });
        bgRow.appendChild(bgInput);
        bgInput.addEventListener('input', function () { setBg(bgInput.value); });
        content.appendChild(bgRow);

        function markActive() {
            brandRow.querySelectorAll('.swatch').forEach(function (s) {
                s.classList.toggle('active', s.getAttribute('data-hex') &&
                    s.getAttribute('data-hex').toLowerCase() === th.brand.toLowerCase());
            });
            bgRow.querySelectorAll('.swatch').forEach(function (s) {
                s.classList.toggle('active', s.getAttribute('data-hex') &&
                    s.getAttribute('data-hex').toLowerCase() === th.bg.toLowerCase());
            });
        }
        markActive();

        /* glow intensity */
        content.appendChild(el('span', 'micro-label section', t('set_glow', 'Accent glow')));
        var glow = makeRange(0, 200, 5, Math.round((th.glow || 1) * 100));
        glow.addEventListener('input', function () { th.glow = parseInt(glow.value, 10) / 100; applyTheme(th); });
        content.appendChild(glow);

        /* compact + auto-rotate toggles */
        var compRow = el('label', 'check-row');
        var compCk = document.createElement('input'); compCk.type = 'checkbox'; compCk.checked = !!th.compact;
        compRow.appendChild(compCk);
        compRow.appendChild(el('span', null, t('set_compact', 'Compact interface')));
        compCk.addEventListener('change', function () { th.compact = compCk.checked; applyTheme(th); });
        content.appendChild(compRow);

        var arRow = el('label', 'check-row');
        var arCk = document.createElement('input'); arCk.type = 'checkbox';
        arCk.checked = localStorage.getItem('apex_vehicles_autorotate') === '1';
        arRow.appendChild(arCk);
        arRow.appendChild(el('span', null, t('set_autorotate', 'Auto-rotate the 3D preview')));
        arCk.addEventListener('change', function () {
            localStorage.setItem('apex_vehicles_autorotate', arCk.checked ? '1' : '0');
            if (window.Viewer && Viewer.setAutoRotate) { Viewer.setAutoRotate(arCk.checked); }
        });
        content.appendChild(arRow);

        App.modal(content, {
            title: t('set_title', 'Settings & appearance'),
            icon: 'fa-sliders',
            buttons: [
                {
                    label: t('set_reset', 'Reset'), kind: 'ghost', onClick: function () {
                        th = Object.assign({}, THEME_DEFAULT);
                        applyTheme(th); writeTheme(th);
                        brandInput.value = th.brand; bgInput.value = th.bg;
                        glow.value = 100; compCk.checked = false; markActive();
                    }
                },
                {
                    label: t('set_save', 'Save'), kind: 'primary', onClick: function (close) {
                        writeTheme(th);
                        App.toast(t('set_saved', 'Appearance saved.'), 'success');
                        close();
                    }
                }
            ]
        });
    }

    function bindSettings() {
        var btn = document.getElementById('btn-settings');
        if (btn) { btn.addEventListener('click', openSettings); }
    }

    /* ────────────────────────────────────────────────────────
       Interactive tutorial — spotlight + arrow callouts
       ──────────────────────────────────────────────────────── */

    /* Every string goes through t(): this tutorial auto-opens on a
       player's first ever visit, so it is the first thing they read —
       it must speak their language, and it must describe THIS studio.
       The inline fallbacks are the English source of truth. */
    /* ⚠ A FUNCTION, not a var holding an array.
       These strings go through t(), and t() only knows the player's
       language once the boot payload has arrived. An array literal at
       module scope is evaluated while the file loads — long before
       that — so the steps used to freeze to their inline fallbacks and
       the tutorial rendered with no text at all.
       Rebuilding on every read costs nothing (twelve small objects) and
       means a language change is picked up with no extra wiring. */
    function tourSteps() {
        return [
        { title: t('tour_welcome_t', 'Welcome'),
          text: t('tour_welcome_d', '') },
        { target: '#models-rail', pos: 'right',
          title: t('tour_pick_t', ''), text: t('tour_pick_d', '') },
        { target: '#stage-panel', pos: 'right',
          title: t('tour_3d_t', ''), text: t('tour_3d_d', '') },
        { target: '#texture-variants', pos: 'bottom', optional: true,
          title: t('tour_variants_t', ''), text: t('tour_variants_d', '') },
        { target: '#canvas-panel', pos: 'left',
          title: t('tour_canvas_t', ''), text: t('tour_canvas_d', '') },
        { target: '#tool-rail', pos: 'right',
          title: t('tour_tools_t', ''), text: t('tour_tools_d', '') },
        { target: '.dock-tab[data-tab="layers"]', pos: 'left', before: function () { activateTab('layers'); },
          title: t('tour_layers_t', ''), text: t('tour_layers_d', '') },
        { target: '.dock-tab[data-tab="ai"]', pos: 'left', before: function () { activateTab('ai'); },
          title: t('tour_ai_t', ''), text: t('tour_ai_d', '') },
        { target: '#project-pill', pos: 'bottom',
          title: t('tour_project_t', ''), text: t('tour_project_d', '') },
        { target: '#btn-export', pos: 'bottom',
          title: t('tour_export_t', ''), text: t('tour_export_d', '') },
        { target: '#btn-settings', pos: 'bottom',
          title: t('tour_settings_t', ''), text: t('tour_settings_d', '') },
        { title: t('tour_done_t', ''), text: t('tour_done_d', '') }
    ];
    }

    var tourIdx = -1, tourEls = null;

    function ensureTourEls() {
        if (tourEls) { return tourEls; }
        var spot = el('div', 'tour-spot'); spot.hidden = true;
        var call = el('div', 'tour-call'); call.hidden = true;
        call.innerHTML =
            '<div class="tour-arrow"></div>' +
            '<div class="tour-step"></div>' +
            '<div class="tour-title"></div>' +
            '<div class="tour-text"></div>' +
            '<div class="tour-actions">' +
              '<button class="btn btn-ghost tour-skip"></button>' +
              '<span class="tour-grow"></span>' +
              '<button class="btn btn-ghost tour-prev"></button>' +
              '<button class="btn btn-primary tour-next"></button>' +
            '</div>';
        document.body.appendChild(spot);
        document.body.appendChild(call);
        call.querySelector('.tour-skip').addEventListener('click', endTour);
        call.querySelector('.tour-prev').addEventListener('click', function () { tourGo(tourIdx - 1); });
        call.querySelector('.tour-next').addEventListener('click', function () { tourGo(tourIdx + 1); });
        tourEls = { spot: spot, call: call };
        return tourEls;
    }

    function tourGo(i) {
        var els = ensureTourEls();
        // skip optional steps whose target is missing/hidden
        while (i >= 0 && i < tourSteps().length) {
            var s = tourSteps()[i];
            if (s.target && s.optional) {
                var t = document.querySelector(s.target);
                if (!t || t.hidden || !t.offsetParent) { i = (i > tourIdx) ? i + 1 : i - 1; continue; }
            }
            break;
        }
        if (i < 0) { i = 0; }
        if (i >= tourSteps().length) { endTour(); return; }
        tourIdx = i;
        var step = tourSteps()[i];
        if (step.before) { try { step.before(); } catch (e) { /* ok */ } }

        // let any tab switch settle, then position
        setTimeout(function () { positionTour(step, els); }, 40);
    }

    function positionTour(step, els) {
        var target = step.target ? document.querySelector(step.target) : null;
        var vw = window.innerWidth, vh = window.innerHeight;
        els.call.querySelector('.tour-step').textContent = (tourIdx + 1) + ' / ' + tourSteps().length;
        els.call.querySelector('.tour-title').textContent = step.title || '';
        els.call.querySelector('.tour-text').textContent = step.text || '';
        els.call.querySelector('.tour-prev').style.visibility = tourIdx === 0 ? 'hidden' : 'visible';
        /* Labels are applied per step so they always match the active
           language (they used to be hard-coded Portuguese). */
        els.call.querySelector('.tour-skip').textContent = t('tour_skip', 'Exit');
        els.call.querySelector('.tour-prev').textContent = t('tour_prev', 'Back');
        els.call.querySelector('.tour-next').textContent =
            (tourIdx === tourSteps().length - 1) ? t('tour_finish', 'Finish') : t('tour_next', 'Next');
        els.call.hidden = false;

        var arrow = els.call.querySelector('.tour-arrow');
        if (!target || !target.offsetParent) {
            // centered, no spotlight
            els.spot.hidden = true;
            arrow.style.display = 'none';
            var cw = els.call.offsetWidth, ch = els.call.offsetHeight;
            els.call.style.left = Math.round((vw - cw) / 2) + 'px';
            els.call.style.top = Math.round((vh - ch) / 2) + 'px';
            return;
        }
        var r = target.getBoundingClientRect();
        var pad = 6;
        els.spot.hidden = false;
        els.spot.style.left = (r.left - pad) + 'px';
        els.spot.style.top = (r.top - pad) + 'px';
        els.spot.style.width = (r.width + pad * 2) + 'px';
        els.spot.style.height = (r.height + pad * 2) + 'px';

        var cw2 = els.call.offsetWidth, ch2 = els.call.offsetHeight, gap = 14;
        var pos = step.pos || 'bottom';
        // fallback if not enough room
        if (pos === 'bottom' && r.bottom + gap + ch2 > vh) { pos = 'top'; }
        if (pos === 'top' && r.top - gap - ch2 < 0) { pos = 'right'; }
        if (pos === 'right' && r.right + gap + cw2 > vw) { pos = 'left'; }
        if (pos === 'left' && r.left - gap - cw2 < 0) { pos = 'bottom'; }
        var cx, cy;
        arrow.style.display = 'block';
        arrow.className = 'tour-arrow ' + pos;
        if (pos === 'bottom') { cx = r.left + r.width / 2 - cw2 / 2; cy = r.bottom + gap; }
        else if (pos === 'top') { cx = r.left + r.width / 2 - cw2 / 2; cy = r.top - gap - ch2; }
        else if (pos === 'right') { cx = r.right + gap; cy = r.top + r.height / 2 - ch2 / 2; }
        else { cx = r.left - gap - cw2; cy = r.top + r.height / 2 - ch2 / 2; }
        cx = Math.max(8, Math.min(cx, vw - cw2 - 8));
        cy = Math.max(8, Math.min(cy, vh - ch2 - 8));
        els.call.style.left = Math.round(cx) + 'px';
        els.call.style.top = Math.round(cy) + 'px';
    }

    function startTour() {
        ensureTourEls();
        try { localStorage.setItem('apex_vehicles_tour_seen', '1'); } catch (e) { /* ok */ }
        tourGo(0);
    }

    function endTour() {
        if (!tourEls) { return; }
        tourEls.spot.hidden = true;
        tourEls.call.hidden = true;
        tourIdx = -1;
    }

    function bindTutorial() {
        var btn = document.getElementById('btn-tutorial');
        if (btn) { btn.addEventListener('click', startTour); }
        window.addEventListener('resize', function () {
            if (tourIdx >= 0 && tourEls && !tourEls.call.hidden) { positionTour(tourSteps()[tourIdx], tourEls); }
        });
        /* first-ever open → offer the tour automatically */
        App.on('open', function () {
            try {
                if (localStorage.getItem('apex_vehicles_tour_seen') !== '1') {
                    setTimeout(startTour, 1200);
                }
            } catch (e) { /* ok */ }
        });
    }

    Panels.init = function () {
        bindTabs();
        bindToolRail();
        bindBrushTypes();
        bindMarqueeModes();
        bindAddLayer();
        bindProjectsPane();
        bindTemplatesPane();
        bindAiPane();
        bindExportPane();
        bindTopbar();
        bindStatusbar();
        bindLayerOps();
        bindDownloadPng();
        bindBus();
        bindClipboardPaste();
        bindFileImage();
        bindLayerDnd();
        bindHelp();
        bindSettings();
        bindTutorial();
        loadTheme();                 /* apply saved appearance immediately */
        bindTexDropdown();
        bindTextureActions();
        bindTexProps();
        bindResetTexture();
        watchSelects();          /* redesign every <select> as a custom dropdown */
        bindSnaps();
        loadAiHistory();
        renderAiHistory();
        renderLayers();
        renderInspector();
        setHint('select');
    };

    document.addEventListener('DOMContentLoaded', function () {
        Panels.init();
    });

    window.Panels = Panels;
})();
