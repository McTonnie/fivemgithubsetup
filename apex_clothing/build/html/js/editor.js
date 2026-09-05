/* ════════════════════════════════════════════════════════════
   APEX CLOTHING STUDIO — editor.js
   ------------------------------------------------------------
   The canvas engine: layer model (§13), tools, selection with
   on-canvas transform handles, undo/redo, zoom/pan, UV guide
   overlay and the live-preview frame transport (§15).

   Layer geometry model: (x, y) is the top-left of the UNSCALED
   layer box; scaleX/scaleY and rotation both apply around the
   box CENTER, so scaling never moves a layer. serialize()/load()
   are exact inverses of each other.

   Preview transport (v2): composited frames (WITHOUT the UV
   guide) go to Lua via App.nui('previewFrameData', {frame,size});
   preview.lua relays them to the DUI page. Nothing else.
   ════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var HISTORY_MAX = 20;

    /* ── tiny helpers ─────────────────────────────────────── */

    var uidCounter = 0;
    function uid() {
        uidCounter++;
        return 'ly_' + Date.now().toString(36) + uidCounter.toString(36);
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    /* Deterministic PRNG so pattern layers re-render identically
       from their serialized seed. */
    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function makeCanvas(w, h) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }

    /* ── engine state ─────────────────────────────────────── */

    var Editor = {
        size: 500,                 /* = max(w, h); kept for secondary features */
        w: 500,                    /* canvas width  (matches the texture aspect) */
        h: 500,                    /* canvas height */
        rev: 0,                    /* bumps on EVERY visual change — the 3D viewer
                                      polls this each frame so the live texture is
                                      never missed, even if event wiring races */
        layers: [],                /* index 0 = bottom */
        selectedId: null,
        tool: 'select',
        brush: { size: 28, color: '#1F5EFF', hardness: 0.85, flow: 1 },
        brushType: 'normal',       /* 'normal' | 'spray' | 'marker' */
        symmetry: 'none',          /* 'none' | 'x' | 'y' | 'xy' */
        shapeKind: 'rect',
        textDefaults: { size: 96, weight: 700, color: '#FFFFFF', font: 'Inter' },
        zoom: 1,
        uvGuide: { image: null, opacity: 0.5, visible: false },
        gridOn: false,

        /* ── marquee selection (see §SELECTION below) ──────────
           marquee.mode : 'rect' | 'ellipse' | 'lasso' | 'wand'
           marquee.op   : 'new' | 'add' | 'sub'  (hold Shift = add,
                          Alt = subtract — the op chip mirrors it)
           marquee.feather   : px of soft edge applied to the mask
           marquee.tolerance : magic-wand colour distance (0-255) */
        marquee: { mode: 'rect', op: 'new', feather: 0, tolerance: 32, contiguous: true },
        /* Active selection, or null. Always carries a rasterized
           `mask` canvas (Editor.w×Editor.h, alpha = selectedness) so
           EVERY tool can honour it uniformly; vector kinds also keep
           their geometry so the marching ants stay crisp at any zoom. */
        selection: null
    };

    var canvas, ctx, overlay, octx, wrap;
    var imageCache = {};           /* layerId → HTMLImageElement (image layers)   */
    var rasterCache = {};          /* layerId → offscreen canvas (raster layers)  */
    var patternCache = {};         /* layerId → { key, canvas }                   */
    var uvImg = null;

    var view = { z: 1, px: 0, py: 0 };   /* CSS transform: translate(px,py) scale(z) */
    var history = [];
    var histIdx = -1;
    var dirtyRender = false;
    var loading = false;

    /* local event bus */
    var listeners = {};
    function emit(ev, payload) {
        var list = listeners[ev];
        if (!list) { return; }
        for (var i = 0; i < list.length; i++) {
            try { list[i](payload); } catch (err) { console.error('[editor] listener failed:', err); }
        }
    }
    Editor.on = function (ev, cb) {
        (listeners[ev] = listeners[ev] || []).push(cb);
        return cb;
    };

    /* debounced change signal (100 ms) + preview push */
    var changeTimer = null;
    function signalChange() {
        requestRender();
        if (changeTimer) { clearTimeout(changeTimer); }
        changeTimer = setTimeout(function () {
            changeTimer = null;
            emit('change', {});
            schedulePreviewFrame();
        }, 100);
    }

    /* ── layer intrinsics ─────────────────────────────────── */

    function measureText(data) {
        var mctx = measureText._ctx || (measureText._ctx = makeCanvas(1, 1).getContext('2d'));
        var size = data.size || 64;
        mctx.font = (data.weight || 700) + ' ' + size + 'px ' + (data.font || 'Inter') + ', sans-serif';
        var lines = String(data.text || '').split('\n');
        var w = 1;
        for (var i = 0; i < lines.length; i++) {
            var m = mctx.measureText(lines[i]);
            if (m.width > w) { w = m.width; }
        }
        return { w: Math.max(w, 8), h: Math.max(lines.length * size * 1.25, size) };
    }

    function layerSize(layer) {
        var d = layer.data || {};
        switch (layer.type) {
            case 'image':
            case 'raster':
                return { w: d.w || Editor.w, h: d.h || Editor.h };
            case 'text':
                return measureText(d);
            case 'shape':
                return { w: d.w || 64, h: d.h || 64 };
            case 'fill':
            case 'pattern':
            default:
                return { w: Editor.w, h: Editor.h };
        }
    }

    function layerCenter(layer) {
        var s = layerSize(layer);
        return { x: layer.x + s.w / 2, y: layer.y + s.h / 2, w: s.w, h: s.h };
    }

    /* ── fill helper (solid / linear / radial) ────────────── */

    function makeFillStyle(g, fill, w, h) {
        if (!fill) { return '#FFFFFF'; }
        if (fill.type === 'linear' || fill.type === 'radial') {
            var stops = (fill.stops && fill.stops.length) ? fill.stops
                : [{ pos: 0, color: fill.color || '#FFFFFF' }, { pos: 1, color: '#000000' }];
            var grad;
            if (fill.type === 'linear') {
                var ang = ((fill.angle || 0) * Math.PI) / 180;
                var dx = Math.cos(ang) * w / 2, dy = Math.sin(ang) * h / 2;
                grad = g.createLinearGradient(-dx, -dy, dx, dy);
            } else {
                grad = g.createRadialGradient(0, 0, 1, 0, 0, Math.max(w, h) / 2);
            }
            for (var i = 0; i < stops.length; i++) {
                grad.addColorStop(clamp(stops[i].pos, 0, 1), stops[i].color || '#FFFFFF');
            }
            return grad;
        }
        return fill.color || '#FFFFFF';
    }

    /* ── pattern rendering (procedural, seeded) ───────────── */

    function renderPattern(layer) {
        var d = layer.data || {};
        var key = JSON.stringify([d.kind, d.colors, d.scale, d.angle, d.seed, Editor.w, Editor.h]);
        var entry = patternCache[layer.id];
        if (entry && entry.key === key) { return entry.canvas; }

        var size = Math.max(Editor.w, Editor.h);
        var c = makeCanvas(Editor.w, Editor.h);
        var g = c.getContext('2d');
        var colors = (d.colors && d.colors.length) ? d.colors : ['#22252B', '#3A3F49', '#565D6B', '#1F5EFF'];
        var scale = clamp(d.scale || 1, 0.2, 6);
        var rnd = mulberry32(d.seed || 1);

        g.save();
        g.fillStyle = colors[0];
        g.fillRect(0, 0, size, size);
        g.translate(size / 2, size / 2);
        g.rotate(((d.angle || 0) * Math.PI) / 180);
        g.translate(-size, -size);

        var i, j, step;
        switch (d.kind) {
            case 'checker':
                step = 64 * scale;
                g.fillStyle = colors[1] || '#FFFFFF';
                for (i = 0; i < (size * 2) / step; i++) {
                    for (j = 0; j < (size * 2) / step; j++) {
                        if ((i + j) % 2 === 0) { g.fillRect(i * step, j * step, step, step); }
                    }
                }
                break;
            case 'dots':
                step = 56 * scale;
                g.fillStyle = colors[1] || '#FFFFFF';
                for (i = 0; i < (size * 2) / step; i++) {
                    for (j = 0; j < (size * 2) / step; j++) {
                        g.beginPath();
                        g.arc(i * step + step / 2, j * step + step / 2, step * 0.18, 0, Math.PI * 2);
                        g.fill();
                    }
                }
                break;
            case 'camo':
                for (i = 0; i < 140 * scale; i++) {
                    g.fillStyle = colors[1 + Math.floor(rnd() * (colors.length - 1))] || '#556B2F';
                    var bx = rnd() * size * 2, by = rnd() * size * 2;
                    g.beginPath();
                    for (j = 0; j < 6; j++) {
                        var a2 = (j / 6) * Math.PI * 2;
                        var r2 = (40 + rnd() * 80) * scale;
                        var px2 = bx + Math.cos(a2) * r2, py2 = by + Math.sin(a2) * r2 * 0.6;
                        if (j === 0) { g.moveTo(px2, py2); } else { g.quadraticCurveTo(bx, by, px2, py2); }
                    }
                    g.closePath();
                    g.fill();
                }
                break;
            case 'stripes':
            default:
                step = 48 * scale;
                for (i = 0; i < (size * 2) / step; i++) {
                    g.fillStyle = colors[1 + (i % Math.max(colors.length - 1, 1))] || '#FFFFFF';
                    if (i % 2 === 0) { g.fillRect(i * step, 0, step, size * 2); }
                }
                break;
        }
        g.restore();

        patternCache[layer.id] = { key: key, canvas: c };
        return c;
    }

    /* ── shape rendering ──────────────────────────────────── */

    function drawShape(g, layer, w, h) {
        var d = layer.data || {};
        var style = makeFillStyle(g, d.fill || { type: 'solid', color: '#1F5EFF' }, w, h);
        g.fillStyle = style;
        if (d.shape === 'ellipse') {
            g.beginPath();
            g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
            g.fill();
            if (d.stroke && d.stroke.width) {
                g.lineWidth = d.stroke.width;
                g.strokeStyle = d.stroke.color || '#FFFFFF';
                g.stroke();
            }
        } else if (d.shape === 'line') {
            g.lineWidth = (d.stroke && d.stroke.width) || 8;
            g.strokeStyle = (d.stroke && d.stroke.color) || (d.fill && d.fill.color) || '#1F5EFF';
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(-w / 2, 0);
            g.lineTo(w / 2, 0);
            g.stroke();
        } else { /* rect */
            g.fillRect(-w / 2, -h / 2, w, h);
            if (d.stroke && d.stroke.width) {
                g.lineWidth = d.stroke.width;
                g.strokeStyle = d.stroke.color || '#FFFFFF';
                g.strokeRect(-w / 2, -h / 2, w, h);
            }
        }
    }

    /* ── text rendering ───────────────────────────────────── */

    function drawText(g, layer, w, h) {
        var d = layer.data || {};
        var size = d.size || 64;
        g.font = (d.weight || 700) + ' ' + size + 'px ' + (d.font || 'Inter') + ', sans-serif';
        g.textBaseline = 'middle';

        /* curved text: lay each glyph along an arc (d.curve -1..1) */
        if (d.curve && Math.abs(d.curve) > 0.01) {
            var text = String(d.text || '').replace(/\n/g, ' ');
            if (!text) { return; }
            g.textAlign = 'center';
            var widths = [], total = 0;
            for (var ci = 0; ci < text.length; ci++) { var cw = g.measureText(text[ci]).width; widths.push(cw); total += cw; }
            // radius from curve strength; sign flips the bend direction
            var radius = (size * 6) / Math.max(0.05, Math.abs(d.curve));
            var dir = d.curve < 0 ? -1 : 1;
            var angleTotal = total / radius;               // radians spanned
            var a = -angleTotal / 2;
            for (var k = 0; k < text.length; k++) {
                var aw = widths[k];
                a += (aw / 2) / radius;
                g.save();
                var px = Math.sin(a) * radius * dir;
                var py = (-Math.cos(a) * radius + radius) * dir;
                g.translate(px, py - radius * dir + (dir > 0 ? 0 : 0));
                g.rotate(a * dir);
                if (d.stroke && d.stroke.width) {
                    g.lineWidth = d.stroke.width; g.strokeStyle = d.stroke.color || '#000000'; g.lineJoin = 'round';
                    g.strokeText(text[k], 0, 0);
                }
                g.fillStyle = d.color || '#FFFFFF';
                g.fillText(text[k], 0, 0);
                g.restore();
                a += (aw / 2) / radius;
            }
            return;
        }

        g.textAlign = d.align || 'center';
        var lines = String(d.text || '').split('\n');
        var lineH = size * 1.25;
        var startY = -((lines.length - 1) * lineH) / 2;
        var tx = (d.align === 'left') ? -w / 2 : (d.align === 'right') ? w / 2 : 0;
        for (var i = 0; i < lines.length; i++) {
            var y = startY + i * lineH;
            if (d.stroke && d.stroke.width) {
                g.lineWidth = d.stroke.width;
                g.strokeStyle = d.stroke.color || '#000000';
                g.lineJoin = 'round';
                g.strokeText(lines[i], tx, y);
            }
            g.fillStyle = d.color || '#FFFFFF';
            g.fillText(lines[i], tx, y);
        }
    }

    /* ── compositing ──────────────────────────────────────── */

    function drawLayer(g, layer) {
        if (!layer.visible) { return; }
        var c = layerCenter(layer);
        g.save();
        g.globalAlpha = clamp(layer.opacity === undefined ? 1 : layer.opacity, 0, 1);
        g.globalCompositeOperation = layer.blend || 'source-over';
        g.translate(c.x, c.y);
        g.rotate(layer.rotation || 0);
        g.scale(layer.scaleX || 1, layer.scaleY || 1);

        var sh = layer.data && layer.data.shadow;
        if (sh) {
            g.shadowColor = sh.color || '#000000';
            g.shadowBlur = sh.blur || 0;
            g.shadowOffsetX = sh.dx || 0;
            g.shadowOffsetY = sh.dy || 0;
        }

        /* Non-destructive colour adjustments (brightness / saturation /
           invert) ride on data.adjust and apply to pixel layers via the
           canvas filter — cheap, live, and serialized with the layer so
           they survive save/undo. Only images and rasters carry pixels. */
        var adj = layer.data && layer.data.adjust;
        if (adj && (layer.type === 'image' || layer.type === 'raster')) {
            var parts = [];
            if (adj.brightness !== undefined && adj.brightness !== 100) { parts.push('brightness(' + (adj.brightness / 100) + ')'); }
            if (adj.contrast !== undefined && adj.contrast !== 100) { parts.push('contrast(' + (adj.contrast / 100) + ')'); }
            if (adj.saturate !== undefined && adj.saturate !== 100) { parts.push('saturate(' + (adj.saturate / 100) + ')'); }
            if (adj.hue) { parts.push('hue-rotate(' + adj.hue + 'deg)'); }
            if (adj.invert) { parts.push('invert(1)'); }
            if (parts.length) { g.filter = parts.join(' '); }
        }

        switch (layer.type) {
            case 'image': {
                var img = imageCache[layer.id];
                if (img && img.complete && img.naturalWidth) {
                    g.drawImage(img, -c.w / 2, -c.h / 2, c.w, c.h);
                }
                break;
            }
            case 'raster': {
                var rc = rasterCache[layer.id];
                if (rc) { g.drawImage(rc, -c.w / 2, -c.h / 2, c.w, c.h); }
                break;
            }
            case 'text':
                drawText(g, layer, c.w, c.h);
                break;
            case 'shape':
                drawShape(g, layer, c.w, c.h);
                break;
            case 'fill': {
                g.fillStyle = makeFillStyle(g, (layer.data || {}).fill, c.w, c.h);
                g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
                break;
            }
            case 'pattern': {
                var pc = renderPattern(layer);
                g.drawImage(pc, -c.w / 2, -c.h / 2, c.w, c.h);
                break;
            }
        }
        g.restore();
    }

    function compose(g, opts) {
        opts = opts || {};
        g.clearRect(0, 0, Editor.w, Editor.h);
        for (var i = 0; i < Editor.layers.length; i++) {
            drawLayer(g, Editor.layers[i]);
        }
        if (opts.includeGuide && Editor.uvGuide.visible && uvImg && uvImg.complete && uvImg.naturalWidth) {
            g.save();
            g.globalAlpha = clamp(Editor.uvGuide.opacity, 0, 1);
            g.drawImage(uvImg, 0, 0, Editor.w, Editor.h);
            g.restore();
        }
    }

    /* ── selection overlay ────────────────────────────────── */

    var HANDLE = 9;   /* handle size in SCREEN px */

    function handlePoints(layer) {
        var c = layerCenter(layer);
        var hw = (c.w * (layer.scaleX || 1)) / 2;
        var hh = (c.h * (layer.scaleY || 1)) / 2;
        /* local (pre-rotation) handle offsets */
        return {
            c: c,
            pts: [
                { k: 'nw', x: -hw, y: -hh }, { k: 'n', x: 0, y: -hh }, { k: 'ne', x: hw, y: -hh },
                { k: 'e', x: hw, y: 0 }, { k: 'se', x: hw, y: hh }, { k: 's', x: 0, y: hh },
                { k: 'sw', x: -hw, y: hh }, { k: 'w', x: -hw, y: 0 },
                { k: 'rot', x: 0, y: -hh - 34 / view.z }
            ],
            hw: hw, hh: hh
        };
    }

    /* Marching ants: two passes (dark under, light over, offset dash)
       so the outline reads on both black and white designs. `antPhase`
       is advanced by the animation loop below. */
    var antPhase = 0;

    function strokeAnts(traceFn) {
        var z = view.z || 1;
        octx.save();
        octx.lineWidth = 1.2 / z;
        octx.setLineDash([]);
        octx.strokeStyle = 'rgba(0,0,0,0.85)';
        traceFn();
        octx.stroke();
        octx.setLineDash([5 / z, 5 / z]);
        octx.lineDashOffset = -antPhase / z;
        octx.strokeStyle = '#FFFFFF';
        traceFn();
        octx.stroke();
        octx.restore();
    }

    function drawSelectionOverlay() {
        /* 1 — the gesture currently being dragged (not committed yet) */
        if (drag && drag.kind === 'marquee') {
            var a = drag.start, b = drag.cur || drag.start;
            var w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
            if (drag.square) { w = h = Math.max(w, h); }
            var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
            if (drag.square) {
                if (b.x < a.x) { x = a.x - w; }
                if (b.y < a.y) { y = a.y - h; }
            }
            var ell = Editor.marquee.mode === 'ellipse';
            strokeAnts(function () {
                octx.beginPath();
                if (ell) {
                    octx.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
                } else {
                    octx.rect(x, y, w, h);
                }
            });
            return;
        }
        if (drag && drag.kind === 'lasso' && drag.pts.length > 1) {
            var pts = drag.pts;
            strokeAnts(function () {
                octx.beginPath();
                octx.moveTo(pts[0].x, pts[0].y);
                for (var i = 1; i < pts.length; i++) { octx.lineTo(pts[i].x, pts[i].y); }
                octx.closePath();
            });
            return;
        }

        /* 2 — the committed selection */
        var s = Editor.selection;
        if (!s) { return; }
        if (s.kind !== 'mask') {
            strokeAnts(function () { tracePath(octx, s); });
            return;
        }
        /* A stencil has no outline to trace, so show the region itself:
           a faint tint plus a dashed bbox. Cheap and unambiguous. */
        octx.save();
        octx.globalAlpha = 0.22;
        octx.drawImage(s.mask, 0, 0, Editor.w, Editor.h);
        octx.restore();
        strokeAnts(function () {
            octx.beginPath();
            octx.rect(s.x, s.y, s.w, s.h);
        });
    }

    function drawOverlay() {
        octx.clearRect(0, 0, Editor.w, Editor.h);

        /* pixel grid */
        if (Editor.gridOn) {
            var step = Math.max(Editor.w, Editor.h) / 16;
            octx.save();
            octx.strokeStyle = 'rgba(255,255,255,0.07)';
            octx.lineWidth = 1 / view.z;
            for (var gx = step; gx < Editor.w; gx += step) {
                octx.beginPath(); octx.moveTo(gx, 0); octx.lineTo(gx, Editor.h); octx.stroke();
            }
            for (var gy = step; gy < Editor.h; gy += step) {
                octx.beginPath(); octx.moveTo(0, gy); octx.lineTo(Editor.w, gy); octx.stroke();
            }
            octx.restore();
        }

        /* symmetry axis guide (while a paint tool is active) */
        if (Editor.symmetry && Editor.symmetry !== 'none'
            && (Editor.tool === 'brush' || Editor.tool === 'eraser')) {
            octx.save();
            octx.strokeStyle = 'rgba(92,122,255,0.7)';
            octx.lineWidth = 1.5 / view.z;
            octx.setLineDash([8 / view.z, 6 / view.z]);
            if (Editor.symmetry === 'x' || Editor.symmetry === 'xy') {
                octx.beginPath(); octx.moveTo(Editor.w / 2, 0); octx.lineTo(Editor.w / 2, Editor.h); octx.stroke();
            }
            if (Editor.symmetry === 'y' || Editor.symmetry === 'xy') {
                octx.beginPath(); octx.moveTo(0, Editor.h / 2); octx.lineTo(Editor.w, Editor.h / 2); octx.stroke();
            }
            octx.restore();
        }

        /* ── selection: live gesture preview + marching ants ── */
        drawSelectionOverlay();

        var layer = Editor.getLayer(Editor.selectedId);
        if (!layer || Editor.tool !== 'select') { return; }

        var hp = handlePoints(layer);
        octx.save();
        octx.translate(hp.c.x, hp.c.y);
        octx.rotate(layer.rotation || 0);

        /* box */
        octx.strokeStyle = '#5C7AFF';
        octx.lineWidth = 1.4 / view.z;
        octx.setLineDash([6 / view.z, 4 / view.z]);
        octx.strokeRect(-hp.hw, -hp.hh, hp.hw * 2, hp.hh * 2);
        octx.setLineDash([]);

        /* rotation stalk */
        octx.beginPath();
        octx.moveTo(0, -hp.hh);
        octx.lineTo(0, -hp.hh - 26 / view.z);
        octx.stroke();

        /* handles */
        var hs = HANDLE / view.z;
        for (var i = 0; i < hp.pts.length; i++) {
            var p = hp.pts[i];
            octx.beginPath();
            if (p.k === 'rot') {
                octx.arc(p.x, p.y, hs * 0.65, 0, Math.PI * 2);
                octx.fillStyle = '#1F5EFF';
                octx.fill();
            } else {
                octx.fillStyle = '#FFFFFF';
                octx.strokeStyle = '#1F5EFF';
                octx.lineWidth = 1.5 / view.z;
                octx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
                octx.strokeRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
            }
        }
        octx.restore();
    }

    /* ── render loop (dirty-flag rAF) ─────────────────────── */

    function requestRender() {
        if (dirtyRender) { return; }
        dirtyRender = true;
        requestAnimationFrame(function () {
            dirtyRender = false;
            var t0 = performance.now();
            compose(ctx, { includeGuide: true });
            drawOverlay();
            var ms = performance.now() - t0;
            var ft = document.getElementById('frame-time');
            if (ft) { ft.textContent = ms.toFixed(1) + ' ms'; }
            /* Bump the revision on EVERY visual change (including mid
               brush-stroke and drag). The 3D viewer polls Editor.rev each
               of its own frames, so the live texture updates even if the
               event subscriptions below never got wired (script load race). */
            Editor.rev++;
            emit('render', {});
        });
    }

    /* The ants are drawn on the OVERLAY canvas, which is a separate
       element with its own context — so animating them needs nothing
       more than drawOverlay(). requestRender() would re-composite every
       layer and bump Editor.rev, and the 3D viewer polls that revision
       to decide whether to re-upload the texture: an idle studio with
       something selected was pushing an unchanged 2048x2048 image to the
       GPU on every frame. */
    var dirtyOverlay = false;
    function requestOverlayRender() {
        if (dirtyOverlay) { return; }
        dirtyOverlay = true;
        requestAnimationFrame(function () {
            dirtyOverlay = false;
            drawOverlay();
        });
    }

    /* Animate the marching ants. The loop only schedules itself while
       something is actually selected (or being dragged), so an idle
       studio costs zero frames. */
    (function antLoop() {
        var running = false;
        function tick() {
            var live = !!Editor.selection || (drag && (drag.kind === 'marquee' || drag.kind === 'lasso'));
            /* A closed studio animates nothing. Without this the loop
               kept burning frames behind the game for as long as a
               selection existed. */
            if (window.App && App.state && App.state.open === false) { live = false; }
            if (!live) { running = false; return; }
            antPhase = (antPhase + 0.6) % 10;
            requestOverlayRender();
            requestAnimationFrame(tick);
        }
        function kick() {
            if (running) { return; }
            running = true;
            requestAnimationFrame(tick);
        }
        Editor.on('selectionMask', kick);
        /* Re-arm on reopen: the loop stops itself while closed, and a
           selection that is still live would otherwise sit frozen. */
        if (window.App && App.on) {
            App.on('open', function () { if (Editor.selection) { kick(); } });
        }
        Editor._kickAnts = kick;
    })();

    /* ── preview transport (v2 — Lua relay only) ──────────── */

    var previewTimer = null;
    var previewLastAt = 0;

    function pushPreviewFrame() {
        if (!window.App || !App.state.previewOn) { return; }
        previewLastAt = Date.now();
        var frame = Editor.compositeDataURL();
        App.nui('previewFrameData', { frame: frame, size: Editor.size });
    }

    function schedulePreviewFrame() {
        if (!window.App || !App.state.previewOn || loading) { return; }
        var throttle = (App.state.config && App.state.config.frameThrottleMs) || 250;
        var elapsed = Date.now() - previewLastAt;
        if (elapsed >= throttle) {
            pushPreviewFrame();                       /* leading edge */
        }
        if (previewTimer) { clearTimeout(previewTimer); }
        previewTimer = setTimeout(pushPreviewFrame,   /* trailing edge */
            Math.max(throttle - Math.max(elapsed, 0), throttle));
    }
    Editor.pushPreviewFrame = pushPreviewFrame;

    /* ── history ──────────────────────────────────────────── */

    function commit() {
        var snap = JSON.stringify(Editor.serialize());
        /* drop redo branch */
        history.splice(histIdx + 1);
        history.push(snap);
        if (history.length > HISTORY_MAX) { history.shift(); }
        histIdx = history.length - 1;
    }

    Editor.canUndo = function () { return histIdx > 0; };
    Editor.canRedo = function () { return histIdx < history.length - 1; };

    function restore(snap) {
        loading = true;
        Editor.load(JSON.parse(snap), true).then(function () {
            loading = false;
            emit('layers', {});
            emit('selection', Editor.selectedId);
            signalChange();
        });
    }

    Editor.undo = function () {
        if (!Editor.canUndo()) { return; }
        histIdx--;
        restore(history[histIdx]);
    };

    Editor.redo = function () {
        if (!Editor.canRedo()) { return; }
        histIdx++;
        restore(history[histIdx]);
    };

    /* ── serialize / load (§13) ───────────────────────────── */

    Editor.serialize = function () {
        var layers = [];
        for (var i = 0; i < Editor.layers.length; i++) {
            var l = Editor.layers[i];
            var data = JSON.parse(JSON.stringify(l.data || {}));
            if (l.type === 'raster') {
                var rc = rasterCache[l.id];
                if (rc) { data.src = rc.toDataURL('image/png'); }
            }
            layers.push({
                id: l.id, type: l.type, name: l.name,
                visible: !!l.visible, locked: !!l.locked,
                opacity: l.opacity === undefined ? 1 : l.opacity,
                blend: l.blend || 'source-over',
                x: l.x, y: l.y,
                scaleX: l.scaleX || 1, scaleY: l.scaleY || 1,
                rotation: l.rotation || 0,
                data: data
            });
        }
        return {
            v: 1,
            size: Editor.size,
            w: Editor.w,
            h: Editor.h,
            background: null,
            layers: layers,
            uvGuide: {
                image: Editor.uvGuide.image,
                opacity: Editor.uvGuide.opacity,
                visible: !!Editor.uvGuide.visible
            }
        };
    };

    /* CRITICAL: every image composited into the canvas MUST load with
       crossOrigin='anonymous'. The texture PNGs come from the cfx-nui
       origin; a plain <img> from another origin TAINTS the canvas, and a
       tainted canvas can't be uploaded to WebGL — the 3D garment then
       stays black forever and export/thumbnails throw SecurityError.
       (three.js defaults to anonymous, which is why .glb textures work.) */
    function newImg() {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        return img;
    }

    function loadImageInto(cacheKey, src, isRaster, w, h) {
        return new Promise(function (resolve) {
            if (!src) { resolve(); return; }
            var img = newImg();
            img.onload = function () {
                if (isRaster) {
                    var rc = makeCanvas(w || img.naturalWidth, h || img.naturalHeight);
                    rc.getContext('2d').drawImage(img, 0, 0);
                    rasterCache[cacheKey] = rc;
                } else {
                    imageCache[cacheKey] = img;
                }
                resolve();
            };
            img.onerror = function () { resolve(); };
            img.src = src;
        });
    }

    Editor.load = function (state, keepHistory) {
        state = state || {};
        loading = true;
        Editor.layers = [];
        Editor.selectedId = null;
        imageCache = {};
        rasterCache = {};
        patternCache = {};

        var lw = state.w || state.size, lh = state.h || state.size;
        if (lw && lh && (lw !== Editor.w || lh !== Editor.h)) {
            applySize(lw, lh);
        }

        var waits = [];
        var layers = state.layers || [];
        for (var i = 0; i < layers.length; i++) {
            var l = layers[i];
            var copy = {
                id: l.id || uid(), type: l.type, name: l.name || l.type,
                visible: l.visible !== false, locked: !!l.locked,
                opacity: l.opacity === undefined ? 1 : l.opacity,
                blend: l.blend || 'source-over',
                x: l.x || 0, y: l.y || 0,
                scaleX: l.scaleX || 1, scaleY: l.scaleY || 1,
                rotation: l.rotation || 0,
                data: JSON.parse(JSON.stringify(l.data || {}))
            };
            Editor.layers.push(copy);
            if (copy.type === 'image') {
                waits.push(loadImageInto(copy.id, copy.data.src, false));
            } else if (copy.type === 'raster') {
                waits.push(loadImageInto(copy.id, copy.data.src, true,
                    copy.data.w || Editor.w, copy.data.h || Editor.h));
                delete copy.data.src;   /* lives in the raster cache while loaded */
            }
        }

        var guide = state.uvGuide || {};
        Editor.uvGuide.opacity = guide.opacity === undefined ? 0.5 : guide.opacity;
        Editor.uvGuide.visible = !!guide.visible;
        Editor.uvGuide.image = guide.image || null;
        uvImg = null;
        if (Editor.uvGuide.image) {
            waits.push(new Promise(function (resolve) {
                var img = newImg();
                img.onload = function () { uvImg = img; resolve(); };
                img.onerror = function () { resolve(); };
                img.src = Editor.uvGuide.image;
            }));
        }

        return Promise.all(waits).then(function () {
            loading = false;
            if (!keepHistory) {
                history = [];
                histIdx = -1;
                commit();
            }
            emit('layers', {});
            emit('selection', null);
            signalChange();
        });
    };

    Editor.clear = function () {
        Editor.load({ v: 1, w: Editor.w, h: Editor.h, layers: [] });
    };

    /* ── thumbnails / composites ──────────────────────────── */

    Editor.compositeDataURL = function () {
        var c = makeCanvas(Editor.w, Editor.h);
        compose(c.getContext('2d'), { includeGuide: false });
        return c.toDataURL('image/png');
    };

    /* Composite the design (WITHOUT the UV guide) straight into an
       external canvas — used by the 3D viewer as a live texture
       source, synchronously and with no dataURL round-trip. */
    Editor.drawToCanvas = function (target) {
        if (!target) { return; }
        if (target.width !== Editor.w || target.height !== Editor.h) {
            target.width = Editor.w;
            target.height = Editor.h;
        }
        compose(target.getContext('2d'), { includeGuide: false });
    };

    Editor.getSize = function () { return Editor.size; };
    Editor.getWidth = function () { return Editor.w; };
    Editor.getHeight = function () { return Editor.h; };
    Editor.requestOverlay = function () { requestRender(); };

    Editor.thumbnail = function (px) {
        px = px || 256;
        var full = makeCanvas(Editor.w, Editor.h);
        compose(full.getContext('2d'), { includeGuide: false });
        /* contain-fit the (possibly non-square) design into a square tile */
        var c = makeCanvas(px, px);
        var g = c.getContext('2d');
        g.fillStyle = '#131314';
        g.fillRect(0, 0, px, px);
        var s = Math.min(px / Editor.w, px / Editor.h);
        var dw = Editor.w * s, dh = Editor.h * s;
        g.drawImage(full, (px - dw) / 2, (px - dh) / 2, dw, dh);
        return c.toDataURL('image/jpeg', 0.7);
    };

    var BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    Editor.layerThumb = function (id, px) {
        px = px || 28;
        try {
            var layer = Editor.getLayer(id);
            var c = makeCanvas(px, px);
            if (!layer) { return BLANK_PNG; }
            var g = c.getContext('2d');
            var s = px / Math.max(Editor.w, Editor.h);
            g.scale(s, s);
            drawLayer(g, Object.assign({}, layer, { opacity: 1 }));
            return c.toDataURL();
        } catch (e) {
            /* tainted canvas / draw error must NEVER blank the layer list */
            return BLANK_PNG;
        }
    };

    /* ── layer CRUD ───────────────────────────────────────── */

    Editor.getLayer = function (id) {
        if (!id) { return null; }
        for (var i = 0; i < Editor.layers.length; i++) {
            if (Editor.layers[i].id === id) { return Editor.layers[i]; }
        }
        return null;
    };

    function layerIndex(id) {
        for (var i = 0; i < Editor.layers.length; i++) {
            if (Editor.layers[i].id === id) { return i; }
        }
        return -1;
    }

    function defaultName(type) {
        /* Built INSIDE the function on purpose. Hoisting this map to
           module scope would evaluate t() at load, before the dictionary
           exists, and freeze every layer name to English — the same trap
           that left the tutorial blank. defaultName runs per add, long
           after boot, so the lookup is always current. */
        var names = {
            image:   t('layer_image',   'Image'),
            text:    t('layer_text',    'Text'),
            shape:   t('layer_shape',   'Shape'),
            fill:    t('layer_fill',    'Fill'),
            raster:  t('layer_paint',   'Paint'),
            pattern: t('layer_pattern', 'Pattern')
        };
        var base = names[type] || t('layer_generic', 'Layer');
        var n = 1;
        Editor.layers.forEach(function (l) {
            if (l.name && l.name.indexOf(base) === 0) { n++; }
        });
        return base + ' ' + n;
    }

    Editor.addLayer = function (type, data, name) {
        var maxLayers = (window.App && App.state.config && App.state.config.maxLayers) || 32;
        if (Editor.layers.length >= maxLayers) {
            if (window.App) { App.toast(t('err_max_layers', 'Layer limit reached (%d).', maxLayers), 'error'); }
            return null;
        }
        data = data || {};
        var layer = {
            id: uid(), type: type, name: name || defaultName(type),
            visible: true, locked: false, opacity: 1, blend: 'source-over',
            x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
            data: data
        };

        if (type === 'raster') {
            data.w = data.w || Editor.w;
            data.h = data.h || Editor.h;
            rasterCache[layer.id] = makeCanvas(data.w, data.h);
            if (data.src) { loadImageInto(layer.id, data.src, true, data.w, data.h).then(requestRender); }
            delete data.src;
        } else if (type === 'image' && data.src) {
            var img = newImg();
            img.onload = function () {
                if (!data.w) {
                    /* fit to 60% of the canvas, centered */
                    var scale = Math.min((Editor.w * 0.6) / img.naturalWidth,
                        (Editor.h * 0.6) / img.naturalHeight, 1);
                    data.w = Math.round(img.naturalWidth * scale);
                    data.h = Math.round(img.naturalHeight * scale);
                    layer.x = Math.round((Editor.w - data.w) / 2);
                    layer.y = Math.round((Editor.h - data.h) / 2);
                }
                imageCache[layer.id] = img;
                emit('layers', {});
                commit();
                signalChange();
            };
            img.src = data.src;
        } else if (type === 'text') {
            var ts = measureText(data);
            if (layer.x === 0 && layer.y === 0 && data._cx === undefined) {
                layer.x = Math.round((Editor.w - ts.w) / 2);
                layer.y = Math.round((Editor.h - ts.h) / 2);
            }
        }

        Editor.layers.push(layer);
        Editor.select(layer.id);
        emit('layers', {});
        commit();
        signalChange();
        return layer;
    };

    Editor.removeLayer = function (id) {
        var idx = layerIndex(id);
        if (idx === -1) { return; }
        Editor.layers.splice(idx, 1);
        delete imageCache[id];
        delete rasterCache[id];
        delete patternCache[id];
        if (Editor.selectedId === id) { Editor.select(null); }
        emit('layers', {});
        commit();
        signalChange();
    };

    Editor.duplicateLayer = function (id) {
        var src = Editor.getLayer(id);
        if (!src) { return null; }
        var copy = JSON.parse(JSON.stringify(src));
        copy.id = uid();
        copy.name = src.name + ' copy';
        copy.x += 24; copy.y += 24;
        if (src.type === 'raster' && rasterCache[id]) {
            var rc = makeCanvas(rasterCache[id].width, rasterCache[id].height);
            rc.getContext('2d').drawImage(rasterCache[id], 0, 0);
            rasterCache[copy.id] = rc;
        }
        if (src.type === 'image' && imageCache[id]) {
            imageCache[copy.id] = imageCache[id];
        }
        Editor.layers.splice(layerIndex(id) + 1, 0, copy);
        Editor.select(copy.id);
        emit('layers', {});
        commit();
        signalChange();
        return copy;
    };

    Editor.moveLayer = function (id, newIndex) {
        var idx = layerIndex(id);
        if (idx === -1) { return; }
        newIndex = clamp(newIndex, 0, Editor.layers.length - 1);
        if (newIndex === idx) { return; }
        var l = Editor.layers.splice(idx, 1)[0];
        Editor.layers.splice(newIndex, 0, l);
        emit('layers', {});
        commit();
        signalChange();
    };

    Editor.updateLayer = function (id, patch, opts) {
        opts = opts || {};
        var layer = Editor.getLayer(id);
        if (!layer) { return; }
        for (var k in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, k)) { continue; }
            if (k === 'data' && typeof patch.data === 'object') {
                for (var dk in patch.data) {
                    if (Object.prototype.hasOwnProperty.call(patch.data, dk)) {
                        layer.data[dk] = patch.data[dk];
                    }
                }
            } else {
                layer[k] = patch[k];
            }
        }
        if (!opts.silent) {
            emit('layers', {});
            if (!opts.noCommit) { commit(); }
            signalChange();
        } else {
            requestRender();
        }
    };

    Editor.select = function (id) {
        if (Editor.selectedId === id) { return; }
        Editor.selectedId = id || null;
        emit('selection', Editor.selectedId);
        requestRender();
    };

    /* ── colour adjustments (non-destructive) ──────────────────
       Patch data.adjust and re-render; drawLayer turns it into a
       canvas filter. Pass {} to clear back to neutral. */
    Editor.setAdjust = function (id, patch, silent) {
        var layer = Editor.getLayer(id);
        if (!layer) { return; }
        layer.data.adjust = Object.assign(layer.data.adjust || {}, patch);
        emit('layers', {});
        /* ⚠ commit() serializes EVERY raster layer to a PNG data URL —
           megabytes of work. On a slider that fires per pixel of travel
           it ran dozens of times a second and filled the whole 20-entry
           undo stack with one drag. Callers pass silent=true while
           dragging and commit once, on 'change'. */
        if (!silent) { commit(); }
        signalChange();
    };
    Editor.getAdjust = function (id) {
        var layer = Editor.getLayer(id);
        return (layer && layer.data && layer.data.adjust) || {};
    };

    /* ── background removal (magic eraser) ─────────────────────
       Knock a flat background out of a pixel layer: sample its four
       corners, clear every pixel within `tol` of that colour, with a
       soft edge so the cut never looks jagged. Works on the target
       layer's OWN pixels (not the composite), so a logo on top keeps
       its surroundings. Image layers are rasterised first so the edit
       has somewhere to live. Returns true on success. */
    function corners(d, w, h) {
        var idx = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
        var r = 0, g = 0, b = 0, a = 0;
        idx.forEach(function (i) { r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; });
        return { r: r / 4, g: g / 4, b: b / 4, a: a / 4 };
    }

    function knockout(canvasEl, tol) {
        var g = canvasEl.getContext('2d');
        var W = canvasEl.width, H = canvasEl.height;
        var img;
        try { img = g.getImageData(0, 0, W, H); } catch (e) { return false; }
        var d = img.data;
        var bg = corners(d, W, H);
        /* a nearly-transparent layer has no background to cut */
        if (bg.a < 8) { return false; }
        var tolSq = tol * tol * 3;
        for (var i = 0; i < d.length; i += 4) {
            var dr = d[i] - bg.r, dg = d[i + 1] - bg.g, db = d[i + 2] - bg.b;
            var dist = dr * dr + dg * dg + db * db;
            if (dist <= tolSq) {
                /* fully clear at the centre of the range, feather at the edge */
                d[i + 3] = Math.round(d[i + 3] * Math.min(1, dist / tolSq));
            }
        }
        g.putImageData(img, 0, 0);
        return true;
    }

    Editor.removeBackground = function (id, tol) {
        tol = tol || 46;
        var layer = Editor.getLayer(id);
        if (!layer) { return false; }

        if (layer.type === 'raster') {
            var rc = rasterCache[layer.id];
            if (!rc) { return false; }
            if (!knockout(rc, tol)) { return false; }
        } else if (layer.type === 'image') {
            var im = imageCache[layer.id];
            if (!im || !im.naturalWidth) { return false; }
            /* bake the image into a raster we can edit, at native res */
            var c = makeCanvas(im.naturalWidth, im.naturalHeight);
            c.getContext('2d').drawImage(im, 0, 0);
            if (!knockout(c, tol)) { return false; }
            /* swap the layer to a raster carrying the cut pixels, keeping
               its box + transform so nothing jumps on screen */
            rasterCache[layer.id] = c;
            delete imageCache[layer.id];
            layer.type = 'raster';
            layer.data.w = im.naturalWidth;
            layer.data.h = im.naturalHeight;
        } else {
            return false;
        }
        emit('layers', {});
        commit();
        signalChange();
        return true;
    };

    /* ── tool management ──────────────────────────────────── */

    var CURSORS = {
        select: 'default', brush: 'crosshair', eraser: 'crosshair',
        text: 'text', shape: 'crosshair', fill: 'cell', pattern: 'cell',
        image: 'copy', eyedrop: 'crosshair', ai: 'default',
        marquee: 'crosshair'
    };

    /* Changing the marquee sub-mode re-renders the options row and the
       cursor hint; feather/tolerance only matter for the NEXT gesture. */
    Editor.setMarquee = function (patch) {
        for (var k in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, k)) { Editor.marquee[k] = patch[k]; }
        }
        emit('tool', Editor.tool);
        requestRender();
    };

    Editor.setTool = function (name) {
        if (name === 'image') {
            var fi = document.getElementById('file-image');
            if (fi) { fi.click(); }
            return;
        }
        if (name === 'ai') {
            emit('tool', 'ai');       /* panels.js opens the AI pane */
            return;
        }
        Editor.tool = name;
        if (wrap) { wrap.style.cursor = CURSORS[name] || 'default'; }
        emit('tool', name);
        requestRender();
    };

    /* ── view (zoom / pan) ────────────────────────────────── */

    function applyView() {
        var tf = 'translate(' + view.px + 'px,' + view.py + 'px) scale(' + view.z + ')';
        canvas.style.transform = tf;
        overlay.style.transform = tf;
        Editor.zoom = view.z;
        var zv = document.getElementById('zoom-value');
        if (zv) { zv.textContent = Math.round(view.z * 100) + '%'; }
        emit('view', { zoom: view.z });
        requestRender();
    }

    Editor.setZoom = function (z, cx, cy) {
        z = clamp(z, 0.1, 8);
        var rect = wrap.getBoundingClientRect();
        if (cx === undefined) { cx = rect.width / 2; }
        if (cy === undefined) { cy = rect.height / 2; }
        /* keep the point under the cursor stationary */
        var beforeX = (cx - view.px) / view.z;
        var beforeY = (cy - view.py) / view.z;
        view.z = z;
        view.px = cx - beforeX * z;
        view.py = cy - beforeY * z;
        applyView();
    };

    Editor.resetView = function () {
        var rect = wrap.getBoundingClientRect();
        var z = Math.min((rect.width - 80) / Editor.w, (rect.height - 80) / Editor.h);
        view.z = clamp(z, 0.02, 4);
        view.px = (rect.width - Editor.w * view.z) / 2;
        view.py = (rect.height - Editor.h * view.z) / 2;
        applyView();
    };

    /* ── size ─────────────────────────────────────────────── */

    function applySize(w, h) {
        h = h || w;
        Editor.w = w; Editor.h = h;
        Editor.size = Math.max(w, h);
        canvas.width = w; canvas.height = h;
        overlay.width = w; overlay.height = h;
        patternCache = {};
        /* A stencil is sized to the old canvas — keeping it would clip
           every tool against a region that no longer maps to anything. */
        if (Editor.selection) {
            Editor.selection = null;
            emit('selectionMask', null);
        }
    }

    /* setSize(w, h) — pass one value for a square canvas, two for a
       texture-matched (e.g. 1024×2048) canvas. */
    Editor.setSize = function (w, h) {
        h = h || w;
        if (w === Editor.w && h === Editor.h) { return; }
        applySize(w, h);
        emit('layers', {});
        commit();
        signalChange();
        Editor.resetView();
    };

    /* ── UV guide ─────────────────────────────────────────── */

    Editor.setUvGuide = function (dataURL) {
        Editor.uvGuide.image = dataURL || null;
        uvImg = null;
        if (dataURL) {
            var img = new Image();
            img.onload = function () {
                uvImg = img;
                Editor.uvGuide.visible = true;
                emit('layers', {});
                requestRender();
            };
            img.src = dataURL;
        } else {
            requestRender();
        }
    };

    /* Show/hide the loaded UV guide without reloading the image. */
    Editor.setUvVisible = function (v) {
        Editor.uvGuide.visible = !!v;
        requestRender();
    };
    Editor.hasUvGuide = function () { return !!Editor.uvGuide.image; };
    Editor.setUvOpacity = function (o) {
        Editor.uvGuide.opacity = clamp(o, 0, 1);
        requestRender();
    };

    /* ════════════════════════════════════════════════════════
       §SELECTION — marquee / lasso / magic wand
       --------------------------------------------------------
       A selection is a stencil, not a layer. It never owns
       pixels; it only decides WHERE the other tools are allowed
       to write. Shape:

         { kind : 'rect'|'ellipse'|'lasso'|'mask',
           x,y,w,h : integer bbox (always present),
           pts  : [{x,y}]  — lasso outline (lasso only),
           mask : canvas   — Editor.w×Editor.h alpha stencil }

       `mask` is authoritative; `kind`/`pts` exist so the overlay
       can trace an exact outline instead of marching a bitmap.
       Boolean ops (add / subtract) collapse the result to
       kind 'mask' because the union of a circle and a lasso has
       no closed-form outline worth keeping.
       ════════════════════════════════════════════════════════ */

    var scratchCanvas = null;
    function scratch(w, h) {
        if (!scratchCanvas) { scratchCanvas = makeCanvas(w, h); }
        if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
            scratchCanvas.width = w; scratchCanvas.height = h;
        } else {
            scratchCanvas.getContext('2d').clearRect(0, 0, w, h);
        }
        return scratchCanvas;
    }

    /* Trace a selection's geometry onto a 2D context. Returns false
       for 'mask' kinds, which have no vector outline. */
    function tracePath(g, sel) {
        if (!sel) { return false; }
        if (sel.kind === 'rect') {
            g.beginPath();
            g.rect(sel.x, sel.y, sel.w, sel.h);
            return true;
        }
        if (sel.kind === 'ellipse') {
            g.beginPath();
            g.ellipse(sel.x + sel.w / 2, sel.y + sel.h / 2,
                Math.max(0.5, sel.w / 2), Math.max(0.5, sel.h / 2), 0, 0, Math.PI * 2);
            return true;
        }
        if (sel.kind === 'lasso' && sel.pts && sel.pts.length > 2) {
            g.beginPath();
            g.moveTo(sel.pts[0].x, sel.pts[0].y);
            for (var i = 1; i < sel.pts.length; i++) { g.lineTo(sel.pts[i].x, sel.pts[i].y); }
            g.closePath();
            return true;
        }
        return false;
    }

    /* Rasterize geometry into a fresh full-canvas alpha stencil. */
    function rasterizeSelection(sel) {
        var m = makeCanvas(Editor.w, Editor.h);
        var g = m.getContext('2d');
        g.fillStyle = '#fff';
        if (tracePath(g, sel)) { g.fill(); }
        var feather = Editor.marquee.feather || 0;
        if (feather > 0.5) {
            /* A blur on the stencil IS the feather — every consumer
               multiplies by this alpha, so soft edges come for free. */
            var b = makeCanvas(Editor.w, Editor.h);
            var bg = b.getContext('2d');
            bg.filter = 'blur(' + feather + 'px)';
            bg.drawImage(m, 0, 0);
            return b;
        }
        return m;
    }

    /* Tight integer bbox of a stencil's non-zero alpha. Returns null
       when the stencil is empty (i.e. the selection selected nothing). */
    function maskBounds(mask) {
        var g = mask.getContext('2d');
        var d;
        try { d = g.getImageData(0, 0, mask.width, mask.height).data; }
        catch (e) { return { x: 0, y: 0, w: mask.width, h: mask.height }; }
        var minX = mask.width, minY = mask.height, maxX = -1, maxY = -1;
        for (var y = 0; y < mask.height; y++) {
            var row = y * mask.width * 4;
            for (var x = 0; x < mask.width; x++) {
                if (d[row + x * 4 + 3] > 8) {
                    if (x < minX) { minX = x; }
                    if (x > maxX) { maxX = x; }
                    if (y < minY) { minY = y; }
                    if (y > maxY) { maxY = y; }
                }
            }
        }
        if (maxX < 0) { return null; }
        return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    /* Commit a selection, applying the pending boolean op against
       whatever is already selected. Emits 'selectionMask' so the UI
       can enable/disable the selection-only actions. */
    function setSelection(sel, op) {
        if (!sel) {
            Editor.selection = null;
            emit('selectionMask', null);
            requestRender();
            return null;
        }
        var incoming = sel.mask || rasterizeSelection(sel);
        var prev = Editor.selection;
        op = op || 'new';

        if (prev && (op === 'add' || op === 'sub')) {
            var m = makeCanvas(Editor.w, Editor.h);
            var g = m.getContext('2d');
            g.drawImage(prev.mask, 0, 0);
            g.globalCompositeOperation = (op === 'add') ? 'source-over' : 'destination-out';
            g.drawImage(incoming, 0, 0);
            sel = { kind: 'mask', mask: m, pts: null };
        } else {
            sel = {
                kind: sel.kind || 'mask',
                pts: sel.pts || null,
                mask: incoming
            };
        }

        /* A rectangle/ellipse drawn fresh already knows its bbox — skip
           the full-canvas alpha scan, which at 2048² reads 16 MB. Only
           lassos, wands and boolean results need measuring. */
        var b;
        if (op === 'new' && (sel.kind === 'rect' || sel.kind === 'ellipse')
            && arguments[0] && arguments[0].w) {
            var src = arguments[0];
            var f = Math.ceil(Editor.marquee.feather || 0);
            b = {
                x: Math.max(0, src.x - f),
                y: Math.max(0, src.y - f),
                w: Math.min(Editor.w, src.w + f * 2),
                h: Math.min(Editor.h, src.h + f * 2)
            };
        } else {
            b = maskBounds(sel.mask);
        }
        if (!b) { return setSelection(null); }   /* subtracted to nothing */
        sel.x = b.x; sel.y = b.y; sel.w = b.w; sel.h = b.h;

        Editor.selection = sel;
        emit('selectionMask', sel);
        requestRender();
        return sel;
    }

    Editor.hasSelection = function () { return !!Editor.selection; };
    Editor.getSelection = function () { return Editor.selection; };
    Editor.selectionBounds = function () {
        var s = Editor.selection;
        return s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null;
    };

    Editor.deselect = function () { setSelection(null); };

    Editor.selectAll = function () {
        setSelection({ kind: 'rect', x: 0, y: 0, w: Editor.w, h: Editor.h }, 'new');
    };

    Editor.invertSelection = function () {
        if (!Editor.selection) { Editor.selectAll(); return; }
        var m = makeCanvas(Editor.w, Editor.h);
        var g = m.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, Editor.w, Editor.h);
        g.globalCompositeOperation = 'destination-out';
        g.drawImage(Editor.selection.mask, 0, 0);
        setSelection({ kind: 'mask', mask: m }, 'new');
    };

    /* Grow / shrink the stencil by `px`. Implemented as a blur +
       alpha threshold, which is a good approximation of a morphology
       pass and costs one composite instead of a per-pixel kernel. */
    Editor.expandSelection = function (px) {
        var s = Editor.selection;
        if (!s || !px) { return; }
        var grow = px > 0;
        var r = Math.abs(px);
        var m = makeCanvas(Editor.w, Editor.h);
        var g = m.getContext('2d');
        if (!grow) {
            /* shrink = grow the INVERSE, then invert back */
            g.fillStyle = '#fff';
            g.fillRect(0, 0, Editor.w, Editor.h);
            g.globalCompositeOperation = 'destination-out';
            g.drawImage(s.mask, 0, 0);
        } else {
            g.drawImage(s.mask, 0, 0);
        }
        var blurred = makeCanvas(Editor.w, Editor.h);
        var bg = blurred.getContext('2d');
        bg.filter = 'blur(' + r + 'px)';
        bg.drawImage(m, 0, 0);
        bg.filter = 'none';
        /* threshold: anything the blur touched at all counts as inside */
        var img = bg.getImageData(0, 0, Editor.w, Editor.h);
        var d = img.data;
        for (var i = 3; i < d.length; i += 4) { d[i] = d[i] > 24 ? 255 : 0; }
        bg.putImageData(img, 0, 0);
        if (!grow) {
            var back = makeCanvas(Editor.w, Editor.h);
            var kg = back.getContext('2d');
            kg.fillStyle = '#fff';
            kg.fillRect(0, 0, Editor.w, Editor.h);
            kg.globalCompositeOperation = 'destination-out';
            kg.drawImage(blurred, 0, 0);
            blurred = back;
        }
        setSelection({ kind: 'mask', mask: blurred }, 'new');
    };

    /* Magic wand — flood/global select by colour similarity against
       the COMPOSITE (what the user actually sees), so it works no
       matter which layer the colour came from. */
    function magicWand(p, tolerance, contiguous) {
        var W = Editor.w, H = Editor.h;
        var flat = makeCanvas(W, H);
        var fg = flat.getContext('2d');
        compose(fg, { includeGuide: false });
        var src;
        try { src = fg.getImageData(0, 0, W, H).data; }
        catch (e) { return null; }

        var sx = clamp(Math.round(p.x), 0, W - 1);
        var sy = clamp(Math.round(p.y), 0, H - 1);
        var si = (sy * W + sx) * 4;
        var r0 = src[si], g0 = src[si + 1], b0 = src[si + 2], a0 = src[si + 3];
        var tol = (tolerance === undefined ? 32 : tolerance);
        var tolSq = tol * tol * 3;   /* squared distance across 3 channels */

        var m = makeCanvas(W, H);
        var mg = m.getContext('2d');
        var out = mg.createImageData(W, H);
        var od = out.data;

        function similar(i) {
            var dr = src[i] - r0, dg = src[i + 1] - g0, db = src[i + 2] - b0;
            var da = src[i + 3] - a0;
            return (dr * dr + dg * dg + db * db) <= tolSq && Math.abs(da) <= tol + 16;
        }

        if (!contiguous) {
            for (var i = 0; i < W * H; i++) {
                if (similar(i * 4)) { od[i * 4 + 3] = 255; }
            }
        } else {
            /* scanline flood fill — an explicit stack, never recursion
               (a 2048² region would blow the JS call stack instantly) */
            var seen = new Uint8Array(W * H);
            var stack = [sy * W + sx];
            while (stack.length) {
                var idx = stack.pop();
                if (seen[idx]) { continue; }
                var y = (idx / W) | 0, x = idx - y * W;
                /* walk left */
                var xl = x;
                while (xl >= 0 && !seen[y * W + xl] && similar((y * W + xl) * 4)) { xl--; }
                xl++;
                /* walk right */
                var xr = x;
                while (xr < W && !seen[y * W + xr] && similar((y * W + xr) * 4)) { xr++; }
                xr--;
                for (var cx = xl; cx <= xr; cx++) {
                    var ci = y * W + cx;
                    seen[ci] = 1;
                    od[ci * 4 + 3] = 255;
                    if (y > 0) {
                        var up = (y - 1) * W + cx;
                        if (!seen[up] && similar(up * 4)) { stack.push(up); }
                    }
                    if (y < H - 1) {
                        var dn = (y + 1) * W + cx;
                        if (!seen[dn] && similar(dn * 4)) { stack.push(dn); }
                    }
                }
            }
        }
        /* white RGB so the stencil composites predictably */
        for (var k = 0; k < od.length; k += 4) {
            if (od[k + 3]) { od[k] = od[k + 1] = od[k + 2] = 255; }
        }
        mg.putImageData(out, 0, 0);

        var feather = Editor.marquee.feather || 0;
        if (feather > 0.5) {
            var fb = makeCanvas(W, H);
            var fbg = fb.getContext('2d');
            fbg.filter = 'blur(' + feather + 'px)';
            fbg.drawImage(m, 0, 0);
            return fb;
        }
        return m;
    }

    Editor.magicWandAt = function (x, y, op) {
        var mask = magicWand({ x: x, y: y }, Editor.marquee.tolerance, Editor.marquee.contiguous);
        if (!mask) { return null; }
        return setSelection({ kind: 'mask', mask: mask }, op || 'new');
    };

    /* ── selection-aware operations ───────────────────────────
       All of these are no-ops without a selection, so the UI can
       wire them unconditionally. */

    /* Every raster layer the user is allowed to modify. The BASE
       texture counts only when the user unlocked it — the same rule
       the brush follows, so "Delete" never silently punches a hole
       in the garment sheet. */
    function editableRasters() {
        var out = [];
        var sel = Editor.getLayer(Editor.selectedId);
        if (sel && sel.type === 'raster' && !sel.locked) { return [sel]; }
        for (var i = 0; i < Editor.layers.length; i++) {
            var l = Editor.layers[i];
            if (l.type === 'raster' && !l.locked && l.visible) { out.push(l); }
        }
        return out;
    }

    /* Erase everything inside the selection on the target raster(s). */
    Editor.deleteSelection = function () {
        var s = Editor.selection;
        if (!s) { return false; }
        var targets = editableRasters();
        if (!targets.length) { return false; }
        for (var i = 0; i < targets.length; i++) {
            var rc = rasterCache[targets[i].id];
            if (!rc) { continue; }
            var g = rc.getContext('2d');
            g.save();
            g.globalCompositeOperation = 'destination-out';
            g.drawImage(s.mask, 0, 0, rc.width, rc.height);
            g.restore();
        }
        emit('layers', {});
        commit();
        signalChange();
        return true;
    };

    /* Flood the selection with the current brush colour (or any
       colour) on a NEW layer, so it stays non-destructive. */
    Editor.fillSelection = function (color) {
        var s = Editor.selection;
        if (!s) { return null; }
        var c = makeCanvas(Editor.w, Editor.h);
        var g = c.getContext('2d');
        g.fillStyle = color || Editor.brush.color;
        g.fillRect(0, 0, Editor.w, Editor.h);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(s.mask, 0, 0);
        var layer = Editor.addLayer('raster',
            { src: c.toDataURL('image/png'), w: Editor.w, h: Editor.h },
            t('sel_fill_layer', 'Selection fill'));
        return layer;
    };

    /* Copy the composited pixels inside the selection into a new
       image layer, positioned exactly where they were. */
    Editor.selectionToLayer = function (cut) {
        var s = Editor.selection;
        if (!s) { return null; }
        var flat = makeCanvas(Editor.w, Editor.h);
        compose(flat.getContext('2d'), { includeGuide: false });
        var g = flat.getContext('2d');
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(s.mask, 0, 0);

        /* crop to the bbox so the layer box hugs the content */
        var c = makeCanvas(s.w, s.h);
        c.getContext('2d').drawImage(flat, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);

        if (cut) { Editor.deleteSelection(); }
        var layer = Editor.addLayer('image',
            { src: c.toDataURL('image/png'), w: s.w, h: s.h },
            cut ? t('sel_cut_layer', 'Cut selection') : t('sel_copy_layer', 'Copied selection'));
        if (layer) {
            layer.x = s.x; layer.y = s.y;
            emit('layers', {});
            signalChange();
        }
        return layer;
    };

    /* The selection as a standalone PNG, cropped to its bbox.
       `opaque` fills transparent areas with the given colour — image
       models choke on alpha, so AI calls pass one. `maxPx` caps the
       longest side (AI references are uploaded in 200KB chunks, so a
       2048px crop is wasted bandwidth); it only ever shrinks. */
    Editor.selectionDataURL = function (opaque, maxPx) {
        var s = Editor.selection;
        if (!s) { return null; }
        var flat = makeCanvas(Editor.w, Editor.h);
        compose(flat.getContext('2d'), { includeGuide: false });
        var fg = flat.getContext('2d');
        fg.globalCompositeOperation = 'destination-in';
        fg.drawImage(s.mask, 0, 0);

        var scale = maxPx ? Math.min(1, maxPx / Math.max(s.w, s.h)) : 1;
        var cw = Math.max(1, Math.round(s.w * scale));
        var ch = Math.max(1, Math.round(s.h * scale));
        var c = makeCanvas(cw, ch);
        var g = c.getContext('2d');
        if (opaque) {
            g.fillStyle = (typeof opaque === 'string') ? opaque : '#ffffff';
            g.fillRect(0, 0, cw, ch);
        }
        g.drawImage(flat, s.x, s.y, s.w, s.h, 0, 0, cw, ch);
        return c.toDataURL('image/png');
    };

    /* Drop an image INTO the selection: it is scaled to the bbox and
       clipped by the stencil, so an AI result lands exactly inside
       the region the user drew. Resolves with the new layer. */
    Editor.placeImageInSelection = function (src, name) {
        var s = Editor.selection;
        if (!s) { return Promise.resolve(null); }
        return new Promise(function (resolve) {
            var img = newImg();
            img.onload = function () {
                var c = makeCanvas(Editor.w, Editor.h);
                var g = c.getContext('2d');
                /* cover-fit into the bbox: never distort the generation */
                var sc = Math.max(s.w / img.naturalWidth, s.h / img.naturalHeight);
                var dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
                g.drawImage(img, s.x + (s.w - dw) / 2, s.y + (s.h - dh) / 2, dw, dh);
                g.globalCompositeOperation = 'destination-in';
                g.drawImage(s.mask, 0, 0);
                var layer = Editor.addLayer('raster',
                    { src: c.toDataURL('image/png'), w: Editor.w, h: Editor.h },
                    name || t('sel_ai_layer', 'AI in selection'));
                resolve(layer);
            };
            img.onerror = function () { resolve(null); };
            img.src = src;
        });
    };

    /* ── pointer interaction ──────────────────────────────── */

    function docPoint(e) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (Editor.w / rect.width),
            y: (e.clientY - rect.top) * (Editor.h / rect.height)
        };
    }

    function toLayerLocal(layer, p) {
        var c = layerCenter(layer);
        var dx = p.x - c.x, dy = p.y - c.y;
        var rot = -(layer.rotation || 0);
        var rx = dx * Math.cos(rot) - dy * Math.sin(rot);
        var ry = dx * Math.sin(rot) + dy * Math.cos(rot);
        return { x: rx / (layer.scaleX || 1), y: ry / (layer.scaleY || 1), c: c };
    }

    function hitTest(p) {
        for (var i = Editor.layers.length - 1; i >= 0; i--) {
            var l = Editor.layers[i];
            /* base texture layers are paintable but never draggable —
               moving them would shift the whole UV mapping */
            if (!l.visible || l.locked || (l.data && l.data.isBase)) { continue; }
            var local = toLayerLocal(l, p);
            if (Math.abs(local.x) <= local.c.w / 2 && Math.abs(local.y) <= local.c.h / 2) {
                return l;
            }
        }
        return null;
    }

    function hitHandle(layer, p) {
        if (!layer) { return null; }
        var hp = handlePoints(layer);
        var rot = layer.rotation || 0;
        var dx = p.x - hp.c.x, dy = p.y - hp.c.y;
        var rx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
        var ry = dx * Math.sin(-rot) + dy * Math.cos(-rot);
        var reach = (HANDLE + 4) / view.z;
        for (var i = 0; i < hp.pts.length; i++) {
            var h = hp.pts[i];
            if (Math.abs(rx - h.x) <= reach && Math.abs(ry - h.y) <= reach) { return h.k; }
        }
        return null;
    }

    var drag = null;   /* current pointer gesture */

    function ensurePaintLayer() {
        var sel = Editor.getLayer(Editor.selectedId);
        // Paint on the SELECTED raster (whatever the user picked) as long as
        // it's unlocked. Never fall back to another raster (that hijacked the
        // base texture — every stroke landed on it). If the selection isn't a
        // paintable layer, make a FRESH paint layer on top and select it.
        if (sel && sel.type === 'raster' && !sel.locked) { return sel; }
        return Editor.addLayer('raster', {}, t('layer_paint', 'Paint'));
    }

    /* Symmetry: return the stroke plus its mirror(s) across the canvas
       centre — so drawing one side paints both (essential for clothing). */
    function mirrorPairs(from, to) {
        var pairs = [{ from: from, to: to }];
        var W = Editor.w, H = Editor.h, s = Editor.symmetry;
        var mx = function (p) { return { x: W - p.x, y: p.y }; };
        var my = function (p) { return { x: p.x, y: H - p.y }; };
        if (s === 'x' || s === 'xy') { pairs.push({ from: mx(from), to: mx(to) }); }
        if (s === 'y' || s === 'xy') { pairs.push({ from: my(from), to: my(to) }); }
        if (s === 'xy') { pairs.push({ from: my(mx(from)), to: my(mx(to)) }); }
        return pairs;
    }

    function drawSegment(g, from, to, erase) {
        if (Editor.brushType === 'spray' && !erase) {
            var r = Math.max(1, Editor.brush.size / 2);
            var dist = Math.hypot(to.x - from.x, to.y - from.y);
            var steps = Math.max(1, Math.floor(dist / 2) + 1);
            var density = Math.max(4, Math.floor(r * 0.7));
            g.fillStyle = Editor.brush.color;
            g.globalAlpha = 0.28;
            for (var st = 0; st <= steps; st++) {
                var cx = from.x + (to.x - from.x) * (st / steps);
                var cy = from.y + (to.y - from.y) * (st / steps);
                for (var d = 0; d < density; d++) {
                    var ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * r;
                    g.beginPath();
                    g.arc(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, 1.1, 0, Math.PI * 2);
                    g.fill();
                }
            }
            g.globalAlpha = 1;
            return;
        }
        g.beginPath();
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
        g.stroke();
    }

    /* Lay down one stroke segment (plus its symmetry mirrors) on `g`.
       `solid` forces an opaque black stroke — used when the stroke is
       being drawn into a scratch buffer that will later be masked and
       composited with destination-out (the eraser-inside-a-selection
       path), where the colour is irrelevant but the alpha is not. */
    function paintSegments(g, from, to, erase, solid) {
        g.strokeStyle = solid ? '#000000' : Editor.brush.color;
        g.lineWidth = Editor.brush.size;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        var soft = (1 - clamp(Editor.brush.hardness, 0, 1)) * Editor.brush.size * 0.6;
        if (soft > 0.5 && !erase && Editor.brushType !== 'spray') {
            g.shadowColor = solid ? '#000000' : Editor.brush.color;
            g.shadowBlur = soft;
        }
        var pairs = mirrorPairs(from, to);
        for (var i = 0; i < pairs.length; i++) {
            drawSegment(g, pairs[i].from, pairs[i].to, solid ? false : erase);
        }
    }

    function strokeTo(layer, from, to, erase) {
        var rc = rasterCache[layer.id];
        if (!rc) { return; }
        var g = rc.getContext('2d');
        var sel = Editor.selection;
        var op = erase ? 'destination-out'
            : (Editor.brushType === 'marker' ? 'multiply' : 'source-over');

        if (!sel) {
            g.save();
            g.globalCompositeOperation = op;
            paintSegments(g, from, to, erase, false);
            g.restore();
        } else if (sel.kind !== 'mask') {
            /* Vector selection → a plain clip path. Cheapest route, and
               exact: the browser antialiases the clip for us. */
            g.save();
            g.globalCompositeOperation = op;
            tracePath(g, sel);
            g.clip();
            paintSegments(g, from, to, erase, false);
            g.restore();
        } else {
            /* Stencil selection (wand / boolean result) → paint the
               segment into a scratch buffer, multiply it by the stencil,
               then composite the masked result in one draw. This is the
               only way an ERASE can respect a soft-edged mask. */
            var sc = scratch(rc.width, rc.height);
            var sg = sc.getContext('2d');
            sg.save();
            paintSegments(sg, from, to, false, !!erase);
            sg.restore();
            sg.save();
            sg.globalCompositeOperation = 'destination-in';
            sg.drawImage(sel.mask, 0, 0, sc.width, sc.height);
            sg.restore();

            g.save();
            g.globalCompositeOperation = op;
            g.drawImage(sc, 0, 0);
            g.restore();
        }
        requestRender();
    }

    function samplePixel(p) {
        var c = makeCanvas(Editor.w, Editor.h);
        var g = c.getContext('2d');
        compose(g, { includeGuide: false });
        var d = g.getImageData(clamp(Math.round(p.x), 0, Editor.w - 1),
            clamp(Math.round(p.y), 0, Editor.h - 1), 1, 1).data;
        function hex(n) { return ('0' + n.toString(16)).slice(-2); }
        return '#' + hex(d[0]) + hex(d[1]) + hex(d[2]);
    }

    function onPointerDown(e) {
        if (e.button === 1 || (e.button === 0 && (e.altKey || spaceHeld))) {
            drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: view.px, py: view.py };
            wrap.setPointerCapture(e.pointerId);
            e.preventDefault();
            return;
        }
        if (e.button !== 0) { return; }
        var p = docPoint(e);
        var tool = Editor.tool;

        if (tool === 'marquee') {
            /* Shift = add to the selection, Alt = subtract. The op chip
               in the tool options sets the same field, so either input
               works and the chip always reflects what will happen. */
            var mop = e.shiftKey ? 'add' : (e.altKey ? 'sub' : (Editor.marquee.op || 'new'));
            if (Editor.marquee.mode === 'wand') {
                Editor.magicWandAt(p.x, p.y, mop);
            } else if (Editor.marquee.mode === 'lasso') {
                drag = { kind: 'lasso', pts: [{ x: p.x, y: p.y }], op: mop };
            } else {
                drag = { kind: 'marquee', start: p, cur: p, op: mop };
            }
            if (Editor._kickAnts) { Editor._kickAnts(); }
        } else if (tool === 'select') {
            var sel = Editor.getLayer(Editor.selectedId);
            var handle = sel ? hitHandle(sel, p) : null;
            if (handle) {
                var c0 = layerCenter(sel);
                drag = {
                    kind: handle === 'rot' ? 'rotate' : 'resize',
                    handle: handle, layer: sel, start: p,
                    startRot: sel.rotation || 0,
                    startSX: sel.scaleX || 1, startSY: sel.scaleY || 1,
                    center: { x: c0.x, y: c0.y }, size: { w: c0.w, h: c0.h }
                };
            } else {
                var hitL = hitTest(p);
                if (hitL) {
                    Editor.select(hitL.id);
                    drag = { kind: 'move', layer: hitL, start: p, lx: hitL.x, ly: hitL.y };
                } else {
                    Editor.select(null);
                }
            }
        } else if (tool === 'brush' || tool === 'eraser') {
            var pl = ensurePaintLayer();
            if (!pl) { return; }
            drag = { kind: 'paint', layer: pl, last: p, erase: tool === 'eraser' };
            strokeTo(pl, p, { x: p.x + 0.01, y: p.y + 0.01 }, drag.erase);
        } else if (tool === 'shape') {
            var shapeLayer = Editor.addLayer('shape', {
                shape: Editor.shapeKind,
                w: 4, h: 4,
                fill: { type: 'solid', color: Editor.brush.color },
                stroke: null
            });
            if (shapeLayer) {
                shapeLayer.x = p.x; shapeLayer.y = p.y;
                drag = { kind: 'drawShape', layer: shapeLayer, start: p };
            }
        } else if (tool === 'text') {
            var textLayer = Editor.addLayer('text', {
                text: t('text_default', 'Your text'),
                font: 'Inter',
                size: Editor.textDefaults.size,
                weight: Editor.textDefaults.weight,
                color: Editor.textDefaults.color,
                stroke: null, align: 'center'
            });
            if (textLayer) {
                var ts = measureText(textLayer.data);
                Editor.updateLayer(textLayer.id, { x: p.x - ts.w / 2, y: p.y - ts.h / 2 });
            }
            Editor.setTool('select');
        } else if (tool === 'fill') {
            /* With a selection active, "fill" means "flood the region I
               drew" — a whole-canvas fill layer would ignore it. */
            if (Editor.selection) {
                Editor.fillSelection(Editor.brush.color);
                e.preventDefault();
                return;
            }
            /* one fill layer per document — click updates it */
            var fillLayer = null;
            for (var i = 0; i < Editor.layers.length; i++) {
                if (Editor.layers[i].type === 'fill') { fillLayer = Editor.layers[i]; break; }
            }
            if (fillLayer) {
                Editor.updateLayer(fillLayer.id, { data: { fill: { type: 'solid', color: Editor.brush.color } } });
                Editor.select(fillLayer.id);
            } else {
                Editor.addLayer('fill', { fill: { type: 'solid', color: Editor.brush.color } });
                /* move it to the bottom so it acts as a base coat */
                var created = Editor.layers[Editor.layers.length - 1];
                Editor.moveLayer(created.id, 0);
            }
        } else if (tool === 'pattern') {
            Editor.addLayer('pattern', {
                kind: 'stripes',
                colors: ['#131314', Editor.brush.color, '#F4F4F5'],
                scale: 1, angle: 45,
                seed: Math.floor(Math.random() * 1e9)
            });
        } else if (tool === 'eyedrop') {
            Editor.brush.color = samplePixel(p);
            emit('tool', Editor.tool);   /* refresh tool options UI */
        }

        if (drag) { wrap.setPointerCapture(e.pointerId); }
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!drag) { return; }
        var p = docPoint(e);

        switch (drag.kind) {
            case 'marquee':
                /* Shift constrains to a square/circle. It also means
                   "add" on pointerdown — by then the op is already
                   captured, so the two uses never collide. */
                drag.cur = p;
                drag.square = e.shiftKey;
                requestRender();
                break;
            case 'lasso': {
                var lastP = drag.pts[drag.pts.length - 1];
                /* thin the path: sub-pixel points cost memory and add
                   nothing to the outline */
                if (Math.hypot(p.x - lastP.x, p.y - lastP.y) >= 2) {
                    drag.pts.push({ x: p.x, y: p.y });
                    requestRender();
                }
                break;
            }
            case 'pan':
                view.px = drag.px + (e.clientX - drag.sx);
                view.py = drag.py + (e.clientY - drag.sy);
                applyView();
                break;
            case 'move':
                Editor.updateLayer(drag.layer.id, {
                    x: drag.lx + (p.x - drag.start.x),
                    y: drag.ly + (p.y - drag.start.y)
                }, { silent: true });
                break;
            case 'rotate': {
                var ang = Math.atan2(p.y - drag.center.y, p.x - drag.center.x)
                    - Math.atan2(drag.start.y - drag.center.y, drag.start.x - drag.center.x);
                var rot = drag.startRot + ang;
                if (e.shiftKey) { rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12); }
                Editor.updateLayer(drag.layer.id, { rotation: rot }, { silent: true });
                break;
            }
            case 'resize': {
                var rot2 = -(drag.layer.rotation || 0);
                var dx = p.x - drag.center.x, dy = p.y - drag.center.y;
                var lx = dx * Math.cos(rot2) - dy * Math.sin(rot2);
                var ly = dx * Math.sin(rot2) + dy * Math.cos(rot2);
                var sx = drag.startSX, sy = drag.startSY;
                var h = drag.handle;
                if (h.indexOf('e') !== -1 || h.indexOf('w') !== -1) {
                    sx = clamp(Math.abs(lx) / (drag.size.w / 2), 0.05, 40);
                }
                if (h.indexOf('n') !== -1 || h.indexOf('s') !== -1) {
                    sy = clamp(Math.abs(ly) / (drag.size.h / 2), 0.05, 40);
                }
                if (e.shiftKey || h === 'ne' || h === 'nw' || h === 'se' || h === 'sw') {
                    var uni = Math.max(sx / drag.startSX, sy / drag.startSY);
                    if (e.shiftKey) {
                        sx = drag.startSX * uni;
                        sy = drag.startSY * uni;
                    }
                }
                Editor.updateLayer(drag.layer.id, { scaleX: sx, scaleY: sy }, { silent: true });
                break;
            }
            case 'paint':
                strokeTo(drag.layer, drag.last, p, drag.erase);
                drag.last = p;
                break;
            case 'drawShape': {
                var x0 = Math.min(drag.start.x, p.x), y0 = Math.min(drag.start.y, p.y);
                var w = Math.abs(p.x - drag.start.x), hgt = Math.abs(p.y - drag.start.y);
                if (e.shiftKey) { w = hgt = Math.max(w, hgt); }
                Editor.updateLayer(drag.layer.id, {
                    x: x0, y: y0,
                    data: { w: Math.max(w, 4), h: Math.max(hgt, 4) }
                }, { silent: true });
                break;
            }
        }
    }

    function onPointerUp(e) {
        if (!drag) { return; }

        /* Selection gestures commit a stencil, not a layer — they touch
           no pixels, so they must NOT push a history entry. */
        if (drag.kind === 'marquee') {
            var a = drag.start, b = drag.cur || drag.start;
            var w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
            if (drag.square) { w = h = Math.max(w, h); }
            var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
            if (drag.square) {
                if (b.x < a.x) { x = a.x - w; }
                if (b.y < a.y) { y = a.y - h; }
            }
            var op = drag.op;
            var mode = Editor.marquee.mode;
            drag = null;
            try { wrap.releasePointerCapture(e.pointerId); } catch (err) { /* ok */ }
            /* a click without a drag clears the selection */
            if (w < 2 || h < 2) { setSelection(null); return; }
            setSelection({
                kind: mode === 'ellipse' ? 'ellipse' : 'rect',
                x: Math.round(x), y: Math.round(y),
                w: Math.round(w), h: Math.round(h)
            }, op);
            return;
        }
        if (drag.kind === 'lasso') {
            var pts = drag.pts;
            var lop = drag.op;
            drag = null;
            try { wrap.releasePointerCapture(e.pointerId); } catch (err) { /* ok */ }
            if (!pts || pts.length < 3) { setSelection(null); return; }
            setSelection({ kind: 'lasso', pts: pts }, lop);
            return;
        }

        var wasGesture = drag.kind !== 'pan';
        var kind = drag.kind;
        drag = null;
        try { wrap.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
        if (wasGesture) {
            emit('layers', {});
            commit();
            signalChange();
            if (kind === 'drawShape') { Editor.setTool('select'); }
        }
    }

    function onDblClick(e) {
        var p = docPoint(e);
        var layer = hitTest(p);
        if (layer && layer.type === 'text' && window.App) {
            App.prompt(t('edit_text_title', 'Edit text'), t('edit_text_label', 'Text'),
                layer.data.text, { multiline: true, rows: 3 }).then(function (val) {
                if (val === null) { return; }
                Editor.updateLayer(layer.id, { data: { text: val } });
            });
        }
    }

    /* space-drag panning */
    var spaceHeld = false;
    document.addEventListener('keydown', function (e) {
        if (e.code === 'Space' && !e.repeat) {
            var el = document.activeElement;
            var typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
            if (!typing) { spaceHeld = true; }
        }
        if ((e.key === 'Delete' || e.key === 'Backspace')) {
            var el2 = document.activeElement;
            var typing2 = el2 && (el2.tagName === 'INPUT' || el2.tagName === 'TEXTAREA');
            if (typing2 || !(window.App && App.state.open)) { return; }
            /* A marquee selection wins over the layer selection: Delete
               means "erase these pixels", which is what every image
               editor does. Without one it still deletes the layer. */
            if (Editor.selection) {
                e.preventDefault();
                Editor.deleteSelection();
            } else if (Editor.selectedId) {
                Editor.removeLayer(Editor.selectedId);
            }
        }
    });
    document.addEventListener('keyup', function (e) {
        if (e.code === 'Space') { spaceHeld = false; }
    });

    /* ── file inputs / drag-drop ──────────────────────────── */

    function readImageFile(file, cb) {
        if (!file || String(file.type).indexOf('image/') !== 0) { return; }
        var reader = new FileReader();
        reader.onload = function () { cb(String(reader.result)); };
        reader.readAsDataURL(file);
    }

    function bindFiles() {
        var fi = document.getElementById('file-image');
        if (fi) {
            fi.addEventListener('change', function () {
                var file = fi.files && fi.files[0];
                fi.value = '';
                readImageFile(file, function (src) {
                    Editor.addLayer('image', { src: src });
                    Editor.setTool('select');
                });
            });
        }

        var hint = document.getElementById('drop-hint');
        wrap.addEventListener('dragover', function (e) {
            e.preventDefault();
            if (hint) { hint.hidden = false; }
        });
        wrap.addEventListener('dragleave', function () {
            if (hint) { hint.hidden = true; }
        });
        wrap.addEventListener('drop', function (e) {
            e.preventDefault();
            if (hint) { hint.hidden = true; }
            var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            readImageFile(file, function (src) {
                Editor.addLayer('image', { src: src });
            });
        });
    }

    /* ── init ─────────────────────────────────────────────── */

    Editor.init = function (wrapEl) {
        wrap = wrapEl || document.getElementById('canvas-wrap');
        canvas = document.getElementById('editor-canvas');
        overlay = document.getElementById('overlay-canvas');
        ctx = canvas.getContext('2d');
        octx = overlay.getContext('2d');

        /* defensive inline layout: both canvases stacked at 0,0
           inside a relatively-positioned, clipped wrap */
        wrap.style.position = 'relative';
        wrap.style.overflow = 'hidden';
        [canvas, overlay].forEach(function (el) {
            el.style.position = 'absolute';
            el.style.left = '0';
            el.style.top = '0';
            el.style.transformOrigin = '0 0';
        });
        overlay.style.pointerEvents = 'none';

        applySize(Editor.w, Editor.h);

        wrap.addEventListener('pointerdown', onPointerDown);
        wrap.addEventListener('pointermove', onPointerMove);
        wrap.addEventListener('pointerup', onPointerUp);
        wrap.addEventListener('pointercancel', onPointerUp);
        wrap.addEventListener('dblclick', onDblClick);
        wrap.addEventListener('wheel', function (e) {
            e.preventDefault();
            var rect = wrap.getBoundingClientRect();
            var factor = e.deltaY < 0 ? 1.12 : (1 / 1.12);
            Editor.setZoom(view.z * factor, e.clientX - rect.left, e.clientY - rect.top);
        }, { passive: false });

        bindFiles();

        window.addEventListener('resize', function () {
            if (window.App && App.state.open) { Editor.resetView(); }
        });

        history = [];
        histIdx = -1;
        commit();
        Editor.resetView();
        requestRender();
    };

    document.addEventListener('DOMContentLoaded', function () {
        Editor.init(document.getElementById('canvas-wrap'));
    });

    window.Editor = Editor;
})();
