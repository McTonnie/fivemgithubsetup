
local function notify(src, description, nType)
    TriggerClientEvent('ox_lib:notify', src, {
        description = description,
        type = nType or 'inform'
    })
end

local function getCitizenId(src)
    local player = exports.qbx_core:GetPlayer(src)
    return player and player.PlayerData and player.PlayerData.citizenid or nil
end

local function getPlayerName(src)
    local player = exports.qbx_core:GetPlayer(src)
    if not player or not player.PlayerData then return tostring(src) end
    local charinfo = player.PlayerData.charinfo or {}
    local full = ((charinfo.firstname or '') .. ' ' .. (charinfo.lastname or '')):gsub('^%s+', ''):gsub('%s+$', '')
    return full ~= '' and full or player.PlayerData.name or tostring(src)
end

local function debugAccessCheck(src, safe, citizenid)
    if not Config.Debug then return end
    local playerName = getPlayerName(src)
    print(('^3[DEBUG ACCESS]^7 Player: %s | citizenid: %s | owner_identifier: %s | match: %s | access_upgrade: %s | access_upgrade_type: %s'):format(
        playerName,
        tostring(citizenid),
        tostring(safe.owner_identifier),
        tostring(citizenid == safe.owner_identifier),
        tostring(safe.access_upgrade_owned),
        type(safe.access_upgrade_owned)
    ))
end

local function buildCharacterName(playerData)
    if not playerData then return nil end
    local charinfo = playerData.charinfo or {}
    local full = ((charinfo.firstname or '') .. ' ' .. (charinfo.lastname or '')):gsub('^%s+', ''):gsub('%s+$', '')
    return full ~= '' and full or playerData.name
end

local function addLog(safeId, citizenid, playerName, action, message, payload)
    if not Config.Features.logs then return end
    MySQL.insert('INSERT INTO safe_logs (safe_id, actor_identifier, actor_name, action, message, payload) VALUES (?, ?, ?, ?, ?, ?)', {
        safeId, citizenid or 'system', playerName or 'System', action, message, json.encode(payload or {})
    })
end

local function getSafeAccess(safeId)
    return MySQL.query.await('SELECT * FROM safe_access WHERE safe_id = ? ORDER BY player_name ASC', { safeId }) or {}
end

local function getSafeContributions(safeId)
    return MySQL.query.await('SELECT * FROM safe_contributions WHERE safe_id = ? ORDER BY citizenid ASC, item_name ASC', { safeId }) or {}
end

local function updateAccessCache(safe)
    safe.access = getSafeAccess(safe.id)
end

SafeServer = SafeServer or {}
SafeServer.safes = {}
SafeServer.crackCooldowns = {}
SafeServer.forcedAccess = {}
SafeServer.stashSessions = {}

local function getTierConfig(tier)
    return Config.StorageTiers.tiers[tier] or Config.StorageTiers.tiers[1]
end

local function mapSafe(row)
    if not row then return nil end
    local safe = {
        id = row.id,
        owner_identifier = row.owner_identifier,
        owner_name = row.owner_name,
        safe_name = row.safe_name,
        model = row.model,
        x = row.x,
        y = row.y,
        z = row.z,
        heading = row.heading,
        stash_token = row.stash_token,
        slots = row.slots,
        max_weight = row.max_weight,
        storage_tier = row.storage_tier or 1,
        alarm_upgrade_owned = row.alarm_upgrade_owned == 1,
        owner_online_required = row.owner_online_required == 1,
        tracking_upgrade_owned = row.tracking_upgrade_owned == 1,
        access_upgrade_owned = row.access_upgrade_owned == 1,
        tracking_enabled = row.tracking_enabled == 1,
        assigned_group_type = row.assigned_group_type,
        assigned_group_name = row.assigned_group_name,
        is_placed = row.is_placed == 1,
        period_days = row.period_days or Config.Tracking.defaultPeriodDays,
        period_start = row.period_start,
    }
    safe.access = getSafeAccess(safe.id)
    return safe
end

local function loadSafes()
    local rows = MySQL.query.await('SELECT * FROM safes WHERE is_placed = 1', {}) or {}
    Safes = {}
    for _, row in ipairs(rows) do
        local safe = mapSafe(row)
        if safe then
            Safes[safe.id] = safe
        end
    end
