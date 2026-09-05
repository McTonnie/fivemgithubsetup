--[[
    Apex Billboards — shared/config.lua
    Everything a server owner should ever need to touch lives here.
]]

Config = {}

-- ─── General ─────────────────────────────────────────────────
Config.locale    = 'en'          -- 'en' | 'pt'
Config.debug     = false
Config.framework = 'auto'        -- 'auto' | 'esx' | 'qb' | 'qbx' | 'standalone'

-- Command / keybind that toggles the billboard studio (creator + dashboard)
Config.command = 'billboards'
Config.keybind = ''              -- e.g. 'F7' — empty string disables the key mapping

-- ─── Permissions ─────────────────────────────────────────────
-- A player may open the studio when ANY of the checks below passes.
Config.permissions = {
    -- ACE permission (add to server.cfg:  add_ace group.admin apexbillboards.use allow)
    ace = 'apexbillboards.use',

    -- Framework admin groups (ESX getGroup / QB permission level)
    groups = { 'admin', 'superadmin', 'god' },

    -- Jobs with a minimum grade, e.g. a "weazel news" advertising company:
    --   jobs = { reporter = 2, marketing = 0 },
    jobs = {},

    -- Set true to let EVERY player create billboards (per-player limits
    -- below still apply). Not recommended on public servers.
    everyone = false,

    -- Players matched by `ace`/`groups` are managers: they can edit,
    -- relocate and delete boards owned by OTHER players. Job-based access
    -- only manages its own boards unless listed here too.
    managerAce    = 'apexbillboards.manage',
    managerGroups = { 'admin', 'superadmin', 'god' },
}

-- ─── Limits ──────────────────────────────────────────────────
Config.limits = {
    maxBoards      = 96,     -- global cap
    perPlayer      = 8,      -- boards owned by a single non-manager player
    maxPolyNodes   = 16,     -- max points for the polygon shape (hexagons, stars…)
    minSize        = 0.25,   -- metres — smallest edge accepted
    maxSize        = 80.0,   -- metres — largest edge accepted
    maxNameLength  = 40,
    maxUrlLength   = 700,
    maxPlaylist    = 10,     -- URLs per playlist
    maxPerVehicle  = 2,      -- boards bound to the same plate

    -- Depth (how far the surface is pushed off — or sunk INTO — the wall).
    -- Effectively unlimited: this is just a sanity bound so a corrupt or
    -- malicious payload can't shove a board a kilometre away. Raise it as
    -- much as you like; the studio's slider covers ±2 m and the number box
    -- next to it accepts anything up to this value.
    maxDepth       = 100.0,  -- metres, in BOTH directions
}

-- ─── Rendering ───────────────────────────────────────────────
Config.render = {
    -- How many billboards can be LIVE at the same time around a player.
    -- Each active slot = one streamed scaleform + one DUI browser.
    -- 16 scaleform copies ship in stream/, so the hard ceiling is 16.
    maxSlots = 8,

    -- DUI browser resolution. Every slot shares this size; the content
    -- engine compensates for the physical aspect of each board.
    duiWidth  = 1280,
    duiHeight = 720,

    -- 'poly'       → DEFAULT. Draws the board as two textured triangles
    --                (DrawSpritePoly) on the same DUI texture, using the
    --                EXACT world positions of the corners you traced.
    --                Pixel-perfect position/size/rotation on any surface
    --                (walls, slopes, floors) — no calibration.
    -- 'scaleform'  → the classic television draw call
    --                (DrawScaleformMovie_3dNonAdditive, as in apex_obd's
    --                TV). Kept as an option; its size/angles depend on
    --                the calibration values below.
    method = 'poly',

    -- ── scaleform-mode-only calibration (ignored in 'poly' mode) ──
    -- Scaleform draw units per metre (derived from the stock TV values
    -- in apex_obd). Only touch if every board renders too big/too small.
    scalePerMeter = 0.0445,

    -- If a board on a slanted surface leans the wrong way, flip the
    -- sign (1.0 ←→ -1.0). Vertical walls are unaffected.
    pitchSign = 1.0,
    rollSign  = 1.0,

    -- Distance gating. Boards draw in world space, so they stay visible
    -- even beyond the game's geometry streaming range (the building may
    -- pop in later — the ad is already there, Times-Square style).
    defaultRenderDistance = 400.0,   -- new boards start with this
    maxRenderDistance     = 2000.0,  -- UI slider ceiling

    -- Frustum culling: skip boards that are off-screen. Safe, keep it on.
    frustumCulling  = true,

    -- Occlusion culling is OFF by default and you almost certainly want
    -- to keep it that way: the draw calls are already depth-tested by the
    -- engine, so a wall in front of a board hides it natively. The manual
    -- raycast below adds nothing but CAN make a board vanish when a prop,
    -- a tree or a car merely clips the probe line.
    -- If you enable it (to let far boards' videos idle behind buildings),
    -- it samples the centre + all four corners and only sleeps a board
    -- when EVERY sample is blocked.
    occlusionChecks = false,
    occlusionEvery  = 500,    -- ms between occlusion probes per board

    -- Beyond this fraction of a board's render distance the DUI is told
    -- to enter "eco" mode: videos pause, animations drop to low FPS.
    ecoFraction = 0.6,

    -- Destroy the DUI browser of a slot that stayed unused this long (ms).
    slotIdleDestroy = 45000,

    -- How often the slot manager re-scores candidates (ms).
    manageEvery = 400,
}

