/* ============================================================
   Apex Vehicle Studio — PNG → .ytd generator
   ------------------------------------------------------------
   Turns a designed texture PNG into a real GTA .ytd, WITHOUT
   OpenIV / CodeWalker / any external tool or login.

   How it stays safe: it does NOT build a .ytd from scratch (the
   RSC7 struct layout is crash-prone). Instead it takes the
   ORIGINAL .ytd of the same clothing item as a TEMPLATE and
   swaps ONLY the texture pixels — same format, same dimensions,
   same mip count, same byte length — then recompresses. Every
   struct, pointer and flag stays byte-identical to a file the
   game already loads, so the result is valid by construction.

   Pure Node (built-in zlib only). No dependencies.

   Usage:
     node make_ytd.js <design.png> <template.ytd> <out.ytd>
     node make_ytd.js --auto        (batch: tools/ytd_in → tools/ytd_out)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ── PNG decode (8-bit, colour type 2/6) ─────────────────── */
function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) { throw new Error('not a PNG'); }
    let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.slice(off + 8, off + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            bitDepth = data[8]; colorType = data[9];
        } else if (type === 'IDAT') { idat.push(data); }
        else if (type === 'IEND') { break; }
        off += 12 + len;
    }
    if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
        throw new Error('PNG must be 8-bit RGB/RGBA (got depth ' + bitDepth + ' colour ' + colorType + ')');
    }
    const channels = colorType === 6 ? 4 : 3;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(width * height * 4);
    let prev = Buffer.alloc(stride);
    let p = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[p++];
        const line = Buffer.from(raw.slice(p, p + stride)); p += stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? line[x - channels] : 0;
            const b = prev[x];
            const c = x >= channels ? prev[x - channels] : 0;
            let v = line[x];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
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
    return { width, height, data: out };   // RGBA8
}

/* ── bilinear resize to target w×h ───────────────────────── */
function resize(img, tw, th) {
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
                const p00 = img.data[(y0 * img.width + x0) * 4 + c];
                const p10 = img.data[(y0 * img.width + x1) * 4 + c];
                const p01 = img.data[(y1 * img.width + x0) * 4 + c];
                const p11 = img.data[(y1 * img.width + x1) * 4 + c];
                const top = p00 + (p10 - p00) * wx, bot = p01 + (p11 - p01) * wx;
                out[d + c] = Math.round(top + (bot - top) * wy);
            }
        }
    }
    return out;
}

/* ── half-size box downscale (for mips) ──────────────────── */
function halve(data, w, h) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const out = Buffer.alloc(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
            const x0 = x * 2, y0 = y * 2, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
            const d = (y * nw + x) * 4;
            for (let c = 0; c < 4; c++) {
                out[d + c] = (data[(y0 * w + x0) * 4 + c] + data[(y0 * w + x1) * 4 + c] +
                    data[(y1 * w + x0) * 4 + c] + data[(y1 * w + x1) * 4 + c] + 2) >> 2;
            }
        }
    }
    return { data: out, w: nw, h: nh };
}

/* ── BC1/BC3 block compression ───────────────────────────── */
function to565(r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); }

