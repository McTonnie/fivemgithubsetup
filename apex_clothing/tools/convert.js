#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   Apex Clothing Studio — .ydd → .glb batch converter (worker)

   The browser can't read the game's .ydd, so the 3D viewer needs a
   .glb. This is the automated equivalent of 0Resmon's worker — BUT
   with NO software to install: it uploads each .ydd to the public
   gtax.dev drawable-to-glb API, gets back a .glb, drops it into
   stream/models/<gender>/<component>/, and updates templates.json so
   the studio shows the real 3D shape.

   Requirements: Node.js + curl (built into Windows 10+/11 and Linux)
   and an internet connection. Nothing else — no Blender, no DLLs.

   Run it from this folder:
       node convert.js
   or double-click convert.bat

   Options:
     --force              reconvert even if a .glb already exists
     --gender female      gender for .ydd not inside a female/ or male/ folder
     --api <base-url>     use a different / self-hosted converter
     --src <folder>       ALSO scan this folder for .ydd/.ytd (repeatable).
                          Lets you keep your working clothes anywhere on the
                          PC — e.g. --src "C:\Users\me\Desktop\Roupa" — without
                          copying them into the resource first.
   Env:
     V_DRAWABLE_TO_GLB_API_KEY   optional Bearer key (higher rate limits)

   Extra source folders can also be listed, one per line, in
   tools/sources.txt — that file is read on every run, so a
   double-click of convert.bat picks them up with no arguments.
   Lines starting with # are comments.
   ───────────────────────────────────────────────────────────── */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOLS_DIR = __dirname;
const RESOURCE_ROOT = path.resolve(TOOLS_DIR, '..');
const STREAM_DIR = path.join(RESOURCE_ROOT, 'stream');
const MODELS_DIR = path.join(STREAM_DIR, 'models');   // .glb/.png OUTPUT (NUI assets, not GTA-streamed)
// The source .ydd/.ytd live OUTSIDE stream/ so FiveM does NOT replicate the
// original game files to every client. convert.js reads them from here and
// writes the web .glb/.png into stream/models/ (which the streamer ignores).
const SOURCE_DIR = path.join(RESOURCE_ROOT, 'templates');
const TEMPLATES_JSON = path.join(RESOURCE_ROOT, 'templates.json');

const COMPONENTS = ['head', 'berd', 'hair', 'uppr', 'lowr', 'hand', 'feet', 'teef', 'accs', 'task', 'decl', 'jbib'];
const COMP_ID = { head: 0, berd: 1, hair: 2, uppr: 3, lowr: 4, hand: 5, feet: 6, teef: 7, accs: 8, task: 9, decl: 10, jbib: 11 };

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
function argVal(flag) { const i = args.indexOf(flag); return (i !== -1 && args[i + 1]) ? args[i + 1] : null; }
/* every --src occurrence, not just the first */
function argVals(flag) {
    const out = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === flag && args[i + 1]) { out.push(args[i + 1]); }
    }
    return out;
}

/* Extra source folders: --src flags plus tools/sources.txt. Missing
   folders are reported, not fatal — a listed drive may be unplugged. */
function extraSources() {
    const out = argVals('--src');
    const listFile = path.join(TOOLS_DIR, 'sources.txt');
    if (fs.existsSync(listFile)) {
        for (let line of fs.readFileSync(listFile, 'utf8').split(/\r?\n/)) {
            line = line.trim();
            if (line && !line.startsWith('#')) { out.push(line); }
        }
    }
    const seen = new Set();
    return out.filter(p => {
        const key = path.resolve(p).toLowerCase();
        if (seen.has(key)) { return false; }
        seen.add(key);
        if (!fs.existsSync(p)) {
            console.log('SKIP (source folder not found):', p);
            return false;
        }
        return true;
    });
}
const DEFAULT_GENDER = (argVal('--gender') || 'male').toLowerCase();
const API_BASE = (argVal('--api') || process.env.V_DRAWABLE_API || 'https://public-drawable-to-glb.gtax.dev').replace(/\/+$/, '');
const API_KEY = process.env.V_DRAWABLE_TO_GLB_API_KEY || '';

/* ── curl ───────────────────────────────────────────────────── */
function findCurl() {
    const win = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe');
    if (process.platform === 'win32' && fs.existsSync(win)) { return win; }
    return 'curl';
}

