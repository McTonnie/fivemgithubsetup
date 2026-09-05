fx_version 'cerulean'
game 'gta5'

version '2.0.0'
author 'amazonium.'
description '919 GARAGE MANAGER'

lua54 'yes'

ui_page 'web/build/index.html'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
    'locales/en.lua',
    'locales/es.lua',
    'locales/fr.lua',
    'locales/de.lua',
    'locales/it.lua',
    'locales/pt-br.lua',
    'locales/ru.lua',
    'locales/zh-cn.lua',
    'locales/ja.lua',
    'locales/init.lua'
}

client_scripts { 
    'client/main.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/storage/jg-advancedgarages.lua',
    'server/storage/qb-qbx-garages.lua',
    'server/storage/esx-garages.lua',
    'server/main.lua',
}

files {
    'web/build/index.html',
    'web/build/**/*'
}

escrow_ignore {
    'config.lua',
    'locales/**/*',
    'server/storage/*',
}
dependency '/assetpacks'