/* ════════════════════════════════════════════════════════════
   APEX CLOTHING STUDIO — viewer.js
   ------------------------------------------------------------
   The isolated 3D garment preview (left panel). Renders a .glb
   clothing mesh from stream/models/ with three.js and paints the
   right-hand canvas design onto it as a LIVE texture — no game
   ped involved. Rotate with drag, zoom with the wheel.

   Templates come from stream/models/models.json:
     { "templates": [ {
         "id", "name", "gender", "component",
         "glb":  "stream/models/vest.glb",     // web mesh (.glb)
         "txd":  "mp_m_freemode_01_apex_templates/jbib_diff_012_a_uni",
         "txn":  "jbib_diff_012_a_uni",         // in-game name (export)
         "baseTexture": "stream/models/vest.png", // optional start image
         "size": 1024                            // optional canvas size
     } ] }

   The selected template also tells the exporter which in-game
   texture (txd/txn) to replace, so Export → Live / Package still
   produces a real retexture for actual gameplay.
   ════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var RESOURCE = 'apex_vehicles';
    var BASE = 'https://cfx-nui-' + RESOURCE + '/';

    var Viewer = {};

    var scene, camera, renderer, controls, loader;
    var modelRoot = null;
    var texCanvas = null, texture = null;
    var rafId = null;
    var running = false;
    var wireframe = false;
    var activeId = null;
    var refreshQueued = false;
    var texDirty = true;      // when set, the render loop repaints the mesh texture
    var lastRev = -1;         // last Editor.rev we painted onto the mesh

    /* ── Texture upload budget ────────────────────────────────
       Rebuilding the sheet costs a full-canvas clear, a composite of
       every layer and a 2048² GPU upload. Editor.rev changes on every
       mouse move, so doing this per frame is what makes painting feel
       like the game is hitching. 30 ms (~33 Hz) is well under what the
       eye resolves on a texture that is being scribbled on, and the
       trailing timer below guarantees the final state always lands. */
    var TEX_MIN_INTERVAL = 30;
    var lastTexAt = 0;
    var pendingTex = null;    // trailing timer id, when a refresh was deferred
    var texCtx = null;        // cached 2D context (getContext is not free)
    var tmpCtx = null;
    var uvCrop = null;        // {u0,v0,u1,v1} UV bbox of the mesh — the editor
                              // shows ONLY this region of the texture sheet
    var activeSurfaceTxn = null;  // GTA texture name of the surface being painted
    // Per-car texture alignment fix: flip / rotate the whole texture so a
    // design lands right on cars whose UV is mirrored/rotated. Applied to
    // BOTH the 3D preview AND the export, so they always match.
    var vehXform = { flipH: false, flipV: false, rot: 0 };
    var tmpCanvas = null;     // editor composite staging (crop mode)
    var panLimit = 0;         // max distance the pan target may drift from
                              // the car's centre (set per model; 0 = no clamp)

    /* ── availability guards ──────────────────────────────── */

    function hasThree() {
        return typeof window.THREE !== 'undefined' && !!window.THREE.WebGLRenderer;
    }

    function el(id) { return document.getElementById(id); }

    /* Takes a KEY, not a finished sentence.
       The span it writes into carries data-i18n="viewer_empty", so a
       pre-resolved string had two problems: it was English whenever this
       ran before the boot payload, and applyI18n would then treat that
       English as viewer_empty's pristine fallback and replace the text
       with viewer_empty — losing the actual diagnostic the player needed.
       Re-stamping data-i18n (and OVERWRITING i18nFb, which applyI18n
       only sets when absent) keeps the message correct and translatable. */
    function showEmpty(key, fallback) {
        var e = el('viewer-empty');
        if (e) {
            e.hidden = false;
            if (key) {
                var span = e.querySelector('span');
                if (span) {
                    span.setAttribute('data-i18n', key);
                    span.dataset.i18nFb = fallback || '';
                    span.textContent = (typeof t === 'function') ? t(key, fallback) : (fallback || '');
                }
            }
        }
    }
    function hideEmpty() { var e = el('viewer-empty'); if (e) { e.hidden = true; } }
    function setLoading(on) { var l = el('viewer-loading'); if (l) { l.hidden = !on; } }

    /* ── three.js scene ───────────────────────────────────── */

    function buildScene(canvas) {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0b0d);

        camera = new THREE.PerspectiveCamera(42, 1, 0.01, 2000);
        camera.position.set(0, 0.2, 3);

        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        if (THREE.sRGBEncoding !== undefined) { renderer.outputEncoding = THREE.sRGBEncoding; }

        // Even, neutral studio lighting so the printed texture reads true.
        scene.add(new THREE.AmbientLight(0xffffff, 0.95));
        var key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(3, 5, 4); scene.add(key);
        var fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-4, 1, -3); scene.add(fill);
        var rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(0, 3, -5); scene.add(rim);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 0.55));

        if (THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.12;       // short, crisp inertia — long
                                                 // tails read as "laggy/buggy"
            controls.rotateSpeed = 1.0;          // 1:1 with the mouse
            controls.zoomSpeed = 1.1;
            // Move the car in EVERY direction: RIGHT-drag or MIDDLE-drag pans
            // (screen-space, follows the mouse exactly); LEFT-drag orbits.
            // The pan target is clamped in the render loop so the car can
            // never be lost off-screen; double-click or R reframes it.
            controls.enablePan = true;
            controls.screenSpacePanning = true;
            controls.panSpeed = 1.1;
            if (THREE.MOUSE) {
                controls.mouseButtons = {
                    LEFT: THREE.MOUSE.ROTATE,
                    MIDDLE: THREE.MOUSE.PAN,
                    RIGHT: THREE.MOUSE.PAN
                };
            }
            controls.minDistance = 0.2;
            controls.maxDistance = 12;
            controls.autoRotate = false;
            controls.autoRotateSpeed = 1.6;
        }

        // ── Click a panel on the car → mark WHERE it is on the canvas ──
        // Uses the real UV of the clicked point, so it works no matter how
        // the car was unwrapped. A plain click (not an orbit drag).
        var _rc = new THREE.Raycaster();
        var _ndc = new THREE.Vector2();
        var _dx = 0, _dy = 0, _dt = 0;
        renderer.domElement.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) { return; }              // right/middle = pan/zoom
            _dx = e.clientX; _dy = e.clientY; _dt = Date.now();
        });
        renderer.domElement.addEventListener('pointerup', function (e) {
            if (e.button !== 0) { return; }              // pan release must never ping
            if (!modelRoot) { return; }
            if (Math.abs(e.clientX - _dx) + Math.abs(e.clientY - _dy) > 6) { return; }  // orbit drag
            if (Date.now() - _dt > 600) { return; }
            var rect = renderer.domElement.getBoundingClientRect();
            _ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            _ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            _rc.setFromCamera(_ndc, camera);
            var hits = _rc.intersectObject(modelRoot, true);
            if (hits.length && hits[0].uv) { pingCanvasUv(wrap01(hits[0].uv.x), wrap01(hits[0].uv.y)); }
        });

        // Lost the car while panning/zooming? Double-click reframes it.
        renderer.domElement.addEventListener('dblclick', function () {
            if (modelRoot) { frameModel(modelRoot); }
        });

        // ── Keyboard: arrows/WASD move the car, Q/E orbit, R reframes ──
        // Shifts BOTH the camera and the orbit target by a screen-space
        // step, so the car slides exactly the way the arrow points and
        // the orbit pivot follows it (rotation stays centred on the car).
        function kbPan(dxPx, dyPx) {
            if (!controls) { return; }
            var dist = camera.position.distanceTo(controls.target);
            var h = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * dist;
            var perPx = h / Math.max(renderer.domElement.clientHeight, 1);
            var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
            var up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
            // car appears to move +dx/+dy when the camera moves the other way
            var move = right.multiplyScalar(-dxPx * perPx)
                .add(up.multiplyScalar(-dyPx * perPx));
            camera.position.add(move);
            controls.target.add(move);
        }
        function kbOrbit(angle) {
            if (!controls) { return; }
            var offset = camera.position.clone().sub(controls.target);
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            camera.position.copy(controls.target).add(offset);
            camera.lookAt(controls.target);
        }
        // HOVER-GATED so it never fights the editor shortcuts (E = eraser,
        // R = rotate layer, arrows = nudge layer): the keys only act while
        // the pointer is over the 3D panel, and then they CAPTURE the event
        // before the editor's document-level handler sees it.
        var viewerHover = false;
        var hoverEl = el('viewer-wrap') || renderer.domElement;
        hoverEl.addEventListener('pointerenter', function () { viewerHover = true; });
        hoverEl.addEventListener('pointerleave', function () { viewerHover = false; });
        window.addEventListener('keydown', function (e) {
            if (!viewerHover || !running || !modelRoot || !controls) { return; }
            var ae = document.activeElement;
            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) { return; }
            if (e.ctrlKey || e.metaKey || e.altKey) { return; }
            var k = e.key;
            var step = e.shiftKey ? 60 : 22;     // px per tap; Shift = faster
            var did = true;
            if (k === 'ArrowLeft' || k === 'a' || k === 'A') { kbPan(-step, 0); }
            else if (k === 'ArrowRight' || k === 'd' || k === 'D') { kbPan(step, 0); }
            else if (k === 'ArrowUp' || k === 'w' || k === 'W') { kbPan(0, step); }
            else if (k === 'ArrowDown' || k === 's' || k === 'S') { kbPan(0, -step); }
            else if (k === 'q' || k === 'Q') { kbOrbit(0.10); }
            else if (k === 'e' || k === 'E') { kbOrbit(-0.10); }
            else if (k === 'r' || k === 'R') { frameModel(modelRoot); }
            else { did = false; }
            if (did) { e.preventDefault(); e.stopPropagation(); }
        }, true);   // capture phase → runs BEFORE the editor's shortcuts

        loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
    }

    /* ── live texture from the editor ─────────────────────── */

    function edW() { return (window.Editor && Editor.getWidth) ? Editor.getWidth() : 1024; }
    function edH() { return (window.Editor && Editor.getHeight) ? Editor.getHeight() : 1024; }

    // Wrap a raw GTA UV coordinate into [0,1) — exactly what
    // RepeatWrapping does on the GPU (this mesh's v is negative).
    function wrap01(t) { t = t % 1; if (t < 0) { t += 1; } return t; }

    // Draw src into dst applying the current flip/rotate alignment transform.
    function xformIdentity() { return !vehXform.flipH && !vehXform.flipV && !vehXform.rot; }
    function drawXform(src, dst) {
        var w = dst.width, h = dst.height;
        var g = dst.getContext('2d');
        g.save();
        g.clearRect(0, 0, w, h);
        g.translate(w / 2, h / 2);
        if (vehXform.rot) { g.rotate(vehXform.rot * Math.PI / 180); }
        g.scale(vehXform.flipH ? -1 : 1, vehXform.flipV ? -1 : 1);
        g.drawImage(src, -w / 2, -h / 2, w, h);
        g.restore();
    }
    // Public: apply the SAME transform to any composite (used by the export
    // so the exported .png matches exactly what the 3D preview shows).
    Viewer.applyXform = function (src) {
        if (xformIdentity() || !src) { return src; }
        var d = document.createElement('canvas');
        d.width = src.width; d.height = src.height;
        drawXform(src, d);
        return d;
    };
    Viewer.hasXform = function () { return !xformIdentity(); };
    Viewer.flipH = function () { vehXform.flipH = !vehXform.flipH; texDirty = true; refreshTexture(); };
    Viewer.flipV = function () { vehXform.flipV = !vehXform.flipV; texDirty = true; refreshTexture(); };
    Viewer.rotate90 = function () { vehXform.rot = (vehXform.rot + 90) % 360; texDirty = true; refreshTexture(); };
    Viewer.resetXform = function () { vehXform = { flipH: false, flipV: false, rot: 0 }; texDirty = true; refreshTexture(); };

    // Flash a marker on the editor canvas at UV (u,v) — same convention as
    // the UV guide (x = u*W, y = v*H). Shows the user exactly where to paint
    // for the car panel they clicked in 3D.
    var _pingEl = null, _pingTimer = null, _pingStyled = false, _pingHinted = false;
    function pingCanvasUv(u, v) {
        var ov = document.getElementById('overlay-canvas');
        if (!ov) { return; }
        if (!_pingStyled) {
            var st = document.createElement('style');
            st.textContent = '@keyframes apexUvPing{0%{transform:scale(.35);opacity:1}100%{transform:scale(1.7);opacity:0}}';
            document.head.appendChild(st); _pingStyled = true;
        }
        var r = ov.getBoundingClientRect();
        if (!_pingEl) {
            _pingEl = document.createElement('div');
            _pingEl.style.cssText = 'position:fixed;z-index:99999;width:26px;height:26px;margin:-13px 0 0 -13px;'
                + 'border:3px solid #4f9dff;border-radius:50%;box-shadow:0 0 12px rgba(79,157,255,.9);pointer-events:none;';
            document.body.appendChild(_pingEl);
        }
        _pingEl.style.left = (r.left + u * r.width) + 'px';
        _pingEl.style.top = (r.top + v * r.height) + 'px';
        _pingEl.style.display = 'block';
        _pingEl.style.animation = 'none'; void _pingEl.offsetWidth;
        _pingEl.style.animation = 'apexUvPing 1.2s ease-out infinite';
        if (!_pingHinted && window.App && App.toast) {
            _pingHinted = true;
            App.toast(t('veh_uv_ping', 'That car panel is here on the canvas — paint around the marker.'), 'info');
        }
        clearTimeout(_pingTimer);
        _pingTimer = setTimeout(function () { if (_pingEl) { _pingEl.style.display = 'none'; } }, 4000);
    }

    // The UV bounding box of the mesh = the only region of the texture
    // sheet the garment actually uses. The editor shows JUST this region
    // (pixel-exact crop, no stretching); everything maps through it.
    function computeUvBounds(root) {
        var u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, n = 0;
        root.traverse(function (o) {
            if (!o.isMesh || !o.geometry) { return; }
            var uv = o.geometry.attributes && o.geometry.attributes.uv;
            if (!uv) { return; }
            for (var i = 0; i < uv.count; i++) {
                var u = wrap01(uv.getX(i)), v = wrap01(uv.getY(i));
                if (u < u0) { u0 = u; } if (u > u1) { u1 = u; }
                if (v < v0) { v0 = v; } if (v > v1) { v1 = v; }
                n++;
            }
        });
        if (!n) { return null; }
        var padU = (u1 - u0) * 0.02 + 0.004;
        var padV = (v1 - v0) * 0.02 + 0.004;
        u0 = Math.max(0, u0 - padU); v0 = Math.max(0, v0 - padV);
        u1 = Math.min(1, u1 + padU); v1 = Math.min(1, v1 + padV);
        // Degenerate, or effectively the whole sheet → no crop needed.
        if ((u1 - u0) < 0.02 || (v1 - v0) < 0.02) { return null; }
        if ((u1 - u0) > 0.96 && (v1 - v0) > 0.96) { return null; }
        return { u0: u0, v0: v0, u1: u1, v1: v1 };
    }

    function buildTexture() {
        texCanvas = document.createElement('canvas');
        texCanvas.width = edW(); texCanvas.height = edH();
        texture = new THREE.CanvasTexture(texCanvas);
        texture.flipY = false;                       // glTF UV convention
        // CRITICAL: GTA meshes use wrap-around UVs (this dress: v -0.43…-0.02).
        // CanvasTexture defaults to ClampToEdge, which collapses every
        // negative coordinate onto the texture's edge row — the garment then
        // renders one flat color no matter what's painted. Repeat wraps
        // v=-0.43 → 0.57 exactly like the glb's own sampler does.
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        if (THREE.sRGBEncoding !== undefined) { texture.encoding = THREE.sRGBEncoding; }
        try { texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); } catch (e) { /* ok */ }
        refreshTexture();
    }

    /* The actual rebuild. Never call this straight from the render loop
       — go through refreshTexture(), which rate-limits it. */
    function rebuildTexture() {
        if (!texCanvas || !window.Editor || !Editor.drawToCanvas) { return; }
        try {
            if (uvCrop) {
                // The editor holds ONLY the used region of the sheet.
                // Rebuild a full sheet: white everywhere, the editor's
                // composite placed back into the UV bbox — the mesh then
                // samples it exactly where the original texture lived.
                if (!tmpCanvas) { tmpCanvas = document.createElement('canvas'); }
                Editor.drawToCanvas(tmpCanvas);
                var W = 2048, H = 2048;   // normalized backing — UVs are ratios
                if (texCanvas.width !== W || texCanvas.height !== H) {
                    texCanvas.width = W; texCanvas.height = H;
                }
                var g = texCanvas.getContext('2d');
                g.fillStyle = '#ffffff';
                g.fillRect(0, 0, W, H);
                g.drawImage(tmpCanvas,
                    uvCrop.u0 * W, uvCrop.v0 * H,
                    (uvCrop.u1 - uvCrop.u0) * W, (uvCrop.v1 - uvCrop.v0) * H);
            } else {
                // The canvas IS the sheet. Composite the design, add a white
                // underlay (transparent would sample BLACK on an opaque
                // material), then bake the flip/rotate alignment transform.
                //
                // With no flip/rotate — the common case — the staging canvas
                // and the full-sheet copy through drawXform are pure waste,
                // so compose straight into the texture. Guarded on the
                // dimensions too: drawToCanvas RESIZES its target to the
                // editor's size, so this is only a 1:1 substitution when
                // they already agree. When they do, drawXform is exactly
                // clearRect + drawImage at the same size, so nothing about
                // the result can differ.
                var direct = xformIdentity()
                    && texCanvas.width === Editor.getWidth()
                    && texCanvas.height === Editor.getHeight();

                var target;
                if (direct) {
                    target = texCanvas;
                } else {
                    if (!tmpCanvas) { tmpCanvas = document.createElement('canvas'); }
                    if (tmpCanvas.width !== texCanvas.width || tmpCanvas.height !== texCanvas.height) {
                        tmpCanvas.width = texCanvas.width; tmpCanvas.height = texCanvas.height;
                    }
                    target = tmpCanvas;
                }

                Editor.drawToCanvas(target);
                var g2 = target.getContext('2d');
                g2.save();
                g2.globalCompositeOperation = 'destination-over';
                g2.fillStyle = '#ffffff';
                g2.fillRect(0, 0, target.width, target.height);
                g2.restore();
                if (!direct) { drawXform(tmpCanvas, texCanvas); }
            }
        } catch (e) { /* never block the render loop */ }
        if (texture) { texture.needsUpdate = true; }
    }

    /* Rate-limited entry point. Runs immediately when the budget allows,
       otherwise schedules ONE trailing run — so the last edit of a
       stroke is always the one that ends up on the mesh. */
    function refreshTexture() {
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        var since = now - lastTexAt;
        if (since >= TEX_MIN_INTERVAL) {
            if (pendingTex) { clearTimeout(pendingTex); pendingTex = null; }
            lastTexAt = now;
            rebuildTexture();
            return;
        }
        if (pendingTex) { return; }             // one trailing run is enough
        pendingTex = setTimeout(function () {
            pendingTex = null;
            lastTexAt = (window.performance && performance.now) ? performance.now() : Date.now();
            rebuildTexture();
        }, TEX_MIN_INTERVAL - since);
    }

    /* Bypass the limiter when correctness beats smoothness: a model or
       texture load must land on the very next frame, not up to 30 ms
       later, or the mesh briefly shows the previous car. */
    function refreshTextureNow() {
        if (pendingTex) { clearTimeout(pendingTex); pendingTex = null; }
        lastTexAt = (window.performance && performance.now) ? performance.now() : Date.now();
        rebuildTexture();
    }

    function queueRefresh() {
        if (refreshQueued) { return; }
        refreshQueued = true;
        requestAnimationFrame(function () { refreshQueued = false; refreshTexture(); });
    }

    /* ── model loading ────────────────────────────────────── */

    function disposeModel() {
        if (!modelRoot) { return; }
        scene.remove(modelRoot);
        modelRoot.traverse(function (o) {
            if (o.isMesh) {
                if (o.geometry) { o.geometry.dispose(); }
                var mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(function (m) { if (m && m.dispose) { m.dispose(); } });
            }
        });
        modelRoot = null;
    }

    // The GTA texture name a material carries (glTF keeps material.name,
    // e.g. 'box' / 'zwart' / 'reclame'), lowercased for matching.
    function matName(m) { return (m && m.name) ? String(m.name).toLowerCase() : ''; }

    // Record each mesh's ORIGINAL surfaces (name + map + material) ONCE, so we
    // can rebind materials any number of times when the user switches the
    // active paint surface without losing the names/textures.
    function texName(m) { return (m && m.map && m.map.name) ? String(m.map.name).toLowerCase() : ''; }

    function captureSurfaces(root) {
        root.traverse(function (o) {
            if (!o.isMesh) { return; }
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            o.userData.surfaces = mats.map(function (m) {
                // A surface is identified by its GTA texture name — glTF keeps
                // it on BOTH the material AND the texture, so match either
                // (some cars have the name only on one of them).
                return { name: matName(m), tex: texName(m), map: (m && m.map) || null, orig: m };
            });
        });
    }

    // GTA livery convention: '<name>_sign_N' surfaces are mapped on the
    // SECOND UV channel (the ZModeler "livery UV"); the first channel on
    // those meshes belongs to the base paint/dirt layer. Many cars simply
    // duplicate the two channels (then this is a harmless no-op), but on
    // cars that don't (e.g. polbmwm3) rendering the livery with channel 1
    // scatters/misaligns it across the body. glTF only encodes texCoord 0
    // on baseColor, so swap uv ← uv2 on sign meshes: rendering, the UV
    // guide AND the click-to-ping raycast (all of which read '.uv') then
    // sample the SAME channel the game does.
    function promoteLiveryUv(root) {
        root.traverse(function (o) {
            if (!o.isMesh || !o.geometry || !o.geometry.attributes) { return; }
            var isSign = (o.userData.surfaces || []).some(function (s) {
                return /_sign_\d+$/.test(s.name || '') || /_sign_\d+$/.test(s.tex || '');
            });
            if (!isSign) { return; }
            var attrs = o.geometry.attributes;
            var uv2 = attrs.uv2 || attrs.uv1;   // three <r152 names TEXCOORD_1 'uv2'
            if (uv2 && uv2 !== attrs.uv) {
                o.geometry.setAttribute('uv', uv2);
            }
        });
    }

    // Bind our live editable canvas ONLY to the meshes whose surface is the
    // ACTIVE one; every other mesh keeps its REAL texture. That's why we
    // paint just the box (or just the body, etc.) and never the whole car.
    function applyTexture(root) {
        var target = activeSurfaceTxn ? String(activeSurfaceTxn).toLowerCase() : null;
        if (!target) {
            // Default surface = the largest texture (the main paint area).
            var bigArea = -1, bigName = '';
            root.traverse(function (o) {
                (o.userData.surfaces || []).forEach(function (s) {
                    if (s.map && s.map.image) {
                        var a = (s.map.image.width || 0) * (s.map.image.height || 0);
                        if (a > bigArea) { bigArea = a; bigName = s.name || s.tex; }
                    }
                });
            });
            target = bigName; activeSurfaceTxn = bigName;
        }
        // Clean material (no inherited metalness/tint that renders black).
        var mkWith = function (map) {
            return new THREE.MeshStandardMaterial({
                map: map, color: 0xffffff, roughness: 0.85, metalness: 0.0,
                side: THREE.DoubleSide, wireframe: wireframe
            });
        };
        var build = function (s) {
            if (target && (s.name === target || s.tex === target)) { return mkWith(texture); }   // editable canvas
            if (s.map) { return mkWith(s.map); }                           // real texture
            if (s.orig) { s.orig.side = THREE.DoubleSide; s.orig.wireframe = wireframe; return s.orig; }
            return mkWith(null);
        };
        root.traverse(function (o) {
            if (!o.isMesh) { return; }
            o.frustumCulled = false;
            var surfs = o.userData.surfaces || [];
            if (Array.isArray(o.material)) {
                o.material = surfs.map(build);
            } else {
                o.material = build(surfs[0] || { name: '', map: null, orig: null });
            }
        });
    }

    // Switch which surface the canvas paints (called by panels.js when the
    // texture-variant dropdown changes). txn = the GTA texture name.
    Viewer.setPaintSurface = function (txn) {
        activeSurfaceTxn = txn ? String(txn).toLowerCase() : null;
        if (modelRoot) {
            applyTexture(modelRoot);
            texDirty = true;
            refreshTextureNow();
        }
    };

    // GTA drawables come out of the converter Z-up; glTF/three.js is
    // Y-up. A single FIXED rotation uprights EVERY garment consistently
    // (a per-shape heuristic mis-guessed the up axis for some, leaving
    // them upside-down/sideways). Camera stays Y-up so the mouse orbit
    // is natural. Flip FLIP_FRONT if garments show their back.
    var GARMENT_TILT = -Math.PI / 2;   // Z-up → Y-up (car sits upright)
    var FLIP_FRONT = false;            // set true if the back faces us
    // Vehicles read best as a SIDE profile, so yaw 90° around the
    // vertical axis. Flip the sign (or use Math.PI / -Math.PI) if a
    // car faces the wrong way.
    var VEHICLE_YAW = Math.PI / 2;

    function orientGarment(root) {
        // The gtax converter BAKES the Z-up→Y-up fix into the glb's root
        // node (a -90° X quaternion), so these models load ALREADY upright
        // with their length along Z. Tilting them again (the old fixed
        // GARMENT_TILT) laid the car on its back — horizontal orbit then
        // read as vertical tumbling and the front/rear views were
        // unreachable. Vehicles are always LONGER than TALL, so measure
        // the untilted model: length on Z → already upright, no tilt;
        // length on Y → raw Z-up export, tilt like before.
        root.rotation.set(0, 0, 0);
        root.position.set(0, 0, 0);
        root.updateMatrixWorld(true);
        var raw = new THREE.Box3().setFromObject(root);
        if (raw.isEmpty()) { return null; }
        var rawSize = raw.getSize(new THREE.Vector3());
        var tilt = (rawSize.z >= rawSize.y) ? 0 : GARMENT_TILT;

        root.rotation.set(tilt, VEHICLE_YAW + (FLIP_FRONT ? Math.PI : 0), 0);
        root.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) { return null; }
        var center = box.getCenter(new THREE.Vector3());
        root.position.sub(center);          // recenter → orbit pivots at middle
        root.updateMatrixWorld(true);
        return box.getSize(new THREE.Vector3());
    }

    function frameModel(root) {
        var size = orientGarment(root);
        if (!size) { return; }
        var maxDim = Math.max(size.x, size.y, size.z) || 1;
        // The pan target may wander up to 1.5× the car's size away from
        // its centre — free framing in every direction, yet impossible
        // to strand the camera staring at empty space.
        panLimit = maxDim * 1.5;
        var fov = camera.fov * Math.PI / 180;
        // 1.9 (was 1.45) pulls the camera further back so the vehicle sits
        // with more breathing room in the viewport instead of filling it.
        var dist = (maxDim / 2) / Math.tan(fov / 2) * 1.9;

        // Reset/first view: slightly ELEVATED ¾ view — side dominant,
        // front visible, never from below the car.
        camera.up.set(0, 1, 0);
        var dir = new THREE.Vector3(0.45, 0.3, 1).normalize().multiplyScalar(dist);
        camera.position.set(dir.x, dir.y, dir.z);
        camera.near = Math.max(dist / 200, 0.001);
        camera.far = dist * 200;
        camera.updateProjectionMatrix();
        camera.lookAt(0, 0, 0);
        if (controls) {
            controls.target.set(0, 0, 0);
            if (controls.object && controls.object.up) { controls.object.up.set(0, 1, 0); }
            controls.minDistance = dist * 0.3;
            controls.maxDistance = dist * 4;
            controls.update();
        }
    }

    // Pull the real texture out of the freshly-loaded .glb (embedded
    // from the item's .ytd) so the editor starts from the ACTUAL
    // clothing texture instead of a blank canvas.
    function extractBaseTexture(root) {
        if (!window.Editor || !Editor.getSize) { return null; }
        var found = null;
        root.traverse(function (o) {
            if (found || !o.isMesh) { return; }
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            for (var i = 0; i < mats.length; i++) {
                var m = mats[i];
                if (m && m.map && m.map.image) { found = m.map.image; break; }
            }
        });
        if (!found) { return null; }
        try {
            var c = document.createElement('canvas');
            c.width = edW(); c.height = edH();
            c.getContext('2d').drawImage(found, 0, 0, edW(), edH());
            return c.toDataURL('image/png');
        } catch (e) { return null; }
    }

    // Fallback 3D form for items without a .glb: a gently curved
    // panel showing the design in 3D. Not the real garment shape
    // (that needs a .glb) but fully automatic — no conversion.
    function buildPlaceholderMesh() {
        var geo = new THREE.PlaneGeometry(1.4, 1.7, 24, 28);
        var pos = geo.attributes.position;
        for (var i = 0; i < pos.count; i++) {
            var x = pos.getX(i);
            pos.setZ(i, Math.cos((x / 1.4) * Math.PI) * 0.14);   // shallow arc
        }
        geo.computeVertexNormals();
        // texture is flipY=false (glTF); flip the plane's V so the
        // design reads upright.
        var uv = geo.attributes.uv;
        for (var j = 0; j < uv.count; j++) { uv.setY(j, 1 - uv.getY(j)); }
        var mat = new THREE.MeshStandardMaterial({
            map: texture, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide
        });
        return new THREE.Mesh(geo, mat);
    }

    function showPlaceholder() {
        disposeModel();
        uvCrop = null;                     // placeholder maps the whole canvas
        modelRoot = new THREE.Group();
        modelRoot.add(buildPlaceholderMesh());
        scene.add(modelRoot);
        frameModel(modelRoot);
        refreshTexture();
        setLoading(false);
        hideEmpty();
    }

    // Build the garment's UV template (the "texture map") from the
    // loaded mesh's UV coordinates and hand it to the editor as a
    // guide — so you draw on the right panels and it lands correctly
    // on the 3D garment. Same (u,v)->canvas mapping as the live
    // texture (flipY=false), so guide + result always align.
    function buildUvGuide(root) {
        if (!window.Editor || !Editor.setUvGuide) { return; }
        var W = edW(), H = edH();
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var g = c.getContext('2d');
        g.clearRect(0, 0, W, H);
        g.lineJoin = 'round';
        g.lineWidth = Math.max(1, Math.max(W, H) / 1024);

        var drew = false;
        root.traverse(function (o) {
            if (!o.isMesh || !o.geometry) { return; }
            var geo = o.geometry;
            var uv = geo.attributes && geo.attributes.uv;
            if (!uv) { return; }
            var idx = geo.index;
            // Wrapped UVs, remapped into the crop region when one is
            // active — the guide then lands exactly on the cropped
            // texture shown in the editor.
            function P(i, arr, k) {
                var u = wrap01(uv.getX(i)), v = wrap01(uv.getY(i));
                if (uvCrop) {
                    u = (u - uvCrop.u0) / (uvCrop.u1 - uvCrop.u0);
                    v = (v - uvCrop.v0) / (uvCrop.v1 - uvCrop.v0);
                }
                arr[k] = u * W; arr[k + 1] = v * H;
            }
            g.strokeStyle = 'rgba(150,180,210,0.85)';
            g.beginPath();
            var t3 = [0, 0, 0, 0, 0, 0];
            if (idx) {
                for (var i = 0; i < idx.count; i += 3) {
                    P(idx.getX(i), t3, 0); P(idx.getX(i + 1), t3, 2); P(idx.getX(i + 2), t3, 4);
                    g.moveTo(t3[0], t3[1]); g.lineTo(t3[2], t3[3]); g.lineTo(t3[4], t3[5]); g.closePath();
                }
            } else {
                for (var j = 0; j < uv.count; j += 3) {
                    P(j, t3, 0); P(j + 1, t3, 2); P(j + 2, t3, 4);
                    g.moveTo(t3[0], t3[1]); g.lineTo(t3[2], t3[3]); g.lineTo(t3[4], t3[5]); g.closePath();
                }
            }
            g.stroke();
            drew = true;
        });

        if (!drew) { return; }
        Editor.setUvGuide(c.toDataURL('image/png'));
        var uvToggle = document.getElementById('uv-toggle');
        if (uvToggle) { uvToggle.checked = true; }
        App.emit('uvGuideReady', {});
    }

    function loadModel(url) {
        if (!loader) { showEmpty('viewer_no_three', ( '3D viewer failed to load (no internet?).')); return; }
        setLoading(true);
        loader.load(url, function (gltf) {
            disposeModel();
            modelRoot = gltf.scene || (gltf.scenes && gltf.scenes[0]);
            if (!modelRoot) { setLoading(false); App.toast(t('viewer_bad_model', 'That model could not be read.'), 'error'); return; }
            var baseTex = extractBaseTexture(modelRoot);   // BEFORE applyTexture swaps the map
            vehXform = { flipH: false, flipV: false, rot: 0 };   // fresh car → no transform
            // Default paint surface = the surface the panel has active (its
            // txn), NOT the first mesh traversed — otherwise the canvas binds
            // to the wrong piece of the car.
            var atpl = window.App && App.state && App.state.activeTemplate;
            activeSurfaceTxn = (atpl && atpl.txn) ? String(atpl.txn).toLowerCase()
                : (atpl && atpl.textures && atpl.textures[0] && atpl.textures[0].txn
                    ? String(atpl.textures[0].txn).toLowerCase() : null);
            captureSurfaces(modelRoot);                    // remember every surface (name+map)
            promoteLiveryUv(modelRoot);                    // sign_N meshes render with the livery UV channel
            applyTexture(modelRoot);
            scene.add(modelRoot);
            frameModel(modelRoot);
            // Vehicles use the WHOLE texture sheet with the model's real UVs
            // (the skin came straight out of the car's .ytd), so we never
            // crop — the canvas IS the sheet and maps 1:1 exactly like the
            // in-game texture. (Cropping is a garment-only optimisation.)
            uvCrop = null;
            buildUvGuide(modelRoot);          // show the vehicle's UV template in the editor
            // Start the canvas from the glb's embedded texture ONLY when
            // the template has no texture PNGs of its own — otherwise
            // panels.js loads the real one and this would leave a stray
            // duplicate layer in the corner.
            var tplTexs = App.state.activeTemplate && App.state.activeTemplate.textures;
            if (baseTex && window.Editor && !Editor.layers.length && !(tplTexs && tplTexs.length)) {
                var layer = Editor.addLayer('image', { src: baseTex, w: edW(), h: edH(), isBase: true }, t('base_texture', 'Texture'));
                if (layer) { Editor.moveLayer(layer.id, 0); }
            }
            texDirty = true;
            refreshTextureNow();
            start();                          // make sure the render loop is live
            try {
                if (controls && localStorage.getItem('apex_vehicles_autorotate') === '1') {
                    Viewer.setAutoRotate(true);
                }
            } catch (e) { /* ok */ }
            // Loading a template's own texture/guide isn't a user edit.
            setTimeout(function () {
                if (window.App) { App.loadingTemplate = false; App.setDirty(false); }
                texDirty = true;              // re-composite once the base image has decoded
            }, 700);
            setLoading(false);
            hideEmpty();
        }, undefined, function (err) {
            setLoading(false);
            if (window.App) { App.loadingTemplate = false; }
            console.error('[viewer] glb load failed:', url, err);
            App.toast(t('viewer_load_fail', 'Could not load %s — check the file exists and is a .glb.', url.split('/').pop()), 'error');
            showEmpty('viewer_load_fail_hint', ( 'Model failed to load — is the .glb in stream/models/ and listed in fxmanifest files{}?'));
        });
    }

    /* ── render loop (only while the studio is open) ──────── */

    function renderOnce() {
        // Real-time canvas → mesh. Poll the editor's revision every frame
        // (race-proof: works even if the Editor.on subscriptions below were
        // never wired because Editor loaded after us). texDirty is a manual
        // fallback used right after a model/texture load.
        var rev = (window.Editor && typeof Editor.rev === 'number') ? Editor.rev : 0;
        if (texDirty || rev !== lastRev) {
            lastRev = rev;
            texDirty = false;
            refreshTexture();
        }
        if (controls) {
            controls.update();
            // Keep the pan target within reach of the car (models are
            // recentred at the origin), so panning can never strand the
            // camera staring at empty space.
            if (panLimit > 0 && controls.target.length() > panLimit) {
                controls.target.setLength(panLimit);
            }
        }
        try {
            renderer.render(scene, camera);
        } catch (e) {
            // Never kill the loop; log the FIRST failure so a broken
            // texture upload (e.g. canvas taint) is visible in F8/console.
            if (!renderOnce._logged) {
                renderOnce._logged = true;
                console.error('[viewer] render failed:', e);
            }
        }
    }
    function animate() {
        rafId = requestAnimationFrame(animate);
        renderOnce();
    }
    function start() { if (!running && renderer) { running = true; resize(); animate(); } }
    function stop() { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

    function resize() {
        var wrap = el('viewer-wrap');
        if (!wrap || !renderer) { return; }
        var w = Math.max(wrap.clientWidth, 1);
        var h = Math.max(wrap.clientHeight, 1);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    /* ── template browser ─────────────────────────────────── */

    function updateReadout(tpl) {
        var chip = el('template-name-chip');
        if (chip) { chip.textContent = tpl ? tpl.name : t('viewer_none', 'No template'); }
        var tex = el('tex-name-label');
        if (tex) { tex.textContent = (tpl && tpl.txn) || '—'; }
        var badge = el('collection-badge');
        if (badge) {
            var coll = tpl && (tpl.collection || (tpl.txd && tpl.txd.indexOf('/') !== -1 ? tpl.txd.split('/')[0] : ''));
            if (coll) { badge.textContent = coll; badge.hidden = false; } else { badge.hidden = true; }
        }
        var title = el('canvas-title');
        if (title) { title.textContent = (tpl && tpl.txn) || t('canvas_title', 'Canvas'); }
    }

    /* Public: load a template into the 3D viewer and make it the
       export target. Called by the Templates tab (panels.js). */
    Viewer.show = function (tpl) {
        if (!tpl) { return; }
        activeId = tpl.id;
        App.state.activeTemplate = tpl;
        App.loadingTemplate = true;   // suppress "dirty" while its texture/guide load

        if (tpl.size && window.Editor && Editor.setSize && Editor.getSize
            && tpl.size !== Editor.getSize() && !Editor.layers.length) {
            Editor.setSize(tpl.size);
        }

        // Start the design from the item's current texture when the
        // canvas is still empty, so you retexture on top of the real art.
        if (tpl.baseTexture && window.Editor && !Editor.layers.length) {
            var size = Editor.getSize ? Editor.getSize() : 1024;
            var created = Editor.addLayer('image',
                { src: BASE + tpl.baseTexture, w: size, h: size },
                t('base_layer', 'Base'));
            if (created) { Editor.moveLayer(created.id, 0); }
        }

        updateReadout(tpl);
        if (!hasThree()) {
            showEmpty('viewer_no_three', ( '3D viewer failed to load (no internet for three.js?).'));
            App.loadingTemplate = false;
        } else if (tpl.glb) {
            loadModel(BASE + tpl.glb);        // clears loadingTemplate on load/error
        } else {
            // No .glb → show the design on a generic curved panel so
            // it can still be edited/exported (real shape needs a .glb).
            showPlaceholder();
            setTimeout(function () { if (window.App) { App.loadingTemplate = false; } }, 300);
        }
        App.emit('templateChanged', tpl);
    };

    Viewer.activeId = function () { return activeId; };
    Viewer.uvCrop = function () { return uvCrop; };
    Viewer.rebuildUvGuide = function () { if (modelRoot) { buildUvGuide(modelRoot); } };
    Viewer.setAutoRotate = function (on) {
        if (controls) { controls.autoRotate = !!on; }
        var ar = el('viewer-autorotate');
        if (ar) { ar.classList.toggle('active', !!on); }
    };

    /* ── static untextured 3D thumbnails (Templates tab) ───────
       Renders each garment .glb once with a plain neutral material
       (no texture, no rotation) → a dataURL, cached per URL. */
    var tRenderer = null, tScene = null, tCam = null, tLoader = null;
    var tCache = {}, tQueue = [], tBusy = false;

    function initThumb() {
        if (tRenderer) { return !!tLoader; }
        if (!hasThree() || !THREE.GLTFLoader) { return false; }
        var c = document.createElement('canvas');
        c.width = 200; c.height = 200;
        tRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
        tRenderer.setSize(200, 200, false);
        if (THREE.sRGBEncoding !== undefined) { tRenderer.outputEncoding = THREE.sRGBEncoding; }
        tScene = new THREE.Scene();
        tScene.add(new THREE.AmbientLight(0xffffff, 0.9));
        var key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(2, 4, 3); tScene.add(key);
        var fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-3, 1, -2); tScene.add(fill);
        tCam = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
        tLoader = new THREE.GLTFLoader();
        return true;
    }

    function frameThumb(root) {
        // same upright-aware orientation + ¾ view as the main viewer
        var size = orientGarment(root);
        if (!size) { return; }
        var maxDim = Math.max(size.x, size.y, size.z) || 1;
        var dist = (maxDim / 2) / Math.tan((tCam.fov * Math.PI / 180) / 2) * 1.5;
        tCam.up.set(0, 1, 0);
        var dir = new THREE.Vector3(0.45, 0.3, 1).normalize().multiplyScalar(dist);
        tCam.position.set(dir.x, dir.y, dir.z);
        tCam.near = Math.max(dist / 200, 0.001); tCam.far = dist * 200;
        tCam.updateProjectionMatrix(); tCam.lookAt(0, 0, 0);
    }

    function pumpThumb() {
        if (tBusy || !tQueue.length) { return; }
        if (!initThumb()) { return; }
        tBusy = true;
        var job = tQueue.shift();
        tLoader.load(job.url, function (gltf) {
            var root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
            var url = null;
            try {
                root.traverse(function (o) {
                    if (o.isMesh) {
                        o.material = new THREE.MeshStandardMaterial({ color: 0xb9c0cc, roughness: 0.72, metalness: 0.04, side: THREE.DoubleSide });
                        o.frustumCulled = false;
                    }
                });
                tScene.add(root);
                frameThumb(root);
                tRenderer.render(tScene, tCam);
                url = tRenderer.domElement.toDataURL('image/png');
                tCache[job.url] = url;
            } catch (e) { /* fall through with null */ }
            if (root) {
                tScene.remove(root);
                root.traverse(function (o) {
                    if (o.isMesh) { if (o.geometry) { o.geometry.dispose(); } if (o.material && o.material.dispose) { o.material.dispose(); } }
                });
            }
            job.cb(url);
            tBusy = false; pumpThumb();
        }, undefined, function () { job.cb(null); tBusy = false; pumpThumb(); });
    }

    Viewer.garmentThumb = function (glbUrl, cb) {
        if (!glbUrl) { cb(null); return; }
        if (tCache[glbUrl]) { cb(tCache[glbUrl]); return; }
        tQueue.push({ url: glbUrl, cb: cb });
        pumpThumb();
    };

    Viewer.clear = function () {
        activeId = null;
        App.state.activeTemplate = null;
        uvCrop = null;
        disposeModel();
        updateReadout(null);
        showEmpty('viewer_empty', ( 'Pick a template in the Templates tab →'));
        App.emit('templateChanged', null);
    };

    /* ── controls (buttons) ───────────────────────────────── */

    function bindButtons() {
        var ar = el('viewer-autorotate');
        if (ar) {
            ar.addEventListener('click', function () {
                if (!controls) { return; }
                controls.autoRotate = !controls.autoRotate;
                ar.classList.toggle('active', controls.autoRotate);
            });
        }
        var wf = el('viewer-wireframe');
        if (wf) {
            wf.addEventListener('click', function () {
                wireframe = !wireframe;
                wf.classList.toggle('active', wireframe);
                if (modelRoot) {
                    modelRoot.traverse(function (o) {
                        if (!o.isMesh) { return; }
                        var mats = Array.isArray(o.material) ? o.material : [o.material];
                        mats.forEach(function (m) { if (m) { m.wireframe = wireframe; } });
                    });
                }
            });
        }
        var rv = el('viewer-reset');
        if (rv) {
            rv.addEventListener('click', function () { if (modelRoot) { frameModel(modelRoot); } });
        }
    }

    /* ── init ─────────────────────────────────────────────── */

    Viewer.init = function () {
        var canvas = el('viewer-canvas');
        bindButtons();

        if (!hasThree()) {
            showEmpty('viewer_no_three', ( '3D viewer failed to load (no internet for three.js?).'));
            // The Templates tab (panels.js) still fetches the catalog so
            // the export target can be chosen even without the 3D view.
            return;
        }

        buildScene(canvas);
        buildTexture();

        // Real-time: any editor render (incl. mid brush-stroke/drag)
        // flags the mesh texture dirty; the render loop repaints it, so
        // the 3D always matches the canvas live.
        if (window.Editor && Editor.on) {
            Editor.on('render', function () { texDirty = true; });
            Editor.on('change', function () { texDirty = true; });
            Editor.on('layers', function () { texDirty = true; });
        }

        // Only render while the studio is actually open.
        App.on('open', function () { start(); });
        App.on('close', function () { stop(); });

        if (window.ResizeObserver) {
            var ro = new ResizeObserver(function () { resize(); });
            var wrap = el('viewer-wrap');
            if (wrap) { ro.observe(wrap); }
        } else {
            window.addEventListener('resize', resize);
        }
    };

    document.addEventListener('DOMContentLoaded', function () { Viewer.init(); });

    window.Viewer = Viewer;
})();