end

local function broadcastSafeState()
    local data = {}
    for _, safe in pairs(Safes) do
        data[#data + 1] = {
            id = safe.id,
            coords = vector3(safe.x, safe.y, safe.z),
            model = safe.model,
            heading = safe.heading
        }
    end
    TriggerClientEvent('qbx_premium_safes:client:syncSafes', -1, data)
end

function SafeServer.refreshDashboard(safeId)
    local safe = Safes[safeId]
    if not safe then return end
    local players = GetPlayers()
    for _, playerId in ipairs(players) do
        local src = tonumber(playerId)
        if src then
            TriggerClientEvent('qbx_premium_safes:client:refreshDashboard', src, safeId)
        end
    end
end

lib.callback.register('qbx_premium_safes:server:getSafeStates', function(source)
    local payload = {}
    for _, safe in pairs(Safes) do
        payload[#payload + 1] = {
            id = safe.id,
            coords = vector3(safe.x, safe.y, safe.z),
            model = safe.model,
            heading = safe.heading
        }
    end
    return payload
end)

local function sendDashboardToPlayer(src, safe)
    local citizenid = getCitizenId(src)
    if not citizenid then return end
    
    local isOwner = citizenid == safe.owner_identifier
    local hasManage = false
    local hasDeposit = isOwner
    local hasWithdraw = isOwner
    local hasViewLogs = isOwner
    local hasViewProgress = isOwner
    
    if not isOwner and safe.access then
        for _, entry in ipairs(safe.access) do
            if entry.player_identifier == citizenid then
                hasDeposit = entry.can_deposit == 1
                hasWithdraw = entry.can_withdraw == 1
                hasManage = entry.can_manage == 1
                hasViewLogs = entry.can_view_logs == 1
                hasViewProgress = entry.can_view_progress == 1
                break
            end
        end
    end
    
    local canViewLogs = Config.Features.logs and hasViewLogs
    
    local tier = getTierConfig(safe.storage_tier or 1)
    
    local dashboard = {
        safe = {
            id = safe.id,
            name = safe.safe_name,
            owner = safe.owner_name,
            slots = safe.slots,
            maxWeight = safe.max_weight,
            storageTier = safe.storage_tier or 1,
            alarmOwned = safe.alarm_upgrade_owned,
            ownerOnlineRequired = safe.owner_online_required,
            trackingOwned = safe.tracking_upgrade_owned,
            accessOwned = safe.access_upgrade_owned,
            trackingEnabled = safe.tracking_enabled,
            assignedGroupType = safe.assigned_group_type,
            assignedGroupName = safe.assigned_group_name,
            periodDays = safe.period_days,
            periodStart = safe.period_start,
        },
        access = {
            canDeposit = hasDeposit,
            canWithdraw = hasWithdraw,
            canManage = hasManage or isOwner,
            canViewLogs = hasViewLogs,
            canViewProgress = hasViewProgress,
            isOwner = isOwner,
        },
        upgrades = {
            storage = {
                current = safe.storage_tier or 1,
                maxSlots = safe.slots,
                maxWeight = safe.max_weight,
            },
            alarm = {
                owned = safe.alarm_upgrade_owned,
                price = Config.AlarmUpgrade.price,
            },
            ownerOnline = {
                owned = safe.owner_online_required,
                price = Config.OwnerOnlineRequirement.price,
            },
            tracking = {
                owned = safe.tracking_upgrade_owned,
                price = Config.TrackingUpgrade.price,
            },
            access = {
                owned = safe.access_upgrade_owned,
                price = Config.AccessUpgrade.price,
            },
        },
        members = safe.access or {},
        logs = canViewLogs and (MySQL.query.await('SELECT * FROM safe_logs WHERE safe_id = ? ORDER BY id DESC LIMIT 50', { safe.id }) or {}) or {},
        contributions = getSafeContributions(safe.id),
    }
    
    TriggerClientEvent('qbx_premium_safes:client:openDashboard', src, dashboard)
end

lib.callback.register('qbx_premium_safes:server:getDashboard', function(source, safeId)
    local safe = Safes[tonumber(safeId)]
    if not safe then return nil end
    sendDashboardToPlayer(source, safe)
    return true
end)

