--[[
    Apex Clothing Studio — Configuration
    ────────────────────────────────────────────────────────────
    Every option the studio uses lives in this file. It stays
    open-source even in escrowed builds — edit freely.

    Quick start:
      1. `ensure apex_clothing` — that's it, the studio is fully
         self-contained (live + package exports included).
      2. Grant access:  add_ace group.admin apex.clothing allow
      3. (Optional) AI, in server.cfg:
           set apex_clothing_ai_key "AIza..."        image engine 1 + the
                                                   help assistant
           set apex_clothing_ai_key_fast "..."       image engine 2
         The second is optional — an engine with no key of its own
         falls back to the first, and the studio marks an engine with
         no key at all as unavailable instead of failing on use.
]]

Config = {}

-- ─── General ────────────────────────────────────────────────

-- Default UI + notification language for the SERVER. Must match a
-- file in build/locales. All nine ship 100% translated; anything a
-- future key misses falls back to English, so the UI can never show
-- a raw key.
--   'en'    English        'it'  Italiano
--   'pt'    Português (PT) 'ja'  日本語
--   'pt-br' Português (BR) 'tr'  Türkçe
--   'es'    Español
--   'fr'    Français
--   'de'    Deutsch
-- Each PLAYER can override this for themselves with
-- "/clothingstudio_lang <code>", and go back to this default with
-- "/clothingstudio_lang auto".
-- Ships as 'en'. Set it to any of the codes above to change the
-- default for your whole server.
Config.locale = 'en'

-- Chat command that opens the studio ("/clothingstudio").
-- Change it if it collides with another resource on your server.
Config.command = 'clothingstudio'

-- Optional default keybind registered through RegisterKeyMapping
-- (players can rebind it in GTA Settings > Key Bindings > FiveM).
-- Use an input mapper key name like 'F7'. Empty string = no bind.
Config.keybind = ''


-- ─── Framework ──────────────────────────────────────────────
-- These studios ask a framework for exactly THREE things: a stable
-- identifier (to own a project and rate-limit AI), a character name
-- (shown on saved projects), and a job (only when Config.access.jobs
-- is enabled). Nothing else in the resource touches it.
--
-- That is why STANDALONE is a first-class mode, not a degraded one:
-- with no framework at all, identifiers fall back to the Rockstar
-- license, names to the Steam/FiveM name, and every access method
-- except `jobs` keeps working.
Config.framework = {
    -- 'auto' → detect es_extended / qbx_core / qb-core, else standalone.
    -- Force one with: 'esx' | 'qb' | 'qbx' | 'standalone' | 'custom'.
    mode = 'auto',

    -- ─── Any OTHER framework (vRP, ND, a fork, your own core) ───
    -- Fill these in and set mode = 'custom' (or leave 'auto' and give
    -- `detect` a function — it is checked before the built-ins).
    -- Every function is optional: return nil and the standalone
    -- fallback takes over, so a half-filled adapter still works.
    custom = {
        name = 'custom',        -- shown in the startup banner

        -- function() return true end
        detect = nil,

        -- function(src) return 'a-stable-unique-string' end
        -- Used to own saved projects and to rate-limit AI. It must be
        -- STABLE for a player across sessions.
        getIdentifier = nil,

        -- function(src) return 'Firstname Lastname' end
        getName = nil,

        -- function(src) return { name = 'police', grade = 3 } end
        -- Only needed if you enable Config.access.jobs.
        getJob = nil,
    },
}

-- ── Ready-made vRP adapter ──────────────────────────────────
-- vRP has no single API across its versions and forks, so it ships
-- commented rather than guessed at. Uncomment the block that matches
-- your build and set Config.framework.mode = 'custom'.
--
-- vRP 2 / vRPex (exports):
--
-- Config.framework.custom.detect = function()
--     return GetResourceState('vrp') == 'started'
-- end
-- Config.framework.custom.getIdentifier = function(src)
--     local ok, id = pcall(function() return exports.vrp:getUserId(src) end)
--     if ok and id then return 'vrp:' .. tostring(id) end
--     return nil                      -- nil → falls back to the license
-- end
-- Config.framework.custom.getName = function(src)
--     local ok, ident = pcall(function() return exports.vrp:getUserIdentity(exports.vrp:getUserId(src)) end)
--     if ok and type(ident) == 'table' and ident.firstname then
--         return ident.firstname .. ' ' .. (ident.name or '')
--     end
--     return nil
-- end
--
-- vRP 1 (legacy, Proxy/Tunnel): expose a tiny bridge FROM your vRP
-- server script and call it here, rather than pulling vRP's lib into
-- this resource — a missing lib file stops the resource from starting
-- on every server that does NOT run vRP:
--
--   -- in your own vRP-side resource:
--   -- exports('apexGetUserId', function(src) return vRP.getUserId({src}) end)
--
-- Config.framework.custom.detect = function()
--     return GetResourceState('your_vrp_bridge') == 'started'
-- end
-- Config.framework.custom.getIdentifier = function(src)
--     local ok, id = pcall(function() return exports['your_vrp_bridge']:apexGetUserId(src) end)
--     if ok and id then return 'vrp:' .. tostring(id) end
--     return nil
-- end

