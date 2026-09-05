local function getAdminName(source)
    if source == 0 and _G.__discordBotIssuedBy then return _G.__discordBotIssuedBy end
    return GetPlayerName(source)
end

local PlayerActions = {
    -- General actions
    ["playeraction:Revive"] = function(source, targetId)
        Bridge.RevivePlayer(targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:Revive", "Revived player")
        return true, "Player revived successfully"
    end,

    ["playeraction:MaxFoodWater"] = function(source, targetId)
        Bridge.MaxFoodWater(targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:MaxFoodWater", "Restored player's hunger and thirst to 100%")
        return true, "Player's needs restored"
    end,

    ["playeraction:RelieveStress"] = function(source, targetId)
        Bridge.RelieveStress(targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:RelieveStress", "Set player's stress to 0")
        return true, "Player's stress relieved"
    end,

    ["playeraction:RepairVehicle"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:RepairVehicle', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:RepairVehicle", "Repaired player's vehicle")
        return true, "Vehicle repaired"
    end,

    ["playeraction:AddCarToGarage"] = function(source, targetId)
        -- get current vehicle props from client
        local ok, props, vehname = lib.callback.await('amzn_admin:client:GetCurrentVehicleProps', targetId)
        if not ok or not props then
            return false, "Player is not in a vehicle"
        end

        local plate = props.plate
        if not plate or plate == '' then
            return false, "No plate found"
        end

        if FRAMEWORK == 'qb' or FRAMEWORK == 'qbx' then
            local license = GetPlayerIdentifierByType(targetId, 'license')
            local citizenid = nil
            if FRAMEWORK == 'qbx' then
                license = GetPlayerIdentifierByType(targetId, 'license2') or license
                citizenid = exports.qbx_core:GetPlayer(targetId).PlayerData.citizenid
            end
            if FRAMEWORK == 'qb' then
                local QBCore = exports['qb-core']:GetCoreObject()
                citizenid = QBCore.Functions.GetPlayer(targetId).PlayerData.citizenid
            end
            if not license or not citizenid then return false, "Player identifiers unavailable" end

            local exists = MySQL.scalar.await('SELECT plate FROM `player_vehicles` WHERE plate = ?', { plate })
            if not exists then
                local vehname = tostring(vehname)
                local insertId = MySQL.insert.await('INSERT INTO `player_vehicles` (license, citizenid, vehicle, hash, mods, plate, state) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    { license, citizenid, vehname, props.model, json.encode(props), plate, 0 })
                if insertId then
                    Logger.logPlayerAction(source, targetId, "playeraction:AddCarToGarage", ("Added %s (%s) to player's garage"):format(vehname, plate))
                    return true, "Vehicle added to garage"
                end
            else
                return false, "Player already owns this plate"
            end
        elseif FRAMEWORK == 'esx' then
            local ESX = exports['es_extended']:getSharedObject()
            local xPlayer = ESX.GetPlayerFromId(targetId)
            if not xPlayer then return false, "Player not found" end
            local identifier = xPlayer.getIdentifier()
            local exists = MySQL.scalar.await('SELECT plate FROM `owned_vehicles` WHERE plate = ?', { plate })
            if not exists then
                local vehicleProps = json.encode(props)
                local insertId = MySQL.insert.await('INSERT INTO `owned_vehicles` (owner, plate, vehicle) VALUES (?, ?, ?)', {
                    identifier,
                    plate,
                    vehicleProps
                })
                if insertId then
                    Logger.logPlayerAction(source, targetId, "playeraction:AddCarToGarage", ("Added vehicle (%s) to player's garage"):format(plate))
                    return true, "Vehicle added to garage"
                end
            else
                return false, "Player already owns this plate"
            end
        end

        return false, "Unsupported framework"
    end,

    ["playeraction:SetPedModel"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No model specified" end
        TriggerClientEvent('amzn_admin:client:SetModel', targetId, inputs[1])
        Logger.logPlayerAction(source, targetId, "playeraction:SetPedModel", "Set player model to: " .. inputs[1])
        return true, "Player model updated"
    end,

    ["playeraction:SetRoutingBucket"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No bucket specified" end
        local bucket = tonumber(inputs[1])
        if bucket == nil then return false, "Invalid bucket" end
        SetPlayerRoutingBucket(targetId, bucket)
        Logger.logPlayerAction(source, targetId, "playeraction:SetRoutingBucket", "Set routing bucket to: " .. bucket)
        return true, "Routing bucket updated"
    end,

    ["playeraction:SetCharacterName"] = function(source, targetId, inputs)
        if not inputs or #inputs < 2 then return false, "Missing first or last name" end
        local firstName, lastName = inputs[1], inputs[2]

        Bridge.SetCharacterName(targetId, firstName, lastName)

        Logger.logPlayerAction(source, targetId, "playeraction:SetCharacterName", string.format("Changed name to %s %s", firstName, lastName))
        return true, "Character name updated"
    end,

    ["playeraction:ClothingMenu"] = function(source, targetId)
        Bridge.OpenClothingMenu(targetId)
        if tonumber(source) == tonumber(targetId) then
            TriggerClientEvent('amzn_admin:client:closeAdminMenu', source)
        end
        Logger.logPlayerAction(source, targetId, "playeraction:ClothingMenu", "Opened clothing menu for player")
        return true, "Clothing menu opened for player"
    end,

    ["playeraction:CopyPedToMe"] = function(source, targetId)
        local success, message = lib.callback.await('amzn_admin:client:CopyPedToMe', source, targetId)
        if success then
            Logger.logPlayerAction(source, targetId, "playeraction:CopyPedToMe", "Copied target ped appearance to admin")
            return true, message or "Copied player's appearance to you"
        else
            return false, message or "Failed to copy player's appearance"
        end
    end,

    -- Teleport actions
    ["playeraction:Goto"] = function(source, targetId)
        local targetPed = GetPlayerPed(targetId)
        local targetCoords = GetEntityCoords(targetPed)
        local sourcePed = GetPlayerPed(source)
        local sourceCoords = GetEntityCoords(sourcePed)
        TriggerClientEvent('amzn_admin:client:SetLastLocation', source, sourceCoords)
        SetEntityCoords(sourcePed, targetCoords.x, targetCoords.y, targetCoords.z)
        Logger.logPlayerAction(source, targetId, "playeraction:Goto", "Teleported to player")
        return true, "Teleported to player"
    end,

    ["playeraction:Bring"] = function(source, targetId)
        local sourcePed = GetPlayerPed(source)
        local sourceCoords = GetEntityCoords(sourcePed)
        local targetPed = GetPlayerPed(targetId)
        local targetCoords = GetEntityCoords(targetPed)
        TriggerClientEvent('amzn_admin:client:SetLastLocation', targetId, targetCoords)
        SetEntityCoords(targetPed, sourceCoords.x, sourceCoords.y, sourceCoords.z)
        Logger.logPlayerAction(source, targetId, "playeraction:Bring", "Brought player to admin")
        return true, "Player brought to you"
    end,
    
    ["playeraction:SendBack"] = function(source, targetId)
        local success, message = lib.callback.await('amzn_admin:client:GoBack', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:SendBack", message or "")
        return success, message or ""
    end,

    ["playeraction:SendToLocation"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No location specified" end
        
        local selectedLabel = inputs[1]
        local location = nil
        
        for _, loc in ipairs(Config.SendToLocations) do
            if loc.label == selectedLabel then
                location = loc.coords
                break
            end
        end
        
        if not location then return false, "Invalid location" end

        local targetPed = GetPlayerPed(targetId)
        local targetCoords = GetEntityCoords(targetPed)
        TriggerClientEvent('amzn_admin:client:SetLastLocation', targetId, targetCoords)
        SetEntityCoords(GetPlayerPed(targetId), location.x, location.y, location.z)
        
        Logger.logPlayerAction(source, targetId, "playeraction:SendToLocation", "Sent player to location: " .. selectedLabel)
        return true, "Player sent to location"
    end,

    -- Monetary actions
    ["playeraction:GiveCash"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No amount specified" end
        local amount = tonumber(inputs[1])
        if not amount then return false, "Invalid amount" end
        
        Bridge.AddMoney(targetId, "cash", amount)
        
        Logger.logPlayerAction(source, targetId, "playeraction:GiveCash", "Gave $" .. amount .. " cash to player")
        return true, "Cash given to player"
    end,

    ["playeraction:RemoveCash"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No amount specified" end
        local amount = tonumber(inputs[1])
        if not amount then return false, "Invalid amount" end
        
        Bridge.RemoveMoney(targetId, "cash", amount)
        
        Logger.logPlayerAction(source, targetId, "playeraction:RemoveCash", "Removed $" .. amount .. " cash from player")
        return true, "Cash removed from player"
    end,

    ["playeraction:GiveBankMoney"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No amount specified" end
        local amount = tonumber(inputs[1])
        if not amount then return false, "Invalid amount" end

        Bridge.AddMoney(targetId, "bank", amount)

        Logger.logPlayerAction(source, targetId, "playeraction:GiveBankMoney", "Gave $" .. amount .. " to player's bank account")
        return true, "Bank money given to player"
    end,

    ["playeraction:RemoveBankMoney"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No amount specified" end
        local amount = tonumber(inputs[1])
        if not amount then return false, "Invalid amount" end
        
        Bridge.RemoveMoney(targetId, "bank", amount)

        Logger.logPlayerAction(source, targetId, "playeraction:RemoveBankMoney", "Removed $" .. amount .. " from player's bank account")
        return true, "Bank money removed from player"
    end,

    -- Job & Gang actions
    ["playeraction:SetJob"] = function(source, targetId, inputs)
        if not inputs or #inputs < 2 then return false, "Missing job name or grade" end
        local jobName, grade = inputs[1], tonumber(inputs[2])
        if not grade then return false, "Invalid grade" end
        
        Bridge.SetJob(targetId, jobName, grade)

        Logger.logPlayerAction(source, targetId, "playeraction:SetJob", string.format("Set job to %s (grade %d)", jobName, grade))
        return true, "Job set successfully"
    end,

    ["playeraction:RemoveFromJob"] = function(source, targetId)
        Bridge.SetJob(targetId, "unemployed", 0)

        Logger.logPlayerAction(source, targetId, "playeraction:RemoveFromJob", "Removed player from their job")
        return true, "Removed from job"
    end,

    ["playeraction:SetGang"] = function(source, targetId, inputs)
        if not inputs or #inputs < 2 then return false, "Missing gang name or grade" end
        local gangName, grade = inputs[1], tonumber(inputs[2])
        if not grade then return false, "Invalid grade" end
        
        Bridge.SetGang(targetId, gangName, grade)        

        Logger.logPlayerAction(source, targetId, "playeraction:SetGang", string.format("Set gang to %s (grade %d)", gangName, grade))
        return true, "Gang set successfully"
    end,

    ["playeraction:RemoveFromGang"] = function(source, targetId)
        Bridge.SetGang(targetId, "none", 0)

        Logger.logPlayerAction(source, targetId, "playeraction:RemoveFromGang", "Removed player from their gang")
        return true, "Removed from gang"
    end,

    ["playeraction:GiveItem"] = function(source, targetId, inputs)
        if not inputs or #inputs < 2 then return false, "Missing item name or amount" end
        local itemName, amount = inputs[1], tonumber(inputs[2])
        if not amount then return false, "Invalid amount" end
        
        Bridge.AddItem(targetId, itemName, amount)

        Logger.logPlayerAction(source, targetId, "playeraction:GiveItem", string.format("Gave %dx %s to player", amount, itemName))
        return true, "Item given to player"
    end,

    ["playeraction:RemoveItem"] = function(source, targetId, inputs)
        if not inputs or #inputs < 2 then return false, "Missing item name or amount" end
        local itemName, amount = inputs[1], tonumber(inputs[2])
        if not amount then return false, "Invalid amount" end

        Bridge.RemoveItem(targetId, itemName, amount)

        Logger.logPlayerAction(source, targetId, "playeraction:RemoveItem", string.format("Removed %dx %s from player", amount, itemName))
        return true, "Item removed from player"
    end,

    ["playeraction:ClearInventory"] = function(source, targetId)
        Bridge.ClearInventory(targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:ClearInventory", "Cleared player's inventory")
        return true, "Inventory cleared"
    end,

    ["playeraction:OpenInventory"] = function(source, targetId)
        Bridge.OpenInventory(source, targetId)

        if source == targetId then
            if GetResourceState('ox_inventory') == 'started' then
                TriggerClientEvent('amzn_admin:client:notify', source, 'ox_inventory does not allow you to open your own inventory', 'error')
                return false, "ox_inventory does not allow you to open your own inventory"
            end
        end

        TriggerClientEvent('amzn_admin:client:closeAdminMenu', source)
        Logger.logPlayerAction(source, targetId, "playeraction:OpenInventory", "Opened player's inventory")
        return true, "Inventory opened"
    end,

    ["playeraction:Spectate"] = function(source, targetId)
        local targetName = GetPlayerName(targetId)
        local targetCoords = GetEntityCoords(GetPlayerPed(targetId))

        local viewerBucket, targetBucket = GetPlayerRoutingBucket(source), GetPlayerRoutingBucket(targetId)
        if viewerBucket ~= targetBucket then
            SetPlayerRoutingBucket(source, targetBucket)
            -- Small wait to allow bucket change to synchronize
            Wait(100)
        end

        TriggerClientEvent('amzn_admin:client:closeAdminMenu', source)
        TriggerClientEvent('amzn_admin:client:startSpectate', source, targetId, targetCoords, targetName)
        TriggerEvent('amzn_admin:updateSpectatorTracker', source, targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:Spectate", "Spectated player")
        return true, "Spectated player"
    end,

    -- Punishment actions
    ["playeraction:Cuff"] = function(source, targetId)
        Bridge.CuffPlayer(targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:Cuff", "Cuffed player")
        return true, "Player cuffed"
    end,

    ["playeraction:Freeze"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:Freeze', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:Freeze", "Froze player")
        return true, "Toggled freeze on player"
    end,

    ["playeraction:Kill"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:Kill', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:Kill", "Killed player")
        return true, "Player killed"
    end,

    ["playeraction:Kick"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No reason specified" end
        local reason = inputs[1]
        local targetName = GetPlayerName(targetId)
        local targetLicense = GetPlayerIdentifierByType(targetId, 'license')
        if FRAMEWORK == 'qbx' then
            targetLicense = GetPlayerIdentifierByType(targetId, 'license2') or GetPlayerIdentifierByType(targetId, 'license')
        end
        local issuedBy = getAdminName(source)
        local issuedAt = os.date('%Y-%m-%d %H:%M:%S', os.time())
        local status = 'active'
        local ptype = 'kick'
        local expire = nil
        MySQL.insert('INSERT INTO admin_punishment_list (license, player_name, reason, issued_by, issued_at, status, type, expire) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', {
            targetLicense,
            targetName,
            reason,
            issuedBy,
            issuedAt,
            status,
            ptype,
            expire
        })
        Logger.logPlayerAction(source, targetId, "playeraction:Kick", "Kicked player - Reason: " .. reason)
        DropPlayer(targetId, "Kicked: " .. reason)
        return true, "Player kicked"
    end,

    ["playeraction:Ban"] = function(source, targetId, inputs)
        if not inputs or #inputs < 2 then
            return false, "Missing duration or reason"
        end

        local duration = tonumber(inputs[1])
        local reason = inputs[2]
        if not duration then
            return false, "Invalid duration"
        end

        local durationMinutes = duration <= 0 and 0 or (duration * 60)
        local identifiers = table.concat(collectIdentifiers(targetId), '|')
        local issuedBy = getAdminName(source)
        local targetName = GetPlayerName(targetId)

        local success, message = createBanRecord(identifiers, targetName, reason, durationMinutes, issuedBy)
        if success then
            Logger.logPlayerAction(source, targetId, "playeraction:Ban", string.format("Banned player for %s hours - Reason: %s", duration, reason))
            if GetPlayerName(targetId) then
                DropPlayer(targetId, ("You have been banned from this server.\n\nReason: %s\n\nThis ban was issued by: %s"):format(reason, issuedBy))
            end
        end

        return success, message
    end,

    ["playeraction:Screenshot"] = function(source, targetId)
        local src = source
        local ids = ExtractIdentifiers(targetId)
    
        if GetResourceState('screencapture') ~= 'started' then
            return false, "screencapture resource is not started"
        end
    
        local p = promise.new()
    
        exports.screencapture:serverCapture(targetId, {
            encoding = "webp",
            quality = 0.1,
        }, function(data)
            if not data then
                p:reject("Failed to capture screenshot")
                return
            end
            local imageSRC = data
            p:resolve(imageSRC)
        end, "base64")
    
        Logger.logPlayerAction(source, targetId, "playeraction:Screenshot", "Took a screenshot of player's game")
    
        local ok, result = pcall(function()
            return Citizen.Await(p)
        end)
    
        if ok then
            Logger.sendScreenshotToWebhook(source, targetId, result)
            return true, "Screenshot grabbed", result
        else
            return false, "Failed to capture screenshot", result
        end
    end,

    ["playeraction:LiveStream"] = function(source, targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:LiveStream", "Started live WebRTC stream of player's game")
        return true, "Live stream initiated"
    end,    

    -- Fun Actions
    ["playeraction:SetDrunk"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:SetDrunk', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:SetDrunk", "Made player drunk")
        return true, "Player is now drunk"
    end,

    ["playeraction:Ragdoll"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:ToggleRagdoll', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:Ragdoll", "Toggled player ragdoll")
        return true, "Toggled player ragdoll"
    end,

    ["playeraction:SetFire"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:SetOnFire', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:SetFire", "Set player on fire")
        return true, "Set player on fire"
    end,

    ["playeraction:LaunchPlayer"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:LaunchPlayer', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:LaunchPlayer", "Launched player into air")
        return true, "Player launched"
    end,

    ["playeraction:ClownAttack"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:ClownAttack', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:ClownAttack", "Spawned killer clowns")
        return true, "Spawned killer clowns"
    end,

    ["playeraction:WildAttack"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:WildAttack', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:WildAttack", "Spawned wild animal attack")
        return true, "Spawned wild animals"
    end,

    ["playeraction:MakeCompanion"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then return false, "No pet type specified" end
        TriggerClientEvent('amzn_admin:client:SpawnCompanion', targetId, inputs[1])
        Logger.logPlayerAction(source, targetId, "playeraction:MakeCompanion", "Gave player a pet companion")
        return true, "Gave player a companion"
    end,

    ["playeraction:UFOAttack"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:UFOAttack', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:UFOAttack", "Spawned UFO attack")
        return true, "UFO attack initiated"
    end,

    ["playeraction:CloneAttack"] = function(source, targetId)
        TriggerClientEvent('amzn_admin:client:CloneAttack', targetId)
        Logger.logPlayerAction(source, targetId, "playeraction:CloneAttack", "Spawned hostile clone")
        return true, "Spawned hostile clone"
    end,

    ["playeraction:Warn"] = function(source, targetId, inputs)
        if not inputs or not inputs[1] then
            return false, "Missing reason"
        end
        local reason = inputs[1]
        local targetName = GetPlayerName(targetId)
        local targetLicense = GetPlayerIdentifierByType(targetId, 'license')
        if FRAMEWORK == 'qbx' then
            targetLicense = GetPlayerIdentifierByType(targetId, 'license2') or GetPlayerIdentifierByType(targetId, 'license')
        end
        local issuedBy = getAdminName(source)
        local issuedAt = os.date('%Y-%m-%d %H:%M:%S', os.time())
        local status = 'active'
        local ptype = 'warn'
        local expire = nil
        MySQL.insert('INSERT INTO admin_punishment_list (license, player_name, reason, issued_by, issued_at, status, type, expire) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', {
            targetLicense,
            targetName,
            reason,
            issuedBy,
            issuedAt,
            status,
            ptype,
            expire
        })        
        TriggerClientEvent('amzn_admin:client:ShowWarning', targetId, reason)
        Logger.logPlayerAction(source, targetId, "playeraction:Warn", string.format("Warned player - Reason: %s", reason))
        return true, "Player warned successfully"
    end
}

lib.callback.register('amzn_admin:executePlayerAction', function(source, data)
    local actionFunc = PlayerActions[data.actionKey]
    if not actionFunc then
        return false, "Invalid action"
    end

    if not CheckPermission(source, data.actionKey) then
        return false, "No permission"
    end

    local success, message, extraData = actionFunc(source, data.playerId, data.inputs)
    
    if success then
        TriggerClientEvent('amzn_admin:actionFeedback', source, message, "info")
    end
    
    return success, message, extraData
end)

---@param actionKey string
---@param targetId number
---@param inputs? table
---@param issuedBy? string
---@return boolean success
---@return string message
---@return any? extraData
exports('ExecutePlayerAction', function(actionKey, targetId, inputs, issuedBy)
    local actionFunc = PlayerActions[actionKey]
    if not actionFunc then return false, "Invalid action" end
    local prevSourceName = _G.__discordBotIssuedBy
    _G.__discordBotIssuedBy = issuedBy
    local success, message, extraData = actionFunc(0, targetId, inputs)
    _G.__discordBotIssuedBy = prevSourceName
    return success, message, extraData
end)

function ExtractIdentifiers(src)
    local identifiers = {
        steam = '',
        ip = '',
        discord = '',
        license = '',
        xbl = '',
        live = ''
    }

    for i = 0, GetNumPlayerIdentifiers(src) - 1 do
        local id = GetPlayerIdentifier(src, i)
        
        if string.find(id, "steam") then
            identifiers.steam = id
        elseif string.find(id, "ip") then
            identifiers.ip = id
        elseif string.find(id, "discord") then
            identifiers.discord = id
        elseif string.find(id, "license") then
            identifiers.license = id
        elseif string.find(id, "xbl") then
            identifiers.xbl = id
        elseif string.find(id, "live") then
            identifiers.live = id
        end
    end

    return identifiers
end