Bridge = {}

local LOG_PREFIX = '[^3919ADMIN^7] '
local function isStarted(name)
    return GetResourceState(name) == 'started'
end

local ESXSharedObject
local function getESX()
    if ESXSharedObject == nil and isStarted('es_extended') then
        ESXSharedObject = exports['es_extended']:getSharedObject()
    end
    return ESXSharedObject
end

local QBCoreObject
local function getQBCore()
    if QBCoreObject == nil and isStarted('qb-core') then
        QBCoreObject = exports['qb-core']:GetCoreObject()
    end
    return QBCoreObject
end

local function getQBPlayer(playerId)
    if FRAMEWORK == 'qb' then
        local QBCore = getQBCore()
        return QBCore and QBCore.Functions.GetPlayer(playerId) or nil
    elseif FRAMEWORK == 'qbx' then
        return exports.qbx_core:GetPlayer(playerId)
    end
    return nil
end

-- Inventory operation adapters
local inventoryAdd = {
    ox = function(src, item, amount, meta)
        if meta == nil then exports.ox_inventory:AddItem(src, item, amount) else exports.ox_inventory:AddItem(src, item, amount, meta) end
    end,
    qs = function(src, item, amount, meta)
        if meta == nil then exports['qs-inventory']:AddItem(src, item, amount) else exports['qs-inventory']:AddItem(src, item, amount, nil, meta) end
    end,
    origen = function(src, item, amount, meta)
        if meta == nil then exports.origen_inventory:AddItem(src, item, amount) else exports.origen_inventory:AddItem(src, item, amount, nil, nil, meta) end
    end,
    codem = function(src, item, amount, meta)
        if meta == nil then exports['codem-inventory']:AddItem(src, item, amount) else exports['codem-inventory']:AddItem(src, item, amount, nil, meta) end
    end,
    tgiann = function(src, item, amount, meta)
        if meta == nil then exports['tgiann-inventory']:AddItem(src, item, amount) else exports['tgiann-inventory']:AddItem(src, item, amount, nil, meta, false) end
    end,
}

local inventoryRemove = {
    ox = function(src, item, amount) exports.ox_inventory:RemoveItem(src, item, amount) end,
    codem = function(src, item, amount) exports['codem-inventory']:RemoveItem(src, item, amount) end,
    tgiann = function(src, item, amount) exports['tgiann-inventory']:RemoveItem(src, item, amount) end,
    qs = function(src, item, amount) exports['qs-inventory']:RemoveItem(src, item, amount) end,
    origen = function(src, item, amount) exports.origen_inventory:RemoveItem(src, item, amount) end,
}

local inventoryGet = {
    ox = function(src) return exports.ox_inventory:GetInventoryItems(src) end,
    qs = function(src) return exports['qs-inventory']:GetInventory(src) end,
    origen = function(src) return exports.origen_inventory:GetInventory(src) end,
    codem = function(src) 
        local identifier
        if FRAMEWORK == 'qb' then
            local QBCore = getQBCore()
            identifier = QBCore.Functions.GetPlayer(src).PlayerData.citizenid
        elseif FRAMEWORK == 'esx' then
            local ESX = getESX()
            identifier = ESX.GetPlayerFromId(src).identifier
        end
        return exports['codem-inventory']:GetInventory(identifier, src) 
    end,
    tgiann = function(src) return exports['tgiann-inventory']:GetInventory(src) end,
}

local inventoryClear = {
    ox = function(src) exports.ox_inventory:ClearInventory(src) end,
    qs = function(src) exports['qs-inventory']:ClearInventory(src) end,
    origen = function(src) exports.origen_inventory:ClearInventory(src) end,
    codem = function(src) exports['codem-inventory']:ClearInventory(src) end,
    tgiann = function(src) exports['tgiann-inventory']:ClearInventory(src) end,
}

local inventoryOpen = {
    ox = function(src, targetId) exports.ox_inventory:forceOpenInventory(src, 'player', targetId) end,
    qs = function(src, targetId) return false end,
    origen = function(src, targetId) exports.origen_inventory:OpenInventory(src, 'playerId', targetId) end,
    codem = function(src, targetId) return false end,
    tgiann = function(src, targetId) exports["tgiann-inventory"]:ForceOpenInventory(src, 'otherplayer', targetId) end,
}

