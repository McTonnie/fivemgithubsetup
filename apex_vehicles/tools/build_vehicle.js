/* ============================================================
   Apex Vehicle Studio — plug-and-play vehicle builder
   ------------------------------------------------------------
   Turns a designed skin (staged by Export -> "Full vehicle")
   into a COMPLETE drop-in FiveM resource: the original car
   (stream + meta files) + your skin.

   The skin is BAKED straight into the car's own .ytd whenever
   possible (the texture then IS the file the game loads —
   deterministic, no runtime tricks). A runtime AddReplaceTexture
   fallback covers any texture that can't be located/baked.

   Flow:
     1. In the studio: Export -> Full vehicle. This stages your
        skin(s) into tools/veh_out/<model>/<surface>.png.
     2. Run this (double-click build_vehicle.bat, or:
            cd tools && node build_vehicle.js  ).
     3. exports/<model>/ is a ready resource — drop it into your
        server's resources/ and `ensure <model>`.

   The exported resource REPLACES the original addon (it already
   contains the whole car), so don't also run the original.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TOOLS_DIR = __dirname;
const RESOURCE_ROOT = path.resolve(TOOLS_DIR, '..');
const VEH_OUT = path.join(TOOLS_DIR, 'veh_out');
const EXPORTS = path.join(RESOURCE_ROOT, 'exports');
const TEMPLATES_JSON = path.join(RESOURCE_ROOT, 'templates.json');

function loadTemplates() {
    try { const d = JSON.parse(fs.readFileSync(TEMPLATES_JSON, 'utf8')); return Array.isArray(d.templates) ? d.templates : []; }
    catch (e) { return []; }
}
function copyDir(srcDir, dstDir) {
    fs.mkdirSync(dstDir, { recursive: true });
    for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const s = path.join(srcDir, e.name), d = path.join(dstDir, e.name);
        if (e.isDirectory()) { copyDir(s, d); }
        else { fs.copyFileSync(s, d); }
    }
}

/* ════════════════════════════════════════════════════════════
   Bake a PNG into a NAMED texture of a multi-texture RSC7 .ytd.
   Same proven approach as make_ytd.js (swap ONLY the pixel data,
   every struct/pointer/flag stays byte-identical), extended with
   a full descriptor scan + name resolution so it works on vehicle
   .ytd files that hold hundreds of textures.
   ════════════════════════════════════════════════════════════ */

