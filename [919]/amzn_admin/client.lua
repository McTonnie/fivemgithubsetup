FRAMEWORK = nil
if GetResourceState('qb-core') == 'started' and GetResourceState('qbx_core') ~= 'started' then
    FRAMEWORK = 'qb'
elseif GetResourceState('qbx_core') == 'started' then
    FRAMEWORK = 'qbx'
elseif GetResourceState('es_extended') == 'started' then
    FRAMEWORK = 'esx'
else
    FRAMEWORK = 'standalone'
    print('[^3919ADMIN^7] No framework detected, running in standalone mode')
end

if FRAMEWORK ~= 'standalone' then
    print('[^3919ADMIN^7] Framework detected: ' .. FRAMEWORK)
end
local toggle = false
local isAdminMenuInstalled = false
local license = nil

function IsAdminMenuOpen()
    return toggle
end

-- Addon callback storage
local addonCallbacks = {}

CreateThread(function()
    Wait(10)
    isAdminMenuInstalled, license = lib.callback.await('amzn_admin:server:isInstallationSequenceComplete')
end)

AddEventHandler('amzn_admin:client:refreshInstallationStatus', function()
    isAdminMenuInstalled, license = lib.callback.await('amzn_admin:server:isInstallationSequenceComplete')
end)

-- Event handler for addon registration
RegisterNetEvent('amzn_admin:registerAddonCallbacks', function(addonName, callbacks)
    addonCallbacks[addonName] = callbacks
    print('[^3919ADMIN^7] Registered addon callbacks for: ' .. addonName)
end)

-- Export functions for addons
exports('GetFramework', function()
    return FRAMEWORK
end)

AddEventHandler('amzn_admin:client:setPlacerEditing', function(editing)
    SendNUIMessage({
        type = "setPlacerEditing",
        data = { editing = editing }
    })
    SetNuiFocus(editing == false, editing == false)
end)

function ShowAdminMenu()
    if isAdminMenuInstalled then
        local groupName, groups = lib.callback.await('amzn_admin:getCurrentUserPermissionGroup')
        if groupName and groupName ~= "User" then
            toggle = not toggle
            SendNUIMessage({
                type = "setVisible",
                data = {
                    visible = toggle,
                    groupName = groupName,
                    myLicense = lib.callback.await('amzn_admin:getCurrentUserLicense'),
                    groups = groups,
                    disabledPages = lib.callback.await('amzn_admin:server:getDisabledPages')
                }
            })
            SetNuiFocus(toggle, toggle)
        end
    else
        SendNUIMessage({
            type = "setInstallationVisible",
            data = { 
                visible = true,
                license = license,
                frameworkName = FRAMEWORK == 'qb' and 'QBCore' or FRAMEWORK == 'qbx' and 'QBox' or FRAMEWORK == 'esx' and 'ESX' or FRAMEWORK == 'standalone' and 'Standalone' or 'Unknown'
            }
        })
        SetNuiFocus(true, true)
    end
end

RegisterCommand("+adminmenu", function(source, args)
    ShowAdminMenu()
end, false)
RegisterKeyMapping("+adminmenu", "Open Admin Menu", "keyboard", "PAGEDOWN")

RegisterNetEvent('amzn_admin:client:closeAdminMenu', function()
    CloseAdminMenu()
end)

CloseAdminMenu = function() 
    toggle = false
    SetNuiFocus(toggle, toggle)
    SendNUIMessage({
        type = "setVisible",
        data = {
            visible = false,
            groupName = "",
            myLicense = "",
            groups = {}
        }
    })
end

-- Generic notification event for server -> client notifications
RegisterNetEvent('amzn_admin:client:notify', function(message, notifType)
    SendNUIMessage({
        type = "showNotification",
        data = { message = message or "", type = notifType or "info" }
    })
end)

-- Global message banner
RegisterNetEvent('amzn_admin:client:ShowGlobalMessage', function(payload)
    -- payload: { message = string, author = string, duration = number(ms) }
    SendNUIMessage({
        type = "showGlobalMessage",
        data = {
            message = payload?.message or "",
            author = payload?.author or "ADMIN",
            duration = payload?.duration or 10000
        }
    })
end)

