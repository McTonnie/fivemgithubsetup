# Apex Billboards

Live billboards, video screens & digital advertising for FiveM — project images,
videos, YouTube clips and rotating ad playlists onto **any real surface in the
world** (walls, rooftops, panels, floors, wrapped building corners) **or onto
vehicles, bound to a number plate**.

Built on the proven "television" render pipeline (streamed scaleform + DUI
runtime texture — the same technique as apex_obd's dyno TV / rcore_television),
with a pooled slot system so hundreds of saved boards cost almost nothing.

---

## Features

### Live in-game creator
- Free-fly camera (WASD · Space/Ctrl · Shift boost · scroll = speed)
- Trace surfaces with a centre reticle — nodes snap to real geometry
- The ghost you see while tracing is the **final renderer** (not an
  approximation): what you confirm is exactly what spawns
- Confirm-surface card with live measurements (m × m) and node count
- 4-step wizard: **SHAPE → PLACE → CONTENT → CREATE**

### Shapes
| Shape | Trace | Notes |
|---|---|---|
| **Image** | **1 click** | the quickest way: click a surface, then set the size with a slider. The height always follows the image's own proportions, so it never stretches. Rotation slider included. |
| Rectangle | 2 corners + height | the classic billboard |
| Circle | centre + radius | round display (masked) |
| Polygon | 3–16 points | a node on every corner (hexagons, stars…), content clipped to the outline |
| Wrap | start → corner → end + height | wraps a 90° building corner, content split proportionally across both walls |

### Content engine (per board)
- **Upload an image straight from your PC** — no image host, no API key.
  The file is downscaled and compressed in the UI until it fits
  `Config.content.maxUploadKB` (512 KB by default), then stored inline
  with the board, so it syncs to every player like any other content.
  Set `allowUploads = false` to force URLs only.
- Image / GIF / MP4 / WebM by URL
- **YouTube links** (`watch?v=`, `youtu.be`, `shorts`) — rendered as a
  chrome-free embed: no controls, no title bar, no related videos, no
  keyboard/fullscreen, looping forever. A small overscan in fill mode
  hides the player's top branding strip.
- **Audio, per board** (off by default): flip *Play sound* on any video
  or YouTube board and set its volume. In-world the level **fades in and
  out with the listener's distance** to the surface (`Config.audio`:
  `fullDistance` → full volume, `maxDistance` → silent, `rolloff` shapes
  the curve). Audible boards keep playing even when you look away, so a
  club screen never cuts out mid-track.
- Single URL or **playlist** with crossfade + seconds-per-item
- Fill / Fit (letterbox colour configurable)
- Drag-to-reposition framing + scroll-to-zoom (in the live preview)
- Animations: **Ken Burns, Zoom, Pan, Fade, Pulse, Sway, Carousel**
- Carousel: auto or 2–6 panels, **dwell+slide** or **smooth scroll**, seconds/panel


### Vehicle billboards (plate-bound)
- Pick **Vehicle** in the placement selector, aim at a car and trace as usual
- The board binds to that car's **number plate**; its faces are stored in
  entity-local space, so a background scanner brings the board back every
  time the plate spawns (garage exit, /car, valet) — no garage-script
  integration needed
- Limit per plate via `Config.limits.maxPerVehicle`; turn the whole
  feature off with `Config.vehicles.enabled = false`

### Depth (live)
Drag the **Depth** slider and the surface slides off the wall in real
time — both while creating (steps 02/04, the traced ghost moves) and when
editing an existing board (that board is redrawn at the new depth while
you drag; nothing is saved until you press Save). Range -10 cm to +60 cm;
negative sinks the surface into the wall for recessed frames.

### Management dashboard
Search · live thumbnails · rename · edit content · relocate · duplicate ·
enable/disable · fly-to · delete. Managers (`Config.permissions.manager*`)
can manage everyone's boards; regular users only their own.

### Performance
- Pooled render slots (default 8, max 16) — one scaleform + one DUI browser
  per slot, never per board
- Distance gating per board + frustum culling
- Far boards drop to **eco** (videos pause, animations freeze);
  off-screen boards **sleep**; idle slots destroy their DUI after 45 s
- Occlusion raycasts are **off by default**: the draw calls are already
  depth-tested by the engine (a wall in front hides the board natively),
  and a naive probe would make a board vanish whenever a prop, tree or
  parked car crossed the line. Enable `Config.render.occlusionChecks`
  only if you want boards fully behind buildings to idle their video —
  it then samples the centre + four corners and needs all five blocked.
- No per-board texture leaks — runtime textures live on the slot, not the board

### Frameworks & storage
- Standalone / ESX Legacy / QBCore / QBox (auto-detected)
- Persistence: **oxmysql** when started, otherwise a JSON file
  (`data/billboards.json`) — zero hard dependencies
- Optional creation fee via `Config.economy.createCost`

---

## Install

1. Drop `apex_billboards` into your resources and `ensure apex_billboards`.
2. (Optional) run `sql/install.sql` — the table is also auto-created.
3. Give access (any one of these):
   ```cfg
   add_ace group.admin apexbillboards.use allow
   add_ace group.admin apexbillboards.manage allow
   ```
   or edit `Config.permissions` (framework groups / jobs with grades /
   `everyone = true`).
4. In game: `/billboards` (configurable command + optional keybind).

## Content URLs

Direct **https** links to images/gifs/videos (Discord CDN, Imgur, Fivemerr…).
Lock it down with `Config.content.allowedHosts` — empty list = any https host.

## Exports

```lua
-- server
exports.apex_billboards:GetBillboards()
exports.apex_billboards:GetBillboard(id)
exports.apex_billboards:SetBillboardContent(id, urls, opts)  -- rotate ads from other scripts
exports.apex_billboards:SetBillboardEnabled(id, enabled)
exports.apex_billboards:DeleteBillboard(id)

-- client
exports.apex_billboards:GetBillboards()
exports.apex_billboards:OpenStudio()
exports.apex_billboards:IsStudioOpen()
```

## Render modes

- `Config.render.method = 'poly'` (**default**) — draws each board as two
  textured triangles anchored to the EXACT world corners you traced.
  Position, size and rotation are pixel-perfect on any surface (walls,
  slopes, floors). Nothing to calibrate.
- `Config.render.method = 'scaleform'` — the classic television draw call
  (as in apex_obd's dyno TV). If you use it, `scalePerMeter` controls the
  size and `pitchSign`/`rollSign` fix leaning boards on slanted surfaces.

Both modes share the same DUI pipeline (`CreateDui` →
`CreateRuntimeTextureFromDuiHandle`) — only the final draw call differs.

## Files that stay open in escrow builds

`shared/config.lua`, `shared/utils.lua`, `shared/framework.lua`,
`locales/*`, `stream/*`, `sql/*`, the whole NUI (`html/**`).