function encodeColorBlock(px) {   // px: 16 * [r,g,b,a] → 8 bytes (BC1 colour)
    // pick min/max by luma along the RGB bounding box
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (let i = 0; i < 16; i++) {
        for (let c = 0; c < 3; c++) { const v = px[i * 4 + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    }
    let c0 = to565(hi[0], hi[1], hi[2]), c1 = to565(lo[0], lo[1], lo[2]);
    if (c0 < c1) { const t = c0; c0 = c1; c1 = t; const tt = hi; hi = lo; lo = tt; }
    // 4 palette colours
    const pal = [hi, lo, [0, 0, 0], [0, 0, 0]];
    for (let c = 0; c < 3; c++) {
        pal[2][c] = Math.round((2 * hi[c] + lo[c]) / 3);
        pal[3][c] = Math.round((hi[c] + 2 * lo[c]) / 3);
    }
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

function encodeAlphaBlock(px) {   // 16 alpha → 8 bytes (BC3/BC4 alpha)
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

function compress(data, w, h, dxt5) {
    const bw = Math.ceil(w / 4), bh = Math.ceil(h / 4);
    const out = Buffer.alloc(bw * bh * (dxt5 ? 16 : 8));
    let o = 0;
    const px = new Uint8Array(64);
    for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
            for (let py = 0; py < 4; py++) {
                for (let pxi = 0; pxi < 4; pxi++) {
                    const sx = Math.min(w - 1, bx * 4 + pxi), sy = Math.min(h - 1, by * 4 + py);
                    const s = (sy * w + sx) * 4, d = (py * 4 + pxi) * 4;
                    px[d] = data[s]; px[d + 1] = data[s + 1]; px[d + 2] = data[s + 2]; px[d + 3] = data[s + 3];
                }
            }
            if (dxt5) { encodeAlphaBlock(px).copy(out, o); o += 8; }
            encodeColorBlock(px).copy(out, o); o += 8;
        }
    }
    return out;
}

/* ── RSC7 helpers ────────────────────────────────────────── */
function flagsToSize(flags) {
    const baseSize = 0x2000 << (flags & 0xF);
    return baseSize * (((flags >> 17) & 0x7F) + ((flags >> 11) & 0x3F) * 2 +
        ((flags >> 7) & 0xF) * 4 + ((flags >> 5) & 0x3) * 8 + ((flags >> 4) & 0x1) * 16);
}

const FMT = { 21: 'A8R8G8B8', 827611204: 'DXT1', 861165636: 'DXT3', 894720068: 'DXT5' };

function findDescriptor(payload) {
    for (let i = 64; i + 0x28 <= payload.length; i++) {
        const w = payload.readUInt16LE(i), h = payload.readUInt16LE(i + 2);
        if (w < 8 || h < 8 || w > 8192 || h > 8192) { continue; }
        if ((w & (w - 1)) || (h & (h - 1))) { continue; }   // powers of two
        const fmt = payload.readUInt32LE(i + 8);
        if (!FMT[fmt]) { continue; }
        const levels = payload.readUInt8(i + 0xD);
        if (levels < 1 || levels > 14) { continue; }
        const dptr = payload.readBigUInt64LE(i + 0x20);
        if (dptr < 0x60000000n || dptr >= 0x70000000n) { continue; }
        return { w, h, fmt, levels, dataOffset: Number(dptr - 0x60000000n) };
    }
    return null;
}

function mipTotal(w, h, levels, dxt5) {
    let n = 0, cw = w, ch = h;
    for (let i = 0; i < levels; i++) {
        n += Math.ceil(cw / 4) * Math.ceil(ch / 4) * (dxt5 ? 16 : 8);
        cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
    }
    return n;
}

function makeYtd(pngPath, templatePath, outPath) {
    const tpl = fs.readFileSync(templatePath);
    if (tpl.readUInt32LE(0) !== 0x37435352) { throw new Error(templatePath + ' is not an RSC7 .ytd'); }
    const sysFlags = tpl.readUInt32LE(8);
    const payload = zlib.inflateRawSync(tpl.slice(16));
    const sysSize = flagsToSize(sysFlags);

    const desc = findDescriptor(payload);
    if (!desc) { throw new Error('could not locate the texture descriptor in ' + templatePath); }
    const dxt5 = desc.fmt === 894720068 || desc.fmt === 861165636;
    if (desc.fmt === 21) { throw new Error('uncompressed A8R8G8B8 templates are not supported yet'); }
    const gfxStart = sysSize + desc.dataOffset;
    const N = mipTotal(desc.w, desc.h, desc.levels, dxt5);
    console.log(`  template: ${desc.w}x${desc.h} ${FMT[desc.fmt]} levels=${desc.levels} dataN=${N}`);

    // Decode + resize the design to the texture's exact dimensions.
    const png = decodePng(fs.readFileSync(pngPath));
    let data = resize(png, desc.w, desc.h);
    let cw = desc.w, ch = desc.h;

    // Encode every mip and concatenate — must equal N exactly.
    const parts = [];
    for (let lvl = 0; lvl < desc.levels; lvl++) {
        parts.push(compress(data, cw, ch, dxt5));
        if (lvl < desc.levels - 1) { const hv = halve(data, cw, ch); data = hv.data; cw = hv.w; ch = hv.h; }
    }
    const pixels = Buffer.concat(parts);
    if (pixels.length !== N) {
        throw new Error(`encoded ${pixels.length} bytes but template expects ${N} — aborting to stay safe`);
    }

    // Splice into the payload (only the pixel region changes), recompress.
    pixels.copy(payload, gfxStart);
    const recompressed = zlib.deflateRawSync(payload, { level: 9 });
    const out = Buffer.concat([tpl.slice(0, 16), recompressed]);
    fs.writeFileSync(outPath, out);
    console.log(`  ✓ wrote ${outPath} (${out.length} bytes)`);
}

/* ── CLI ─────────────────────────────────────────────────── */
function findTemplate(name) {
    // Collect every .ytd from the edit-source (templates/) AND from stream/
    // (addon clothing the user drops in), then match by preference.
    const roots = [
        path.resolve(__dirname, '..', 'templates'),
        path.resolve(__dirname, '..', 'stream'),
    ];
    const all = [];
    function walk(dir) {
        if (!fs.existsSync(dir)) { return; }
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); }
            else if (e.name.toLowerCase().endsWith('.ytd')) { all.push(p); }
        }
    }
    for (const r of roots) { walk(r); }

    const want = name.toLowerCase() + '.ytd';
    // 1) exact filename match — this is the normal case now that the export
    //    stages PNGs as the full <collection>^<drawable> name.
    let exact = all.filter(p => path.basename(p).toLowerCase() === want);
    if (exact.length) { return { path: exact[0] }; }

    // 2) fallback for older PNGs staged with only the texture name (no
    //    collection): match any <collection>^<name>.ytd by its suffix.
    const suffix = '^' + name.toLowerCase() + '.ytd';
    let sfx = all.filter(p => path.basename(p).toLowerCase().endsWith(suffix));
    if (sfx.length === 1) { return { path: sfx[0] }; }
    if (sfx.length > 1) {
        return { path: sfx[0], ambiguous: sfx.map(p => path.basename(p)) };
    }
    return null;
}

