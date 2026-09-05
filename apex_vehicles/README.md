# Apex Vehicle Studio

**An in-game vehicle livery designer for FiveM.** Players sit in a car, open a
full design studio, paint a livery on a layer-based canvas (brush, text, shapes,
fills, patterns, images **and AI generation**) and watch it update **live in 3D
and on the real car**. When it's done, they export it as a plug-and-play vehicle
resource, a drop-in retexture package, or apply it live to the whole server —
**without OpenIV, CodeWalker or Blender**.

Works on **ESX Legacy, QBCore, QBox and standalone**. **No database required.**

---

## ✨ Features

- **Real-time 3D vehicle viewer** — the car renders with three.js and updates the
  instant you paint. Orbit, pan in every direction, keyboard controls (WASD/arrows
  move, Q/E orbit, R reframes), click a body panel to see exactly where to paint
  on the canvas.
- **Live preview on the actual car** — sit in the vehicle and the livery updates
  on it in real time while you design (runtime texture replacement, no restarts).
- **Wrap mode — paint cars that have NO livery slot.** Cars that just spawn in a
  colour expose no texture to replace. Wrap mode shrink-wraps a mesh onto the
  car's real body and projects your sheet onto it, bound to that car's **plate**,
  synced to every player. See [Wrap mode](#-wrap-mode-cars-with-no-livery-slot).
- **Layer-based 2D editor** — brush (with symmetry / spray / marker), eraser,
  text (curved + many fonts), shapes, fill, pattern, eyedropper, image upload &
  paste. Reorder, hide, lock, duplicate, opacity, shadow, precise positioning.
- **AI texture generation** — describe the livery ("JDM drift livery with
  tribal flames") and it generates straight onto the sheet. **Select an area**
  and the AI edits only that region. Bring-your-own-key; default provider is
  **Google Gemini (free tier)**; fal.ai / Together / OpenAI / custom supported.
- **Quick AI** — one click composes a themed livery (racing, camo, graffiti,
  synthwave, monogram…) from thousands of style combinations.
- **Download as PNG** — one click saves the current sheet to the server PC.
- **Projects & community gallery** — save designs, reopen them, share by code, or
  publish to an in-server gallery. Persisted as plain JSON — **no SQL**.
- **Three export modes** — see [Exporting](#-exporting-your-liveries).
- **Framework aware** — auto-detects ESX / QBCore / QBox, falls back to standalone.
- **Access control** — five stackable methods: everyone, ACE, framework groups,
  jobs, or a hand-picked identifier list. `/vehiclestudio_access` explains any
  denial.
- **Full i18n — 9 languages, all 100%** — English, Português (PT), Português
  (BR), Español, Français, Deutsch, Italiano, 日本語, Türkçe. Each player picks
  their own with `/vehiclestudio_lang`.
- **Zero external dependencies at runtime** — three.js, the icon font and every
  web font are self-hosted, so the studio works behind a firewall.

---

## 📦 What's in the package

| Resource | Purpose | Ship it? |
|---|---|---|
| `apex_vehicles` | The studio itself (editor, AI, **live + package export** — fully self-contained). | **Required** |

> **Live** exports need nothing else — they broadcast runtime textures to every
> client and persist inside `apex_vehicles/data/`. **Package** and **Full
> vehicle** exports generate a brand-new standalone resource under
> `exports/<name>/` that you drop into `resources/`.

---

## ✅ Requirements

- FiveM server artifacts **build 5104+**.
- A framework (ESX / QBCore / QBox) **or** none (standalone works out of the box).
- **For importing your own vehicles:** [Node.js](https://nodejs.org) on the machine
  that runs the tools (any modern version). `curl` is used too — it ships with
  Windows 10+/11 and Linux. *You do not need Node on the game server — only on the
  PC where you run the `tools/` scripts.*
- **Nothing else.** No database, no oxmysql, no external web panel.

---

## 🚀 Installation

1. Drop `apex_vehicles` into your server's `resources/` directory.
2. Add to `server.cfg` (order matters — after your framework):

   ```cfg
   ensure apex_vehicles

   # (Optional) AI — get a FREE Gemini key at https://aistudio.google.com/apikey
   set apex_vehicles_ai_key "AIza..."
   ```
3. Open the studio in-game with **`/vehiclestudio`** (configurable).

> The resource ships **empty of vehicles** on purpose — the editor's Templates tab
> is blank until you import your own cars (next section). This keeps the package
> clean and free of third-party game files.

---

## 🚗 Importing your own vehicles (Templates)

The browser can't read the game's `.yft`, so each vehicle is converted once to a
web `.glb` (+ its texture sheets as `.png`). A bundled tool does it automatically —
**no OpenIV, no Blender, no login.**

1. Put the vehicle's files under **`templates/`** — the easiest way is to copy the
   whole original vehicle resource folder in there (its `stream/` with the `.yft`
   + `.ytd` and its `data/` metas). Any layout works.
2. Run the converter on that machine:
   - **Windows:** double-click `tools/convert.bat`
   - **Linux/Mac:** `bash tools/convert.sh`
   - **Any OS:** `cd tools && node convert.js`
3. It converts each paintable `.yft` (the one with a matching `.ytd`), writes the
   `.glb` + texture `.png`s into `stream/models/vehicles/`, and updates
   `templates.json`. The cars now appear in the studio's **Templates** tab with
   every paintable surface (body, livery `sign_1`, interior…) selectable.
   Re-run any time to add more — already-converted vehicles are skipped.

> **Why `templates/` and not `stream/`?** The source `.yft/.ytd` under
> `templates/` are **edit-only** and are **not** streamed to players. Only the web
> `.glb/.png` live under `stream/models/`, and those are **not** GTA stream
> assets, so nothing heavy is replicated to clients.

---

## 🎨 Exporting your liveries

Open **Export** in the studio and pick a mode:

| Mode | What it does | Best for |
|---|---|---|
| **Resource** | Writes a complete standalone livery resource (runtime `AddReplaceTexture` + automatic livery selection). Install it on any server that streams the car. | Keeping a livery, or sharing it. |
| **Live** | Broadcasts the texture to every connected player instantly and persists it in `data/live.json` — survives restarts. | Applying a livery to your own server right now. |

Both finish inside the studio. Neither needs another resource, a database, or
a tool run by hand — if an export says it is done, it *is* done.

### After a Resource export

The Export panel shows you the exact folder it wrote to, the resource name and
the `server.cfg` line, each with a Copy button, followed by the numbered steps.
The short version:

1. Make a folder named after your export inside `resources/`.
2. Move the `<name>__*` files from `apex_vehicles/exports/` into it and drop the
   `<name>__` prefix from each name.
3. Add `ensure <name>` to `server.cfg` and restart (or `refresh` + `ensure`).

> **Why the manual move?** Having the server create the folder and write into it
> hard-crashed the FXServer process on Linux in two separate releases of our map
> builder — a native fault a `pcall` cannot catch. One drag-and-drop beats an
> export that can take the server down. If your host handles it, set
> `Config.export.createFolder = true` and the folder is made for you.

### Seeing it on the car

The pack holds **only the texture** — the car itself must already be streamed by
your server, so install this *next to* the vehicle pack, not instead of it.

Surfaces named `<model>_sign_N` are livery slots, and a texture replacement on
one is **invisible until that livery is selected**. The generated resource works
this out from the texture name and selects the right livery on each car as it
spawns, so you never have to pick it in a mod shop.

---

## 🩹 Wrap mode (cars with no livery slot)

Some vehicles have **nothing to paint on**: no `sign_1`, no body texture of their
own — they just spawn in a colour. Every livery tool in existence (this one
included) works by *replacing a texture the model already references*, so on
those cars there is simply no name to replace. Giving them a real livery means
editing the model itself (a new texture in the `.ytd` **and** a shader-group edit
in the `.yft`), which no runtime script can do.

**Wrap mode paints them anyway.** In the studio header (top of the 3D panel):

| Button | What it does |
|---|---|
| 🚗 | Live preview on the real car (the classic texture replacement). |
| 🎨 | **Wrap mode** — shrink-wraps the car and projects your sheet onto it. |
| 🔗 | Apply the wrap **for everyone**, bound to this car's plate. |
| 🗑️ | Remove the wrap from this car. |

1. Sit in the car and press the **wrap** button. The studio fires a grid of rays
   at the body ("Reading the car's shape…") and builds a mesh that follows the
   real panels — doors, bonnet, roof. It is cached per model, so the next car of
   that model is instant.
2. Paint. The canvas shows a **layout guide** of which region of the sheet lands
   on which panel (left flank, right flank, hood, roof, rear, front) and the car
   updates live as you draw.
3. Press **apply**. The wrap is stored server-side against that car's **plate**,
   broadcast to everyone, and it comes back after a restart, a respawn or a
   garage cycle — the client re-matches the plate to the car automatically.

Manage them with `/vehiclewrapclear` (removes every wrap, same access gate) and
`exports.apex_vehicles:RemoveWrap(plate)` / `:ClearWraps()`.

**Be honest about what it is.** A wrap is drawn by this resource on each client
instead of being a real game texture, so:

- it is **unlit** — `Config.wrap.ambient` fakes the day/night difference so it
  does not glow at midnight;
- it follows the car's **collision** surface, which is slightly coarser than the
  visual mesh — `Config.wrap.grid` and `offset` tune the fit;
- it costs draw calls: `drawDistance`, `lodDistance` and `maxDrawn` cap that.

Everything above is configurable in `Config.wrap` (panels, sheet layout, grid,
opacity, budgets). If a wrap ever comes out invisible from outside the car, run
`/vehiclewrapdebug` once — it flips double-sided rendering and prints what the
client thinks it is drawing.

Storage: `data/wraps.json` holds a small index, `data/wraps/<plate>.txt` holds
each PNG, and a client downloads a wrap's image only when it first sees that car.

---

## 🧩 Frameworks & standalone

Auto-detected at runtime — **ESX Legacy**, **QBCore**, **QBox** (checked before
qb-core so a compatibility shim can't win), or **standalone**. Nothing to
configure and no database anywhere.

Standalone is a **first-class mode, not a degraded one**. These three things are
all a framework is ever asked for:

| What | Used for | Without a framework |
|---|---|---|
| A stable identifier | owning saved projects, rate-limiting AI | the Rockstar license |
| A character name | shown on saved projects | the player's Steam/FiveM name |
| A job | only the `jobs` access method | that one method is unavailable |

The editor, the 3D viewer, AI, live preview, both export modes and the whole
storage layer never touch a framework at all.

### Another framework (vRP, ND, a fork, your own core)

`shared/config.lua` → `Config.framework.custom` takes three small functions.
Fill in what you have; anything you leave out falls back to the standalone
behaviour above, so a half-filled adapter still works:

```lua
Config.framework.mode = 'custom'
Config.framework.custom.name   = 'vrp'
Config.framework.custom.detect = function()
    return GetResourceState('vrp') == 'started'
end
Config.framework.custom.getIdentifier = function(src)
    local ok, id = pcall(function() return exports.vrp:getUserId(src) end)
    if ok and id then return 'vrp:' .. tostring(id) end
    return nil          -- nil is fine: it falls back to the license
end
```

The config ships a commented, ready-to-use **vRP** recipe for both the export-based
builds and legacy Proxy/Tunnel vRP. An adapter that throws is caught and logged,
then ignored — a bad adapter degrades to standalone instead of taking the
resource down.

> Why a recipe instead of built-in vRP support? vRP has no single API across its
> versions and forks, and pulling vRP's own lib into this resource would stop it
> from starting on every server that does *not* run vRP. Three lines you paste
> once beats a hard dependency everyone else pays for.

Access control is independent of all this: `everyone`, `ace` and `identifiers`
need no framework at all, and `groups` falls back to plain aces
(`name`, `group.name`, `qbcore.name`, `qbx.name`), so it works on any server.
Only `jobs` genuinely requires one.

---

## 🔐 Access control

Five independent methods in `shared/config.lua` → `Config.access`, each with its
own switch. They **add up**: a player gets in as soon as the *first enabled*
method says yes, so turning one on never removes access from someone who already
had it.

| Method | Gives access to | Default |
|---|---|---|
| `everyone` | anyone at all | **on** |
| `ace` | an ACE permission | off |
| `groups` | a framework rank (owner/god/admin…) | off |
| `jobs` | a job, from a minimum grade up | off |
| `identifiers` | a hand-picked list of people | off |

> ⚠️ `everyone` ships **on** so nothing breaks on update, but it lets *any*
> player retexture your whole server. The console warns on every start while it
> is on — switch to `ace` before going live.

```lua
everyone = { enabled = false },
ace      = { enabled = true, permissions = { 'apex.vehicles' } },
```
```cfg
add_ace group.admin apex.vehicles allow
add_principal identifier.license:YOUR_LICENSE group.admin
```

- **`ace`** also accepts the aces every framework and txAdmin already grant the
  owner (`command`, `txadmin.everything`, `group.admin`), so a fresh install
  never locks out the person who just installed it. Set
  `acceptOwnerAces = false` to require exactly your own permissions.
- **`groups`** looks each name up in the ESX group, the QBCore/QBox permission
  system **and** the plain aces (`name`, `group.name`, `qbcore.name`,
  `qbx.name`) — so it works even with no framework.
- **`identifiers`** needs neither a framework nor an ace, which makes it the way
  back in when a server's permissions are broken.

⚠️ An `add_ace` written in `server.cfg` only takes effect when the cfg is read,
i.e. at server **start** — restarting the resource is not enough. Paste the two
lines into the live console to apply them immediately. This is by far the most
common cause of "I'm admin and it says I have no access".

### Locked out? `/vehiclestudio_access`

Run it in game. The **server console** then prints each of the five methods and
whether it is on, that method's verdict for you and why, and **all of your
identifiers**, ready to paste into `identifiers.list`. Any player may run it —
it only ever reports on themselves. From the console:
`vehiclestudio_access <server id>`.

The gate is enforced **server-side on every open** — the command/keybind alone
never grants access. Configs written for the older single-`mode` format are
translated, not ignored, so they keep working exactly as before.

---

## 🤖 AI setup

Bring your own key. Nothing is sent anywhere until a key is configured, and the
studio marks an engine with no key as unavailable rather than failing when you
press Generate.

```cfg
set apex_vehicles_ai_key       "AIza..."   # engine 1 + the help assistant
set apex_vehicles_ai_key_fast  "..."       # engine 2 (optional)
```

Get a **free** Gemini key at <https://aistudio.google.com/apikey>. The second key
is optional — an engine without one falls back to the first, so a single key
keeps everything working.

### Two image engines

The AI pane lets the designer pick per generation:

| Engine | What it is good at |
|---|---|
| **Creative** | Understands what is already on the canvas, so it restyles a livery you started instead of replacing it. Backed by Gemini. |
| **Fast** | Answers in a couple of seconds. Best for generating a texture from scratch. Backed by Together AI (FLUX). |

Both are defined in `shared/config.lua` → `Config.ai.engines`. Each names a
provider adapter (`gemini`, `together`, `fal`, `openai` or `custom`) and its own
key convar, so a free tier can sit next to a paid one without sharing a bill.
Set `enabled = false` on one to show only the other.

### The help assistant

`Config.ai.support` adds a help desk inside the studio: the designer asks a
question and gets an answer **about this script**, in the language they are
reading the interface in. Five one-tap buttons cover what people actually ask
(installing an export, the difference between the export modes, granting access,
setting the AI key, changing the language).

It is a text model, so it costs very little, and it never sees anyone's design —
only the question. It is also told the facts about this resource rather than left
to guess, so it cannot invent a command or a config key that does not exist; when
something falls outside what it knows, it says so and points at this README.

Turn it off with `Config.ai.support.enabled = false` and the whole block
disappears from the interface.
---

## 🧩 Developer exports

```lua
-- CLIENT
exports.apex_vehicles:Open()              -- open the studio
exports.apex_vehicles:Close()             -- close it
exports.apex_vehicles:IsOpen()            -- boolean
exports.apex_vehicles:Notify(msg, type)   -- 'success' | 'error' | 'info'

-- SERVER
exports.apex_vehicles:OpenFor(src)        -- open it for a player (honours access)
exports.apex_vehicles:IsAllowed(src)      -- boolean access check
```

Wire these to an admin menu, a mechanic job, or an `ox_target`/NPC zone.

---

## ⚙️ Config highlights (`shared/config.lua`)

| Option | Meaning |
|---|---|
| `Config.locale` | UI language: `en` `pt` `es` `fr` `de`. |
| `Config.command` | Chat command that opens the studio (`vehiclestudio`). |
| `Config.keybind` | Optional default key (e.g. `'F7'`), rebindable in FiveM settings. |
| `Config.access` | `everyone` / `ace` / `jobs`. |
| `Config.canvas.sizes` | Canvas sizes offered (512 → 2048). |
| `Config.ai` | Provider, key, cooldown, hourly cap, quick themes. |
| `Config.export` | Live-export target resource, package folder, PNG download folder. |
| `Config.vehicleTextureSuffixes` | Extra texture-name candidates for the live on-car preview. |
| `Config.wrap` | Wrap mode: on/off, body panels + sheet layout, mesh grid, opacity, ambient tint and the draw budget. |

---

## 🛠️ Troubleshooting

- **Templates tab is empty** → you haven't imported any vehicles yet. See
  [Importing your own vehicles](#-importing-your-own-vehicles-templates).
- **"ACCESS DENIED" in console** → run `/vehiclestudio_access`; the server console
  then names the method that would let you in and prints your identifiers.
  Remember that a `server.cfg` ace only applies at server **start**.
- **Live preview doesn't show on the car** → sit in the SAME vehicle model you are
  editing; the studio tells you when they don't match.
- **Live export does nothing** → check the server console for `[apex_vehicles]`
  errors; the livery is broadcast to every client instantly and persisted in
  `apex_vehicles/data/live.json` (no extra resource or permission needed).
- **AI says no key** → set `apex_vehicles_ai_key` in `server.cfg`.

---

## 📄 License / credits

Apex Vehicle Studio — by **Apex Scriptz**. `shared/config.lua`, locales, the
bundled `tools/` and your vehicle catalog stay open so you can configure,
translate and import freely.
