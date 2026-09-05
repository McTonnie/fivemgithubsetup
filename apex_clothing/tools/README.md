# tools/ — automatic `.ydd` → `.glb` converter

The 3D viewer needs a web mesh (`.glb`) because the browser can't read the
game's `.ydd`. **0Resmon does this with compiled CodeWalker DLLs it bundles;**
this does the same job with **no software to install** — it uploads each `.ydd`
to the public **gtax.dev** drawable→glb converter, gets back a `.glb`, drops it
into `stream/models/<gender>/<component>/`, and updates `templates.json` so the
studio shows the **real 3D shape**.

**Requirements:** Node.js + `curl` (built into Windows 10/11 and Linux) + an
internet connection. That's it — no Blender, no CodeWalker, no DLLs.

---

## Convert your clothes

From this `tools/` folder, **double-click `convert.bat`** (or run `node convert.js`).

It finds every `.ydd` under `stream/`, converts each one, and wires it into the
studio. Then, in the server console:

```
refresh
restart apex_clothing
```

Open `/clothingstudio` → **Templates** tab → your clothes show the **real 3D
shape** (rotate, design, export).

## Options

- `--force` — reconvert even if a `.glb` already exists.
- `--gender female` — gender for `.ydd` files that aren't inside a
  `stream/female/` or `stream/male/` folder (default `male`).
- `--api <url>` — use a different / self-hosted converter endpoint.

## How it decides gender / component

- **Gender** — from the folder: files under `stream/female/…` → female,
  `stream/male/…` → male (else the `--gender` default).
- **Component** — from the file name prefix (`jbib_…` → torso/top,
  `lowr_…` → legs, `feet_…` → shoes, etc.).
- **Export name** (`txd`/`txn`) — derived from the file name; if you stream your
  clothes under an addon dlcName, set `Config.templates.collection` in
  `shared/config.lua` so **Export → Live** targets the right in-game texture.

## Adding more clothes later

1. Drop the `.ydd` (+ its `.ytd` textures) in `stream/female/` or `stream/male/`.
2. Double-click `convert.bat`.
3. `refresh` + `restart apex_clothing`, then open the studio.

## Notes & troubleshooting

- The converter is a **free public API** (`https://public-drawable-to-glb.gtax.dev`).
  It's rate-limited; if a batch fails with an HTTP error, wait a minute and
  re-run, or set an API key for higher limits:
  ```
  set V_DRAWABLE_TO_GLB_API_KEY=<your key>
  node convert.js
  ```
- Your `.ydd` files are uploaded to that service only to be converted — they're
  extracted game meshes, not personal data. If you'd rather not use a hosted
  service, point `--api` at your own self-hosted `v-drawable-to-glb` instance.
- **"curl not found"** — install curl or add it to PATH (it ships with Windows
  10+/11 and every Linux distro).
- The `.glb` is only for the viewer's SHAPE. To make the clothes actually
  **wearable in-game** (so Export → Live has something to retexture), stream the
  real addon (`.ydd`/`.ytd`/`.ymt`/`.meta`) — see `../stream/README.md`.

Credit: conversion by the free **gtax.dev** drawable→glb service
(github.com/gtax-dev/v-drawable-to-glb).
