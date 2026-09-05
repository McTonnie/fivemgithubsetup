local spawnedSafes = {}
local placementPreview = nil

local function notify(description, nType)
    lib.notify({ description = description, type = nType or 'inform' })
end

local function loadModel(model)
    -- Handle both hash numbers and string model names
    model = tonumber(model) or model
    if not model then return false end
    
    -- Request and wait for model to load
    lib.requestModel(model, 10000)
    
    -- Verify model loaded successfully
    if not HasModelLoaded(model) then
        return false
    end
    
    return true
end

local function deleteSafeEntity(entry)
    if not entry or not entry.entity or not DoesEntityExist(entry.entity) then return end
    SetEntityAsMissionEntity(entry.entity, true, true)
    DeleteObject(entry.entity)
    DeleteEntity(entry.entity)
    entry.entity = nil
end

local function spawnSafeEntity(safe)
    local model = tonumber(safe.model)
    if not loadModel(model) then
        print(('[qbx_premium_safes] Failed to load model %s for safe %s'):format(tostring(safe.model), tostring(safe.id)))
        return nil
    end

    local entity = CreateObjectNoOffset(model, safe.coords.x + 0.0, safe.coords.y + 0.0, safe.coords.z + 0.0, false, false, false)
    if not entity or entity == 0 then
        print(('[qbx_premium_safes] Failed to create object for safe %s'):format(tostring(safe.id)))
        return nil
    end

    SetEntityHeading(entity, safe.heading or 0.0)
    PlaceObjectOnGroundProperly(entity)
    FreezeEntityPosition(entity, true)
    SetEntityInvincible(entity, true)
    SetEntityAsMissionEntity(entity, true, true)
    return entity
end

local function syncSafeEntities(incomingSafes)
    local nextState = {}

    for _, safe in ipairs(incomingSafes) do
        local existing = spawnedSafes[safe.id]
        if existing then
            local moved = existing.safe.model ~= safe.model
                or math.abs(existing.safe.coords.x - safe.coords.x) > 0.01
                or math.abs(existing.safe.coords.y - safe.coords.y) > 0.01
                or math.abs(existing.safe.coords.z - safe.coords.z) > 0.01
                or math.abs((existing.safe.heading or 0.0) - (safe.heading or 0.0)) > 0.01

            if moved then
                deleteSafeEntity(existing)
                existing.entity = spawnSafeEntity(safe)
            end

            existing.safe = safe
            nextState[safe.id] = existing
        else
            nextState[safe.id] = {
                safe = safe,
                entity = spawnSafeEntity(safe)
            }
        end
    end

    for id, entry in pairs(spawnedSafes) do
        if not nextState[id] then
            deleteSafeEntity(entry)
        end
    end

    spawnedSafes = nextState

    local targetPayload = {}
    for id, entry in pairs(spawnedSafes) do
        targetPayload[id] = entry.safe
    end

    TriggerEvent('qbx_premium_safes:client:refreshTargets', targetPayload)
end

local function stopPlacementPreview()
    if placementPreview and placementPreview.entity and DoesEntityExist(placementPreview.entity) then
        SetEntityAsMissionEntity(placementPreview.entity, true, true)
        DeleteObject(placementPreview.entity)
        DeleteEntity(placementPreview.entity)
    end
    placementPreview = nil
end

local function rotationStep()
    return tonumber(Config.Placement.headingSnap) or 5.0
end

local function movementStep(fast)
    return fast and 0.03 or 0.0125
end

local function startPlacementPreview(model)
    stopPlacementPreview()

    if not loadModel(model) then
        notify('Failed to load safe model.', 'error')
        return false
    end

    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local forward = GetEntityForwardVector(ped)
    local startCoords = coords + (forward * 1.0)
    local entity = CreateObjectNoOffset(model, startCoords.x, startCoords.y, startCoords.z - 1.0, false, false, false)

    if not entity or entity == 0 then
        notify('Failed to create placement preview.', 'error')
        return false
    end

    SetEntityCollision(entity, false, false)
    SetEntityAlpha(entity, 180, false)
    FreezeEntityPosition(entity, true)
    SetEntityInvincible(entity, true)
    SetEntityAsMissionEntity(entity, true, true)
    SetEntityHeading(entity, GetEntityHeading(ped))
    PlaceObjectOnGroundProperly(entity)

    placementPreview = {
        entity = entity,
        model = model,
        coords = GetEntityCoords(entity),
        heading = GetEntityHeading(entity)
    }

    return true
end