/* Given the ORIGINAL texture .ytd, find its garment MODEL .ydd (same
   collection, same folder). A clothing pack needs BOTH the model and the
   texture, so we ship them together.
     texture:  <collection>^<comp>_diff_<NNN>_<letter>_uni.ytd
     model:    <collection>^<comp>_<NNN>_*.ydd   (usually _u)              */
function findModelYdd(templatePath) {
    const dir = path.dirname(templatePath);
    const bn = path.basename(templatePath, '.ytd');
    const caret = bn.indexOf('^');
    const coll = caret >= 0 ? bn.slice(0, caret) : '';
    const draw = caret >= 0 ? bn.slice(caret + 1) : bn;       // jbib_diff_014_a_uni
    const m = draw.match(/^(.+?)_diff_(\d+)_/i);               // comp + number
    if (!m) { return null; }
    const prefix = ((coll ? coll + '^' : '') + m[1] + '_' + m[2] + '_').toLowerCase(); // ..^jbib_014_
    try {
        for (const e of fs.readdirSync(dir)) {
            const le = e.toLowerCase();
            if (le.endsWith('.ydd') && le.startsWith(prefix)) { return path.join(dir, e); }
        }
    } catch (_) { /* none */ }
    return null;
}

function main() {
    const args = process.argv.slice(2);
    if (args[0] === '--auto') {
        const inDir = path.resolve(__dirname, 'ytd_in'), outDir = path.resolve(__dirname, 'ytd_out');
        if (!fs.existsSync(inDir)) { fs.mkdirSync(inDir, { recursive: true }); }
        if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, { recursive: true }); }
        const pngs = fs.readdirSync(inDir).filter(f => f.toLowerCase().endsWith('.png'));
        if (!pngs.length) { console.log('Drop <txn>.png files in tools/ytd_in/ then run this again.'); return; }
        let ok = 0;
        for (const f of pngs) {
            const name = f.replace(/\.png$/i, '');
            const tpl = findTemplate(name);
            if (!tpl) { console.log(`✗ ${f}: no original .ytd found under stream/ for "${name}" — skipping`); continue; }
            if (tpl.ambiguous) {
                console.log(`  ! "${name}" matches ${tpl.ambiguous.length} collections (${tpl.ambiguous.join(', ')}) — using ${path.basename(tpl.path)}. Re-export from the studio for an exact match.`);
            }
            // output keeps the ORIGINAL .ytd filename so it drops straight in
            const outName = path.basename(tpl.path);
            try {
                console.log(`• ${f}  ->  ${outName}`);
                makeYtd(path.join(inDir, f), tpl.path, path.join(outDir, outName));
                ok++;
                // Ship the garment MODEL (.ydd) next to the texture so the
                // pack is a complete item+texture pair, ready to drop in.
                const ydd = findModelYdd(tpl.path);
                if (ydd) {
                    const yddOut = path.join(outDir, path.basename(ydd));
                    fs.copyFileSync(ydd, yddOut);
                    console.log(`  + model ${path.basename(ydd)}`);
                } else {
                    console.log(`  ! model .ydd not found for ${outName} — texture only (still works as an override)`);
                }
            }
            catch (e) { console.log(`✗ ${f}: ${e.message}`); }
        }
        console.log(`\nDone — ${ok}/${pngs.length} converted. Model + texture pairs in tools/ytd_out/`);
        return;
    }
    if (args.length < 3) {
        console.log('Usage: node make_ytd.js <design.png> <template.ytd> <out.ytd>');
        console.log('   or: node make_ytd.js --auto   (batch tools/ytd_in → tools/ytd_out)');
        return;
    }
    makeYtd(args[0], args[1], args[2]);
}
main();