local imageTemplateByInventory = {
    ox = 'nui://ox_inventory/web/images/%s.png',
    qs = 'nui://qs-inventory/web/dist/images/%s.png',
    origen = 'nui://origen_inventory/html/images/%s.png',
    codem = 'nui://codem-inventory/html/itemimages/%s.png',
    tgiann = 'nui://inventory_images/images/%s.png',
    ps = 'nui://ps-inventory/html/images/%s.png',
    qb = 'nui://qb-inventory/html/images/%s.png',
}

local imageTemplateByInventoryHasImageData = {
    ox = 'nui://ox_inventory/web/images/%s',
    qs = 'nui://qs-inventory/html/images/%s',
    origen = 'nui://origen_inventory/html/images/%s',
    codem = 'nui://codem-inventory/html/itemimages/%s',
    tgiann = 'nui://inventory_images/images/%s',
    ps = 'nui://ps-inventory/html/images/%s',
    qb = 'nui://qb-inventory/html/images/%s',
}

-- Strategy lists for integrations
local function firstTrue(strategies)
    for i = 1, #strategies do
        local can, run = strategies[i][1], strategies[i][2]
        if can() then return run() end
    end
    return false
end

-- Item list providers per inventory
local itemListProviders = {
    ox = function() return exports.ox_inventory:Items() end,
    qs = function() return exports['qs-inventory']:GetItemList() end,
    origen = function() return exports.origen_inventory:GetItems() end,
    codem = function() return exports['codem-inventory']:GetItemList() end,
    tgiann = function() return exports['tgiann-inventory']:GetItemList() end,
}

------------ INVENTORY BRIDGE FUNCTIONS ------------

function Bridge.GetItemImage(item)
    local template = imageTemplateByInventory[INVENTORY]
    if template then return template:format(item) end
    return 'placeholder_item.png'
end

function Bridge.GetItemImageHasImageData(item)
    local template = imageTemplateByInventoryHasImageData[INVENTORY]
    if template then return template:format(item) end
    return 'placeholder_item.png'
end

function Bridge.GetItems()
    local itemsData = {}
    local provider = itemListProviders[INVENTORY]
    if provider then
        local data = provider()
        if data then
            for k, v in pairs(data) do
                itemsData[#itemsData+1] = {
                    name = k,
                    label = v.label or k,
                    description = v.description or "",
                    weight = v.weight or 0,
                    image = Bridge.GetItemImage(k),
                }
            end
        end
        return itemsData
    end

    if FRAMEWORK == "qb" or INVENTORY == "ps" then
        local QBCore = getQBCore()
        if QBCore and QBCore.Shared and QBCore.Shared.Items then
            for k, v in pairs(QBCore.Shared.Items) do
                local image
                if v.image then
                    image = ('nui://qb-inventory/html/images/%s'):format(v.image)
                else
                    local tmpl = imageTemplateByInventory[INVENTORY] or imageTemplateByInventory.qb
                    image = tmpl:format(k)
                end
                itemsData[#itemsData+1] = {
                    name = k,
                    label = v.label or k,
                    description = v.description or "",
                    weight = v.weight or 0,
                    image = image,
                }
            end
        end
    end

    if FRAMEWORK == "esx" then
        local result = MySQL.query.await('SELECT * FROM items')
        if result then
            for i, v in ipairs(result) do
                itemsData[#itemsData+1] = {
                    name = v.name,
                    label = v.label,
                    description = '',
                    weight = v.weight,
                    image = nil,
                }
            end
        end
        return itemsData
    end
    
    if FRAMEWORK == "standalone" then
        -- Return empty array for standalone mode
        return itemsData
    end
    
    return itemsData
end

function Bridge.AddItem(source, item, amount, meta)
    local handler = inventoryAdd[INVENTORY]
    if handler then
        handler(source, item, amount, meta)
        return
    end
    if FRAMEWORK == "esx" then
        local ESX = getESX()
        if ESX then ESX.GetPlayerFromId(source).addInventoryItem(item, amount) end
        return
    elseif FRAMEWORK == "qb" then
        local QBCore = getQBCore()
        if meta == nil then QBCore.Functions.GetPlayer(source).Functions.AddItem(item, amount) else QBCore.Functions.GetPlayer(source).Functions.AddItem(item, amount, false, meta) end
        return
    elseif FRAMEWORK == "qbx" then
        exports.qbx_core:GetPlayer(source).Functions.AddItem(item, amount)
        return
    elseif FRAMEWORK == "standalone" then
        -- Standalone mode: no inventory system
        return
    end