local function placementLoop()
    CreateThread(function()
        notify('Placement mode: Arrow keys move, scroll rotates, E confirm, Backspace cancel.', 'inform')

        while placementPreview and placementPreview.entity and DoesEntityExist(placementPreview.entity) do
            Wait(0)
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 140, true)
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            DisableControlAction(0, 263, true)
            DisableControlAction(0, 264, true)

            local ped = PlayerPedId()
            local forward = GetEntityForwardVector(ped)
            local right = vector3(forward.y, -forward.x, 0.0)
            local fast = IsControlPressed(0, 21)
            local step = movementStep(fast)

            if IsControlPressed(0, 172) then placementPreview.coords = placementPreview.coords + (forward * step) end
            if IsControlPressed(0, 173) then placementPreview.coords = placementPreview.coords - (forward * step) end
            if IsControlPressed(0, 174) then placementPreview.coords = placementPreview.coords - (right * step) end
            if IsControlPressed(0, 175) then placementPreview.coords = placementPreview.coords + (right * step) end

            if IsControlJustPressed(0, 14) then placementPreview.heading = placementPreview.heading - rotationStep() end
            if IsControlJustPressed(0, 15) then placementPreview.heading = placementPreview.heading + rotationStep() end

            SetEntityCoordsNoOffset(placementPreview.entity, placementPreview.coords.x, placementPreview.coords.y, placementPreview.coords.z, false, false, false)
            SetEntityHeading(placementPreview.entity, placementPreview.heading)
            PlaceObjectOnGroundProperly(placementPreview.entity)
            placementPreview.coords = GetEntityCoords(placementPreview.entity)

            if IsControlJustPressed(0, 38) then
                local finalized = {
                    x = placementPreview.coords.x,
                    y = placementPreview.coords.y,
                    z = placementPreview.coords.z,
                    heading = placementPreview.heading
                }
                stopPlacementPreview()
                placementPreview = finalized
                return
            end

            if IsControlJustPressed(0, 177) or IsControlJustPressed(0, 194) then
                stopPlacementPreview()
                placementPreview = false
                notify('Placement cancelled.', 'error')
                return
            end
        end
    end)

    while type(placementPreview) == 'table' and placementPreview.entity do
        Wait(50)
    end

    local result = placementPreview
    placementPreview = nil
    return result
end


local function requestSafeSync()
    CreateThread(function()
        Wait(1000)
        local safes = lib.callback.await('qbx_premium_safes:server:getSafeStates', false)
        if safes and type(safes) == 'table' then
            syncSafeEntities(safes)
        end
    end)
end

local function placeSafeFlow()
     local input = lib.inputDialog('Place Safe', {
         { type = 'select', label = 'Safe Model', options = (function()
             local options = {}
             for i = 1, #Config.Safes.props do
                 options[#options + 1] = { value = Config.Safes.props[i].prop, label = Config.Safes.props[i].displayname }
             end
             return options
         end)(), required = true },
         { type = 'input', label = 'Safe Name', required = true, min = Config.Placement.nameMinLength, max = Config.Placement.nameMaxLength },
     })

    if not input then return end
    local model = tonumber(input[1])
    local safeName = input[2]

      -- Get the safeId from the item's metadata before placement
      local items = exports.ox_inventory:Search('count', Config.SafeItem) or 0
      local safeId = nil
      if items > 0 then
          local itemSlots = exports.ox_inventory:Search('slots', Config.SafeItem) or {}
          if itemSlots[1] and itemSlots[1].metadata then
              safeId = itemSlots[1].metadata.safeId
          end
      end

    if not startPlacementPreview(model) then return end
    local finalPlacement = placementLoop()
    if not finalPlacement or finalPlacement == false then return end

    local success, data = lib.callback.await('qbx_premium_safes:server:placeSafe', false, {
        model = model,
        safeName = safeName,
        coords = { x = finalPlacement.x, y = finalPlacement.y, z = finalPlacement.z },
        heading = finalPlacement.heading,
        safeId = safeId,
    })

    if not success then
        notify(data or 'Placement failed.', 'error')
        return
    end

    notify(Lang.notify.safe_placed, 'success')
end

RegisterCommand('placesafe', function()
    placeSafeFlow()
end)

RegisterNetEvent('qbx_premium_safes:client:startPlacement', function()
    placeSafeFlow()
end)

RegisterNetEvent('qbx_premium_safes:client:syncSafes', function(safes)
    syncSafeEntities(safes)
end)

RegisterNetEvent('qbx_premium_safes:client:removeSafeEntity', function(safeId)
    local entry = spawnedSafes[safeId]
    if not entry then return end

    deleteSafeEntity(entry)
    spawnedSafes[safeId] = nil

    local targetPayload = {}
    for id, data in pairs(spawnedSafes) do
        targetPayload[id] = data.safe
    end

    TriggerEvent('qbx_premium_safes:client:refreshTargets', targetPayload)
end)

RegisterNetEvent('qbx_premium_safes:client:openStash', function(stashToken)
    TriggerEvent('qbx_premium_safes:client:closeUi')
    Wait(50)
    exports.ox_inventory:openInventory('stash', stashToken)
end)


RegisterNetEvent('qbx_premium_safes:client:crackResult', function(success, safeId)
    if success then
        TriggerEvent('qbx_premium_safes:client:closeUi')
        TriggerServerEvent('qbx_premium_safes:server:openStash', safeId, 'withdraw')
    end
end)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    stopPlacementPreview()
    for _, entry in pairs(spawnedSafes) do
        deleteSafeEntity(entry)
    end
end)


AddEventHandler('onClientResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    requestSafeSync()
end)

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    requestSafeSync()
end)

RegisterNetEvent('qbx_core:client:onPlayerLoaded', function()
    requestSafeSync()
end)

-- Admin inspect command - finds nearest safe within range
RegisterCommand(Config.Commands.inspect, function()
    local ped = PlayerPedId()
    local pedCoords = GetEntityCoords(ped)
    local nearestSafe = nil
    local nearestDist = Config.Admin.inspectRange

    for safeId, entry in pairs(spawnedSafes) do
        if entry and entry.safe then
            local safeCoords = vector3(entry.safe.coords.x, entry.safe.coords.y, entry.safe.coords.z)
            local dist = #(pedCoords - safeCoords)
            if dist < nearestDist then
                nearestDist = dist
                nearestSafe = entry.safe
            end
        end
    end

    if not nearestSafe then
        print(('[qbx_premium_safes] No safe found within %.1f units.'):format(Config.Admin.inspectRange))
        return
    end

    print(('[qbx_premium_safes] Nearest safe (distance: %.2f):'):format(nearestDist))
    print(json.encode(nearestSafe, { indent = true }))
end, false)