lib.callback.register('qbx_premium_safes:server:getSafeAccess', function(source, safeId)
    local safe = Safes[tonumber(safeId)]
    if not safe then return nil end
    
    local citizenid = getCitizenId(source)
    if not citizenid then return nil end
    
    local isOwner = citizenid == safe.owner_identifier
    local hasWithdraw = isOwner
    local hasDeposit = isOwner
    
    local hasAccessUpgrade = safe.access_upgrade_owned == 1 or safe.access_upgrade_owned == true
    
    if not isOwner and hasAccessUpgrade and safe.access then
        for _, entry in ipairs(safe.access) do
            if entry.player_identifier == citizenid then
                hasDeposit = entry.can_deposit == 1
                hasWithdraw = entry.can_withdraw == 1
                break
            end
        end
    elseif not isOwner and not hasAccessUpgrade then
        hasDeposit = true
        hasWithdraw = true
    end
    
    return {
        canWithdraw = hasWithdraw,
        canDeposit = hasDeposit,
        isOwner = isOwner
    }
end)

function SafeServer.canPerform(src, safe, action)
    if not safe then return false end
    local citizenid = getCitizenId(src)
    if not citizenid then return false end
    
    if citizenid == safe.owner_identifier then return true end
    
    local forcedExpiry = SafeServer.forcedAccess[safe.id] and SafeServer.forcedAccess[safe.id][citizenid]
    if forcedExpiry and forcedExpiry > os.time() then
        if action == 'withdraw' or action == 'deposit' then
            return true
        end
    end
    
    if not safe.access then return false end
    
    for _, entry in ipairs(safe.access) do
        if entry.player_identifier == citizenid then
            if action == 'deposit' and entry.can_deposit == 1 then return true end
            if action == 'withdraw' and entry.can_withdraw == 1 then return true end
            if action == 'manage' and entry.can_manage == 1 then return true end
            if action == 'view_logs' and entry.can_view_logs == 1 then return true end
            if action == 'view_progress' and entry.can_view_progress == 1 then return true end
        end
    end
    
    return false
end

RegisterNetEvent('qbx_premium_safes:server:openStash', function(safeId)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    local citizenid = getCitizenId(src)
    if not citizenid then
        notify(src, 'Unable to identify player.', 'error')
        return
    end
    
    debugAccessCheck(src, safe, citizenid)
    
    local isOwner = citizenid == safe.owner_identifier
    local canAccess = isOwner

    local hasAccessUpgrade = safe.access_upgrade_owned == 1 or safe.access_upgrade_owned == true

    if hasAccessUpgrade and not canAccess then
        if safe.access then
            for _, entry in ipairs(safe.access) do
                if entry.player_identifier == citizenid then
                    canAccess = entry.can_deposit == 1 or entry.can_withdraw == 1
                    break
                end
            end
        end
    elseif not hasAccessUpgrade and not canAccess then
        canAccess = true
    end
    
    if not canAccess then
        notify(src, 'You do not have access to this safe.', 'error')
        return
    end
    
    if Config.Debug then
        print(('[DEBUG STASH] safe=%s | owner=%s | citizenid=%s | hasAccessUpgrade=%s | canAccess=%s'):format(
            safe.id, tostring(isOwner), citizenid, tostring(hasAccessUpgrade), tostring(canAccess)
        ))
    end
    
    local forcedExpiry = SafeServer.forcedAccess[safe.id] and SafeServer.forcedAccess[safe.id][citizenid]
    local isForcedAccess = forcedExpiry and forcedExpiry > os.time()
    
    local displayName
    if isForcedAccess then
        displayName = 'Unknown'
    else
        displayName = getPlayerName(src)
    end
    
    exports.ox_inventory:RegisterStash(safe.stash_token, safe.safe_name, safe.slots, safe.max_weight)
    
    TriggerEvent('ox_inventory:openInventory', 'stash', safe.stash_token)
    
    addLog(safe.id, citizenid, displayName, 'open_stash', 'Opened stash', {})
end)

