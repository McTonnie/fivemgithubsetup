fx_version 'cerulean'
game 'gta5'

version '1.1.0h4'
author 'amazonium.'
description '919ADMIN PRO'

lua54 'yes'

ui_page 'web/build/index.html'

shared_script '@ox_lib/init.lua'
server_script '@oxmysql/lib/MySQL.lua'

client_scripts { 
    'client.lua',
    'modules_editable/freecam/utils.lua',
    'modules_editable/freecam/config.lua',
    'modules_editable/freecam/camera.lua',
    'modules_editable/freecam/main.lua',
    'modules/**/*_c.lua',
    'modules_editable/**/*_c.lua',
}
server_scripts {
    'server.lua',
    'config.lua',
    'modules/**/*_s.lua',
    'modules_editable/**/*_s.lua',
}

files {
    'locales/*.lua',
    'data/*.lua',
    'web/build/index.html',
    'web/build/**/*'
}

escrow_ignore {
    'config.lua',
    'client.lua',
    'server.lua',
    'modules_editable/**/*.lua',
    'locales/*.lua',
    'data/*.lua',
}

dependencies {
    'screencapture',
    'oxmysql',
    'ox_lib'
}
dependency '/assetpacks'