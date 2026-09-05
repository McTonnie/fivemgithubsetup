fx_version 'cerulean'
games {'gta5'}

author 'GOM'
description 'GOM Styling 2012 Camaro V3'
version '3.0.0'

data_file 'VEHICLE_LAYOUTS_FILE' 'vehiclelayouts.meta'
data_file 'HANDLING_FILE' 'handling.meta'
data_file 'VEHICLE_METADATA_FILE' 'vehicles.meta'
data_file 'CARCOLS_FILE' 'carcols.meta'
data_file 'VEHICLE_VARIATION_FILE' 'carvariations.meta'
data_file "AUDIO_SYNTHDATA" "audioconfig/lgccl02gomcharger_amp.dat"
data_file "AUDIO_GAMEDATA" "audioconfig/lgccl02gomcharger_game.dat"
data_file "AUDIO_SOUNDDATA" "audioconfig/lgccl02gomcharger_sounds.dat"
data_file "AUDIO_WAVEPACK" "sfx/dlc_lgccl02gomcharger"

files {
  'vehiclelayouts.meta',
  'handling.meta',
  'vehicles.meta',
  'carcols.meta',
  'carvariations.meta',
  "audioconfig/*.dat151.rel",
  "audioconfig/*.dat54.rel",
  "audioconfig/*.dat10.rel",
  "sfx/**/*.awc"
}

client_script 'vehicle_names.lua'
lua54 'yes'