-- ─── Access control ─────────────────────────────────────────
-- Who may open the studio. Checked server-side on every open —
-- the command/keybind alone never grants access.
--
-- FIVE independent methods, each with its own switch. They ADD UP:
-- a player gets in as soon as the FIRST enabled method says yes, so
-- turning one on never takes access away from someone who had it.
-- Locked out? Type /clothingstudio_access in-game — the server console
-- prints every method's verdict for you plus your own identifiers.
--
Config.access = {
    -- 1. Anyone at all. Great for creative servers, but it also lets
    --    every player retexture the whole server — the console warns
    --    on every start while this is on.
    everyone = { enabled = true },

    -- 2. Ace permission (the recommended method for a live server).
    --    In server.cfg:
    --      add_ace group.admin apex.clothing allow
    --      add_principal identifier.license:YOUR_LICENSE group.admin
    --    ⚠ server.cfg aces only apply on server START — paste the lines
    --    into the live console to apply them without a restart.
    ace = {
        enabled = false,
        -- Any ONE of these is enough. Add your own to split access
        -- per team, e.g. { 'apex.clothing', 'apex.designers' }.
        permissions = { 'apex.clothing' },
        -- Also accept the aces every framework/txAdmin already grants
        -- the owner, so a fresh install never locks out the installer.
        -- Set false to require EXACTLY the permissions above.
        acceptOwnerAces = true,
        ownerAces = { 'command', 'txadmin.everything', 'group.admin' },
    },

    -- 3. A framework rank. Each name is looked up in the ESX group,
    --    the QBCore/QBox permission system AND the plain aces
    --    (`name`, `group.name`, `qbcore.name`, `qbx.name`) — so this
    --    works even with no framework installed.
    groups = {
        enabled = false,
        list = { 'owner', 'god', 'superadmin', 'admin' },
    },

    -- 4. A job, from a minimum grade up. [jobName] = minimumGrade.
    --    Needs ESX / QBCore / QBox, started BEFORE this resource.
    jobs = {
        enabled = false,
        list = { admin = 0 },
    },

    -- 5. A hand-picked list. Compared against EVERY identifier the
    --    player carries — no framework and no ace needed, which makes
    --    it the emergency way back in when a server's perms are broken.
    identifiers = {
        enabled = false,
        list = {
            -- 'license:c14af569131376631fcc98a32c649cf5cbf5ceeb',
            -- 'fivem:11750483',
            -- 'discord:123456789012345678',
        },
    },
}

-- ─── Canvas / editor ────────────────────────────────────────
Config.canvas = {
    -- Size (in pixels, square) new projects start at. When a template
    -- texture is loaded the canvas re-matches that texture's aspect,
    -- so this only applies to a fresh, empty canvas.
    defaultSize = 500,

    -- Sizes offered in the statusbar size selector. 2048 gives
    -- razor-sharp results but produces heavier exports.
    sizes = { 500, 512, 1024, 2048 },

    -- Hard cap on layers per project. Keeps serialized project
    -- state (and the DB row) at a sane size.
    maxLayers = 32,
}

-- ─── Stage (live ped viewport) ──────────────────────────────
Config.stage = {
    -- true  → teleport the player to `coords` while the studio is
    --         open (clean backdrop, no traffic), restore after.
    -- false → edit right where the player stands (default).
    teleport = false,

    -- Studio spot used when teleport = true (x, y, z, heading).
    -- Default: a quiet, evenly-lit corner at the LSIA docks.
    coords = vector4(-1092.63, -2864.7, 27.7, 150.0),

    -- Where the character sits horizontally in the 3D preview
    -- (0 = far left, 0.5 = centre). The left preview panel is a
    -- transparent hole showing the real ped, so we push the ped
    -- into that region. Lower it if your screen is ultrawide,
    -- raise it toward 0.5 if the ped sits too far left.
    previewScreenX = 0.27,
}

