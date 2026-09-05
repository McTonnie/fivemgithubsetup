local superJumpEnabled = false
local godModeEnabled = false
_G.AdminInvisibilityEnabled = false

local QuickActions = {
        -- Self Actions
    ["quickaction:ReviveSelf"] = function()
        Bridge.ReviveSelf()
        return true, "You have been revived."
    end,
    ["quickaction:FeedSelf"] = function()
        Bridge.FeedSelf()
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:FeedSelf", "Restored own hunger and thirst")
        return true, "Hunger and thirst restored."
    end,
    ["quickaction:RelieveStress"] = function()
        TriggerServerEvent('amzn_admin:server:RelieveStressSelf')
        return true, "Stress relieved."
    end,
    ["quickaction:GoBack"] = function()
        if LastLocation then
            SetEntityCoords(PlayerPedId(), LastLocation.x, LastLocation.y, LastLocation.z)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:GoBack", "Returned to previous location")
            return true, "Returned to previous location."
        end
        return false, "No previous location found."
    end,
    ["quickaction:TeleportToMarker"] = function()
        local blipMarker = GetFirstBlipInfoId(8)
        if not DoesBlipExist(blipMarker) then
            return false, "No waypoint set."
        end

        local ped = PlayerPedId()
        local coords = GetBlipInfoIdCoord(blipMarker)
        local vehicle = GetVehiclePedIsIn(ped, false)
        local oldCoords = GetEntityCoords(ped)
        
        LastLocation = oldCoords

        local x, y = coords.x, coords.y
        local groundZ = 800.0
        local Z_START = 900.0
        local found = false

        if vehicle > 0 then
            FreezeEntityPosition(vehicle, true)
        else
            FreezeEntityPosition(ped, true)
        end

        for i = Z_START, 0, -25.0 do
            local z = i
            if (i % 2) ~= 0 then
                z = Z_START - i
            end

            NewLoadSceneStart(x, y, z, x, y, z, 50.0, 0)
            local curTime = GetGameTimer()
            while IsNetworkLoadingScene() do
                if GetGameTimer() - curTime > 1000 then
                    break
                end
                Wait(0)
            end
            NewLoadSceneStop()
            SetPedCoordsKeepVehicle(ped, x, y, z)

            while not HasCollisionLoadedAroundEntity(ped) do
                RequestCollisionAtCoord(x, y, z)
                if GetGameTimer() - curTime > 1000 then
                    break
                end
                Wait(0)
            end

            found, groundZ = GetGroundZFor_3dCoord(x, y, z, false)
            if found then
                Wait(0)
                SetPedCoordsKeepVehicle(ped, x, y, groundZ)
                break
            end
            Wait(0)
        end

        if vehicle > 0 then
            FreezeEntityPosition(vehicle, false)
        else
            FreezeEntityPosition(ped, false)
        end

        if not found then
            SetPedCoordsKeepVehicle(ped, oldCoords.x, oldCoords.y, oldCoords.z - 1.0)
            return false, "Failed to find ground at waypoint."
        end

        SetPedCoordsKeepVehicle(ped, x, y, groundZ)
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:TeleportToMarker", string.format("Teleported to marker at %0.2f, %0.2f, %0.2f", x, y, groundZ))
        return true, "Teleported to marker."
    end,
    ["quickaction:ClothingMenu"] = function()
        Bridge.OpenClothingMenu()
        CloseAdminMenu()
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ClothingMenu", "Opened clothing menu")
        return true, "Opened clothing menu."
    end,
    ["quickaction:ClearBlood"] = function()
        ClearPedBloodDamage(PlayerPedId())
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ClearBlood", "Cleared blood from self")
        return true, "Blood cleared."
    end,
    ["quickaction:WetClothes"] = function()
        SetPedWetnessHeight(PlayerPedId(), 2.0)
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:WetClothes", "Made clothes wet")
        return true, "Clothes are now wet."
    end,
    ["quickaction:DryClothes"] = function()
        ClearPedWetness(PlayerPedId())
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:DryClothes", "Dried clothes")
        return true, "Clothes dried."
    end,

    -- Toggle Actions with State
    ["quickaction:ToggleInvisibility"] = {
        state = true,
        func = function(state)
            SetEntityVisible(PlayerPedId(), not state, 0)
            _G.AdminInvisibilityEnabled = state
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ToggleInvisibility", not state and "Enabled invisibility" or "Disabled invisibility")
            return not state, not state and "Invisibility disabled." or "Invisibility enabled."
        end
    },
    ["quickaction:ToggleFastRun"] = {
        state = false,
        func = function(state)
            SetRunSprintMultiplierForPlayer(PlayerId(), state and 1.0 or 1.49)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ToggleFastRun", not state and "Enabled fast run" or "Disabled fast run")
            return not state, not state and "Fast run enabled." or "Fast run disabled."
        end
    },
    ["quickaction:ToggleGodMode"] = {
        state = false,
        func = function(state)
            godModeEnabled = not godModeEnabled
            if godModeEnabled then
                CreateThread(function()
                    while godModeEnabled do
                        local ped = PlayerPedId()
                        SetPlayerInvincible(PlayerId(), true)
                        SetEntityInvincible(ped, true)
                        SetPedCanRagdoll(ped, false)
                        Wait(0)
                    end
                    local ped = PlayerPedId()
                    SetPlayerInvincible(PlayerId(), false)
                    SetEntityInvincible(ped, false)
                    SetPedCanRagdoll(ped, true)
                end)
            end
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ToggleGodMode", godModeEnabled and "Enabled god mode" or "Disabled god mode")
            return godModeEnabled, godModeEnabled and "God mode enabled." or "God mode disabled."
        end
    },
    ["quickaction:ToggleSuperJump"] = {
        state = false,
        func = function(state)
            superJumpEnabled = not superJumpEnabled
            if superJumpEnabled then
                CreateThread(function()
                    while superJumpEnabled do
                        SetSuperJumpThisFrame(PlayerId())
                        Wait(0)
                    end
                end)
            end
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ToggleSuperJump", superJumpEnabled and "Enabled super jump" or "Disabled super jump")
            return superJumpEnabled, superJumpEnabled and "Super jump enabled." or "Super jump disabled."
        end
    },
    ["quickaction:ToggleNoRagdoll"] = {
        state = false,
        func = function(state)
            SetPedCanRagdoll(PlayerPedId(), state)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ToggleNoRagdoll", not state and "Enabled no ragdoll" or "Disabled no ragdoll")
            return not state, not state and "No ragdoll enabled." or "No ragdoll disabled."
        end
    },
    ["quickaction:ToggleInfiniteStamina"] = {
        state = false,
        func = function(state)
            StatSetInt(GetHashKey("MP0_STAMINA"), state and 0 or 100, true)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ToggleInfiniteStamina", not state and "Enabled infinite stamina" or "Disabled infinite stamina")
            return not state, not state and "Infinite stamina enabled." or "Infinite stamina disabled."
        end
    },
    ["quickaction:ToggleAdminTag"] = {
        state = false,
        func = function(state)
            local enabling = not state
            local label = nil
            if enabling then
                local group
                group = lib.callback.await('amzn_admin:getCurrentUserPermissionGroup', false)
                label = group or "Admin"
            end
            TriggerServerEvent('amzn_admin:server:SetAdminTagState', enabling, label)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:ToggleAdminTag", enabling and ("Enabled admin tag: " .. (label or "Admin")) or "Disabled admin tag")
            return enabling, enabling and "Admin tag enabled." or "Admin tag disabled."
        end
    },

    -- Server Actions
    ["quickaction:ReviveAll"] = function()
        TriggerServerEvent('amzn_admin:server:ReviveAll')
        return true, "All players revived."
    end,
    ["quickaction:MessageAll"] = function(message)
        if not message then return false, "No message provided." end
        TriggerServerEvent('amzn_admin:server:MessageAll', message)
        return true, "Message sent to all players."
    end,
    ["quickaction:SetWeather"] = function(weather)
        if not weather then return false, "No weather type provided." end
        TriggerServerEvent('amzn_admin:server:SetWeather', weather)
        return true, "Weather set to " .. weather .. "."
    end,
    ["quickaction:SetTime"] = function(time)
        if not time then return false, "No time provided." end
        TriggerServerEvent('amzn_admin:server:SetTime', time)
        return true, "Time set to " .. time .. "."
    end,

    -- Vehicle Actions
    ["quickaction:RepairVehicle"] = function()
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle ~= 0 then
            SetVehicleFixed(vehicle)
            SetVehicleDeformationFixed(vehicle)
            SetVehicleUndriveable(vehicle, false)
            SetVehicleEngineOn(vehicle, true, true)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:RepairVehicle", "Repaired current vehicle")
            return true, "Vehicle repaired."
        end
        return false, "You are not in a vehicle."
    end,
    ["quickaction:FillGasTank"] = function()
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle ~= 0 then
            
            Bridge.FillFuel(vehicle)

            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:FillGasTank", "Filled current vehicle's gas tank")
            return true, "Gas tank filled."
        end
        return false, "You are not in a vehicle."
    end,
    ["quickaction:WashVehicle"] = function()
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle ~= 0 then
            SetVehicleDirtLevel(vehicle, 0.0)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:WashVehicle", "Washed current vehicle")
            return true, "Vehicle washed."
        end
        return false, "You are not in a vehicle."
    end,
    ["quickaction:SetVehicleColor"] = function(input)
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle == 0 then
            return false, "You are not in a vehicle."
        end
        if not input then
            return false, "No color provided."
        end
        local r, g, b
        if type(input) == 'table' then
            r = tonumber(input.r) or tonumber(input[1])
            g = tonumber(input.g) or tonumber(input[2])
            b = tonumber(input.b) or tonumber(input[3])
        elseif type(input) == 'string' then
            -- Expecting "r,g,b"
            local rr, gg, bb = string.match(input, "^(%d+)%s*,%s*(%d+)%s*,%s*(%d+)$")
            r, g, b = tonumber(rr), tonumber(gg), tonumber(bb)
        end
        if not r or not g or not b then
            return false, "Invalid color."
        end

        r = math.max(0, math.min(255, r))
        g = math.max(0, math.min(255, g))
        b = math.max(0, math.min(255, b))

        SetVehicleCustomPrimaryColour(vehicle, r, g, b)
        SetVehicleCustomSecondaryColour(vehicle, r, g, b)
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:SetVehicleColor", string.format("Set color to %d,%d,%d", r, g, b))
        return true, string.format("Vehicle color set to RGB(%d, %d, %d)", r, g, b)
    end,
    ["quickaction:SetMeDriver"] = function()
        local pos = GetEntityCoords(PlayerPedId())
        local closestVehicle = nil
        local closestDistance = 100.0
        for _, vehicle in ipairs(GetGamePool('CVehicle')) do
            local distance = #(pos - GetEntityCoords(vehicle))
            if distance < closestDistance then
                closestDistance = distance  
                closestVehicle = vehicle
            end 
        end
        if closestVehicle then
            if IsVehicleSeatFree(closestVehicle, -1) then
                TaskWarpPedIntoVehicle(PlayerPedId(), closestVehicle, -1)
                TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:SetMeDriver", "Set self as driver of nearest vehicle")
                return true, "You are now the driver."
            end
            
            local driverPed = GetPedInVehicleSeat(closestVehicle, -1)
            if driverPed ~= 0 and not IsPedAPlayer(driverPed) then
                TaskLeaveVehicle(driverPed, closestVehicle, 16)
                Wait(300)
                if IsVehicleSeatFree(closestVehicle, -1) then
                    TaskWarpPedIntoVehicle(PlayerPedId(), closestVehicle, -1)
                    TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:SetMeDriver", "Set self as driver of nearest vehicle")
                    return true, "You are now the driver."
                end
            end

            return false, "Driver seat is occupied."
        end
        return false, "No vehicle found nearby."
    end,
    ["quickaction:SetMePassenger"] = function()
        local pos = GetEntityCoords(PlayerPedId())
        local closestVehicle = nil
        local closestDistance = 100.0
        for _, vehicle in ipairs(GetGamePool('CVehicle')) do
            local distance = #(pos - GetEntityCoords(vehicle))
            if distance < closestDistance then
                closestDistance = distance  
                closestVehicle = vehicle
            end 
        end
        if closestVehicle then
            local maxSeats = GetVehicleMaxNumberOfPassengers(closestVehicle)
            for i = 0, maxSeats do
                if IsVehicleSeatFree(closestVehicle, i) then
                    SetPedIntoVehicle(PlayerPedId(), closestVehicle, i)
                    TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:SetMePassenger", "Set self as passenger in nearest vehicle")
                    return true, "You are now a passenger."
                end
            end
            return false, "No free passenger seats."
        end
        return false, "No vehicle found nearby."
    end,
    ["quickaction:UnlockVehicle"] = function()
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), true)
        if vehicle ~= 0 then
            SetVehicleDoorsLocked(vehicle, 1)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:UnlockVehicle", "Unlocked current vehicle")
            return true, "Vehicle unlocked."
        end
        return false, "You are not in a vehicle."
    end,
    ["quickaction:LockVehicle"] = function()
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), true)
        if vehicle ~= 0 then
            SetVehicleDoorsLocked(vehicle, 2)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:LockVehicle", "Locked current vehicle")
            return true, "Vehicle locked."
        end
        return false, "You are not in a vehicle."
    end,
    ["quickaction:MaxPerformance"] = function()
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), true)
        if vehicle ~= 0 then
            SetVehicleModKit(vehicle, 0)
            SetVehicleMod(vehicle, 11, GetNumVehicleMods(vehicle, 11) - 1, false)
            SetVehicleMod(vehicle, 12, GetNumVehicleMods(vehicle, 12) - 1, false)
            SetVehicleMod(vehicle, 13, GetNumVehicleMods(vehicle, 13) - 1, false)
            SetVehicleMod(vehicle, 15, GetNumVehicleMods(vehicle, 15) - 2, false)
            SetVehicleMod(vehicle, 16, GetNumVehicleMods(vehicle, 16) - 1, false)
            ToggleVehicleMod(vehicle, 17, true)
            ToggleVehicleMod(vehicle, 18, true)
            ToggleVehicleMod(vehicle, 19, true)
            ToggleVehicleMod(vehicle, 21, true)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:MaxPerformance", "Max performance")
            return true, "Max performance"
        end
        return false, "You are not in a vehicle."
    end,

    -- Dev Actions
    ["quickaction:GetVec3"] = function()
        local coords = GetEntityCoords(PlayerPedId())
        TriggerEvent('chat:addMessage', {
            color = {255, 255, 255},
            multiline = true,
            args = {"Vector3", string.format("vector3(%f, %f, %f)", coords.x, coords.y, coords.z)}
        })
        lib.setClipboard(string.format("vector3(%f, %f, %f)", coords.x, coords.y, coords.z))
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:GetVec3", string.format("Got Vector3: %0.2f, %0.2f, %0.2f", coords.x, coords.y, coords.z))
        return true, "Copied Vector3 to chat and clipboard."
    end,
    ["quickaction:GetVec4"] = function()
        local coords = GetEntityCoords(PlayerPedId())
        local heading = GetEntityHeading(PlayerPedId())
        TriggerEvent('chat:addMessage', {
            color = {255, 255, 255},
            multiline = true,
            args = {"Vector4", string.format("vector4(%f, %f, %f, %f)", coords.x, coords.y, coords.z, heading)}
        })
        lib.setClipboard(string.format("vector4(%f, %f, %f, %f)", coords.x, coords.y, coords.z, heading))
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:GetVec4", string.format("Got Vector4: %0.2f, %0.2f, %0.2f, %0.2f", coords.x, coords.y, coords.z, heading))
        return true, "Copied Vector4 to chat and clipboard."
    end,
    ["quickaction:GetHeading"] = function()
        local heading = GetEntityHeading(PlayerPedId())
        TriggerEvent('chat:addMessage', {
            color = {255, 255, 255},
            multiline = true,
            args = {"Heading", tostring(heading)}
        })  
        lib.setClipboard(tostring(heading))
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:GetHeading", string.format("Got heading: %0.2f", heading))
        return true, "Copied heading to chat and clipboard."
    end,
    ["quickaction:LoadIPL"] = function(ipl)
        if not ipl then return false, "No IPL specified." end
        if not IsIplActive(ipl) then
            RequestIpl(ipl)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:LoadIPL", "Loaded IPL: " .. ipl)
            return true, "IPL loaded."
        end
        return false, "IPL already loaded."
    end,
    ["quickaction:UnloadIPL"] = function(ipl)
        if not ipl then return false, "No IPL specified." end
        if IsIplActive(ipl) then
            RemoveIpl(ipl)
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:UnloadIPL", "Unloaded IPL: " .. ipl)
            return true, "IPL unloaded."
        end
        return false, "IPL not loaded."
    end,

    -- Entity Actions
    ["quickaction:GetKeys"] = function()
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle ~= 0 then
            TriggerServerEvent('amzn_admin:server:GetKeys', VehToNet(vehicle))
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:GetKeys", "Got keys for current vehicle")
            return true, "Keys received."
        end
        return false, "You are not in a vehicle."
    end,
    ["quickaction:SpawnCar"] = function(model)
        if not model then return false, "No model specified." end
        local hash = GetHashKey(model)
        if not IsModelInCdimage(hash) then return false, "Invalid model." end
        RequestModel(hash)
        while not HasModelLoaded(hash) do
            Wait(0)
        end
        local coords = GetEntityCoords(PlayerPedId())
        local heading = GetEntityHeading(PlayerPedId())
        local vehicle = CreateVehicle(hash, coords.x, coords.y, coords.z, heading, true, false)
        SetPedIntoVehicle(PlayerPedId(), vehicle, -1)
        SetEntityAsNoLongerNeeded(vehicle)
        SetModelAsNoLongerNeeded(hash)
        CloseAdminMenu()
        CreateThread(function()
            Wait(1000)
            TriggerServerEvent('amzn_admin:server:GetKeys', VehToNet(vehicle))
        end)
        TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:SpawnCar", "Spawned vehicle: " .. model)
        return true, "Vehicle spawned."
    end,
    ["quickaction:DeleteClosestVehicle"] = function()
        local pos = GetEntityCoords(PlayerPedId())
        local closestVehicle = nil
        local closestDistance = 100.0
        for _, vehicle in ipairs(GetGamePool('CVehicle')) do
            local distance = #(pos - GetEntityCoords(vehicle))
            if distance < closestDistance then
                closestDistance = distance  
                closestVehicle = vehicle
            end 
        end
        if closestVehicle then
            DeleteEntity(closestVehicle)
            if GetResourceState('AdvancedParking') == 'started' then
                TriggerServerEvent('amzn_admin:server:AdvancedParkingDeleteVehicle', VehToNet(closestVehicle))
            end
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:DeleteClosestVehicle", "Deleted closest vehicle")
            return true, "Closest vehicle deleted."
        end
        return false, "No vehicle found nearby."
    end,
    ["quickaction:DeleteClosestPed"] = function()
        local pos = GetEntityCoords(PlayerPedId())
        local closestPed = nil
        local closestDistance = 100.0
        for _, ped in ipairs(GetGamePool('CPed')) do
            local distance = #(pos - GetEntityCoords(ped))
            if distance < closestDistance then
                closestDistance = distance
                closestPed = ped
            end
        end
        if closestPed and DoesEntityExist(closestPed)then
            if NetworkGetEntityIsNetworked(closestPed) then
                local netId = NetworkGetNetworkIdFromEntity(closestPed)
                TriggerServerEvent('amzn_admin:server:DeleteEntity', netId, "quickaction:DeleteClosestPed")
            else
                SetEntityAsMissionEntity(closestPed, true, true)
                Wait(100)
                DeletePed(closestPed)
            end
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:DeleteClosestPed", "Deleted closest ped")
            return true, "Closest ped deleted."
        end
        return false, "No ped found nearby."
    end,
    ["quickaction:DeleteClosestObject"] = function()
        local pos = GetEntityCoords(PlayerPedId())
        local object = GetClosestObjectOfType(pos.x, pos.y, pos.z, 5.0, GetHashKey("prop_"), false, false, false)

        if object and DoesEntityExist(object) then
            if NetworkGetEntityIsNetworked(object) then
                local netId = NetworkGetNetworkIdFromEntity(object)
                TriggerServerEvent('amzn_admin:server:DeleteEntity', netId, "quickaction:DeleteClosestObject")
            else
                SetEntityAsMissionEntity(object, true, true)
                Wait(100)
                DeleteEntity(object)
            end
            TriggerServerEvent('amzn_admin:server:logQuickAction', "quickaction:DeleteClosestObject", "Deleted closest object")
            return true, "Closest object deleted."
        end
        return false, "No object found nearby."
    end,
    ["quickaction:MassDeleteVehicles"] = function()
        TriggerServerEvent('amzn_admin:server:MassDeleteVehicles')
        return true, "All vehicles deleted."
    end,
    ["quickaction:MassDeletePeds"] = function()
        TriggerServerEvent('amzn_admin:server:MassDeletePeds')
        return true, "All peds deleted."
    end,
}


