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

    var RESOURCE = 'apex_clothing';
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
    var tmpCanvas = null;     // editor composite staging (crop mode)

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

        // Even, neutral studio lighting so the printed texture reads TRUE.
        // The total incident light on the front-facing surface is tuned to
        // land near 1.0 — any higher and the sRGB texture clips toward white
        // and the garment looks washed-out / lighter than the real colour.
        scene.add(new THREE.AmbientLight(0xffffff, 0.50));
        var key = new THREE.DirectionalLight(0xffffff, 0.40); key.position.set(3, 5, 4); scene.add(key);
        var fill = new THREE.DirectionalLight(0xffffff, 0.18); fill.position.set(-4, 1, -3); scene.add(fill);
        var rim = new THREE.DirectionalLight(0xffffff, 0.14); rim.position.set(0, 3, -5); scene.add(rim);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 0.25));

        if (THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.055;      // silky inertia after you let go
            controls.rotateSpeed = 0.85;         // a touch calmer than 1:1
            controls.zoomSpeed = 0.9;
            controls.enablePan = false;
            controls.minDistance = 0.2;
            controls.maxDistance = 12;
            controls.autoRotate = false;
            controls.autoRotateSpeed = 1.6;
        }
        loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
    }

    /* ── live texture from the editor ─────────────────────── */

    function edW() { return (window.Editor && Editor.getWidth) ? Editor.getWidth() : 1024; }
    function edH() { return (window.Editor && Editor.getHeight) ? Editor.getHeight() : 1024; }

    // Wrap a raw GTA UV coordinate into [0,1) — exactly what
    // RepeatWrapping does on the GPU (this mesh's v is negative).
    function wrap01(t) { t = t % 1; if (t < 0) { t += 1; } return t; }

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

    /* The actual rebuild. Never call this directly from the render
       loop — go through refreshTexture(), which rate-limits it. */
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
                    texCtx = null;                  // resizing invalidates it
                }
                /* Default options on purpose: this context is shared with
                   the non-crop branch below, which relies on real
                   transparency for its destination-over white underlay.
                   An opaque context would render cleared areas black. */
                if (!texCtx) { texCtx = texCanvas.getContext('2d'); }
                var g = texCtx;
                g.fillStyle = '#ffffff';
                g.fillRect(0, 0, W, H);
                g.drawImage(tmpCanvas,
                    uvCrop.u0 * W, uvCrop.v0 * H,
                    (uvCrop.u1 - uvCrop.u0) * W, (uvCrop.v1 - uvCrop.v0) * H);
            } else {
                // No crop info (placeholder / no glb): the canvas IS the sheet.
                Editor.drawToCanvas(texCanvas);
                // White underlay: transparent areas would sample BLACK on an
                // opaque material.
                var g2 = texCanvas.getContext('2d');
                g2.save();
                g2.globalCompositeOperation = 'destination-over';
                g2.fillStyle = '#ffffff';
                g2.fillRect(0, 0, texCanvas.width, texCanvas.height);
                g2.restore();
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
       later, or the mesh briefly shows the previous garment. */
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

    function applyTexture(root) {
        // Replace every mesh material with a clean one bound to our live
        // canvas texture. Fresh material = no inherited metalness/tint that
        // could make the garment render black.
        var mk = function () {
            return new THREE.MeshStandardMaterial({
                map: texture, color: 0xffffff, roughness: 0.85, metalness: 0.0,
                side: THREE.DoubleSide, wireframe: wireframe
            });
        };
        root.traverse(function (o) {
            if (!o.isMesh) { return; }
            o.frustumCulled = false;
            o.material = Array.isArray(o.material) ? o.material.map(mk) : mk();
        });
    }

    // GTA drawables come out of the converter Z-up; glTF/three.js is
    // Y-up. A single FIXED rotation uprights EVERY garment consistently
    // (a per-shape heuristic mis-guessed the up axis for some, leaving
    // them upside-down/sideways). Camera stays Y-up so the mouse orbit
    // is natural. Flip FLIP_FRONT if garments show their back.
    var GARMENT_TILT = -Math.PI / 2;   // Z-up → Y-up
    var FLIP_FRONT = false;            // set true if the back faces us

    function orientGarment(root) {
        root.rotation.set(GARMENT_TILT, FLIP_FRONT ? Math.PI : 0, 0);
        root.position.set(0, 0, 0);
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
        var fov = camera.fov * Math.PI / 180;
        /* 2.1 pulls the camera further back so the garment sits small in
           the viewport with generous margins (was 1.45 → 1.7 → 2.1). */
        var dist = (maxDim / 2) / Math.tan(fov / 2) * 2.1;

        camera.up.set(0, 1, 0);
        camera.position.set(0, 0, dist);
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
            applyTexture(modelRoot);
            scene.add(modelRoot);
            frameModel(modelRoot);
            uvCrop = computeUvBounds(modelRoot);   // BEFORE the guide — it maps through the crop
            buildUvGuide(modelRoot);          // show the garment's UV template in the editor
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
                if (controls && localStorage.getItem('apex_clothing_autorotate') === '1') {
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
        if (controls) { controls.update(); }
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
        // same fixed upright orientation as the main viewer
        root.rotation.set(GARMENT_TILT, FLIP_FRONT ? Math.PI : 0, 0);
        root.position.set(0, 0, 0); root.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) { return; }
        var size = box.getSize(new THREE.Vector3());
        root.position.sub(box.getCenter(new THREE.Vector3()));
        root.updateMatrixWorld(true);
        var maxDim = Math.max(size.x, size.y, size.z) || 1;
        var dist = (maxDim / 2) / Math.tan((tCam.fov * Math.PI / 180) / 2) * 1.5;
        tCam.up.set(0, 1, 0); tCam.position.set(0, 0, dist);
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
