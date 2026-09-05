--[[
    Apex Scriptz — apex_vehicles
    Apex Vehicle Studio: an in-game vehicle livery designer.
    Real-time 3D vehicle viewer, a layer-based canvas editor
    (brush, text, shapes, fills, patterns, images), instant DUI
    live preview on the actual car, AI texture generation with
    area editing, project saving/sharing, and one-click export
    to a live retexture, a portable package or a full plug-and-
    play vehicle resource.

    Compatible with ESX Legacy, QBCore, and QBox (standalone
    fallback included). No database required — projects, the
    gallery and share codes persist to plain JSON in data/.
]]

fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author      'Apex Scriptz'
description 'In-game vehicle livery designer (canvas editor, live 3D preview, AI, export)'
version     '2.0.0'

-- Locales are listed ONE BY ONE on purpose (no 'build/locales/*.lua'
-- glob): a glob loads every file twice when the explicit entries are
-- present, and escrow treats patterns literally — a globbed language
-- can end up locked and unfixable for whoever buys the script.
shared_scripts {
    'shared/config.lua',
    'shared/framework.lua',
    'shared/utils.lua',
    'shared/access.lua',
    'build/locales/en.lua',      -- base language + fallback for all others
    'build/locales/pt.lua',      -- Português (PT)
    'build/locales/pt-br.lua',   -- Português (BR)
    'build/locales/es.lua',      -- Español
    'build/locales/fr.lua',      -- Français
    'build/locales/de.lua',      -- Deutsch
    'build/locales/it.lua',      -- Italiano
    'build/locales/ja.lua',      -- 日本語
    'build/locales/tr.lua',      -- Türkçe
}

client_scripts {
    'build/client/apex_lib.lua',
    'build/client/main.lua',
    'build/client/stage.lua',
    'build/client/wardrobe.lua',
    'build/client/preview.lua',
    'build/client/livetex.lua',      -- real-time "Live on Server" retextures
    'build/client/wrap.lua',         -- projected wraps for cars with no texture
    'build/client/exports.lua',
}

server_scripts {
    'build/server/apex_lib.lua',
    'build/server/main.lua',
    'build/server/templates.lua',
    'build/server/projects.lua',     -- includes the zero-setup file store (no oxmysql)
    'build/server/ai.lua',
    'build/server/export.lua',
    'build/server/wrap.lua',         -- plate-bound wrap store (data/wraps.json)
}

ui_page 'build/html/index.html'

files {
    'build/html/index.html',
    'build/html/dui.html',
    'build/html/css/*.css',
    'build/html/js/*.js',
    -- Self-hosted three.js, Font Awesome and the web fonts. If this
    -- line is missing the NUI serves 404s for all of them and the
    -- studio opens with no icons and a dead 3D viewer.
    'build/html/vendor/**/*',
    -- Guaranteed template catalog the NUI fetches directly (works
    -- even if server-side folder scanning is unavailable).
    'templates.json',
    -- 3D viewer models (served to the NUI, NOT GTA stream assets):
    -- the catalog, the web meshes and their preview textures that
    -- tools/convert.js generates from your vehicles.
    'stream/models/models.json',
    'stream/models/**/*.glb',
    'stream/models/**/*.png',
    'stream/models/**/*.jpg',
    'stream/models/**/*.jpeg',
    'stream/models/**/*.webp',
}

-- Framework (es_extended / qb-core / qbx_core) is auto-detected at
-- runtime — no manual toggle needed. Standalone works out of the box.
dependencies {
    '/server:5104',
}


-- ─── ESCROWED BUILD ─────────────────────────────────────────
-- Everything listed here stays readable and editable after Keymaster
-- encryption: the config, the framework bridge, the access rules, all
-- nine languages, the whole NUI and the docs. Only the client/server
-- Lua that makes up the build itself is protected.
--
-- ⚠ One entry per language, never 'build/locales/*.lua': escrow matches
-- patterns literally, and a globbed locale silently ships ENCRYPTED —
-- the buyer then cannot fix a bad translation.
escrow_ignore {
    'shared/config.lua',
    'shared/framework.lua',
    'shared/utils.lua',
    'shared/access.lua',
    'build/locales/en.lua',
    'build/locales/pt.lua',
    'build/locales/pt-br.lua',
    'build/locales/es.lua',
    'build/locales/fr.lua',
    'build/locales/de.lua',
    'build/locales/it.lua',
    'build/locales/ja.lua',
    'build/locales/tr.lua',
    'build/html/**/*',
    'tools/**/*',
    'README.md',
    'LICENSE',
}

provide 'apex_vehicles'

dependency '/assetpacks'