end

function Bridge.RemoveItem(source, item, amount)
    local handler = inventoryRemove[INVENTORY]
    if handler then handler(source, item, amount) return end
    if FRAMEWORK == "esx" then
        local ESX = getESX(); if ESX then ESX.GetPlayerFromId(source).removeInventoryItem(item, amount) end; return
    elseif FRAMEWORK == "qb" then
        local QBCore = getQBCore(); QBCore.Functions.GetPlayer(source).Functions.RemoveItem(item, amount); return
    elseif FRAMEWORK == "qbx" then
        exports.qbx_core:GetPlayer(source).Functions.RemoveItem(item, amount); return
    elseif FRAMEWORK == "standalone" then
        -- Standalone mode: no inventory system
        return
    end
end

function Bridge.GetInventory(source)
    local handler = inventoryGet[INVENTORY]
    if handler then return handler(source) end
    if FRAMEWORK == "esx" then
        local ESX = getESX(); local xPlayer = ESX and ESX.GetPlayerFromId(source); return xPlayer and xPlayer.getInventory() or {}
    elseif FRAMEWORK == "qb" then
        local QBCore = getQBCore(); local Player = QBCore.Functions.GetPlayer(source); 
        return Player and Player.PlayerData.items or {}
    elseif FRAMEWORK == "qbx" then
        local Player = exports.qbx_core:GetPlayer(source); return Player and Player.PlayerData.items or {}
    elseif FRAMEWORK == "standalone" then
        return {}
    end
    return {}
end

function Bridge.ClearInventory(source)
    local handler = inventoryClear[INVENTORY]
    if handler then handler(source) return end
    if FRAMEWORK == "esx" then
        local ESX = getESX(); local xPlayer = ESX and ESX.GetPlayerFromId(source)
        if xPlayer then
            local inventory = xPlayer.getInventory()
            for i = 1, #inventory do
                if inventory[i].count > 0 then xPlayer.removeInventoryItem(inventory[i].name, inventory[i].count) end
            end
        end
        return
    elseif FRAMEWORK == "qb" then
        local QBCore = getQBCore(); local Player = QBCore.Functions.GetPlayer(source)
        if Player then
            for k, v in pairs(Player.PlayerData.items) do
                if v.amount > 0 then Player.Functions.RemoveItem(v.name, v.amount) end
            end
        end
        return
    elseif FRAMEWORK == "qbx" then
        local Player = exports.qbx_core:GetPlayer(source)
        if Player then
            for k, v in pairs(Player.PlayerData.items) do
                if v.amount > 0 then Player.Functions.RemoveItem(v.name, v.amount) end
            end
        end
        return
    elseif FRAMEWORK == "standalone" then
        -- Standalone mode: no inventory system
        return
    end
end

function Bridge.OpenInventory(source, targetId)
    local handler = inventoryOpen[INVENTORY]
    if handler then handler(source, targetId) return end
    if FRAMEWORK == "esx" then
        local ESX = getESX(); local xPlayer = ESX and ESX.GetPlayerFromId(source)
        if xPlayer then xPlayer.openInventory('player') end
    elseif FRAMEWORK == "standalone" then
        -- Standalone mode: no inventory system
        return
    end
end

------------ OTHER BRIDGE FUNCTIONS ------------

