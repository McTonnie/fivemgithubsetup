# Automatic Installation
17mov_Hud resource has an automatic installer feature. That means you can integrate HUD automatically with your framework with no really touching nothing.
To use this kind of installation you need to open `Config.lua` file and just set `Config.Autoinstall = true`. Then you just need to restart server/resource and follow messages into server console. After that you can already enjoy our HUD resource.

If Automatic Installation failed, please install hud manually: 

# Manual Installation
> qb-core
1. Copy `qb-core/17mov_functions.lua` file from `installation` folder.
2. Paste copied file to root directory of your `qb-core` resource.
3. Open `qb-core/fxmanifest.lua` and add this line at **VERY BOTTOM** of manifest file:
client_script "17mov_functions.lua"
4. Restart your server and enjoy our HUD resource :D

> es_extended
1. Copy `es_extended/17mov_functions.lua` file from `installation` folder.
2. Paste copied file to root directory of your `es_extended` resource.
3. Open `es_extended/fxmanifest.lua` and add this line at **VERY BOTTOM** of manifest file:
client_script "17mov_functions.lua"
4. Restart your server and enjoy our HUD resource :D

> ox_lib
1. Copy `ox_lib/notify.lua` and `ox_lib/progress.lua` file from `installation` folder.
2. Paste copied files to `ox_lib/resource/interface/client/` (You need to replace orginal ox_lib files).
3. Restart your server and enjoy our HUD resource :D