RegisterNetEvent('qbx_premium_safes:server:pickupSafe', function(safeId)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    local citizenid = getCitizenId(src)
    if not citizenid then
        notify(src, 'Unable to identify player.', 'error')
        return
    end
    
    if citizenid ~= safe.owner_identifier then
        notify(src, 'Only the owner can pick up the safe.', 'error')
        return
    end
    
    local upgradeCount = 0
    if safe.storage_tier and safe.storage_tier > 1 then upgradeCount = upgradeCount + (safe.storage_tier - 1) end
    if safe.alarm_upgrade_owned then upgradeCount = upgradeCount + 1 end
    if safe.owner_online_required then upgradeCount = upgradeCount + 1 end
    if safe.tracking_upgrade_owned then upgradeCount = upgradeCount + 1 end
    if safe.access_upgrade_owned then upgradeCount = upgradeCount + 1 end
    
    local weight = Config.Safes.baseWeight + (upgradeCount * Config.Safes.weightPerUpgrade)
    weight = math.min(weight, Config.Safes.maxItemWeight)
    
    local inventory = exports.ox_inventory:GetInventory(src)
    local currentWeight = inventory and inventory.weight or 0
    local maxWeight = inventory and inventory.maxWeight or 0
    
    if currentWeight + weight > maxWeight then
        notify(src, 'Not enough inventory space to carry this safe.', 'error')
        return
    end
    
    local metadata = {
        safeId = safe.id,
        weight = weight,
        description = safe.safe_name
    }
    
    local added = exports.ox_inventory:AddItem(src, Config.SafeItem, 1, metadata)
    if not added then
        notify(src, 'Failed to pick up safe.', 'error')
        return
    end
    
    MySQL.update.await('UPDATE safes SET is_placed = 0 WHERE id = ?', { safe.id })
    
    Safes[safe.id] = nil
    
    addLog(safe.id, citizenid, getPlayerName(src), 'safe_picked_up', 'Safe picked up', { weight = weight })
    
    TriggerClientEvent('qbx_premium_safes:client:safeRemoved', -1, safeId)
    notify(src, 'Safe picked up successfully.', 'success')
    
    broadcastSafeState()
end)

function SafeServer.forceRemoveSafe(safeId, src, keepItems)
    local safe = Safes[safeId]
    if not safe then
        safe = Safes[safeId]
    end
    if not safe then return false, 'Safe not found' end
    
    if src and src > 0 then
        local citizenid = getCitizenId(src)
        addLog(safeId, citizenid or 'admin', getPlayerName(src) or 'Admin', 'force_removed', 'Safe force removed by admin', {})
    end
    
    MySQL.update.await('DELETE FROM safe_access WHERE safe_id = ?', { safeId })
    MySQL.update.await('DELETE FROM safe_logs WHERE safe_id = ?', { safeId })
    MySQL.update.await('DELETE FROM safe_contributions WHERE safe_id = ?', { safeId })
    MySQL.update.await('DELETE FROM safe_tracked_items WHERE safe_id = ?', { safeId })
    MySQL.update.await('DELETE FROM safe_tracker WHERE safe_id = ?', { safeId })
    MySQL.update.await('DELETE FROM safe_tracker_progress WHERE safe_id = ?', { safeId })
    MySQL.update.await('DELETE FROM safe_tracker_archive WHERE safe_id = ?', { safeId })
    MySQL.update.await('DELETE FROM safes WHERE id = ?', { safeId })
    
    Safes[safeId] = nil
    
    TriggerClientEvent('qbx_premium_safes:client:safeRemoved', -1, safeId)
    
    return true
end