function Bridge.GetKeys(playerId, vehicle)
    local strategies = {
        { function() return isStarted('qb-vehiclekeys') and not isStarted('qbx_vehiclekeys') end, function()
            exports['qb-vehiclekeys']:GiveKeys(playerId, GetVehicleNumberPlateText(NetworkGetEntityFromNetworkId(vehicle)))
            return true
        end },
        { function() return isStarted('Renewed-VehicleKeys') end, function()
            exports['Renewed-Vehiclekeys']:addKey(playerId, GetVehicleNumberPlateText(NetworkGetEntityFromNetworkId(vehicle)))
            return true
        end },
        { function() return isStarted('qbx_vehiclekeys') end, function()
            exports.qbx_vehiclekeys:GiveKeys(playerId, NetworkGetEntityFromNetworkId(vehicle))
            return true
        end },
        { function() return isStarted('MrNewbVehicleKeys') end, function()
            exports.MrNewbVehicleKeys:GiveKeys(playerId, vehicle)
            return true
        end },
        { function() return isStarted('qs-vehiclekeys') end, function() 
            exports['qs-vehiclekeys']:GiveServerKeys(playerId, GetVehicleNumberPlateText(NetworkGetEntityFromNetworkId(vehicle)), GetEntityModel(NetworkGetEntityFromNetworkId(vehicle)), true)
            return true
        end },
        { function() return isStarted('cd_garage') end, function()
            TriggerClientEvent('cd_garage:AddKeys', playerId, GetVehicleNumberPlateText(NetworkGetEntityFromNetworkId(vehicle)))
            return true
        end },
        { function() return isStarted('vehicles_keys') end, function()
            exports["vehicles_keys"]:giveVehicleKeysToPlayerId(playerId, GetVehicleNumberPlateText(NetworkGetEntityFromNetworkId(vehicle)))
            return true
        end },
    }
    if not firstTrue(strategies) then
        print(LOG_PREFIX .. 'Autodetect for vehicle keys functionality failed')
    end
end

function Bridge.RevivePlayer(playerId)
    local strategies = {
        { function() return isStarted('tk_ambulancejob') end, function() exports.tk_ambulancejob:revive(playerId, true) return true end },
        { function() return isStarted('sky_ambulancejob') end, function() exports.sky_ambulancejob:revive(playerId) return true end },
        { function() return isStarted('wasabi_ambulance_v2') end, function() exports['wasabi_ambulance_v2']:RevivePlayer(playerId) return true end },
        { function() return isStarted('wasabi_ambulance') end, function() exports.wasabi_ambulance:RevivePlayer(playerId) return true end },
        { function() return isStarted('randol_medical') end, function() exports.randol_medical:Revive(playerId) return true end },
        { function() return isStarted('qbx_medical') end, function() TriggerClientEvent('qbx_medical:client:playerRevived', playerId) return true end },
        { function() return isStarted('qb-ambulancejob') end, function() TriggerClientEvent('hospital:client:Revive', playerId) return true end },
        { function() return isStarted('esx_ambulancejob') end, function() TriggerClientEvent('esx_ambulancejob:revive', playerId) return true end },
        { function() return isStarted('osp_ambulance') end, function() TriggerClientEvent('hospital:client:Revive', playerId) return true end },
        { function() return isStarted('ak47_qb_ambulancejob') end, function() TriggerClientEvent('ak47_qb_ambulancejob:revive', playerId) return true end },
        { function() return isStarted('ak47_ambulancejob') end, function() TriggerClientEvent('ak47_ambulancejob:revive', playerId) return true end },
        { function() return isStarted('p_ambulancejob') end, function() TriggerClientEvent('hospital:client:Revive', playerId) return true end },
    }
    if not firstTrue(strategies) then
        print(LOG_PREFIX .. 'Autodetect for revive functionality failed')
    end
end

function Bridge.CuffPlayer(playerId)
    local strategies = {
        { function() return isStarted('p_policejob') end, function() exports['p_policejob']:forceUncuff(playerId) return true end },
        { function() return isStarted('qb-policejob') end, function() TriggerClientEvent('police:client:GetCuffed', playerId) return true end },
        { function() return isStarted('qbx_policejob') end, function() TriggerClientEvent('police:client:GetCuffed', playerId) return true end },
        { function() return isStarted('tk_policejob') end, function()
            TriggerClientEvent('amzn_admin:tk_policejob:uncuff', playerId)
        return true end },
    }
    if not firstTrue(strategies) then
        print(LOG_PREFIX .. 'Autodetect for cuff functionality failed')
    end
end

function Bridge.SetWeather(weather)
    local strategies = {
        { function() return isStarted('av_weather') end, function()
            exports['av_weather']:updateZone("santos", weather, false)
            exports['av_weather']:updateZone("sandy", weather, false)
            exports['av_weather']:updateZone("paleto", weather, false)
            exports['av_weather']:updateZone("cayo", weather, false)
            return true
        end },
        { function() return isStarted('qb-weathersync') end, function() exports['qb-weathersync']:setWeather(weather) return true end },
        { function() return isStarted('Renewed-Weathersync') end, function() GlobalState.weather = { weather = weather, time = 9999999999 } return true end },
        { function() return isStarted('weathersync') end, function() exports.weathersync:setWeather(weather, 0, false, false) return true end },
        { function() return isStarted('cd_easytime') end, function() exports.cd_easytime:SetWeather(weather) return true end },
    }
    if not firstTrue(strategies) then
        print(LOG_PREFIX .. 'Autodetect for weather functionality failed')
    end
