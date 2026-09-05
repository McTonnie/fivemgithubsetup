/* ============================================================
   Apex Vehicle Studio — .yft → .glb batch converter (worker)
   ------------------------------------------------------------
   The browser can't read the game's .yft, so the 3D viewer needs
   a .glb. This uploads each vehicle .yft to the public gtax.dev
   fragment-to-glb API, gets back a .glb, drops it into
   stream/models/vehicles/, extracts the vehicle's biggest embedded
   texture as a paint base, and updates templates.json.

   NO OpenIV, no CodeWalker, no Blender, no login.

   Put your vehicle .yft files under  templates/  (any layout), then:
     Windows : double-click convert.bat
     Linux   : bash convert.sh
     any OS  : node convert.js
   Flags:
     --force              reconvert even if a .glb already exists
     --api <url>          override the conversion API base
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOLS_DIR = __dirname;
const RESOURCE_ROOT = path.resolve(TOOLS_DIR, '..');
const STREAM_DIR = path.join(RESOURCE_ROOT, 'stream');
const MODELS_DIR = path.join(STREAM_DIR, 'models', 'vehicles');   // .glb/.png OUTPUT (NUI assets, not GTA-streamed)
// Source .yft live OUTSIDE stream/ so FiveM does NOT replicate them.
const SOURCE_DIR = path.join(RESOURCE_ROOT, 'templates');
const TEMPLATES_JSON = path.join(RESOURCE_ROOT, 'templates.json');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
function argVal(flag) { const i = args.indexOf(flag); return (i !== -1 && args[i + 1]) ? args[i + 1] : null; }
const API_BASE = (argVal('--api') || process.env.V_DRAWABLE_API || 'https://public-drawable-to-glb.gtax.dev').replace(/\/+$/, '');
const API_KEY = process.env.V_DRAWABLE_TO_GLB_API_KEY || '';

/* ── curl ───────────────────────────────────────────────────── */
function findCurl() {
    const win = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe');
    if (process.platform === 'win32' && fs.existsSync(win)) { return win; }
    return 'curl';
}