function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) { throw new Error('not a PNG'); }
    let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.slice(off + 8, off + 8 + len);
        if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
        else if (type === 'IDAT') { idat.push(data); }
        else if (type === 'IEND') { break; }
        off += 12 + len;
    }
    if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) { throw new Error('PNG must be 8-bit RGB/RGBA'); }
    const channels = colorType === 6 ? 4 : 3;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(width * height * 4);
    let prev = Buffer.alloc(stride), p = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[p++];
        const line = Buffer.from(raw.slice(p, p + stride)); p += stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? line[x - channels] : 0, b = prev[x];
            const c = x >= channels ? prev[x - channels] : 0;
            let v = line[x];
            if (filter === 1) v += a; else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            line[x] = v & 0xff;
        }
        prev = line;
        for (let x = 0; x < width; x++) {
            const s = x * channels, d = (y * width + x) * 4;
            out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
            out[d + 3] = channels === 4 ? line[s + 3] : 255;
        }
    }
    return { width, height, data: out };
}
function resizeImg(img, tw, th) {
    if (img.width === tw && img.height === th) { return img.data; }
    const out = Buffer.alloc(tw * th * 4);
    const sx = img.width / tw, sy = img.height / th;
    for (let y = 0; y < th; y++) {
        const fy = (y + 0.5) * sy - 0.5, y0 = Math.max(0, Math.floor(fy));
        const y1 = Math.min(img.height - 1, y0 + 1), wy = fy - y0;
        for (let x = 0; x < tw; x++) {
            const fx = (x + 0.5) * sx - 0.5, x0 = Math.max(0, Math.floor(fx));
            const x1 = Math.min(img.width - 1, x0 + 1), wx = fx - x0;
            const d = (y * tw + x) * 4;
            for (let c = 0; c < 4; c++) {
                const p00 = img.data[(y0 * img.width + x0) * 4 + c], p10 = img.data[(y0 * img.width + x1) * 4 + c];
                const p01 = img.data[(y1 * img.width + x0) * 4 + c], p11 = img.data[(y1 * img.width + x1) * 4 + c];
                const top = p00 + (p10 - p00) * wx, bot = p01 + (p11 - p01) * wx;
                out[d + c] = Math.round(top + (bot - top) * wy);
            }
        }
    }
    return out;
}
function halve(data, w, h) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const out = Buffer.alloc(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const x0 = x * 2, y0 = y * 2, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
        const d = (y * nw + x) * 4;
        for (let c = 0; c < 4; c++) {
            out[d + c] = (data[(y0 * w + x0) * 4 + c] + data[(y0 * w + x1) * 4 + c] +
                data[(y1 * w + x0) * 4 + c] + data[(y1 * w + x1) * 4 + c] + 2) >> 2;
        }
    }
    return { data: out, w: nw, h: nh };
}
function to565(r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }
function encodeColorBlock(px) {
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (let i = 0; i < 16; i++) for (let c = 0; c < 3; c++) { const v = px[i * 4 + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    let c0 = to565(hi[0], hi[1], hi[2]), c1 = to565(lo[0], lo[1], lo[2]);
    if (c0 < c1) { const t = c0; c0 = c1; c1 = t; const tt = hi; hi = lo; lo = tt; }
    const pal = [hi, lo, [0, 0, 0], [0, 0, 0]];
    for (let c = 0; c < 3; c++) { pal[2][c] = Math.round((2 * hi[c] + lo[c]) / 3); pal[3][c] = Math.round((hi[c] + 2 * lo[c]) / 3); }
    let idx = 0;
    for (let i = 0; i < 16; i++) {
        let best = 0, bd = 1e9;
        for (let p = 0; p < 4; p++) {
            const dr = px[i * 4] - pal[p][0], dg = px[i * 4 + 1] - pal[p][1], db = px[i * 4 + 2] - pal[p][2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bd) { bd = d; best = p; }
        }
        idx |= best << (i * 2);
    }
    const out = Buffer.alloc(8);
    out.writeUInt16LE(c0, 0); out.writeUInt16LE(c1, 2); out.writeUInt32LE(idx >>> 0, 4);
    return out;
}
function encodeAlphaBlock(px) {
    let a0 = 0, a1 = 255;
    for (let i = 0; i < 16; i++) { const a = px[i * 4 + 3]; if (a > a0) a0 = a; if (a < a1) a1 = a; }
    const out = Buffer.alloc(8); out[0] = a0; out[1] = a1;
    const al = [a0, a1];
    if (a0 > a1) { for (let j = 1; j <= 6; j++) al.push(Math.round(((7 - j) * a0 + j * a1) / 7)); }
    else { for (let j = 1; j <= 4; j++) al.push(Math.round(((5 - j) * a0 + j * a1) / 5)); al.push(0, 255); }
    let bits = 0n;
    for (let i = 0; i < 16; i++) {
        let best = 0, bd = 999;
        for (let p = 0; p < 8; p++) { const d = Math.abs(px[i * 4 + 3] - al[p]); if (d < bd) { bd = d; best = p; } }
        bits |= BigInt(best) << BigInt(i * 3);
    }
    for (let b = 0; b < 6; b++) { out[2 + b] = Number((bits >> BigInt(b * 8)) & 0xffn); }
    return out;
}
function compressBC(data, w, h, dxt5) {
    const bw = Math.ceil(w / 4), bh = Math.ceil(h / 4);
    const out = Buffer.alloc(bw * bh * (dxt5 ? 16 : 8));
    let o = 0;
    const px = new Uint8Array(64);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        for (let py = 0; py < 4; py++) for (let pxi = 0; pxi < 4; pxi++) {
            const sx = Math.min(w - 1, bx * 4 + pxi), sy = Math.min(h - 1, by * 4 + py);
            const s = (sy * w + sx) * 4, d = (py * 4 + pxi) * 4;
            px[d] = data[s]; px[d + 1] = data[s + 1]; px[d + 2] = data[s + 2]; px[d + 3] = data[s + 3];
        }
        if (dxt5) { encodeAlphaBlock(px).copy(out, o); o += 8; }
        encodeColorBlock(px).copy(out, o); o += 8;
    }
    return out;
}
function flagsToSize(flags) {
    const baseSize = 0x2000 << (flags & 0xF);
    return baseSize * (((flags >> 17) & 0x7F) + ((flags >> 11) & 0x3F) * 2 +
        ((flags >> 7) & 0xF) * 4 + ((flags >> 5) & 0x3) * 8 + ((flags >> 4) & 0x1) * 16);
}
const BAKE_FMT = { 827611204: 'DXT1', 861165636: 'DXT3', 894720068: 'DXT5' };
function readTexName(payload, ptr) {
    if (ptr < 0x50000000n || ptr >= 0x60000000n) { return null; }
    const off = Number(ptr - 0x50000000n);
    if (off <= 0 || off >= payload.length) { return null; }
    let end = off;
    while (end < payload.length && end - off < 64 && payload[end] !== 0) { end++; }
    if (end === off || payload[end] !== 0) { return null; }
    const s = payload.toString('ascii', off, end);
    return /^[\x20-\x7e]+$/.test(s) ? s : null;
}
function scanDescriptors(payload) {
    const found = [];
    for (let i = 64; i + 0x28 <= payload.length; i++) {
        const w = payload.readUInt16LE(i), h = payload.readUInt16LE(i + 2);
        if (w < 8 || h < 8 || w > 8192 || h > 8192) { continue; }
        if ((w & (w - 1)) || (h & (h - 1))) { continue; }
        const fmt = payload.readUInt32LE(i + 8);
        if (!BAKE_FMT[fmt] && fmt !== 21) { continue; }
        const levels = payload.readUInt8(i + 0xD);
        if (levels < 1 || levels > 14) { continue; }
        const dptr = payload.readBigUInt64LE(i + 0x20);
        if (dptr < 0x60000000n || dptr >= 0x70000000n) { continue; }
        let name = null;   // grcTexture name ptr sits 0x28 before the width field
        if (i >= 0x28) {
            try { name = readTexName(payload, payload.readBigUInt64LE(i - 0x28)); } catch (e) { /* none */ }
        }
        found.push({ w, h, fmt, levels, dataOffset: Number(dptr - 0x60000000n), name });
    }
    return found;
}
function mipTotal(w, h, levels, dxt5) {
    let n = 0, cw = w, ch = h;
    for (let i = 0; i < levels; i++) {
        n += Math.ceil(cw / 4) * Math.ceil(ch / 4) * (dxt5 ? 16 : 8);
        cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
    }
    return n;
}

/** Bake pngPath into the texture NAMED texName inside ytdPath (in place).
    Returns true on success; false leaves the file untouched. */
function bakeIntoYtd(ytdPath, texName, pngPath) {
    let buf;
    try { buf = fs.readFileSync(ytdPath); } catch (e) { return false; }
    if (buf.length < 16 || buf.readUInt32LE(0) !== 0x37435352) { return false; }
    let payload;
    try { payload = zlib.inflateRawSync(buf.slice(16)); } catch (e) { return false; }
    const sysSize = flagsToSize(buf.readUInt32LE(8));

    const target = scanDescriptors(payload)
        .find(d => d.name && d.name.toLowerCase() === texName.toLowerCase());
    if (!target || !BAKE_FMT[target.fmt]) { return false; }   // unnamed / A8R8G8B8 → runtime fallback
    const dxt5 = target.fmt === 894720068 || target.fmt === 861165636;

    let img;
    try { img = decodePng(fs.readFileSync(pngPath)); } catch (e) { return false; }
    let data = resizeImg(img, target.w, target.h);
    let cw = target.w, ch = target.h;
    const parts = [];
    for (let lvl = 0; lvl < target.levels; lvl++) {
        parts.push(compressBC(data, cw, ch, dxt5));
        if (lvl < target.levels - 1) { const hv = halve(data, cw, ch); data = hv.data; cw = hv.w; ch = hv.h; }
    }
    const pixels = Buffer.concat(parts);
    if (pixels.length !== mipTotal(target.w, target.h, target.levels, dxt5)) { return false; }
    const gfxStart = sysSize + target.dataOffset;
    if (gfxStart + pixels.length > payload.length) { return false; }
    pixels.copy(payload, gfxStart);
    fs.writeFileSync(ytdPath, Buffer.concat([buf.slice(0, 16), zlib.deflateRawSync(payload, { level: 9 })]));
    return true;
}

/** Every .ytd in outDir that belongs to this model (base and +hi). */
function findModelYtds(outDir, model) {
    const hits = [];
    const wants = [model.toLowerCase() + '.ytd', model.toLowerCase() + '+hi.ytd'];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); }
            else if (wants.includes(e.name.toLowerCase())) { hits.push(p); }
        }
    })(outDir);
    return hits;
}