-- Modified to handle addon callbacks
RegisterNUICallback("close", function(data, cb)
    toggle = false
    SetNuiFocus(toggle, toggle)
    cb({ status = 'ok' })
end)

-- Function to handle NUI callbacks from addons
local function HandleAddonCallback(callbackName, data, cb)
    -- Check each addon for the callback
    for addonName, callbacks in pairs(addonCallbacks) do
        if callbacks[callbackName] then
            callbacks[callbackName](data, cb)
            return true
        end
    end
    return false
end

-- Register a generic NUI callback handler that routes to addons
RegisterNUICallback("addonCallback", function(data, cb)
    local callbackName = data.callback
    local callbackData = data.data
    
    if HandleAddonCallback(callbackName, callbackData, cb) then
        return
    end
    
    -- Fallback if callback not found
    cb({ status = 'error', data = 'Callback not found: ' .. callbackName })
end)

-- Existing NUI callbacks remain the same
RegisterNUICallback("getServerInfo", function(data, cb)
    local data = lib.callback.await('amzn_admin:server:getServerInfo')
    data.gameBuild = GetGameBuildNumber()
    cb(data)
end)

RegisterNUICallback("setServerName", function(data, cb)
    if not data.name then
        cb({ status = "error", message = "Missing server name" })
        return
    end
    cb(lib.callback.await('amzn_admin:server:setServerName', false, data.name))
end)

RegisterNUICallback("getAllPlayers", function(data, cb)
    local data = lib.callback.await('amzn_admin:server:getPlayerList')
    cb(data)
end)

RegisterNUICallback("getDetailedPlayerInfo", function(data, cb)
    local data = lib.callback.await('amzn_admin:server:getPlayerInfo', false, data.playerId)
    cb(data)
end)

RegisterNUICallback("getSendToLocations", function(data, cb)
    cb(lib.callback.await('amzn_admin:server:getSendToLocations'))
end)

RegisterNUICallback("getJobsList", function(data, cb)
    cb(lib.callback.await('amzn_admin:server:getJobsList'))
end)

RegisterNUICallback("getGangsList", function(data, cb)
    cb(lib.callback.await('amzn_admin:server:getGangsList'))
end)

RegisterNUICallback("getItemsList", function(data, cb)
    cb(lib.callback.await('amzn_admin:server:getItemsList'))
end)

RegisterNUICallback("getPanelVersion", function(data, cb)
    cb({ version = GetResourceMetadata(GetCurrentResourceName(), "version", 0) })
end)

RegisterNUICallback("getAddonStates", function(data, cb)
    cb(lib.callback.await('amzn_admin:getAddonStates'))
end)

