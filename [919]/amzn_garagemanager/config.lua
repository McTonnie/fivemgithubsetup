Config = {}

Config.Framework = 'autodetect' -- Framework to use, 'qb-core', 'qbx_core', 'esx' or 'autodetect'
Config.GarageSystem = 'autodetect' -- 'autodetect', 'qb-qbx' (qb-garages/qbx_garages), 'jg-advancedgarages', 'esx'

Config.Command = "gm" -- Command to open the garage manager

Config.AllowedGroups = { -- Groups that are allowed to access the garage manager (QB perms, ACE, or ESX group)
    "god",
    "admin",
    "superadmin"
}

Config.GarageCodes = { "pillboxgarage" } -- List of garage codes admins can choose

Config.Locale = 'en' -- Default locale key (available: 'en','es','fr','de','it','pt-br','ru','zh-cn','ja')