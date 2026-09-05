RegisterNetEvent('amzn_admin:server:AdvancedParkingDeleteVehicle', function(vehNetId)
    local src = source
    if not CheckPermission(src, 'quickaction:DeleteClosestVehicle') then return end
    if GetResourceState('AdvancedParking') == 'started' then
        exports["AdvancedParking"]:DeleteVehicle(NetworkGetEntityFromNetworkId(vehNetId), false)
    end
end)

RegisterNetEvent('amzn_admin:server:logQuickAction', function(action, details)
    local src = source
    Logger.logQuickAction(src, action, details)
end)

RegisterNetEvent('amzn_admin:server:ReviveSelf', function()
    local src = source
    if not CheckPermission(src, 'quickaction:ReviveSelf') then return end
    Bridge.RevivePlayer(src)
    Logger.logQuickAction(src, "quickaction:ReviveSelf", "Revived self")
end)

RegisterNetEvent('amzn_admin:server:FeedSelf', function()
    local src = source
    if not CheckPermission(src, 'quickaction:FeedSelf') then return end
    Bridge.MaxFoodWater(src)
end)

RegisterNetEvent('amzn_admin:server:RelieveStressSelf', function()
    local src = source
    if not CheckPermission(src, 'quickaction:RelieveStress') then return end
    Bridge.RelieveStress(src)
    Logger.logQuickAction(src, "quickaction:RelieveStress", "Set own stress to 0")
end)

RegisterNetEvent('amzn_admin:server:GetKeys', function(vehicle)
    local src = source
    if not CheckPermission(src, 'quickaction:SpawnCar') or not CheckPermission(src, 'page:Vehicles') then return end
    local vehicleEntity = NetworkGetEntityFromNetworkId(vehicle)
    local timeout = 0
    while not DoesEntityExist(vehicleEntity) do
        Wait(50)
        vehicleEntity = NetworkGetEntityFromNetworkId(vehicle)
        timeout = timeout + 1
        if timeout > 100 then
            print('[^1ERROR^7] Failed to get keys for vehicle, vehicle entity does not exist')
            return
        end
    end
    Bridge.GetKeys(src, vehicle)
    Logger.logQuickAction(src, "quickaction:GetKeys", "Received keys for spawned vehicle")
end)

RegisterNetEvent('amzn_admin:server:ReviveAll', function()
    local src = source
    if not CheckPermission(src, 'quickaction:ReviveAll') then return end
    
    for _, playerId in ipairs(GetPlayers()) do
        Bridge.RevivePlayer(playerId)
    end
    Logger.logQuickAction(src, "quickaction:ReviveAll", "Revived all players")
end)

RegisterNetEvent('amzn_admin:server:MessageAll', function(message)
    local src = source
    if not CheckPermission(src, 'quickaction:MessageAll') then return end
    
    TriggerClientEvent('amzn_admin:client:ShowGlobalMessage', -1, {
        message = message,
        author = GetPlayerName(src) or "ADMIN",
        duration = 10000 -- ms
    })
    Logger.logQuickAction(src, "quickaction:MessageAll", "Sent message to all players: " .. message)
end)

RegisterNetEvent('amzn_admin:server:SetWeather', function(weather)
    local src = source
    if not CheckPermission(src, 'quickaction:SetWeather') then return end
    
    Bridge.SetWeather(weather)
    Logger.logQuickAction(src, "quickaction:SetWeather", "Set weather to: " .. weather)
end)

RegisterNetEvent('amzn_admin:server:SetTime', function(time)
    local src = source
    if not CheckPermission(src, 'quickaction:SetTime') then return end

    if not time then return end
    if not tostring(time):find(':') then
        local hours = tonumber(time)
        if not hours then return end
        Bridge.SetTime(hours, 0)
        Logger.logQuickAction(src, "quickaction:SetTime", string.format("Set time to %02d:00", hours))
        return
    end
    
    local hours, minutes = time:match("(%d+):(%d+)")
    if not hours then return end
    if not minutes then minutes = 0 end
    
    Bridge.SetTime(tonumber(hours), tonumber(minutes))
    Logger.logQuickAction(src, "quickaction:SetTime", string.format("Set time to %02d:%02d", tonumber(hours), tonumber(minutes)))
end)

RegisterNetEvent('amzn_admin:server:MassDeleteVehicles', function()
    local src = source
    if not CheckPermission(src, 'quickaction:MassDeleteVehicles') then return end
    
    -- Delete all vehicles for all players
    TriggerClientEvent('amzn_admin:client:deleteAllVehicles', -1)
    Logger.logQuickAction(src, "quickaction:MassDeleteVehicles", "Deleted all vehicles")
end)

RegisterNetEvent('amzn_admin:server:MassDeletePeds', function()
    local src = source
    if not CheckPermission(src, 'quickaction:MassDeletePeds') then return end
    
    -- Delete all peds for all players
    TriggerClientEvent('amzn_admin:client:deleteAllPeds', -1)
    Logger.logQuickAction(src, "quickaction:MassDeletePeds", "Deleted all peds")
end)

RegisterNetEvent('amzn_admin:server:DeleteEntity', function(netId, type)
    local src = source
    if not type or not CheckPermission(src, type) or not netId then return end

    local entity = NetworkGetEntityFromNetworkId(netId)
    if not entity or not DoesEntityExist(entity) then return end

    DeleteEntity(entity)
end)