-- ─── Live preview ───────────────────────────────────────────
Config.preview = {
    -- Minimum milliseconds between canvas frames pushed to the
    -- ped. Lower = snappier preview, higher = lighter on the CEF
    -- process. 250 ms feels live without measurable cost.
    frameThrottleMs = 250,

    -- Freemode clothing texture names end in a race suffix
    -- (e.g. jbib_diff_004_a_uni / _whi / _bla). We try every
    -- suffix listed here when resolving replacement candidates —
    -- wrong guesses are harmless no-ops, so keep all three.
    raceSuffixes = { 'uni', 'whi', 'bla' },

    -- How the edited canvas reaches the ped:
    -- 'auto'  → use the live DUI texture; fall back to 'image'
    --           automatically if the DUI never answers (default).
    -- 'dui'   → force the DUI pipeline (live, zero GPU churn).
    -- 'image' → force per-frame runtime textures (compatible with
    --           odd CEF setups, but throttled — see below).
    mode = 'auto',

    -- 'auto' waits this long (ms) for the DUI page to say hello
    -- after the first frame before switching to 'image' mode.
    duiTimeoutMs = 6000,

    -- 'image' mode creates a NEW runtime texture per push (they
    -- cannot be freed), so it enforces a slower minimum interval
    -- and a per-session cap before asking for manual applies.
    imageMinIntervalMs = 1500,
    imageMaxVersions = 40,
}

-- ─── Network / payload limits ───────────────────────────────
Config.limits = {
    -- Hard ceiling for one chunked client↔server transfer
    -- (project saves, AI references, export uploads). 12 MB fits
    -- a 2048px project with several image layers comfortably.
    maxTransferBytes = 12 * 1024 * 1024,
}

-- ─── Ped models ─────────────────────────────────────────────
-- Models the studio recognises by hash. Freemode peds are what
-- GTA clothing streaming is built around; add custom ped model
-- names here if your server streams clothes for them too.
Config.pedModels = {
    'mp_m_freemode_01',
    'mp_f_freemode_01',
}

-- ─── Texture name overrides ─────────────────────────────────
-- The studio auto-resolves runtime texture dictionary/name pairs
-- for every slot. If a specific DLC drawable resists the
-- automatic naming, pin its exact names here and the studio will
-- use them (in addition to the auto candidates).
--
-- Key format:   'pedModel|kind|componentOrPropId|drawable|texture'
-- Value:        list of { txd = '...', txn = '...' } pairs.
--
-- Example:
-- Config.textureNameOverrides = {
--     ['mp_m_freemode_01|component|11|15|0'] = {
--         { txd = 'mp_m_freemode_01_jbib', txn = 'jbib_diff_015_a_uni' },
--     },
-- }
Config.textureNameOverrides = {}

