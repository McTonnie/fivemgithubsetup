local targetZones = {}

local function removeTargets()
    for _, id in pairs(targetZones) do
        exports.ox_target:removeZone(id)
    end
    targetZones = {}
end

local function buildTargetOptions(safe)
     local options = {
         {
             name = ('safe_open_%s'):format(safe.id),
             icon = 'fa-solid fa-vault',
             label = 'Open Safe Dashboard',
             onSelect = function()
                 TriggerEvent('qbx_premium_safes:client:openDashboard', safe.id)
             end,
             distance = Config.Safes.interactionDistance,
         },
          {
              name = ('safe_stash_%s'):format(safe.id),
              icon = 'fa-solid fa-box',
              label = 'Open Stash',
              onSelect = function()
                  local access = lib.callback.await('qbx_premium_safes:server:getSafeAccess', false, safe.id)
                  if not access or (not access.canDeposit and not access.canWithdraw) then
                      lib.notify({ description = 'You do not have access to this safe.', type = 'error' })
                      return
                  end
                   local mode = access.canWithdraw and 'withdraw' or 'deposit'
                   TriggerServerEvent('qbx_premium_safes:server:openStash', safe.id, mode)
              end,
              distance = Config.Safes.interactionDistance,
          },
         {
             name = ('safe_crack_%s'):format(safe.id),
             icon = 'fa-solid fa-user-secret',
             label = 'Attempt Break-In',
             onSelect = function()
                 TriggerEvent('qbx_premium_safes:client:startCrack', safe.id)
             end,
             distance = Config.Safes.interactionDistance,
             canInteract = function()
                 return Config.Features.breakIn
             end
         }
     }
     return options
 end

RegisterNetEvent('qbx_premium_safes:client:refreshTargets', function(safes)
    if not Config.Features.oxTarget then return end
    removeTargets()
    for _, safe in pairs(safes) do
        targetZones[safe.id] = exports.ox_target:addBoxZone({
            coords = vec3(safe.coords.x, safe.coords.y, safe.coords.z + 0.5),
            size = Config.Safes.targetZone.size,
            rotation = safe.heading,
            debug = Config.Safes.targetZone.debug,
            drawSprite = Config.Safes.targetZone.drawSprite,
            options = buildTargetOptions(safe),
        })
    end
end)