-- New NUI callbacks that route to appropriate addons
RegisterNUICallback("getPlacements", function(data, cb)
    if HandleAddonCallback("getPlacements", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("createPlacement", function(data, cb)
    if HandleAddonCallback("createPlacement", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("updatePlacement", function(data, cb)
    if HandleAddonCallback("updatePlacement", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("deletePlacement", function(data, cb)
    if HandleAddonCallback("deletePlacement", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("getPlayerFrontPosition", function(data, cb)
    if HandleAddonCallback("getPlayerFrontPosition", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("addPlacementObject", function(data, cb)
    if HandleAddonCallback("addPlacementObject", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("addPlacementPed", function(data, cb)
    if HandleAddonCallback("addPlacementPed", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("updatePlacementObject", function(data, cb)
    if HandleAddonCallback("updatePlacementObject", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("updatePlacementPed", function(data, cb)
    if HandleAddonCallback("updatePlacementPed", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("deletePlacementObject", function(data, cb)
    if HandleAddonCallback("deletePlacementObject", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("deletePlacementPed", function(data, cb)
    if HandleAddonCallback("deletePlacementPed", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("startEditingItem", function(data, cb)
    local result = nil
    local function respond(response)
        result = response
        cb(response)
    end

    if HandleAddonCallback("startEditingItem", data, respond) then
        if result and result.status == 'ok' then
            SetNuiFocus(false, false)
        end
        return
    end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

RegisterNUICallback("teleportToItem", function(data, cb)
    if HandleAddonCallback("teleportToItem", data, cb) then return end
    cb({ status = 'error', data = 'Placer addon not available' })
end)

-- Car Customizer callbacks
RegisterNUICallback("checkCarCustomizerVehicle", function(data, cb)
    if HandleAddonCallback("checkCarCustomizerVehicle", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("getVehicleCustomizationData", function(data, cb)
    if HandleAddonCallback("getVehicleCustomizationData", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("getVehicleModLimits", function(data, cb)
    if HandleAddonCallback("getVehicleModLimits", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("applyVehicleMod", function(data, cb)
    if HandleAddonCallback("applyVehicleMod", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("applyVehicleColor", function(data, cb)
    if HandleAddonCallback("applyVehicleColor", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("toggleVehicleExtra", function(data, cb)
    if HandleAddonCallback("toggleVehicleExtra", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("toggleVehicleTurbo", function(data, cb)
    if HandleAddonCallback("toggleVehicleTurbo", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("toggleVehicleXenon", function(data, cb)
    if HandleAddonCallback("toggleVehicleXenon", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("resetVehicleToOriginal", function(data, cb)
    if HandleAddonCallback("resetVehicleToOriginal", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

RegisterNUICallback("saveVehicleCustomization", function(data, cb)
    if HandleAddonCallback("saveVehicleCustomization", data, cb) then return end
    cb({ status = 'error', data = 'Car Customizer addon not available' })
end)

-- Config Editor callbacks
RegisterNUICallback("getConfigEditorResourceTree", function(data, cb)
    if HandleAddonCallback("getConfigEditorResourceTree", data, cb) then return end
    cb({ status = 'error', data = 'Config Editor addon not available' })
end)

RegisterNUICallback("openConfigEditorFile", function(data, cb)
    if HandleAddonCallback("openConfigEditorFile", data, cb) then return end
    cb({ status = 'error', data = 'Config Editor addon not available' })
end)

RegisterNUICallback("saveConfigEditorFile", function(data, cb)
    if HandleAddonCallback("saveConfigEditorFile", data, cb) then return end
    cb({ status = 'error', data = 'Config Editor addon not available' })
end)

RegisterNUICallback("exportConfigEditorFile", function(data, cb)
    if HandleAddonCallback("exportConfigEditorFile", data, cb) then return end
    cb({ status = 'error', data = 'Config Editor addon not available' })
end)

RegisterNUICallback("restartConfigEditorResource", function(data, cb)
    if HandleAddonCallback("restartConfigEditorResource", data, cb) then return end
    cb({ status = 'error', data = 'Config Editor addon not available' })
end)

-- Vehicle Editor callbacks
RegisterNUICallback("isUserInVehicle", function(data, cb)
    if HandleAddonCallback("isUserInVehicle", data, cb) then return end
    cb({ status = 'error', data = 'Vehicle Editor addon not available' })
end)

RegisterNUICallback("startVehicleEditor", function(data, cb)
    if HandleAddonCallback("startVehicleEditor", data, cb) then return end
    cb({ status = 'error', data = 'Vehicle Editor addon not available' })
end)

RegisterNUICallback("stopVehicleEditor", function(data, cb)
    if HandleAddonCallback("stopVehicleEditor", data, cb) then return end
    cb({ status = 'error', data = 'Vehicle Editor addon not available' })
end)

RegisterNUICallback("getVehicleData", function(data, cb)
    if HandleAddonCallback("getVehicleData", data, cb) then return end
    cb({ status = 'error', data = 'Vehicle Editor addon not available' })
end)

RegisterNUICallback("updateVehicleProperty", function(data, cb)
    if HandleAddonCallback("updateVehicleProperty", data, cb) then return end
    cb({ status = 'error', data = 'Vehicle Editor addon not available' })
end)

RegisterNUICallback("resetVehicleHandling", function(data, cb)
    if HandleAddonCallback("resetVehicleHandling", data, cb) then return end
    cb({ status = 'error', data = 'Vehicle Editor addon not available' })
end)

RegisterNUICallback("repairVehicle", function(data, cb)
    if HandleAddonCallback("repairVehicle", data, cb) then return end
    cb({ status = 'error', data = 'Vehicle Editor addon not available' })
end)

RegisterNUICallback("copyHandlingToClipboard", function(data, cb)
    if HandleAddonCallback("copyHandlingToClipboard", data, cb) then return end
    cb({ status = 'error', data = 'Vehicle Editor addon not available' })
end)