end

function Bridge.SetTime(hours, minutes)
    local h, m = tonumber(hours), tonumber(minutes)
    local strategies = {
        { function() return isStarted('av_weather') end, function() exports['av_weather']:updateTime(h, m, false, true) return true end },
        { function() return isStarted('qb-weathersync') end, function() exports['qb-weathersync']:setTime(h, m) return true end },
        { function() return isStarted('Renewed-Weathersync') end, function() GlobalState.currentTime = { hour = h, minute = m or 0 } return true end },
        { function() return isStarted('weathersync') end, function() exports.weathersync:setTime(1, h, m or 0, 0, 0, 0) return true end },
        { function() return isStarted('cd_easytime') end, function() exports.cd_easytime:SetTime(h, m) return true end },
    }
    if not firstTrue(strategies) then
        print(LOG_PREFIX .. 'Autodetect for time functionality failed')
    end
end

function Bridge.MaxFoodWater(playerId)
    if FRAMEWORK == 'qbx' then
        local Player = exports.qbx_core:GetPlayer(playerId)
        if not Player then return false, "Player not found" end
        
        Player.Functions.SetMetaData("hunger", 100)
        Player.Functions.SetMetaData("thirst", 100)
    elseif FRAMEWORK == 'qb' then
        local Player = getQBPlayer(playerId)
        if not Player then return false, "Player not found" end
        
        Player.Functions.SetMetaData("hunger", 100)
        Player.Functions.SetMetaData("thirst", 100)
        return
    elseif FRAMEWORK == 'esx' then
        TriggerClientEvent('esx_status:set', playerId, 'hunger', 1000000)
        TriggerClientEvent('esx_status:set', playerId, 'thirst', 1000000)
        return
    elseif FRAMEWORK == 'standalone' then
        -- Standalone mode: no food/water system
        return true
    end
end

Bridge.RelieveStress = function(playerId)
    if FRAMEWORK == 'qbx' then 
        local Player = exports.qbx_core:GetPlayer(playerId)
        if not Player then return false, "Player not found" end
        
        Player.Functions.SetMetaData("stress", 0)
    elseif FRAMEWORK == 'qb' then
        local Player = exports['qb-core']:GetCoreObject().Functions.GetPlayer(playerId)
        if not Player then return false, "Player not found" end
        
        Player.Functions.SetMetaData("stress", 0)
        return
    elseif FRAMEWORK == 'esx' then
        TriggerClientEvent('esx_status:set', playerId, 'stress', 0)
        return
    elseif FRAMEWORK == 'standalone' then
        -- Standalone mode: no stress system
        return true
    end
end

Bridge.SetCharacterName = function(playerId, firstName, lastName)
    if FRAMEWORK == 'qb' or FRAMEWORK == 'qbx' then
        local Player = getQBPlayer(playerId)
        if not Player then return false, "Player not found" end

        local charinfo = Player.PlayerData.charinfo or {}
        charinfo.firstname = firstName
        charinfo.lastname = lastName
        Player.PlayerData.charinfo = charinfo
        Player.Functions.SetPlayerData('charinfo', charinfo)
        Player.Functions.Save()
    elseif FRAMEWORK == 'esx' then
        local ESX = getESX()
        local xPlayer = ESX.GetPlayerFromId(playerId)
        if not xPlayer then return false, "Player not found" end
        xPlayer.setName(('%s %s'):format(firstName, lastName))
        xPlayer.save()
    elseif FRAMEWORK == 'standalone' then
        -- Standalone mode: no character system
        return true
    end
end