-- ─── AI texture generation ──────────────────────────────────
-- Bring-your-own-key. All providers speak pure JSON with base64
-- images both ways (FiveM's HTTP layer cannot do multipart or
-- binary bodies).
--
-- IMPORTANT: FiveM aborts any HTTP request that receives ZERO
-- response bytes within 5 seconds (hardcoded in the server). The
-- default provider ('fal') uses a submit-then-poll queue, which
-- is immune to that limit — the most reliable choice for image
-- models. 'together' answers in ~1-3 s with FLUX schnell and is
-- the cheapest; 'openai' works because we request streaming.
Config.ai = {
    -- Master switch. false hides the AI tools in the UI and
    -- rejects generation requests server-side.
    enabled = true,

    -- 'gemini'   → Google Gemini (default — free tier, great quality)
    -- 'fal'      → fal.ai queue API
    -- 'together' → Together AI (fastest/cheapest, single POST)
    -- 'openai'   → OpenAI Images API
    -- 'custom'   → any JSON HTTP provider via Config.ai.custom
    provider = 'gemini',

    -- API key for the selected provider. LEAVE EMPTY and set it in
    -- server.cfg instead (the convar always wins over this value):
    --     set apex_clothing_ai_key "your-key"
    -- Get a FREE Gemini key at https://aistudio.google.com/apikey
    apiKey = '',

    -- Abort a generation if the provider has not answered within
    -- this many milliseconds (image models can be slow).
    timeoutMs = 120000,

    -- Anti-spam: seconds a player must wait between generations.
    cooldownSeconds = 20,

    -- Anti-cost-explosion: generations per player per rolling hour.
    maxPerHour = 20,

    -- ─── The two image engines the studio offers ────────────
    -- The player picks one per generation; `provider` names which
    -- adapter below actually runs. Each engine can use its OWN key,
    -- so you can put the free Gemini tier next to a paid, faster
    -- model without them sharing a bill.
    --
    -- Each engine needs ITS OWN convar set. A key for one provider is
    -- not a key for another, so an engine never borrows the other's —
    -- it simply shows as unavailable in the studio until you set it.
    --
    -- Set enabled = false on one to show only the other.
    engines = {
        {
            id = 'edit',
            labelKey = 'ai_engine_edit',
            descKey  = 'ai_engine_edit_desc',
            icon     = 'fa-wand-magic-sparkles',
            enabled  = true,
            provider = 'gemini',
            -- set apex_clothing_ai_key "AIza..."   (FREE at aistudio.google.com/apikey)
            keyConvar = 'apex_clothing_ai_key',
        },
        {
            id = 'fast',
            labelKey = 'ai_engine_fast',
            descKey  = 'ai_engine_fast_desc',
            icon     = 'fa-bolt',
            enabled  = true,
            provider = 'together',
            -- set apex_clothing_ai_key_fast "..."   (api.together.xyz)
            keyConvar = 'apex_clothing_ai_key_fast',
        },
    },

    -- Engine pre-selected when the studio opens. Must be an id above.
    defaultEngine = 'edit',

    -- ─── AI support assistant ───────────────────────────────
    -- A help desk INSIDE the studio: the player asks a question in
    -- their own language and gets an answer about THIS script, with
    -- one-tap buttons for the questions people actually ask.
    --
    -- It is a TEXT model, so it is cheap — and it never sees a
    -- player's design, only their question.
    support = {
        enabled = true,

        -- Text provider: 'gemini' or 'openai'.
        provider = 'gemini',
        -- A '-latest' alias on purpose: versioned ids get retired
        -- ("no longer available to new users") and a hard-coded one
        -- 404s silently — gemini-2.5-flash already does.
        --
        -- The assistant uses generateContent, which does NOT stream, so
        -- its total time IS its time to first byte and it must clear
        -- FiveM's 5s abort outright. Measured:
        --   gemini-flash-lite-latest   770ms   (no reasoning tokens)
        --   gemini-flash-latest       4801ms   (565 reasoning tokens)
        -- Both answer correctly; only the first has room to spare.
        geminiModel = 'gemini-flash-lite-latest',

        -- ⚠ Only reached if the model above is REJECTED (404 retired).
        -- Measured with the real ~900-token system prompt, both of these
        -- spend so long "thinking" that they produce no byte within
        -- FiveM's 5-second window, even streamed — so they are a last
        -- resort, not a preference. If you swap the primary, check the
        -- first byte, not the total time.
        geminiFallbackModels = { 'gemini-flash-latest', 'gemini-pro-latest' },
        openaiModel = 'gpt-5-mini',

        -- Falls back to the main key when this convar is empty.
        keyConvar = 'apex_clothing_ai_key',

        -- Anti-spam: seconds between questions, and a rolling cap.
        cooldownSeconds = 5,
        maxPerHour = 60,

        -- Answers are kept short on purpose — this is a side panel,
        -- not a chat window.
        maxAnswerChars = 900,
    },

    -- Google Gemini — get a FREE key at https://aistudio.google.com/apikey
    -- then add to server.cfg:  set apex_clothing_ai_key "AIza..."
    -- The same model also EDITS images, so "use canvas as reference"
    -- works natively (no separate edit model needed).
    gemini = {
        -- ⚠ CHOSEN BY MEASUREMENT. The number that matters is TIME TO
        -- FIRST BYTE, not total time: FiveM aborts a request that has
        -- received ZERO bytes for 5 seconds, and keeps going once bytes
        -- flow. That is the whole reason this provider uses SSE.
        --
        -- Measured on this API, first byte / total / payload:
        --   gemini-2.5-flash-image        487ms / 8.4s / 3.1 MB   ← 10x margin
        --   gemini-3.1-flash-lite-image  3024ms / 3.3s / 1.8 MB   ← 1.7x margin
        --   gemini-3.1-flash-image       no first byte in 5s → aborted
        --   gemini-3-pro-image           no first byte in 5s → aborted
        --
        -- A shorter TOTAL time is worthless if the first byte is late.
        model = 'gemini-2.5-flash-image',

        -- Tried in order when the model above is REJECTED (Google
        -- retires versioned ids with a 404 "no longer available to new
        -- users", which would otherwise break the studio months from
        -- now with nothing in the console to explain it).
        -- Ordered by measured first-byte safety.
        fallbackModels = {
            'gemini-3.1-flash-lite-image',
            'gemini-3.1-flash-image',
            'gemini-3-pro-image',
        },
    },

    -- fal.ai — model ids are queue endpoints (queue.fal.run/<model>).
    -- editModel handles "use canvas as reference" via FLUX Kontext.
    fal = {
        model = 'fal-ai/flux/schnell',
        editModel = 'fal-ai/flux-kontext/dev',
        pollIntervalMs = 2000,
    },

    -- Together AI — FLUX schnell for text-to-image, Kontext for
    -- reference edits. width/height/steps map straight to the API.
    together = {
        model = 'black-forest-labs/FLUX.1-schnell',
        editModel = 'black-forest-labs/FLUX.1-kontext-pro',
        width = 1024, height = 1024, steps = 4,
    },

    -- OpenAI — model for /v1/images/generations (streamed), and
    -- responsesModel for reference edits via the /v1/responses
    -- image_generation tool.
    openai = {
        model = 'gpt-image-1-mini',
        responsesModel = 'gpt-5',
        size = '1024x1024',
        quality = 'low',
    },

    -- Generic adapter used when provider = 'custom'. The prompt is
    -- injected into bodyTemplate via string.format (%s), and the
    -- base64 image is read from the JSON response by walking
    -- responsePath ('data.0.b64_json' → response.data[1].b64_json).
    custom = {
        url = '',
        method = 'POST',
        headers = {},                       -- e.g. { ['Authorization'] = 'Bearer xxx' }
        bodyTemplate = '{"prompt":"%s"}',
        responsePath = 'data.0.b64_json',
    },
}

