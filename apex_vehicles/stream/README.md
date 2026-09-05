# stream/ — the 3D viewer assets (NOT game files)

This folder holds only the **web assets of the 3D viewer**: the `.glb` meshes
and texture `.png`s that `tools/convert.js` generates from the vehicles you put
under `templates/`, plus the `models/models.json` catalog.

> Despite the folder's name, **nothing in here is a GTA stream asset**. The
> `.glb`/`.png` are served to the NUI browser through `files{}` in the
> `fxmanifest.lua` — they are never replicated to game clients as `.yft`/`.ytd`.

```
stream/
└─ models/
   ├─ models.json                ← optional manual catalog (normally empty)
   └─ vehicles/
      ├─ mycar.glb               ← generated: web mesh for the 3D viewer
      ├─ mycar__sign_1.png       ← generated: paintable texture sheets
      └─ ...
```

## How files get here

You never add files here by hand. Put your vehicle source (`.yft` + `.ytd`)
under **`templates/`** and run `tools/convert.bat` — the converter writes the
generated assets into `stream/models/vehicles/` and updates the root
`templates.json` automatically.

## The actual cars

The playable vehicles themselves keep streaming from wherever they already
stream on your server (their own resource). The studio only needs the source
files under `templates/` to build the viewer meshes and, for
**Export → Full vehicle**, to bundle the original car with your livery.