lib.callback.register('qbx_premium_safes:server:placeSafe', function(source, payload)
    local src = source
    local citizenid = getCitizenId(src)
    if not citizenid then
        return false, 'Unable to identify player.'
    end
    
    local playerName = getPlayerName(src)
    local coords = payload.coords
    local heading = payload.heading or 0.0
    local modelName = payload.model
    local safeName = payload.safeName or ('Safe')
    local safeId = payload.safeId
    
    local stashToken = ('safe_%s'):format(SafeShared.RandomToken(32))
    local tier = getTierConfig(1)
    
    if safeId then
        local existingSafe = MySQL.single.await('SELECT * FROM safes WHERE id = ?', { safeId })
        if existingSafe then
            MySQL.update.await('UPDATE safes SET x = ?, y = ?, z = ?, heading = ?, model = ?, safe_name = ?, owner_identifier = ?, owner_name = ?, is_placed = 1 WHERE id = ?', {
                coords.x, coords.y, coords.z, heading, modelName, safeName, citizenid, playerName, safeId
            })
            
            local updatedSafe = MySQL.single.await('SELECT * FROM safes WHERE id = ?', { safeId })
            if updatedSafe then
                local safe = mapSafe(updatedSafe)
                Safes[safe.id] = safe
                
                TriggerClientEvent('qbx_premium_safes:client:safeSpawned', -1, {
                    id = safe.id,
                    coords = vector3(safe.x, safe.y, safe.z),
                    model = safe.model,
                    heading = safe.heading
                })
                
                addLog(safe.id, citizenid, playerName, 'safe_relocated', 'Safe relocated', { coords = coords })
                notify(src, 'Safe placed successfully.', 'success')
                broadcastSafeState()
                
                if Config.Hooks.onSafePlaced then
                    Config.Hooks.onSafePlaced(safe)
                end
                
                return true, { id = safe.id }
            end
        end
    end
    
    local id = MySQL.insert.await([[INSERT INTO safes
        (owner_identifier, owner_name, safe_name, model, x, y, z, heading, stash_token, slots, max_weight, storage_tier, alarm_upgrade_owned, owner_online_required, tracking_upgrade_owned, access_upgrade_owned, tracking_enabled, is_placed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 0, ?, 1)]], {
        citizenid, playerName, safeName, modelName, coords.x, coords.y, coords.z, heading, stashToken, tier.slots, tier.maxWeight, Config.Tracking.enabledByDefault and 1 or 0
    })
    
    if not id then
        return false, 'Failed to place safe.'
    end
    
    local safe = mapSafe(MySQL.single.await('SELECT * FROM safes WHERE id = ?', { id }))
    Safes[safe.id] = safe
    
    TriggerClientEvent('qbx_premium_safes:client:safeSpawned', -1, {
        id = safe.id,
        coords = vector3(safe.x, safe.y, safe.z),
        model = safe.model,
        heading = safe.heading
    })
    
    addLog(safe.id, citizenid, playerName, 'safe_placed', 'Safe placed', { coords = coords })
    notify(src, 'Safe placed successfully.', 'success')
    broadcastSafeState()
    
    if Config.Hooks.onSafePlaced then
        Config.Hooks.onSafePlaced(safe)
    end
    
    return true, { id = safe.id }
end)

RegisterNetEvent('qbx_premium_safes:server:updateTrackedItems', function(safeId, trackedItems)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    if getCitizenId(src) ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'No access.', 'error')
        return
    end
    
    MySQL.update.await('DELETE FROM safe_tracked_items WHERE safe_id = ?', { safe.id })
    
    for _, item in ipairs(trackedItems or {}) do
        if item.item and item.item ~= '' then
            MySQL.insert.await('INSERT INTO safe_tracked_items (safe_id, item_name, required_amount) VALUES (?, ?, ?)', { safe.id, item.item, item.required or 0 })
        end
    end
    
    addLog(safe.id, getCitizenId(src), getPlayerName(src), 'tracked_items_update', 'Tracked items updated', { trackedItems = trackedItems })
    notify(src, 'Tracked items updated.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:updateSettings', function(safeId, changes)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    if getCitizenId(src) ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'No access.', 'error')
        return
    end
    
    safe.tracking_enabled = changes.trackingEnabled and true or false
    safe.assigned_group_type = changes.assignedGroupType ~= '' and changes.assignedGroupType or nil
    safe.assigned_group_name = changes.assignedGroupName ~= '' and changes.assignedGroupName or nil
    
    MySQL.update.await('UPDATE safes SET tracking_enabled = ?, assigned_group_type = ?, assigned_group_name = ?, updated_at = NOW() WHERE id = ?', {
        safe.tracking_enabled and 1 or 0, safe.assigned_group_type, safe.assigned_group_name, safe.id
    })
    
    addLog(safe.id, getCitizenId(src), getPlayerName(src), 'settings_update', 'Safe settings updated', changes)
    notify(src, 'Settings saved.', 'success')
    SafeServer.refreshDashboard(safe.id)
    broadcastSafeState()