Bridge.AddMoney = function(playerId, type, amount)
    amount = tonumber(amount)
    if FRAMEWORK == 'qb' or FRAMEWORK == 'qbx' then
        local Player = getQBPlayer(playerId)
        if not Player then return false, "Player not found" end
        Player.Functions.AddMoney(type, amount)
    elseif FRAMEWORK == 'esx' then
        if type == 'cash' then
            type = 'money'
        end
        local ESX = getESX()
        local xPlayer = ESX.GetPlayerFromId(playerId)
        if not xPlayer then return false, "Player not found" end
        if type == 'money' then
            xPlayer.addMoney(amount)
        else
            xPlayer.addAccountMoney(type, amount)
        end
    elseif FRAMEWORK == 'standalone' then
        -- Standalone mode: no money system
        return true
    end
end

Bridge.RemoveMoney = function(playerId, type, amount)   
    amount = tonumber(amount)
    if FRAMEWORK == 'qb' or FRAMEWORK == 'qbx' then
        local Player = getQBPlayer(playerId)
        if not Player then return false, "Player not found" end
        Player.Functions.RemoveMoney(type, amount)
    elseif FRAMEWORK == 'esx' then
        if type == 'cash' then
            type = 'money'
        end
        local ESX = getESX()
        local xPlayer = ESX.GetPlayerFromId(playerId)
        if not xPlayer then return false, "Player not found" end
        if type == 'money' then
            xPlayer.removeMoney(amount)
        else
            xPlayer.removeAccountMoney(type, amount)
        end
    elseif FRAMEWORK == 'standalone' then
        -- Standalone mode: no money system
        return true
    end
end

Bridge.SetJob = function(playerId, jobName, grade)
    if FRAMEWORK == 'qb' or FRAMEWORK == 'qbx' then
        local Player = getQBPlayer(playerId)
        if not Player then return false, "Player not found" end
        Player.Functions.SetJob(jobName, grade)
        Player.Functions.Save()
    elseif FRAMEWORK == 'esx' then
        local ESX = getESX()
        local xPlayer = ESX.GetPlayerFromId(playerId)
        if not xPlayer then return false, "Player not found" end
        xPlayer.setJob(jobName, grade)
    elseif FRAMEWORK == 'standalone' then
        -- Standalone mode: no job system
        return true
    end
end

Bridge.SetGang = function(playerId, gangName, grade)
    if FRAMEWORK == 'qb' or FRAMEWORK == 'qbx' then
        local Player = getQBPlayer(playerId)
        if not Player then return false, "Player not found" end
        Player.Functions.SetGang(gangName, grade)
        Player.Functions.Save()
    elseif FRAMEWORK == 'standalone' then
        -- Standalone mode: no gang system
        return true
    end
end

Bridge.OpenClothingMenu = function(targetId)
    local strategies = {
        { function() return isStarted('rcore_clothing') end, function() TriggerClientEvent('rcore_clothing:openClothingShopWithEverythingAndFree', targetId) return true end },
        { function() return isStarted('qb-clothing') end, function() TriggerClientEvent('qb-clothing:client:openMenu', targetId) return true end },
        { function() return isStarted('illenium-appearance') end, function() TriggerClientEvent('illenium-appearance:client:openClothingShop', targetId, true) return true end },
    }
    firstTrue(strategies)
end

function Bridge.GetCharacterName(playerId)
	if FRAMEWORK == 'qbx' then
		local Player = exports.qbx_core:GetPlayer(playerId)
		if Player and Player.PlayerData and Player.PlayerData.charinfo then
			local first = Player.PlayerData.charinfo.firstname or ''
			local last = Player.PlayerData.charinfo.lastname or ''
			local full = ('%s %s'):format(first, last)
			return full:match('^%s*(.-)%s*$')
		end
	elseif FRAMEWORK == 'qb' then
		local Player = getQBPlayer(playerId)
		if Player and Player.PlayerData and Player.PlayerData.charinfo then
			local first = Player.PlayerData.charinfo.firstname or ''
			local last = Player.PlayerData.charinfo.lastname or ''
			local full = ('%s %s'):format(first, last)
			return full:match('^%s*(.-)%s*$')
		end
	elseif FRAMEWORK == 'esx' then
		local ESX = getESX()
		local xPlayer = ESX.GetPlayerFromId(playerId)
		if xPlayer and xPlayer.getName then
			return xPlayer.getName()
		end
	elseif FRAMEWORK == 'standalone' then
		-- Standalone mode: use player name
		return GetPlayerName(playerId)
	end
	return GetPlayerName(playerId)
end