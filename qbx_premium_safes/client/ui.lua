
local currentDashboard = nil
local alarmBlip = nil

local function removeAlarmBlip()
    if alarmBlip and DoesBlipExist(alarmBlip) then
        RemoveBlip(alarmBlip)
        alarmBlip = nil
    end
end

local function createAlarmBlip(coords, safeName, blipSeconds)
    removeAlarmBlip()
    
    alarmBlip = AddBlipForCoord(coords.x, coords.y, coords.z)
    SetBlipSprite(alarmBlip, 431) -- Stealable vehicle blip (red)
    SetBlipColour(alarmBlip, 1) -- Red
    SetBlipScale(alarmBlip, 1.2)
    SetBlipAsShortRange(alarmBlip, false)
    SetBlipDisplay(alarmBlip, 6)
    
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(('BREAK-IN: %s'):format(safeName or 'Unknown Safe'))
    EndTextCommandSetBlipName(alarmBlip)
    
    -- Flash the blip
    SetBlipFlashes(alarmBlip, true)
    
    -- Remove blip after configured seconds
    SetTimeout((blipSeconds or 30) * 1000, removeAlarmBlip)
end

local function closeUi()
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
    if currentDashboard and currentDashboard.safe then
        TriggerServerEvent('qbx_premium_safes:server:closeDashboard')
    end
    currentDashboard = nil
end

AddEventHandler('qbx_premium_safes:client:closeUi', closeUi)

local function openUi(payload)
    currentDashboard = payload
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'open', payload = payload })
end

local function updateUi(payload)
    currentDashboard = payload
    SendNUIMessage({ action = 'update', payload = payload })
end

RegisterNetEvent('qbx_premium_safes:client:openDashboard', function(safeId)
    local success, payload = lib.callback.await('qbx_premium_safes:server:getDashboard', false, safeId)
    if not success then
        lib.notify({ description = payload or 'Access denied.', type = 'error' })
        return
    end
    openUi(payload)
end)

RegisterNetEvent('qbx_premium_safes:client:refreshDashboard', function(safeId)
    if not currentDashboard or not currentDashboard.safe or currentDashboard.safe.id ~= safeId then return end
    local success, payload = lib.callback.await('qbx_premium_safes:server:getDashboard', false, safeId)
    if success then
        updateUi(payload)
    end
end)

RegisterNetEvent('qbx_premium_safes:client:showAlarmFlash', function(payload)
    SendNUIMessage({ action = 'safeUnderAttack', payload = payload or {} })
    
    -- Create map blip at safe location
    if payload and payload.coords then
        createAlarmBlip(payload.coords, payload.safeName, payload.blipSeconds)
    end
end)

RegisterNetEvent('qbx_premium_safes:client:startCrack', function(safeId)
    local allowed, reason = lib.callback.await('qbx_premium_safes:server:canCrack', false, safeId)
    if not allowed then
        lib.notify({ description = reason or 'Cannot crack this safe.', type = 'error' })
        return
    end

    -- Trigger alarm immediately when cracking attempt starts
    TriggerServerEvent('qbx_premium_safes:server:crackAttemptStarted', safeId)

    local completed = lib.progressBar({ duration = Config.Cracking.crackDuration, label = 'Running code cracker...', useWhileDead = false, canCancel = true, disable = { move = true, car = true, combat = true } })
    
    if completed then
        TriggerServerEvent('qbx_premium_safes:server:finishCrack', safeId, true)
    else
        -- User canceled the progress bar
        TriggerServerEvent('qbx_premium_safes:server:crackCanceled', safeId)
    end
end)

RegisterNetEvent('qbx_premium_safes:client:openTrackedItemSelector', function(safeId, selectorToken)
    closeUi()
    Wait(50)
    exports.ox_inventory:openInventory('stash', selectorToken)
    CreateThread(function()
        while LocalPlayer.state.invOpen do Wait(200) end
        Wait(200)
        TriggerServerEvent('qbx_premium_safes:server:finalizeTrackedItemSelector', safeId, selectorToken)
        Wait(300)
        TriggerEvent('qbx_premium_safes:client:openDashboard', safeId)
    end)
end)