/* ── discovery ──────────────────────────────────────────────── */
// Skip the "_hi" high-detail LOD twin — the base .yft is the model.
function walk(dir, out) {
    if (!fs.existsSync(dir)) { return; }
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        let st; try { st = fs.statSync(full); } catch (e) { continue; }
        if (st.isDirectory()) { walk(full, out); }
        else if (/\.yft$/i.test(name) && !/_hi\.yft$/i.test(name)) {
            // Only the paintable vehicle body — the one with its own .ytd.
            // Accessory-part .yft (spoilers, skirts, cages…) share the main
            // txd and have no .ytd, so they're skipped.
            const base = name.replace(/\.yft$/i, '');
            if (fs.existsSync(path.join(dir, base + '.ytd')) ||
                fs.existsSync(path.join(dir, base + '+hi.ytd')) ||
                fs.existsSync(path.join(dir, base + '_hi.ytd'))) {
                out.push(full);
            }
        }
    }
}
function pretty(base) {
    return base.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

/* ── templates.json ─────────────────────────────────────────── */
function loadTemplates() {
    try { const d = JSON.parse(fs.readFileSync(TEMPLATES_JSON, 'utf8')); return Array.isArray(d.templates) ? d.templates : []; }
    catch (e) { return []; }
}
function saveTemplates(list) {
    fs.writeFileSync(TEMPLATES_JSON, JSON.stringify({
        _comment: 'Auto-updated by tools/convert.js. The NUI fetches this directly. Safe to edit by hand.',
        templates: list
    }, null, 2) + '\n', 'utf8');
}
function upsert(list, entry) {
    const i = list.findIndex(t => t && t.id === entry.id);
    if (i === -1) { list.push(entry); } else { list[i] = Object.assign({}, list[i], entry); }
}

/* ── glb helpers ────────────────────────────────────────────── */
function isGlb(p) {
    try { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.toString('ascii') === 'glTF'; }
    catch (e) { return false; }
}
function pngSize(buf) {
    if (buf && buf.length > 24 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
        return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    return null;
}
// Pull EVERY embedded image out of a .glb WITH its real GTA texture name
// (json.images[i].name — e.g. 'box', 'zwart', 'reclame'). A vehicle has
// several paintable surfaces; each becomes a selectable texture in the
// studio, applied only to the meshes that use it and exported under its
// real name. Sorted largest-first so the main paint surface is the default.
function pretty2(s) { return String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim(); }
function extractAllImages(buf) {
    if (!buf || buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') { return []; }
    let off = 12, json = null, bin = null;
    while (off + 8 <= buf.length) {
        const clen = buf.readUInt32LE(off);
        const ctype = buf.readUInt32LE(off + 4);
        const start = off + 8;
        if (ctype === 0x4E4F534A) { try { json = JSON.parse(buf.toString('utf8', start, start + clen)); } catch (e) { return []; } }
        else if (ctype === 0x004E4942) { bin = buf.slice(start, start + clen); }
        off = start + clen;
    }
    if (!json || !bin || !Array.isArray(json.images)) { return []; }
    const out = [];
    json.images.forEach((img, i) => {
        if (!img || img.bufferView === undefined) { return; }
        const bv = json.bufferViews[img.bufferView];
        if (!bv) { return; }
        const data = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
        const dim = pngSize(data) || { w: 0, h: 0 };
        out.push({ name: (img.name || ('tex_' + i)), data: data, w: dim.w, h: dim.h });
    });
    // Liveries (the police "sign_1" / livery slot) first — that's the one
    // people actually want to paint — then everything else by size.
    const livery = n => /(_sign_?\d+$|sign_1|livery)/i.test(String(n || ''));
    out.sort((a, b) => {
        const la = livery(a.name) ? 1 : 0, lb = livery(b.name) ? 1 : 0;
        if (la !== lb) { return lb - la; }
        return (b.w * b.h) - (a.w * a.h);
    });
    return out;
}

// The vehicle's paint textures live in a SEPARATE .ytd (the .yft has
// none embedded), so pass it too — that's what fills the glb with the
// body texture we paint on. Looks for <model>.ytd / <model>+hi.ytd /
// <model>_hi.ytd next to the .yft.
function findSiblingYtd(yft, model) {
    const dir = path.dirname(yft);

    // ⚠ CROSS-PLATFORM. This used to build 'adder.ytd' from a lowercased
    // model name and test existsSync. On Windows that matches 'Adder.ytd'
    // because NTFS is case-insensitive; on Linux it does not, and the
    // caller reads null as "this vehicle has no texture" — so the car
    // converts BLANK, silently, on Linux only.
    // Read the directory once and return the name AS IT IS ON DISK, so
    // the path resolves on either filesystem. Ranking by `wanted` keeps
    // the plain .ytd ahead of the +hi/_hi variants.
    const real = path.basename(yft, path.extname(yft));
    const suffixes = ['.ytd', '+hi.ytd', '_hi.ytd'];
    const wanted = [];
    for (const stem of (real.toLowerCase() === model.toLowerCase() ? [real] : [real, model])) {
        for (const s of suffixes) { wanted.push((stem + s).toLowerCase()); }
    }

    let entries;
    try { entries = fs.readdirSync(dir); } catch (e) { return null; }

    let best = null, bestRank = Infinity;
    for (const name of entries) {
        const rank = wanted.indexOf(name.toLowerCase());
        if (rank >= 0 && rank < bestRank) { best = name; bestRank = rank; }
    }
    return best ? path.join(dir, best) : null;
}

/* ── conversion (one .yft → gtax.dev API via curl) ──────────── */
function convertOne(curl, yft, ytd, outGlb, name) {
    const a = ['-sS', '-o', outGlb, '-w', '%{http_code}',
        '-F', 'yft=@' + yft, '-F', 'name=' + name, '-F', 'lod=high'];
    if (ytd) { a.push('-F', 'ytd=@' + ytd); }
    if (API_KEY) { a.push('-H', 'Authorization: Bearer ' + API_KEY); }
    a.push(API_BASE + '/convert/yft-to-glb');
    const r = spawnSync(curl, a, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    if (r.error) { return { ok: false, code: 'curl-missing', err: r.error.message }; }
    const code = (r.stdout || '').trim();
    if (code === '200' && isGlb(outGlb)) { return { ok: true, code }; }
    try { if (fs.existsSync(outGlb) && !isGlb(outGlb)) { fs.unlinkSync(outGlb); } } catch (e) { /* ignore */ }
    return { ok: false, code, body: (r.stderr || '').trim() };
}

function relPath(p) { return path.relative(RESOURCE_ROOT, p).split(path.sep).join('/'); }

/* ── main ───────────────────────────────────────────────────── */
function main() {
    console.log('Apex Vehicle Studio — .yft -> .glb converter (gtax.dev API)\n');
    console.log('API   :', API_BASE);

    const curl = findCurl();
    const ver = spawnSync(curl, ['--version'], { encoding: 'utf8' });
    if (ver.error) {
        console.error('\nERROR: curl not found. It ships with Windows 10+/11 and Linux.\n');
        process.exit(1);
    }

    const yfts = [];
    walk(SOURCE_DIR, yfts);
    console.log('Found :', yfts.length, 'vehicle .yft file(s) under templates/\n');
    if (!yfts.length) {
        console.log('Nothing to convert. Put your vehicle .yft files under templates/ (e.g. templates/adder.yft).');
        return;
    }

    fs.mkdirSync(MODELS_DIR, { recursive: true });
    const templates = loadTemplates();
    let ok = 0, skip = 0, fail = 0;
    const seen = new Set();

    for (const yft of yfts) {
        const model = path.basename(yft, path.extname(yft)).toLowerCase();   // adder, faggio2…
        if (seen.has(model)) { continue; }
        seen.add(model);

        const outGlb = path.join(MODELS_DIR, model + '.glb');
        const relGlb = relPath(outGlb);
        // Remember the vehicle's SOURCE folder (the addon it came from) so the
        // plug-and-play export can bundle the original .yft/.ytd/.meta files.
        const vehDir = path.basename(path.dirname(yft)).toLowerCase() === 'stream'
            ? path.dirname(path.dirname(yft)) : path.dirname(yft);
        const meta = { id: 'veh_' + model, name: pretty(model), model: model, class: 'vehicle', src: relPath(vehDir) };

        // Extract EVERY paintable surface from the glb (real GTA names).
        function buildTexs() {
            const texs = [];
            try {
                extractAllImages(fs.readFileSync(outGlb)).forEach((im, i) => {
                    const letter = String.fromCharCode(97 + i);
                    const safe = im.name.replace(/[^a-z0-9_\-]+/gi, '_').toLowerCase();
                    const pngPath = path.join(MODELS_DIR, model + '__' + safe + '.png');
                    fs.writeFileSync(pngPath, im.data);
                    texs.push({ id: letter, txn: im.name, png: relPath(pngPath), w: im.w, h: im.h, label: pretty2(im.name) });
                });
            } catch (e) { /* no textures — the canvas just starts blank */ }
            return texs;
        }
        function register(texs) {
            upsert(templates, Object.assign({
                glb: relGlb, textures: texs, txd: model,
                txn: (texs[0] && texs[0].txn) || model
            }, meta));
        }

        if (!FORCE && fs.existsSync(outGlb) && isGlb(outGlb)) {
            const texs = buildTexs();
            console.log('SKIP (exists):', relGlb, '(' + texs.length + ' surface(s))');
            register(texs);
            skip++;
            continue;
        }

        const ytd = findSiblingYtd(yft, model);
        process.stdout.write('CONVERT ' + model + '.yft ' + (ytd ? '(+ ' + path.basename(ytd) + ') ' : '(no .ytd — blank) ') + '… ');
        const res = convertOne(curl, yft, ytd, outGlb, model);
        if (!res.ok) {
            console.log('FAILED (' + (res.code || '?') + ') ' + (res.body || res.err || ''));
            fail++;
            continue;
        }
        const texs = buildTexs();
        register(texs);
        console.log('OK  -> ' + relGlb + '  (' + texs.length + ' surface(s): ' + texs.map(t => t.txn).join(', ') + ')');
        ok++;
    }

    saveTemplates(templates);
    console.log('\nDone — ' + ok + ' converted, ' + skip + ' skipped, ' + fail + ' failed. Catalog: templates.json');
    if (fail) { console.log('Failures are usually the free API rate limit or a bad .yft — wait a minute and re-run (already-done cars are skipped).'); }
}
main();