-- ─── Templates (auto-discovered 3D garments) ────────────────
-- The studio scans this folder and builds the Templates tab
-- automatically — just drop your files in, no JSON to write.
--
-- Folder convention (like 0r-clothing_designer):
--   stream/models/<gender>/<component>/<name>.glb   ← 3D mesh (web)
--   stream/models/<gender>/<component>/<name>.png   ← optional preview/base
-- e.g. stream/models/male/jbib/jbib_015.glb
--
-- The browser cannot read the game's .ydd, so the 3D MESH must be
-- a .glb (convert once in Blender+Sollumz — see stream/models/
-- README.md). Any .ydd found is listed as "needs conversion".
Config.templates = {
    -- Root folder scanned for templates (relative to the resource).
    dir = 'stream/models',

    -- true → the server scans the folder tree on start and on
    -- /clothingtemplates refresh. false → only read a manual
    -- stream/models/models.json (see the README).
    autoScan = true,

    -- Gender for loose files dropped straight in stream/ (their name
    -- has no gender hint). Put clothes in stream/female/ or
    -- stream/male/ (or stream/models/<gender>/<component>/) to set it
    -- per file instead of relying on this default.
    defaultGender = 'male',

    -- Fallback only: if the server can't list folders (older
    -- artifact), it probes file names <component>_000..N. This is
    -- the highest drawable number probed. Raise it if you have many.
    probeMax = 48,

    -- Addon collection (dlcName) your clothes are streamed under,
    -- used to build the in-game export texture dictionary. Leave
    -- '' to replace the BASE-GAME slot (mp_x_freemode_01/<txn>).
    -- Set it (e.g. 'apex_templates') if you stream your items as
    -- an addon so Export → Live targets the right texture.
    collection = '',
}

