# templates/ — drop your vehicle source files here

This folder holds the **edit-only** source of the vehicles you want to design
liveries for. It is **never streamed to players** — only the tools read it.

## What to put here

The vehicle's `.yft` models and their `.ytd` textures — the easiest way is to
copy the **whole original vehicle resource folder** in here, e.g.:

```
templates/MyCarPack/stream/mycar.yft
templates/MyCarPack/stream/mycar.ytd
templates/MyCarPack/stream/mycar_hi.yft
templates/MyCarPack/data/vehicles.meta
templates/MyCarPack/data/carvariations.meta
...
```

Any folder layout works — the converter finds every **paintable** `.yft` (the
one that has a matching `.ytd`) on its own. `_hi` LODs and accessory parts
(spoilers, cages…) are skipped automatically.

## Then convert

Run **`tools/convert.bat`** (Windows) / **`tools/convert.sh`** (Linux/Mac) /
`node tools/convert.js`. It builds the web `.glb` + texture `.png`s into
`stream/models/vehicles/` and updates `templates.json`, so the vehicles appear
in the studio's **Templates** tab with every paintable surface selectable.

Keeping the full pack here (stream + data metas) also lets
**Export → Full vehicle** bundle the original car together with your livery
into one plug-and-play resource.

See the main `README.md` for the full workflow.