function main() {
    console.log('Apex Vehicle Studio — plug-and-play vehicle builder\n');
    if (!fs.existsSync(VEH_OUT)) {
        console.log('Nothing staged. In the studio: Export -> "Full vehicle", then run this again.');
        return;
    }
    const templates = loadTemplates();
    const byModel = {};
    templates.forEach(t => { if (t && t.model) { byModel[String(t.model).toLowerCase()] = t; } });

    const models = fs.readdirSync(VEH_OUT).filter(f => {
        try { return fs.statSync(path.join(VEH_OUT, f)).isDirectory(); } catch (e) { return false; }
    });
    if (!models.length) { console.log('No staged skins in tools/veh_out/.'); return; }

    let built = 0;
    for (const model of models) {
        const inDir = path.join(VEH_OUT, model);
        const skins = fs.readdirSync(inDir).filter(f => /\.png$/i.test(f));
        if (!skins.length) { continue; }

        const tpl = byModel[model.toLowerCase()];
        if (!tpl || !tpl.src) {
            console.log(`skip ${model}: no source vehicle in templates.json (re-run convert.js with the car in templates/).`);
            continue;
        }
        const srcDir = path.join(RESOURCE_ROOT, tpl.src.split('/').join(path.sep));
        if (!fs.existsSync(srcDir)) {
            console.log(`skip ${model}: source folder missing (${tpl.src}).`);
            continue;
        }

        const outDir = path.join(EXPORTS, model);
        if (fs.existsSync(outDir)) { fs.rmSync(outDir, { recursive: true, force: true }); }
        console.log(`• ${model}: bundling car + ${skins.length} skin(s)…`);

        // 1) copy the whole original car (stream + meta + manifest)
        copyDir(srcDir, outDir);

        // 2) add the skins — and BAKE each one straight into the car's own
        //    .ytd whenever the texture can be located by name. Baked skins
        //    are deterministic (the texture IS the streamed file); anything
        //    that can't be baked falls back to a runtime replace.
        const modelYtds = findModelYtds(outDir, model);
        const skinDir = path.join(outDir, 'skins');
        fs.mkdirSync(skinDir, { recursive: true });
        const pairs = [];
        skins.forEach((f, i) => {
            const txn = f.replace(/\.png$/i, '');
            const src = path.join(inDir, f);
            fs.copyFileSync(src, path.join(skinDir, f));
            let baked = false;
            for (const ytd of modelYtds) {
                if (bakeIntoYtd(ytd, txn, src)) {
                    baked = true;
                    console.log(`  ✓ baked ${txn} into ${path.relative(outDir, ytd)}`);
                }
            }
            if (!baked) {
                console.log(`  ! ${txn}: not found in the car's .ytd — using the runtime fallback`);
            }
            pairs.push({ txn: txn, file: 'skins/' + f, baked: baked });
        });

        // 3) runtime apply script: replace fallback for unbaked skins +
        //    livery enforcement for '<name>_sign_N' surfaces (they only
        //    render when livery N-1 is selected on the vehicle).
        const lua = [
            '-- Generated by Apex Vehicle Studio. Custom skin support for the ' + model + '.',
            '-- Baked skins already live inside the .ytd; unbaked ones are applied',
            '-- at runtime. Sign/livery surfaces get their livery slot enforced.',
            "local MODEL = '" + model + "'",
            'local SKINS = {',
        ];
        pairs.forEach(p => lua.push(`    { txn = ${JSON.stringify(p.txn)}, file = ${JSON.stringify(p.file)}, baked = ${p.baked} },`));
        lua.push('}');
        lua.push([
            '',
            "local RT_TXD = 'apex_' .. MODEL .. '_rt'",
            'local applied = {}',
            '',
            'local liveryFor = nil',
            'for _, s in ipairs(SKINS) do',
            "    local n = tonumber(string.match(string.lower(s.txn), '_sign_(%d+)$'))",
            '    if n then liveryFor = n - 1 break end',
            'end',
            '',
            'CreateThread(function()',
            '    local res = GetCurrentResourceName()',
            '    local txd = nil',
            '    for i, s in ipairs(SKINS) do',
            '        if not s.baked then',
            '            txd = txd or CreateRuntimeTxd(RT_TXD)',
            "            local rt = 'rt' .. i",
            '            CreateRuntimeTextureFromImage(txd, rt, s.file)',
            '            AddReplaceTexture(MODEL, s.txn, RT_TXD, rt)',
            '            applied[#applied + 1] = s.txn',
            "            print(('^2[%s]^7 runtime replace %s/%s'):format(res, MODEL, s.txn))",
            '        end',
            '    end',
            "    print(('^2[%s]^7 %d baked skin(s), %d runtime skin(s) on %s%s'):format(res,",
            '        #SKINS - #applied, #applied, MODEL,',
            "        liveryFor and (' - enforcing livery ' .. liveryFor) or ''))",
            '',
            '    if liveryFor == nil then return end',
            '    local hash = GetHashKey(MODEL)',
            '    local done = {}',
            '    while true do',
            '        Wait(1000)',
            "        for _, veh in ipairs(GetGamePool('CVehicle')) do",
            '            if GetEntityModel(veh) == hash and not done[veh] then',
            '                done[veh] = true',
            '                if GetVehicleLiveryCount(veh) > liveryFor and GetVehicleLivery(veh) ~= liveryFor then',
            '                    SetVehicleLivery(veh, liveryFor)',
            '                end',
            '            end',
            '        end',
            '    end',
            'end)',
            '',
            'AddEventHandler("onResourceStop", function(res)',
            '    if res ~= GetCurrentResourceName() then return end',
            '    for _, txn in ipairs(applied) do RemoveReplaceTexture(MODEL, txn) end',
            'end)',
        ].join('\n'));
        fs.writeFileSync(path.join(outDir, 'apex_skin.lua'), lua.join('\n') + '\n');

        // 4) make sure the manifest loads our script + skin files.
        //    The original manifest already streams the car and declares the
        //    meta data_files — we just append our bits.
        const addon = ['\n',
            '-- ----- Apex Vehicle Studio (custom skin) -----',
            "client_script 'apex_skin.lua'",
            "files {",
            "    'skins/*.png',",
            "}",
            '',
        ].join('\n');
        for (const man of ['fxmanifest.lua', '__resource.lua']) {
            const mp = path.join(outDir, man);
            if (fs.existsSync(mp)) { fs.appendFileSync(mp, addon); }
        }

        built++;
        console.log(`  ✓ exports/${model}/  (drop into resources/ and ensure ${model})`);
    }

    console.log(`\nDone — ${built} plug-and-play vehicle(s) in exports/.`);
    if (built) {
        console.log('Each folder is a complete resource: the original car + your skin.');
        console.log('It REPLACES the original addon — use one or the other, not both.');
    }
}
main();
