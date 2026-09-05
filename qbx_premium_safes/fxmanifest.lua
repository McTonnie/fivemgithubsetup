fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'qbx_premium_safes'
author 'McTonnie'
description 'Advanced Safe Management System: Optimized for ox_inventory & qbx_core. Supports dynamic item metadata, custom audio-visual alarms with configurable blip tracking, and persistent upgrade state across placements.'
version '1.0.0'

ui_page 'web/index.html'

files {
    'web/index.html',
    'web/style.css',
    'web/theme.css',
    'web/app.js',
    'web/sounds/*.ogg'
}

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
    'shared/*.lua'
}

client_scripts {
    'client/*.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/*.lua'
}

dependencies {
    'ox_lib',
    'ox_inventory',
    'ox_target',
    'qbx_core',
    'oxmysql'
}
escrow_ignore {
    'config.lua',
    'shared/locale.lua',
    'item_Icons/*',
    'web/sounds/*',
    'README.html'
}