RegisterNUICallback('close', function(_, cb) closeUi() cb(1) end)
RegisterNUICallback('withdraw', function(_, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then closeUi() TriggerServerEvent('qbx_premium_safes:server:openStash', safeId, 'withdraw') end
    cb(true)
end)
RegisterNUICallback('deposit', function(_, cb)
     local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
     if safeId then closeUi() TriggerServerEvent('qbx_premium_safes:server:openStash', safeId, 'deposit') end
     cb(true)
end)
RegisterNUICallback('saveSettings', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then TriggerServerEvent('qbx_premium_safes:server:updateSettings', safeId, data) end
    cb(true)
end)
RegisterNUICallback('selectTrackedItem', function(_, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then TriggerServerEvent('qbx_premium_safes:server:beginTrackedItemSelector', safeId) end
    cb(true)
end)
RegisterNUICallback('searchPlayers', function(data, cb)
    cb(lib.callback.await('qbx_premium_safes:server:searchPlayers', false, data and data.query or '') or {})
end)
RegisterNUICallback('addAccess', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then TriggerServerEvent('qbx_premium_safes:server:addAllowedUser', safeId, data.identifier) end
    cb(true)
end)
RegisterNUICallback('removeAccess', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then TriggerServerEvent('qbx_premium_safes:server:removeAllowedUser', safeId, data.identifier) end
    cb(true)
end)
RegisterNUICallback('updatePermissions', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then TriggerServerEvent('qbx_premium_safes:server:updateMemberPermissions', safeId, data.identifier, data.permissions or {}) end
    cb(true)
end)
RegisterNUICallback('resetProgress', function(_, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then TriggerServerEvent('qbx_premium_safes:server:resetProgress', safeId) end
    cb(true)
end)
RegisterNUICallback('pickupSafe', function(_, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    local safeName = currentDashboard and currentDashboard.safe and (currentDashboard.safe.safeName or ('Safe #' .. currentDashboard.safe.id)) or 'this safe'
    if safeId then
        local confirmed = lib.alertDialog({
            header = 'Pick Up Safe?',
            content = ('Pick up %s and add it to your inventory.'):format(safeName),
            centered = true,
            cancel = true,
            labels = { confirm = 'Pick Up Safe', cancel = 'Cancel' }
        })

        if confirmed == 'confirm' then
            closeUi()
            TriggerServerEvent('qbx_premium_safes:server:removeSafe', safeId)
        end
    end
    cb(true)
end)
RegisterNUICallback('upgradeStorage', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    local tier = data and data.tier
    if safeId and tier then
         local confirmed = lib.alertDialog({
             header = 'Buy Storage Upgrade?',
             content = 'Upgrade storage capacity to expand your safe.',
             centered = true,
             cancel = true,
             labels = { confirm = 'Buy Upgrade', cancel = 'Cancel' }
         })

        if confirmed == 'confirm' then
            TriggerServerEvent('qbx_premium_safes:server:upgradeStorage', safeId, tier)
        end
    end
    cb(true)
end)

RegisterNUICallback('buyAlarmUpgrade', function(_, cb)
     local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
     if safeId then
         local upgrade = currentDashboard and currentDashboard.alarmUpgrade or {}
          local confirmed = lib.alertDialog({
              header = 'Buy Alarm Upgrade?',
              content = ('Purchase %s to receive break-in notifications.'):format(upgrade.label or 'alarm upgrade'),
              centered = true,
              cancel = true,
              labels = { confirm = 'Buy Upgrade', cancel = 'Cancel' }
          })

         if confirmed == 'confirm' then
             TriggerServerEvent('qbx_premium_safes:server:buyAlarmUpgrade', safeId)
         end
     end
     cb(true)
 end)

RegisterNUICallback('buyAccessUpgrade', function(_, cb)
     local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
     if safeId then
         local upgrade = currentDashboard and currentDashboard.accessUpgrade or {}
          local confirmed = lib.alertDialog({
              header = 'Buy Access Control?',
              content = ('Purchase %s to restrict stash access to allowed users only. Without this, anyone can access the stash.'):format(upgrade.label or 'Access Control'),
              centered = true,
              cancel = true,
              labels = { confirm = 'Buy Upgrade', cancel = 'Cancel' }
          })

         if confirmed == 'confirm' then
             TriggerServerEvent('qbx_premium_safes:server:buyAccessUpgrade', safeId)
         end
     end
     cb(true)
 end)

 RegisterNUICallback('buyOwnerOnlineRequirement', function(_, cb)
      local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
      if safeId then
          local upgrade = currentDashboard and currentDashboard.ownerOnlineRequirement or {}
           local confirmed = lib.alertDialog({
               header = 'Buy Owner Online Requirement?',
               content = ('Purchase %s to require the owner to be online for break-ins.'):format(upgrade.label or 'owner online requirement'),
               centered = true,
               cancel = true,
               labels = { confirm = 'Buy Upgrade', cancel = 'Cancel' }
           })

          if confirmed == 'confirm' then
              TriggerServerEvent('qbx_premium_safes:server:buyOwnerOnlineRequirement', safeId)
          end
      end
      cb(true)
  end)

RegisterNUICallback('buyTrackingUpgrade', function(_, cb)
      local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
      if safeId then
          local upgrade = currentDashboard and currentDashboard.trackingUpgrade or {}
           local confirmed = lib.alertDialog({
               header = 'Buy Tracking Upgrade?',
               content = ('Purchase %s to track member activity.'):format(upgrade.label or 'member tracking'),
               centered = true,
               cancel = true,
               labels = { confirm = 'Buy Upgrade', cancel = 'Cancel' }
           })

          if confirmed == 'confirm' then
              TriggerServerEvent('qbx_premium_safes:server:buyTrackingUpgrade', safeId)
          end
      end
      cb(true)
  end)

RegisterNUICallback('setTrackedItems', function(_, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then
        local confirmed = lib.alertDialog({
            header = 'Configure Tracked Items?',
            content = 'This will open a temporary inventory. Place items in it to register them for tracking. All items will be returned to you when you close it.',
            centered = true,
            cancel = true,
            labels = { confirm = 'Open Inventory', cancel = 'Cancel' }
        })
        
        if confirmed == 'confirm' then
            TriggerServerEvent('qbx_premium_safes:server:beginSetTrackedItems', safeId)
        end
    end
    cb(true)
end)

RegisterNUICallback('addTrackerMember', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId and data and data.memberName then
        TriggerServerEvent('qbx_premium_safes:server:addTrackerMember', safeId, data.memberName, data.linkedCitizenid)
    end
    cb(true)
end)

RegisterNUICallback('removeTrackerMember', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId and data and data.memberName then
        TriggerServerEvent('qbx_premium_safes:server:removeTrackerMember', safeId, data.memberName)
    end
    cb(true)
end)

RegisterNUICallback('adjustProgress', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId and data and data.memberName and data.itemName and data.amount then
        TriggerServerEvent('qbx_premium_safes:server:adjustProgress', safeId, data.memberName, data.itemName, data.amount)
    end
    cb(true)
end)

RegisterNUICallback('setPeriodDays', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId and data and data.days then
        TriggerServerEvent('qbx_premium_safes:server:setPeriodDays', safeId, data.days)
    end
    cb(true)
end)

RegisterNUICallback('endPeriodNow', function(data, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then
        local confirmed = lib.alertDialog({
            header = 'End Tracking Period?',
            content = 'This will archive current progress and start a new period.',
            centered = true,
            cancel = true,
            labels = { confirm = 'End Period', cancel = 'Cancel' }
        })
        
        if confirmed == 'confirm' then
            TriggerServerEvent('qbx_premium_safes:server:endPeriod', safeId)
        end
    end
    cb(true)
end)

RegisterNUICallback('getArchives', function(_, cb)
    local safeId = currentDashboard and currentDashboard.safe and currentDashboard.safe.id
    if safeId then
        TriggerServerEvent('qbx_premium_safes:server:getArchives', safeId)
    end
    cb(true)
end)