-- ─── Export ─────────────────────────────────────────────────
-- Everything is self-contained: "live" exports broadcast runtime
-- textures to every client and persist in this resource's
-- data/live.json — no companion resource, no extra server.cfg
-- lines needed.
Config.export = {
    -- Folder (inside apex_clothing) where "package" exports are
    -- written. Each package is a complete standalone resource you
    -- can drop into any server's resources folder.
    packageDir = 'exports',

    -- ⚠ LEAVE THIS false UNLESS YOU KNOW YOUR HOST HANDLES IT.
    -- false → the export files land flat in exports/, all named
    --         "<name>__*". You make the folder and move them in;
    --         the Export panel walks you through it.
    -- true  → the server creates exports/<name>/ itself.
    -- Creating a folder and writing into it killed the FXServer
    -- process outright on Linux in two separate releases of our map
    -- builder (a native fault, not catchable by pcall). One manual
    -- step beats an export that can take the server down.
    createFolder = false,

    -- Where "Download PNG" writes. Empty = the Desktop of the machine
    -- the SERVER runs on (which is the owner's own Desktop on a local
    -- server). Falls back to <resource>/exports/downloads/ if that is
    -- not writable.
    downloadDir = '',
}

-- ─── Storage ────────────────────────────────────────────────
-- Projects, the community gallery and share codes persist to plain
-- JSON files inside the resource's data/ folder — NO database, no
-- oxmysql, no SQL import. It works out of the box on any host/OS.
-- Nothing to configure here; the folder is created automatically.

-- ─── Debug ──────────────────────────────────────────────────
-- true → verbose Utils.Log output in client/server consoles
-- (wardrobe enumeration, preview candidates, AI/export tracing).
Config.debug = false

-- ─── Ped components (drawable slots) ────────────────────────
-- Ordered list of the 12 GTA ped components the wardrobe strip
-- shows. `key` is the game's own component prefix — it is also
-- what texture names are built from (e.g. jbib_diff_004_a_uni).
-- `label` is a locale key resolved in the UI. Remove an entry to
-- hide that slot from the studio; order here = order on screen.
Config.components = {
    { id = 0,  key = 'head', label = 'comp_head' },  -- head / face
    { id = 1,  key = 'berd', label = 'comp_berd' },  -- mask / beard
    { id = 2,  key = 'hair', label = 'comp_hair' },  -- hair (retexture works here too)
    { id = 3,  key = 'uppr', label = 'comp_uppr' },  -- arms / upper skin
    { id = 4,  key = 'lowr', label = 'comp_lowr' },  -- legs / pants
    { id = 5,  key = 'hand', label = 'comp_hand' },  -- bags / parachute
    { id = 6,  key = 'feet', label = 'comp_feet' },  -- shoes
    { id = 7,  key = 'teef', label = 'comp_teef' },  -- neck / scarves & chains
    { id = 8,  key = 'accs', label = 'comp_accs' },  -- undershirt
    { id = 9,  key = 'task', label = 'comp_task' },  -- body armor / vest
    { id = 10, key = 'decl', label = 'comp_decl' },  -- decals / badges
    { id = 11, key = 'jbib', label = 'comp_jbib' },  -- torso / top (the big one)
}

-- ─── Ped props (attached objects) ───────────────────────────
-- Props use their own natives + naming scheme; same idea as
-- components above. `id` is the game prop index.
Config.props = {
    { id = 0, key = 'p_head',   label = 'comp_p_head' },   -- hat / helmet
    { id = 1, key = 'p_eyes',   label = 'comp_p_eyes' },   -- glasses
    { id = 2, key = 'p_ears',   label = 'comp_p_ears' },   -- earrings / ear gear
    { id = 6, key = 'p_lwrist', label = 'comp_p_lwrist' }, -- left wrist (watches)
    { id = 7, key = 'p_rwrist', label = 'comp_p_rwrist' }, -- right wrist (bracelets)
}