RegisterNUICallback('executeQuickAction', function(data, cb)
    if not data.actionKey then
        cb({ status = "error", message = "No action key provided" })
        SendNUIMessage({ type = "showNotification", data = { message = "No action key provided", type = "error" } })
        return
    end

    local hasPermission = lib.callback.await('amzn_admin:server:checkPermission', false, data.actionKey)
    if not hasPermission then
        cb({ status = "error", message = "No permission" })
        SendNUIMessage({ type = "showNotification", data = { message = "No permission", type = "error" } })
        return
    end

    local action = QuickActions[data.actionKey]
    if not action then
        cb({ status = "error", message = "Invalid action" })
        SendNUIMessage({ type = "showNotification", data = { message = "Invalid action", type = "error" } })
        return
    end

    local success, message
    if type(action) == "table" and action.func then
        action.state, message = action.func(action.state)
        success = true
    else
        success, message = action(data.input)
    end

    local status = success and "ok" or "error"
    cb({ status = status, message = message })
    SendNUIMessage({ type = "showNotification", data = { message = message, type = status == "ok" and "success" or "error" } })
end)

RegisterNetEvent('amzn_admin:client:deleteAllVehicles', function()
    local vehicles = GetGamePool('CVehicle')
    for _, vehicle in ipairs(vehicles) do
        if DoesEntityExist(vehicle) then
            DeleteEntity(vehicle)
        end
    end
end)

RegisterNetEvent('amzn_admin:client:deleteAllPeds', function()
    local peds = GetGamePool('CPed')
    for _, ped in ipairs(peds) do
        if DoesEntityExist(ped) and not IsPedAPlayer(ped) then
            DeleteEntity(ped)
        end
    end
end)