/* ── discovery / naming ─────────────────────────────────────── */
function walk(dir, out) {
    if (!fs.existsSync(dir)) { return; }
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        let st; try { st = fs.statSync(full); } catch (e) { continue; }
        if (st.isDirectory()) { walk(full, out); }
        else if (name.toLowerCase().endsWith('.ydd')) { out.push(full); }
    }
}
function genderFromPath(p) {
    const parts = p.toLowerCase().split(path.sep);
    if (parts.includes('female')) { return 'female'; }
    if (parts.includes('male')) { return 'male'; }
    return null;
}
// GTA gender lives in the collection prefix: mp_f_* = female, mp_m_* = male.
// This wins over the folder so mixed dumps get sorted correctly.
function genderFromName(base) {
    const b = base.toLowerCase();
    if (/(^|_|\^)mp_f_freemode/.test(b)) { return 'female'; }
    if (/(^|_|\^)mp_m_freemode/.test(b)) { return 'male'; }
    return null;
}
// GTA names are "<collection_dict>^<drawable>" where ^ = "/". The component
// (jbib/lowr/uppr/…) is in the DRAWABLE part, after the last ^.
function drawableOf(base) { return base.includes('^') ? base.split('^').pop() : base; }
function collectionOf(base) { return base.includes('^') ? base.split('^')[0] : null; }
function componentFromBase(base) {
    const drawable = drawableOf(base);
    let best = null;
    for (const c of COMPONENTS) {
        if (drawable === c || drawable.startsWith(c + '_')) { if (!best || c.length > best.length) { best = c; } }
    }
    return best;
}
function deriveTexture(gender, comp, base) {
    const ped = gender === 'female' ? 'mp_f_freemode_01' : 'mp_m_freemode_01';
    const drawable = drawableOf(base);
    // Addon DLC clothing streams under its own collection dictionary; the
    // base game streams under mp_x_freemode_01.
    const dict = collectionOf(base) || ped;
    if (drawable.includes('_diff_')) { return { txd: dict + '/' + drawable, txn: drawable }; }
    const m = drawable.match(/(\d+)/);
    const num = m ? String(parseInt(m[1], 10)).padStart(3, '0') : '000';
    const race = /_r$/.test(drawable) ? 'whi' : 'uni';
    const txn = `${comp}_diff_${num}_a_${race}`;
    return { txd: dict + '/' + txn, txn: txn };
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

/* ── conversion (one file → gtax.dev API via curl) ──────────── */
function isGlb(p) {
    try { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.toString('ascii') === 'glTF'; }
    catch (e) { return false; }
}
// Find ALL texture variants (.ytd) for a drawable, e.g.
// jbib_diff_012_a_uni.ytd, _b_uni.ytd, … → the switchable textures.
function findAllYtd(dir, comp, num, base) {
    const n = String(parseInt(num, 10)).padStart(3, '0');
    const drawPrefix = (comp + '_diff_' + n + '_').toLowerCase();     // jbib_diff_006_
    // Match ONLY the same collection, so different DLCs that reuse a
    // number don't cross-contaminate. The .ytd shares the .ydd's
    // "<collection>^" prefix (or none for base game).
    const collection = base && base.includes('^') ? base.split('^')[0] : null;
    const fullPrefix = ((collection ? collection + '^' : '') + drawPrefix).toLowerCase();
    const out = [];
    try {
        for (const f of fs.readdirSync(dir)) {
            const lf = f.toLowerCase();
            if (!lf.endsWith('.ytd') || !lf.startsWith(fullPrefix)) { continue; }
            const draw = f.includes('^') ? f.split('^').pop() : f;    // jbib_diff_006_a_uni.ytd
            const txn = draw.replace(/\.ytd$/i, '');                  // jbib_diff_006_a_uni
            out.push({
                letter: txn.toLowerCase().slice(drawPrefix.length).charAt(0) || '?',
                path: path.join(dir, f),
                txn: txn,
            });
        }
    } catch (e) { /* none */ }
    out.sort((a, b) => a.letter.localeCompare(b.letter));
    return out;
}

// Extract the embedded PNG (image[0]) from a .glb the API returned
// with a .ytd — that PNG is the real clothing texture for that variant.
function extractPngFromGlb(buf) {
    if (!buf || buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') { return null; }
    let off = 12, json = null, bin = null;
    while (off + 8 <= buf.length) {
        const clen = buf.readUInt32LE(off);
        const ctype = buf.readUInt32LE(off + 4);
        const start = off + 8;
        if (ctype === 0x4E4F534A) { try { json = JSON.parse(buf.toString('utf8', start, start + clen)); } catch (e) { return null; } }
        else if (ctype === 0x004E4942) { bin = buf.slice(start, start + clen); }
        off = start + clen;
    }
    if (!json || !bin || !Array.isArray(json.images) || !json.images.length) { return null; }
    const img = json.images.find(i => i && i.bufferView !== undefined);
    if (!img) { return null; }
    const bv = json.bufferViews[img.bufferView];
    if (!bv) { return null; }
    return bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Read a PNG's pixel dimensions from its IHDR header.
function pngSize(buf) {
    if (buf && buf.length > 24 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
        return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    return null;
}

function convertOne(curl, ydd, outGlb, name, ytd) {
    const a = ['-sS', '-o', outGlb, '-w', '%{http_code}',
        '-F', 'ydd=@' + ydd, '-F', 'name=' + name, '-F', 'lod=high'];
    if (ytd) { a.push('-F', 'ytd=@' + ytd); }
    if (API_KEY) { a.push('-H', 'Authorization: Bearer ' + API_KEY); }
    a.push(API_BASE + '/convert/ydd-to-glb');
    const r = spawnSync(curl, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error) { return { ok: false, code: 'curl-missing', err: r.error.message }; }
    const code = (r.stdout || '').trim();
    if (code === '200' && isGlb(outGlb)) { return { ok: true, code }; }
    // clean up an error body written to the output path
    try { if (fs.existsSync(outGlb) && !isGlb(outGlb)) { fs.unlinkSync(outGlb); } } catch (e) { /* ignore */ }
    return { ok: false, code, body: (r.stderr || '').trim() };
}

function relPath(p) { return path.relative(RESOURCE_ROOT, p).split(path.sep).join('/'); }

/* ── main ───────────────────────────────────────────────────── */
async function main() {
    console.log('Apex Clothing Studio — .ydd -> .glb converter (gtax.dev API)\n');
    console.log('API   :', API_BASE);

    const curl = findCurl();
    const ver = spawnSync(curl, ['--version'], { encoding: 'utf8' });
    if (ver.error) {
        console.error('\nERROR: curl not found. It ships with Windows 10+/11 and Linux.');
        console.error('Install curl (or add it to PATH) and run again.\n');
        process.exit(1);
    }

    const ydds = [];
    walk(SOURCE_DIR, ydds);
    const extras = extraSources();
    for (const dir of extras) {
        console.log('Source:', dir);
        walk(dir, ydds);
    }
    console.log('Found :', ydds.length, '.ydd file(s)\n');
    if (!ydds.length) {
        console.log('Nothing to convert. Put your .ydd + .ytd files under templates/female/ or templates/male/,');
        console.log('or point at any folder:  node convert.js --src "C:\\path\\to\\your\\clothes"');
        console.log('(or list that folder in tools/sources.txt so a plain double-click finds it)');
        return;
    }

    const templates = loadTemplates();
    let ok = 0, skip = 0, fail = 0, texCount = 0;
    const seen = new Set();

    for (const ydd of ydds) {
        const base = path.basename(ydd, path.extname(ydd));
        // gender from the collection name first (mixed dumps), then folder.
        const gender = genderFromName(base) || genderFromPath(ydd) || DEFAULT_GENDER;
        const comp = componentFromBase(base);
        if (!comp) { console.log('SKIP (unknown component):', relPath(ydd)); skip++; continue; }

        // Output filenames drop the "^" (collection^drawable) → clean names.
        const safeBase = base.replace(/\^/g, '_');

        const key = gender + '|' + comp + '|' + safeBase;
        if (seen.has(key)) { continue; }   // same item copied in two folders
        seen.add(key);

        const outDir = path.join(MODELS_DIR, gender, comp);
        const outGlb = path.join(outDir, safeBase + '.glb');
        const relGlb = relPath(outGlb);
        const { txd, txn } = deriveTexture(gender, comp, base);
        const id = gender + '_' + comp + '_' + safeBase;
        const numMatch = drawableOf(base).match(/(\d+)/);
        const variants = numMatch ? findAllYtd(path.dirname(ydd), comp, numMatch[1], base) : [];
        const meta = { id, name: pretty(drawableOf(base)), gender, component: COMP_ID[comp], componentKey: comp, txd, txn };

        // Fully done? (glb present AND every variant's PNG already
        // extracted) → just re-list and skip. If the glb exists but the
        // textures are MISSING, fall through and extract them — so a
        // plain re-run (double-click, no --force) fixes texture-less items.
        const pngPathOf = v => path.join(outDir, safeBase + '_' + v.letter + '.png');
        const texturesReady = variants.length === 0 || variants.every(v => fs.existsSync(pngPathOf(v)));
        if (!FORCE && fs.existsSync(outGlb) && isGlb(outGlb) && texturesReady) {
            const textures = variants.map(v => {
                const png = pngPathOf(v);
                if (!fs.existsSync(png)) { return null; }
                const dim = pngSize(fs.readFileSync(png)) || { w: 1024, h: 1024 };
                return { id: v.letter, txn: v.txn, png: relPath(png), w: dim.w, h: dim.h };
            }).filter(Boolean);
            console.log('SKIP (exists):', relGlb, textures.length ? '(' + textures.length + ' textures)' : '');
            upsert(templates, Object.assign({ glb: relGlb, textures, txn: (textures[0] && textures[0].txn) || txn }, meta));
            skip++;
            continue;
        }

        fs.mkdirSync(outDir, { recursive: true });

        // No textures → geometry-only glb.
        if (!variants.length) {
            process.stdout.write('CONVERT: ' + relPath(ydd) + '  ... ');
            const r = convertOne(curl, ydd, outGlb, safeBase, null);
            if (r.ok) { console.log('OK (geometry only)'); upsert(templates, Object.assign({ glb: relGlb, textures: [] }, meta)); ok++; }
            else { console.log('FAILED (http ' + r.code + ')'); upsert(templates, Object.assign({ glb: '', textures: [] }, meta)); fail++; }
            continue;
        }

        // One conversion per texture variant: first is the model glb,
        // and we extract each variant's embedded PNG as a switchable texture.
        console.log('CONVERT: ' + safeBase + '  (' + variants.length + ' texture' + (variants.length > 1 ? 's' : '') + ')');
        const textures = [];
        let modelSaved = false;
        for (let i = 0; i < variants.length; i++) {
            const v = variants[i];
            const target = i === 0 ? outGlb : (outGlb + '.tmp');
            process.stdout.write('  · ' + v.txn + '  ... ');
            let r = convertOne(curl, ydd, target, safeBase, v.path);
            // retry transient failures (rate limit, or a dropped connection = http 000)
            for (let attempt = 0; attempt < 2 && !r.ok && (r.code === '429' || r.code === '000' || !r.code); attempt++) {
                await sleep(r.code === '429' ? 6000 : 1500);
                r = convertOne(curl, ydd, target, safeBase, v.path);
            }
            if (r.ok) {
                if (i === 0) { modelSaved = true; }
                let png = null;
                try { png = extractPngFromGlb(fs.readFileSync(target)); } catch (e) { png = null; }
                if (png && png.length) {
                    const pngPath = path.join(outDir, safeBase + '_' + v.letter + '.png');
                    fs.writeFileSync(pngPath, png);
                    const dim = pngSize(png) || { w: 1024, h: 1024 };
                    textures.push({ id: v.letter, txn: v.txn, png: relPath(pngPath), w: dim.w, h: dim.h });
                    texCount++;
                    console.log('OK (' + dim.w + 'x' + dim.h + ')');
                } else {
                    console.log('OK (no embedded texture)');
                }
                if (i > 0) { try { fs.unlinkSync(target); } catch (e) { /* ignore */ } }
            } else {
                console.log('FAILED (http ' + r.code + ')');
                if (i > 0) { try { fs.unlinkSync(target); } catch (e) { /* ignore */ } }
            }
            await sleep(400);   // be gentle on the free API
        }

        upsert(templates, Object.assign({
            glb: modelSaved ? relGlb : '',
            textures,
            txn: (textures[0] && textures[0].txn) || txn
        }, meta));
        if (modelSaved) { ok++; } else { fail++; }
    }

    saveTemplates(templates);
    console.log(`\nDone. items: ${ok} ok, ${skip} skipped, ${fail} failed  ·  textures: ${texCount}`);
    console.log('templates.json updated. In game: /clothingtemplates (or restart apex_clothing), then open the studio.');
    if (fail) {
        console.log('\nSome failed — usually the free API rate limit or a bad .ydd. Wait a minute and re-run,');
        console.log('or set an API key:  set V_DRAWABLE_TO_GLB_API_KEY=<key>  (see tools/README.md).');
    }
}

main();