-- ─── Quick AI Fit themes ────────────────────────────────────
-- The "Quick AI Fit" button shuffles one of these themes, adds
-- the player's extra prompt (if any) and generates in one click.
-- `labelKey` resolves through the locale files; `prompt` is sent
-- to the image provider as-is (keep prompts in English — image
-- models respond best to it). Add/remove themes freely.
Config.quickThemes = {
    {
        id = 'graffiti', labelKey = 'theme_graffiti',
        prompt = 'Seamless streetwear clothing texture, flat fabric print covered in layered spray-paint graffiti tags, bold wildstyle letters, paint drips and stencil arrows, vivid urban colors, high detail, no human, no mannequin.',
    },
    {
        id = 'monogram', labelKey = 'theme_monogram',
        prompt = 'Seamless luxury fashion clothing texture, flat fabric print of a repeating designer monogram pattern, gold interlocked initials on deep espresso canvas, subtle satin sheen, high detail, no human, no mannequin.',
    },
    {
        id = 'camo', labelKey = 'theme_camo',
        prompt = 'Seamless tactical clothing texture, flat fabric print of modern multicam camouflage, olive tan and brown organic blotches, fine ripstop weave grid, matte military finish, high detail, no human, no mannequin.',
    },
    {
        id = 'synthwave', labelKey = 'theme_synthwave',
        prompt = 'Seamless retro synthwave clothing texture, flat fabric print with neon sunset gradient, chrome grid horizon, palm silhouettes and 80s scanlines, magenta and cyan glow, high detail, no human, no mannequin.',
    },
    {
        id = 'floral', labelKey = 'theme_floral',
        prompt = 'Seamless floral silk clothing texture, flat fabric print of hand-painted peonies, cherry blossoms and trailing vines on champagne satin, soft watercolor edges, elegant flowing repeat, high detail, no human, no mannequin.',
    },
    {
        id = 'denim', labelKey = 'theme_denim',
        prompt = 'Seamless denim workwear clothing texture, flat fabric print of faded indigo twill with visible weave, contrast orange stitching, worn patches and subtle whiskering, rugged utility feel, high detail, no human, no mannequin.',
    },
    {
        id = 'gothic', labelKey = 'theme_gothic',
        prompt = 'Seamless gothic lace clothing texture, flat fabric print of intricate black Victorian lace, damask roses and filigree scrollwork over deep charcoal velvet, moody baroque elegance, high detail, no human, no mannequin.',
    },
    {
        id = 'tropical', labelKey = 'theme_tropical',
        prompt = 'Seamless tropical shirt clothing texture, flat fabric print of oversized monstera leaves, hibiscus flowers and toucans on teal aloha cloth, vintage 1960s vacation palette, high detail, no human, no mannequin.',
    },
    {
        id = 'racing', labelKey = 'theme_racing',
        prompt = 'Seamless motorsport racing clothing texture, flat fabric print with sponsor-style side stripes, checkered flag accents, bold race number blocks, red white and carbon panels, high detail, no human, no mannequin.',
    },
    {
        id = 'varsity', labelKey = 'theme_varsity',
        prompt = 'Seamless varsity clothing texture, flat fabric print in collegiate letterman style, chenille patch shapes, contrast rib stripes, athletic block numbers on navy wool and cream, high detail, no human, no mannequin.',
    },
    {
        id = 'tiedye', labelKey = 'theme_tiedye',
        prompt = 'Seamless tie-dye clothing texture, flat fabric print of a swirling spiral dye pattern, saturated rainbow pigment bleeding into soft white folds, authentic hand-dyed cotton look, high detail, no human, no mannequin.',
    },
    {
        id = 'carbon', labelKey = 'theme_carbon',
        prompt = 'Seamless carbon fiber clothing texture, flat fabric print of tight twill carbon weave, subtle specular highlights, technical sport panels with hexagonal mesh accents, sleek black finish, high detail, no human, no mannequin.',
    },
    {
        id = 'pinstripe', labelKey = 'theme_pinstripe',
        prompt = 'Seamless pinstripe suit clothing texture, flat fabric print of fine chalk-white pinstripes on midnight charcoal wool, faint herringbone undertone, tailored classic menswear elegance, high detail, no human, no mannequin.',
    },
    {
        id = 'kawaii', labelKey = 'theme_kawaii',
        prompt = 'Seamless pastel kawaii clothing texture, flat fabric print scattered with smiling clouds, strawberries, sparkles and tiny rainbows on baby pink cotton, cute Japanese pop style, high detail, no human, no mannequin.',
    },
    {
        id = 'chrome', labelKey = 'theme_chrome',
        prompt = 'Seamless chrome cyber clothing texture, flat fabric print of liquid metal panels, iridescent holographic sheen, circuit-line seams and glowing cyan accents, futuristic techwear finish, high detail, no human, no mannequin.',
    },
    {
        id = 'bandtee', labelKey = 'theme_bandtee',
        prompt = 'Seamless faded band tee clothing texture, flat fabric print of a cracked vintage rock poster graphic, distressed skull and lightning artwork, washed black cotton, retro grunge wear, high detail, no human, no mannequin.',
    },
}