end)

RegisterNetEvent('qbx_premium_safes:server:upgradeStorage', function(safeId, targetTier)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    local citizenid = getCitizenId(src)
    if not citizenid then
        notify(src, 'Unable to identify player.', 'error')
        return
    end
    
    if citizenid ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can upgrade storage.', 'error')
        return
    end
    
    local currentTier = safe.storage_tier or 1
    if targetTier <= currentTier then
        notify(src, 'Cannot downgrade storage.', 'error')
        return
    end
    
    local tier = getTierConfig(targetTier)
    if not tier then
        notify(src, 'Invalid tier.', 'error')
        return
    end
    
    local currency = Config.StorageTiers.currency
    local price = tier.price
    
    local player = exports.qbx_core:GetPlayer(src)
    if not player then
        notify(src, 'Player not found.', 'error')
        return
    end
    
    local money = player.Functions.GetMoney(currency)
    if not money or money < price then
        notify(src, ('Not enough %s. Need %s'):format(currency, price), 'error')
        return
    end
    
    player.Functions.RemoveMoney(currency, price)
    
    MySQL.update.await('UPDATE safes SET storage_tier = ?, slots = ?, max_weight = ?, updated_at = NOW() WHERE id = ?', { targetTier, tier.slots, tier.maxWeight, safe.id })
    
    safe.storage_tier = targetTier
    safe.slots = tier.slots
    safe.max_weight = tier.maxWeight
    
    addLog(safe.id, citizenid, getPlayerName(src), 'storage_upgrade', ('Storage upgraded to Tier %s'):format(targetTier), { tier = targetTier, price = price })
    notify(src, ('Storage upgraded to Tier %s'):format(targetTier), 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:buyAlarmUpgrade', function(safeId)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    local citizenid = getCitizenId(src)
    if not citizenid then
        notify(src, 'Unable to identify player.', 'error')
        return
    end
    
    if citizenid ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can buy upgrades.', 'error')
        return
    end
    
    if safe.alarm_upgrade_owned == 1 then
        notify(src, 'Alarm upgrade already owned.', 'error')
        return
    end
    
    local currency = Config.AlarmUpgrade.currency
    local price = Config.AlarmUpgrade.price
    
    local player = exports.qbx_core:GetPlayer(src)
    if not player then
        notify(src, 'Player not found.', 'error')
        return
    end
    
    local money = player.Functions.GetMoney(currency)
    if not money or money < price then
        notify(src, ('Not enough %s. Need %s'):format(currency, price), 'error')
        return
    end
    
    player.Functions.RemoveMoney(currency, price)
    
    MySQL.update.await('UPDATE safes SET alarm_upgrade_owned = 1, updated_at = NOW() WHERE id = ?', { safe.id })
    
    safe.alarm_upgrade_owned = true
    
    addLog(safe.id, citizenid, getPlayerName(src), 'alarm_upgrade', 'Silent alarm purchased', { price = price })
    notify(src, 'Silent alarm purchased.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:buyOwnerOnlineRequirement', function(safeId)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    local citizenid = getCitizenId(src)
    if not citizenid then
        notify(src, 'Unable to identify player.', 'error')
        return
    end
    
    if citizenid ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can buy upgrades.', 'error')
        return
    end
    
    if safe.owner_online_required == 1 then
        notify(src, 'Owner online requirement already owned.', 'error')
        return
    end
    
    local currency = Config.OwnerOnlineRequirement.currency
    local price = Config.OwnerOnlineRequirement.price
    
    local player = exports.qbx_core:GetPlayer(src)
    if not player then
        notify(src, 'Player not found.', 'error')
        return
    end
    
    local money = player.Functions.GetMoney(currency)
    if not money or money < price then
        notify(src, ('Not enough %s. Need %s'):format(currency, price), 'error')
        return
    end
    
    player.Functions.RemoveMoney(currency, price)
    
    MySQL.update.await('UPDATE safes SET owner_online_required = 1, updated_at = NOW() WHERE id = ?', { safe.id })
    
    safe.owner_online_required = true
    
    addLog(safe.id, citizenid, getPlayerName(src), 'owner_online_upgrade', 'Owner online requirement purchased', { price = price })
    notify(src, 'Owner online requirement purchased.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:buyTrackingUpgrade', function(safeId)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    local citizenid = getCitizenId(src)
    if not citizenid then
        notify(src, 'Unable to identify player.', 'error')
        return
    end
    
    if citizenid ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can buy upgrades.', 'error')
        return
    end
    
    if safe.tracking_upgrade_owned == 1 then
        notify(src, 'Tracking upgrade already owned.', 'error')
        return
    end
    
    local currency = Config.TrackingUpgrade.currency
    local price = Config.TrackingUpgrade.price
    
    local player = exports.qbx_core:GetPlayer(src)
    if not player then
        notify(src, 'Player not found.', 'error')
        return
    end
    
    local money = player.Functions.GetMoney(currency)
    if not money or money < price then
        notify(src, ('Not enough %s. Need %s'):format(currency, price), 'error')
        return
    end
    
    player.Functions.RemoveMoney(currency, price)
    
    MySQL.update.await('UPDATE safes SET tracking_upgrade_owned = 1, updated_at = NOW() WHERE id = ?', { safe.id })
    
    safe.tracking_upgrade_owned = true
    
    addLog(safe.id, citizenid, getPlayerName(src), 'tracking_upgrade', 'Tracking upgrade purchased', { price = price })
    notify(src, 'Tracking upgrade purchased.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:buyAccessUpgrade', function(safeId)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    local citizenid = getCitizenId(src)
    if not citizenid then
        notify(src, 'Unable to identify player.', 'error')
        return
    end
    
    if citizenid ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can buy upgrades.', 'error')
        return
    end
    
    if safe.access_upgrade_owned == 1 then
        notify(src, 'Access control already owned.', 'error')
        return
    end
    
    local currency = Config.AccessUpgrade.currency
    local price = Config.AccessUpgrade.price
    
    local player = exports.qbx_core:GetPlayer(src)
    if not player then
        notify(src, 'Player not found.', 'error')
        return
    end
    
    local money = player.Functions.GetMoney(currency)
    if not money or money < price then
        notify(src, ('Not enough %s. Need %s'):format(currency, price), 'error')
        return
    end
    
    player.Functions.RemoveMoney(currency, price)
    
    MySQL.update.await('UPDATE safes SET access_upgrade_owned = 1, updated_at = NOW() WHERE id = ?', { safe.id })
    
    safe.access_upgrade_owned = true
    
    addLog(safe.id, citizenid, getPlayerName(src), 'access_upgrade', 'Access control purchased', { price = price })
    notify(src, 'Access control purchased.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:addMemberToAccess', function(safeId, targetCitizenId)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    local citizenid = getCitizenId(src)
    if not citizenid then return end
    
    if citizenid ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can add access.', 'error')
        return
    end
    
    local playerName = targetCitizenId
    local targetPlayer = exports.qbx_core:GetPlayerByCitizenId(targetCitizenId)
    if targetPlayer then
        playerName = buildCharacterName(targetPlayer.PlayerData) or targetCitizenId
    end
    
    MySQL.insert.await('INSERT INTO safe_access (safe_id, player_identifier, player_name, can_deposit, can_withdraw, can_manage, can_view_logs, can_view_progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE player_name = VALUES(player_name), can_deposit = VALUES(can_deposit), can_withdraw = VALUES(can_withdraw), can_manage = VALUES(can_manage), can_view_logs = VALUES(can_view_logs), can_view_progress = VALUES(can_view_progress)', {
        safe.id, targetCitizenId, playerName, 1, 0, 0, 0, 0
    })
    
    updateAccessCache(safe)
    addLog(safe.id, citizenid, getPlayerName(src), 'access_add', ('Added %s to access list'):format(playerName), { identifier = targetCitizenId })
    notify(src, 'User added to access list.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:updateMemberPermissions', function(safeId, identifier, permissions)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    if getCitizenId(src) ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can edit permissions.', 'error')
        return
    end
    
    MySQL.update.await('UPDATE safe_access SET can_deposit = ?, can_withdraw = ?, can_manage = ?, can_view_logs = ?, can_view_progress = ? WHERE safe_id = ? AND player_identifier = ?', {
        permissions.deposit and 1 or 0,
        permissions.withdraw and 1 or 0,
        permissions.manage and 1 or 0,
        permissions.logs and 1 or 0,
        permissions.viewProgress and 1 or 0,
        safe.id,
        identifier
    })
    
    updateAccessCache(safe)
    addLog(safe.id, getCitizenId(src), getPlayerName(src), 'permissions_update', ('Updated permissions for %s'):format(identifier), permissions)
    notify(src, 'Permissions updated.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:removeAllowedUser', function(safeId, identifier)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    if getCitizenId(src) ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can remove access.', 'error')
        return
    end
    
    MySQL.query.await('DELETE FROM safe_access WHERE safe_id = ? AND player_identifier = ?', { safe.id, identifier })
    
    updateAccessCache(safe)
    addLog(safe.id, getCitizenId(src), getPlayerName(src), 'access_remove', ('Removed %s from access list'):format(identifier), { identifier = identifier })
    notify(src, 'User removed from access list.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterNetEvent('qbx_premium_safes:server:resetProgress', function(safeId)
    local src = source
    local safe = Safes[tonumber(safeId)]
    if not safe then return end
    
    if getCitizenId(src) ~= safe.owner_identifier and not SafeServer.canPerform(src, safe, 'manage') then
        notify(src, 'Only the owner or manager can reset progress.', 'error')
        return
    end
    
    MySQL.update.await('DELETE FROM safe_contributions WHERE safe_id = ?', { safe.id })
    
    addLog(safe.id, getCitizenId(src), getPlayerName(src), 'progress_reset', 'Progress reset', {})
    notify(src, 'Progress reset.', 'success')
    SafeServer.refreshDashboard(safe.id)
end)

RegisterCommand(Config.Commands.inspect, function(source, args)
    if source == 0 then return end
    
    local src = source
    local ped = GetPlayerPed(src)
    local coords = GetEntityCoords(ped)
    
    local nearestSafe = nil
    local nearestDist = Config.Admin.inspectRange + 1.0
    
    for id, safe in pairs(Safes) do
        local dist = #(coords - vector3(safe.x, safe.y, safe.z))
        if dist < nearestDist then
            nearestDist = dist
            nearestSafe = safe
        end
    end
    
    if not nearestSafe then
        notify(src, 'No safe found nearby.', 'error')
        return
    end
    
    sendDashboardToPlayer(src, nearestSafe)
end, false)

RegisterCommand('deleteallsafes', function(source, args, raw)
    if source ~= 0 then return end
    
    local confirm = args[1]
    if confirm ~= 'confirm' then
        print('^1[USAGE]^7 deleteallsafes confirm')
        print('^3[WARNING]^7 This will permanently delete ALL safes from the database.')
        return
    end
    
    MySQL.transaction.await({
        { query = 'DELETE FROM safe_tracker_archive' },
        { query = 'DELETE FROM safe_tracker_progress' },
        { query = 'DELETE FROM safe_tracker' },
        { query = 'DELETE FROM safe_tracked_items' },
        { query = 'DELETE FROM safe_contributions' },
        { query = 'DELETE FROM safe_logs' },
        { query = 'DELETE FROM safe_crack_attempts' },
        { query = 'DELETE FROM safe_access' },
        { query = 'DELETE FROM safes' },
    })
    
    Safes = {}
    SafeServer.safes = {}
    
    print('^2[SUCCESS]^7 All safes have been deleted from the database.')
    broadcastSafeState()
end, true)

AddEventHandler('onResourceStart', function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    
    Wait(500)
    
    if RunMigrations then
        RunMigrations()
    end
    
    loadSafes()
    broadcastSafeState()
    
    print(('^2[qbx_premium_safes]^7 Loaded %d safes'):format(#(Safes or {})))
end)

AddEventHandler('playerDropped', function(reason)
    local src = source
    local citizenid = getCitizenId(src)
    
    for safeId, access in pairs(SafeServer.forcedAccess) do
        if access[citizenid] then
            SafeServer.forcedAccess[safeId][citizenid] = nil
        end
    end
    
    for sessionKey, session in pairs(SafeServer.stashSessions or {}) do
        if session.citizenid == citizenid then
            SafeServer.stashSessions[sessionKey] = nil
        end
    end
end)

Safes = Safes or {}
