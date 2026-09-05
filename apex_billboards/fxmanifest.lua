--[[
    Apex Scripts — apex_billboards
    Advanced live billboards, video screens & digital advertising for FiveM.

    Features at a glance:
      • Live in-game creator: free-fly camera, click a surface or trace it,
        and the ghost you see IS the final renderer — what you confirm is
        exactly what spawns
      • Shapes: one-click Image (keeps the picture's proportions), rectangle,
        circle, polygon (3–16 nodes) and wrapped 90° building corners
      • Renders with the proven "television" pipeline (DUI runtime texture),
        anchored to the exact world corners you traced — nothing to calibrate
      • Content: upload a picture straight from your PC (no image host
        needed), or any https image / GIF / MP4 / WebM / YouTube link
        (chrome-free embed, looping forever)
      • Playlists with a leak-free crossfade, opaque board background
      • Animations: Ken Burns, zoom, pan, fade, pulse, sway, carousel
        (dwell+slide or smooth scroll)
      • Per-board audio that fades in and out with the listener's distance
      • Live depth: drag and watch the surface slide off (or into) the wall
      • VEHICLE billboards bound to a vehicle — the board re-appears
        automatically whenever that car spawns / leaves a garage
      • Management dashboard: search, live thumbnails, rename, edit,
        relocate, duplicate, enable/disable, fly-to, delete
      • Pooled render slots (no per-board DUI leaks), distance gating and
        frustum culling; far boards drop to low-power mode
      • Multi-framework: standalone, ESX Legacy, QBCore, QBox (auto-detected)
      • Persistence: oxmysql when available, JSON file fallback otherwise
      • Fully translatable: EN / PT included (notifications, HUD and the
        entire studio interface)
]]

fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author      'Apex Scripts'
description 'Apex Billboards: live billboards, video screens & digital ads on any surface or vehicle'
version     '1.1.0'

shared_scripts {
    'shared/config.lua',
    'locales/en.lua',
    'locales/pt.lua',
    'shared/utils.lua',
    'shared/framework.lua',
}

client_scripts {
    'client/main.lua',
    'client/freecam.lua',
    'client/geometry.lua',
    'client/boards.lua',
    'client/vehicles.lua',
    'client/render.lua',
    'client/creator.lua',
    'client/nui.lua',
    'client/exports.lua',
}

server_scripts {
    'server/database.lua',
    'server/main.lua',
    'server/exports.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/board.html',
    'html/css/*.css',
    'html/js/*.js',
}

-- Streamed scaleform movies used by the render pool. These are the
-- standard "television" scaleform (identical bytes, one copy per render
-- slot — the FILE name is what the engine registers, so bundling our own
-- copies keeps apex_billboards fully self-contained and conflict-free).
dependencies {
    '/server:5104',
    '/assetpacks',
}

-- ─── ESCROW IGNORE ────────────────────────────────────────
-- ESCROW build: the config, the locales, the SQL bootstrap, the readme,
-- the streamed scaleforms and the whole NUI (HTML/CSS/JS) stay fully
-- readable and editable after Keymaster protection. Only the game logic
-- ESCROW IGNORE
-- ESCROW build: the config, the locales, the SQL bootstrap, the readme,
-- the streamed scaleforms and the whole NUI (HTML/CSS/JS) stay fully
-- readable and editable after Keymaster protection. Only the game logic
-- is protected.
escrow_ignore {
    'shared/config.lua',
    'locales/*.lua',
    'html/index.html',
    'html/board.html',
    'html/css/*.css',
    'html/js/*.js',
    'stream/*.gfx',
    'data/*',
    'sql/*.sql',
    'README.md',
}

provide 'apex_billboards'

dependency '/assetpacks'