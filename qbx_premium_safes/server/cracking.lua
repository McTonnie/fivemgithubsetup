local function notify(src, description, nType)
    TriggerClientEvent('ox_lib:notify', src, {
        description = description,
        type = nType or 'inform'
    })
end

local function getSafe(safeId)
    return SafeServer.safes[tonumber(safeId)]
end

local function getCitizenId(src)
    local player = exports.qbx_core:GetPlayer(src)
    return player and player.PlayerData and player.PlayerData.citizenid or nil
end

local function getPlayerName(src)
    local player = exports.qbx_core:GetPlayer(src)
    return player and player.PlayerData and player.PlayerData.name or tostring(src)
end

local function sendCrackWebhook(safeId, safeName, result, coords, accessDuration, actorName, actorCitizenid)
    if not Config.Features.webhooks then return end
    local url = Config.Logging.webhooks.crack
    if not url or url == '' then url = Config.Logging.webhooks.default end
    if not url or url == '' then return end
    
    local color, message
    if result == 'succeeded' then
        color = 65280
        message = 'Break-in successful! Safe is now accessible.'
    elseif result == 'failed' then
        color = 15158332
        message = 'Break-in attempt failed.'
    else
        color = 16776960
        message = 'Break-in attempt was canceled by user.'
    end
    
    local fields = {
        { name = 'Actor', value = actorName or 'Unknown', inline = true },
        { name = 'Citizen ID', value = actorCitizenid or 'Unknown', inline = true },
        { name = 'Safe Name', value = safeName or ('Safe #' .. safeId), inline = true },
        { name = 'Result', value = result:upper(), inline = true },
        { name = 'Location', value = ('X: %.1f, Y: %.1f, Z: %.1f'):format(coords.x, coords.y, coords.z), inline = false }
    }
    
    if result == 'succeeded' and accessDuration then
        fields[#fields + 1] = { name = 'Access Duration', value = ('%s seconds'):format(accessDuration), inline = true }
    end
    
    PerformHttpRequest(url, function() end, 'POST', json.encode({
        username = 'Safe Crack Logs',
        embeds = {{
            title = ('Safe #%s • Break-in Attempt'):format(safeId),
            description = message,
            color = color,
            fields = fields,
            footer = { text = 'qbx_premium_safes' },
            timestamp = os.date('!%Y-%m-%dT%H:%M:%SZ')
        }}
    }), { ['Content-Type'] = 'application/json' })
end

local function getPlayerSourceByCitizenId(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local player = exports.qbx_core:GetPlayerByCitizenId(citizenid)
    if player and player.PlayerData then
        return player.PlayerData.source or player.PlayerData.id
    end
    for _, playerId in ipairs(GetPlayers()) do
        local src = tonumber(playerId)
        local p = exports.qbx_core:GetPlayer(src)
        if p and p.PlayerData and p.PlayerData.citizenid == citizenid then
            return src
        end
    end
    return nil
end

local function alarmDebug(message)
    if Config.Debug then
        print(('[SAFE DEBUG] %s'):format(message))
    end
end

local function alertSafeOwner(safe, burglarSrc)
    alarmDebug('--- BREAK-IN ALERT CHECK START ---')

    if not Config.AlarmUpgrade.enabled then
        alarmDebug('Alarm upgrade feature disabled in config')
        return
    end

    if not safe then
        alarmDebug('Safe reference missing during alertSafeOwner')
        return
    end

    local burglarIdentifier = getCitizenId(burglarSrc)
    alarmDebug(('Cracker Identifier: %s'):format(tostring(burglarIdentifier)))
    alarmDebug(('Owner Identifier: %s'):format(tostring(safe.owner_identifier)))
    alarmDebug(('Alarm Owned: %s'):format(tostring(safe.alarm_upgrade_owned)))
    alarmDebug(('Notify Enabled: %s'):format(tostring(Config.AlarmUpgrade.notifyOwner)))

    if safe.alarm_upgrade_owned ~= 1 then
        alarmDebug('Safe does not own the alarm upgrade')
        return
    end

    if not Config.AlarmUpgrade.notifyOwner then
        alarmDebug('Owner notify disabled in config')
        return
    end

    local ownerSrc = getPlayerSourceByCitizenId(safe.owner_identifier)
    alarmDebug(('Owner Source Found: %s'):format(tostring(ownerSrc)))

    if not ownerSrc then
        alarmDebug('Owner is not online -> no alert sent')
        return
    end

    local burglarName = 'Unknown'
    local message
    
    if safe.alarm_upgrade_owned == 1 then
        message = ('%s Safe: %s is being targeted.'):format(
            Config.AlarmUpgrade.notifyMessage or 'Your safe alarm has been triggered.',
            safe.safe_name or ('Safe #' .. tostring(safe.id))
        )
    else
        message = ('%s One of your safes is being targeted.'):format(
            Config.AlarmUpgrade.notifyMessage or 'Your safe alarm has been triggered.'
        )
    end

    TriggerClientEvent('ox_lib:notify', ownerSrc, {
        title = Config.AlarmUpgrade.label or 'Safe Alarm',
        description = message,
        type = 'warning',
        duration = 9000
    })

    alarmDebug(('ALERT SENT TO OWNER | src=%s | safeId=%s'):format(tostring(ownerSrc), tostring(safe.id)))

    if Config.AlarmUpgrade.visualEffect and Config.AlarmUpgrade.visualEffect.enabled then
        TriggerClientEvent('qbx_premium_safes:client:showAlarmFlash', ownerSrc, {
            title = Config.AlarmUpgrade.visualEffect.title or 'SAFE UNDER ATTACK',
            subtitle = Config.AlarmUpgrade.visualEffect.subtitle or ('Break-in detected at %s'):format(safe.safe_name or ('Safe #' .. tostring(safe.id))),
            duration = Config.AlarmUpgrade.visualEffect.duration or 9000,
            pulseCount = Config.AlarmUpgrade.visualEffect.pulseCount or 3,
            safeId = safe.id,
            safeName = safe.safe_name or ('Safe #' .. tostring(safe.id)),
            burglarName = 'Unknown',
            coords = vector3(safe.x, safe.y, safe.z),
            blipSeconds = Config.AlarmUpgrade.blipSeconds or 30,
            soundFile = Config.AlarmUpgrade.soundFile or 'alarm',
        })
        alarmDebug(('VISUAL ALERT TRIGGERED | ownerSrc=%s | duration=%s'):format(
            tostring(ownerSrc),
            tostring(Config.AlarmUpgrade.visualEffect.duration or 9000)
        ))
    else
        alarmDebug('Visual effect disabled -> skipping owner flash event')
    end

    if Config.Features.logs then
        MySQL.insert('INSERT INTO safe_logs (safe_id, actor_identifier, actor_name, action, message, payload) VALUES (?, ?, ?, ?, ?, ?)', {
            safe.id,
            burglarIdentifier,
            burglarName,
            'alarm_triggered',
            ('%s triggered on %s'):format(Config.AlarmUpgrade.label or 'Alarm', safe.safe_name or ('Safe #' .. tostring(safe.id))),
            json.encode({
                burglar = burglarName,
                burglarIdentifier = burglarIdentifier,
                ownerIdentifier = safe.owner_identifier
            })
        })
    end

    alarmDebug('--- BREAK-IN ALERT CHECK END ---')
end

local function addCrackLog(safeId, src, success, method, itemUsed)
    if Config.Features.crackAttemptLogs then
        MySQL.insert('INSERT INTO safe_crack_attempts (safe_id, cracker_identifier, cracker_name, success) VALUES (?, ?, ?, ?)', {
            safeId, getCitizenId(src), 'Unknown', success and 1 or 0
        })
    end

    if Config.Features.logs then
        MySQL.insert('INSERT INTO safe_logs (safe_id, actor_identifier, actor_name, action, message, payload) VALUES (?, ?, ?, ?, ?, ?)', {
            safeId,
            getCitizenId(src),
            'Unknown',
            success and 'crack_success' or 'crack_fail',
            success and 'Safe crack attempt succeeded' or 'Safe crack attempt failed',
            json.encode({ method = method, item = itemUsed })
        })
    end
end

lib.callback.register('qbx_premium_safes:server:canCrack', function(source, safeId)
    local safe = getSafe(safeId)
    if not safe or not Config.Features.breakIn or not Config.Features.codeCrackerItem then
        return false, 'Cracking is disabled.'
    end

    local cooldown = SafeServer.crackCooldowns[safeId]
    if cooldown and cooldown > os.time() then
        return false, ('Cooldown active for %s seconds.'):format(cooldown - os.time())
    end

    if not Config.Cracking.anyoneCanAttempt and next(Config.Cracking.allowedGroups) then
        local hasGroup = exports.qbx_core:HasGroup(source, Config.Cracking.allowedGroups)
        if not hasGroup then
            return false, 'You are not allowed to attempt a break-in.'
        end
    end

    if safe.owner_online_required == 1 and Config.OwnerOnlineRequirement and Config.OwnerOnlineRequirement.enabled then
        local ownerSrc = getPlayerSourceByCitizenId(safe.owner_identifier)
        if not ownerSrc then
            return false, 'The safe owner must be online to attempt a break-in.'
        end
    end

    local count = exports.ox_inventory:Search(source, 'count', Config.CodeCrackerItem)
    if not count or count < 1 then
        return false, ('Missing item: %s'):format(Config.CodeCrackerItem)
    end

    return true
end)

RegisterNetEvent('qbx_premium_safes:server:crackAttemptStarted', function(safeId)
    local src = source
    local safe = getSafe(safeId)
    if not safe then return end

    local citizenid = getCitizenId(src)

    alertSafeOwner(safe, src)

    if Config.Features.crackAlerts then
        Config.Hooks.policeAlert({
            safeId = safeId,
            playerName = 'Unknown',
            citizenid = citizenid,
            coords = vector3(safe.x, safe.y, safe.z)
        })
    end
end)

RegisterNetEvent('qbx_premium_safes:server:crackCanceled', function(safeId)
    local src = source
    local safe = getSafe(safeId)
    if not safe then return end

    local citizenid = getCitizenId(src)
    local playerName = getPlayerName(src)
    
    sendCrackWebhook(safeId, safe.safe_name, 'canceled', vector3(safe.x, safe.y, safe.z), nil, playerName, citizenid)
    
    if Config.Features.logs then
        MySQL.insert('INSERT INTO safe_logs (safe_id, actor_identifier, actor_name, action, message, payload) VALUES (?, ?, ?, ?, ?, ?)', {
            safeId,
            citizenid,
            'Unknown',
            'crack_canceled',
            'Break-in attempt was canceled by user',
            json.encode({ method = 'codecracker' })
        })
    end
end)

RegisterNetEvent('qbx_premium_safes:server:finishCrack', function(safeId, minigamePassed)
    local src = source
    local safe = getSafe(safeId)
    if not safe then return end

    local count = exports.ox_inventory:Search(src, 'count', Config.CodeCrackerItem)
    if not count or count < 1 then
        notify(src, ('Missing item: %s'):format(Config.CodeCrackerItem), 'error')
        return
    end

    if not Config.Cracking.anyoneCanAttempt and next(Config.Cracking.allowedGroups) then
        local hasGroup = exports.qbx_core:HasGroup(src, Config.Cracking.allowedGroups)
        if not hasGroup then
            notify(src, 'You are not allowed to attempt this.', 'error')
            return
        end
    end

    if safe.owner_online_required == 1 and Config.OwnerOnlineRequirement and Config.OwnerOnlineRequirement.enabled then
        local ownerSrc = getPlayerSourceByCitizenId(safe.owner_identifier)
        if not ownerSrc then
            notify(src, 'The safe owner must be online to attempt a break-in.', 'error')
            return
        end
    end

    if Config.Features.minigameHook and not Config.Hooks.minigame(src, safeId) then
        notify(src, 'Break-in minigame failed.', 'error')
        return
    end

    local successChance = Config.Cracking.successChance
    if minigamePassed == false then
        successChance = math.floor(successChance / 2)
    end

    local roll = math.random(1, 100)
    local success = roll <= successChance

    local shouldConsume = Config.Features.consumeCodeCrackerOnUse or (not success and Config.Features.consumeCodeCrackerOnFailure)
    if shouldConsume then
        local itemCount = exports.ox_inventory:Search(src, 'count', Config.CodeCrackerItem)
        if itemCount and itemCount >= 1 then
            local removed = exports.ox_inventory:RemoveItem(src, Config.CodeCrackerItem, 1)
            if Config.Debug then
                print(('[CRACK DEBUG] Codecracker removal: %s (had %s items)'):format(
                    removed and 'SUCCESS' or 'FAILED',
                    tostring(itemCount)
                ))
            end
        elseif Config.Debug then
            print(('[CRACK DEBUG] Skipped removal - item count: %s'):format(tostring(itemCount)))
        end
    end

    SafeServer.crackCooldowns[safeId] = os.time() + Config.Cracking.cooldownSeconds

    addCrackLog(safe.id, src, success, 'codecracker', Config.CodeCrackerItem)

    if success then
        local citizenid = getCitizenId(src)
        local playerName = getPlayerName(src)
        if citizenid then
            SafeServer.forcedAccess[safeId] = SafeServer.forcedAccess[safeId] or {}
            SafeServer.forcedAccess[safeId][citizenid] = os.time() + Config.Security.forcedAccess.withdrawSeconds
        end
        
        sendCrackWebhook(safeId, safe.safe_name, 'succeeded', vector3(safe.x, safe.y, safe.z), Config.Security.forcedAccess.withdrawSeconds, playerName, citizenid)
        
        notify(src, Lang.notify.cracking_success, 'success')
        TriggerClientEvent('qbx_premium_safes:client:crackResult', src, true, safeId)
        return
    end

    local citizenid = getCitizenId(src)
    local playerName = getPlayerName(src)
    sendCrackWebhook(safeId, safe.safe_name, 'failed', vector3(safe.x, safe.y, safe.z), nil, playerName, citizenid)

    notify(src, Lang.notify.cracking_failed, 'error')
    TriggerClientEvent('qbx_premium_safes:client:crackResult', src, false, safeId)

    if citizenid and SafeServer.forcedAccess[safeId] then
        SafeServer.forcedAccess[safeId][citizenid] = nil
    end
end)