-- ─── Audio ───────────────────────────────────────────────────
-- Boards are SILENT unless their owner turns audio on in the content
-- editor. When enabled, the volume fades in and out with the listener's
-- distance to the surface (3D-ish attenuation done on the DUI side).
Config.audio = {
    enabled     = true,    -- master switch — false hides the option entirely
    maxDistance = 30.0,    -- metres — beyond this an audible board is silent
    fullDistance = 4.0,    -- metres — closer than this it plays at full volume
    rolloff     = 2.0,     -- 1 = linear fade, 2 = natural (inverse-square-ish)
    maxVolume   = 1.0,     -- hard ceiling applied on top of the board's own volume
    updateEvery = 150,     -- ms between volume updates per board
}

-- ─── Content rules ───────────────────────────────────────────
Config.content = {
    -- Allowed URL schemes. Keep https-only unless you know what you do.
    schemes = { 'https' },

    -- Host allowlist. EMPTY = every https host is accepted.
    -- If you DO restrict hosts and want YouTube links to work, remember
    -- to include 'youtube.com' and 'youtu.be'.
    -- Example: { 'i.imgur.com', 'cdn.discordapp.com', 'youtube.com', 'youtu.be' }
    allowedHosts = {},

    -- Shown on boards that have no content URL yet (and in the creator
    -- preview). Set false to render nothing instead.
    placeholder = true,

    -- ── Image upload (no external host needed) ──
    -- The studio can take an image straight off the player's disk. It is
    -- downscaled and compressed in the UI, then stored inline with the
    -- board (a data: URL) — so it syncs to every player like any other
    -- content, with no image host, no API key and no upload endpoint.
    -- Keep the cap low: this payload lives in the database AND is sent to
    -- every client. Set allowUploads = false to force URLs only.
    allowUploads = true,
    maxUploadKB  = 512,     -- hard ceiling for the stored image
    uploadMaxPx  = 1600,    -- longest side after the automatic downscale

    -- Default seconds per playlist item / carousel panel.
    playlistSeconds = 10,
    panelSeconds    = 8,
}

-- ─── Vehicle billboards ──────────────────────────────────────
-- Boards can be bound to a vehicle's NUMBER PLATE. Their faces are
-- stored in entity-local space, and a background scanner watches the
-- vehicles streamed around the player: the moment a matching plate
-- spawns (garage exit, /car, valet…) its billboard snaps back on. No
-- integration with your garage script is required.
Config.vehicles = {
    enabled    = true,
    scanEvery  = 2000,    -- ms between plate scans of streamed vehicles
    renderDist = 200.0,   -- metres — render distance used by vehicle boards
}

-- ─── Economy (optional) ──────────────────────────────────────
-- Charge players when they CREATE a board. 0 disables. Managers are
-- never charged.
Config.economy = {
    createCost = 0,
    account    = 'money',
}

-- ─── Persistence ─────────────────────────────────────────────
-- 'auto'  → oxmysql when the resource is started, JSON file otherwise
-- 'mysql' → force oxmysql (errors if missing)
-- 'json'  → force the JSON file (data/billboards.json inside the resource)
Config.storage = 'auto'

-- ─── Theme ───────────────────────────────────────────────────
Config.theme = {
    brand = '#1F5EFF',   -- accent used across the studio UI + placeholder
}
