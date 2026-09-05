

local function getSafeByStashToken(stashToken)
    for _, safe in pairs(SafeServer.safes) do
        if safe.stash_token == stashToken then return safe end
    end
end

local function isLeader(safe, src)
    local citizenid
    if src == 0 then
        return true
    else
        local player = exports.qbx_core:GetPlayer(src)
        citizenid = player and player.PlayerData and player.PlayerData.citizenid
    end
    if not citizenid then return false end
    if citizenid == safe.owner_identifier then return true end
    return SafeServer.canPerform and SafeServer.canPerform(src, safe, 'manage') or false
end

local function hasViewProgress(safe, src)
    if isLeader(safe, src) then return true end
    local player = exports.qbx_core:GetPlayer(src)
    local citizenid = player and player.PlayerData and player.PlayerData.citizenid
    if not citizenid then return false end
    if safe.access then
        for _, entry in ipairs(safe.access) do
            if entry.player_identifier == citizenid and entry.can_view_progress == 1 then
                return true
            end
        end
    end
    return false
end

-- Per-safe tracked items (stored in database)
local function getTrackedItemsForSafe(safeId)
    local rows = MySQL.query.await('SELECT item_name, required_amount FROM safe_tracked_items WHERE safe_id = ?', { safeId }) or {}
    local items = {}
    for _, row in ipairs(rows) do
        items[#items + 1] = { item = row.item_name, required = row.required_amount or 0 }
    end
    return items
end

local function setTrackedItemsForSafe(safeId, items)
    MySQL.update.await('DELETE FROM safe_tracked_items WHERE safe_id = ?', { safeId })
    for _, item in ipairs(items or {}) do
        if item.item and item.item ~= '' then
            MySQL.insert.await('INSERT INTO safe_tracked_items (safe_id, item_name, required_amount) VALUES (?, ?, ?)', { safeId, item.item, item.required or 0 })
        end
    end
end

local function calculateItemPercentages(items)
    local totalRequired = 0
    for _, item in ipairs(items or {}) do
        totalRequired = totalRequired + (item.required or 0)
    end
    if totalRequired == 0 then return {} end
    
    local percentages = {}
    for _, item in ipairs(items or {}) do
        percentages[item.item] = ((item.required or 0) / totalRequired) * 100
    end
    return percentages
end

local function getRequiredForItem(items, itemName)
    for _, item in ipairs(items or {}) do
        if item.item == itemName then
            return item.required or 0
        end
    end
    return 0
end

local function isItemTracked(items, itemName)
    for _, item in ipairs(items or {}) do
        if item.item == itemName then return true end
    end
    return false
end

local function getMemberProgress(safeId, memberName)
    local rows = MySQL.query.await('SELECT item_name, amount, period_start FROM safe_tracker_progress WHERE safe_id = ? AND member_name = ?', { safeId, memberName })
    local progress = {}
    for _, row in ipairs(rows) do
        progress[row.item_name] = {
            amount = row.amount,
            period_start = row.period_start
        }
    end
    return progress
end

local function getAllMemberProgress(safeId)
    local rows = MySQL.query.await('SELECT member_name, item_name, amount FROM safe_tracker_progress WHERE safe_id = ?', { safeId })
    local members = {}
    for _, row in ipairs(rows) do
        if not members[row.member_name] then
            members[row.member_name] = {}
        end
        members[row.member_name][row.item_name] = row.amount
    end
    return members
end

local function upsertProgress(safeId, memberName, itemName, amount)
    local existing = MySQL.single.await('SELECT id, amount FROM safe_tracker_progress WHERE safe_id = ? AND member_name = ? AND item_name = ?', { safeId, memberName, itemName })
    local newAmount
    if existing then
        newAmount = math.max(0, (existing.amount or 0) + amount)
        MySQL.update.await('UPDATE safe_tracker_progress SET amount = ? WHERE id = ?', { newAmount, existing.id })
    else
        newAmount = math.max(0, amount)
        MySQL.insert.await('INSERT INTO safe_tracker_progress (safe_id, member_name, item_name, amount) VALUES (?, ?, ?, ?)', { safeId, memberName, itemName, newAmount })
    end
    return newAmount
end

local function setProgress(safeId, memberName, itemName, amount)
    MySQL.rawExecute.await([[
        INSERT INTO safe_tracker_progress (safe_id, member_name, item_name, amount)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE amount = ?
    ]], { safeId, memberName, itemName, amount, amount })
end

local function getLinkedMember(safeId, citizenid)
    return MySQL.single.await('SELECT member_name FROM safe_tracker WHERE safe_id = ? AND linked_citizenid = ?', { safeId, citizenid })
end

local function addMemberToTracker(safeId, memberName, linkedCitizenid)
    MySQL.rawExecute.await([[
        INSERT INTO safe_tracker (safe_id, member_name, linked_citizenid)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE linked_citizenid = ?
    ]], { safeId, memberName, linkedCitizenid, linkedCitizenid })
end

local function removeMemberFromTracker(safeId, memberName)
    MySQL.update.await('DELETE FROM safe_tracker WHERE safe_id = ? AND member_name = ?', { safeId, memberName })
    MySQL.update.await('DELETE FROM safe_tracker_progress WHERE safe_id = ? AND member_name = ?', { safeId, memberName })
end

local function archivePeriod(safeId)
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    
    local progress = getAllMemberProgress(safeId)
    if next(progress) then
        local archiveData = json.encode(progress)
        MySQL.insert.await(
            'INSERT INTO safe_tracker_archive (safe_id, period_start, period_end, archive_data) VALUES (?, ?, NOW(), ?)',
            { safeId, safe.period_start or os.date('%Y-%m-%d %H:%M:%S'), archiveData }
        )
    end
    
    MySQL.update.await('DELETE FROM safe_tracker_progress WHERE safe_id = ?', { safeId })
end

local function endPeriod(safeId)
    archivePeriod(safeId)
    MySQL.update.await('UPDATE safes SET period_start = NOW() WHERE id = ?', { safeId })
    
    if SafeServer.safes[safeId] then
        SafeServer.safes[safeId].period_start = os.time()
    end
    
    if SafeServer.refreshDashboard then
        SafeServer.refreshDashboard(safeId)
    end
end

local function checkPeriodExpiry(safe)
    if not safe.period_start or not safe.period_days then return false end
    if safe.period_days == 0 then return false end
    
    local periodStart = type(safe.period_start) == 'number' and safe.period_start or MySQL.scalar.await('SELECT UNIX_TIMESTAMP(period_start) FROM safes WHERE id = ?', { safe.id }) or os.time()
    local expiryTime = periodStart + (safe.period_days * 86400)
    
    return os.time() >= expiryTime
end

local function getPlayerNameFromSource(src)
    local player = exports.qbx_core:GetPlayer(src)
    local data = player and player.PlayerData
    if not data then return tostring(src) end
    local charinfo = data.charinfo or {}
    local full = ((charinfo.firstname or '') .. ' ' .. (charinfo.lastname or '')):gsub('^%s+', ''):gsub('%s+$', '')
    return full ~= '' and full or data.name or tostring(src)
end

-- Send batched webhook when stash is closed
local function sendBatchedWebhook(safe, citizenid, realName, movements)
    if not Config.Features.webhooks then return end
    local url = Config.Logging.webhooks.default
    if not url or url == '' then return end
    
    local depositLines = {}
    local withdrawLines = {}
    
    for _, move in ipairs(movements) do
        local line = ('%sx %s'):format(move.amount, move.item)
        if move.direction == 'deposit' then
            depositLines[#depositLines + 1] = line
        else
            withdrawLines[#withdrawLines + 1] = line
        end
    end
    
    local fields = {
        { name = 'Actor', value = realName, inline = true },
        { name = 'Citizen ID', value = citizenid or 'Unknown', inline = true },
        { name = 'Safe', value = safe.safe_name or ('Safe #' .. safe.id), inline = true },
    }
    
    if #depositLines > 0 then
        fields[#fields + 1] = { name = 'Deposited', value = table.concat(depositLines, '\n'), inline = false }
    end
    if #withdrawLines > 0 then
        fields[#fields + 1] = { name = 'Withdrew', value = table.concat(withdrawLines, '\n'), inline = false }
    end
    
    PerformHttpRequest(url, function() end, 'POST', json.encode({
        username = 'Safe Activity',
        embeds = {{
            title = ('Safe #%s - Stash Session Closed'):format(safe.id),
            description = 'Item movement summary for this session.',
            color = 3447003,
            fields = fields,
            footer = { text = 'qbx_premium_safes' },
            timestamp = os.date('!%Y-%m-%dT%H:%M:%SZ')
        }}
    }), { ['Content-Type'] = 'application/json' })
end

-- Hook: Track when stash opens (create session)
CreateThread(function()
    exports.ox_inventory:registerHook('openInventory', function(payload)
        if payload.inventoryType ~= 'stash' then return end
        
        local safe = getSafeByStashToken(payload.inventoryId)
        if not safe then return end
        if payload.source == 0 then return end
        
        local player = exports.qbx_core:GetPlayer(payload.source)
        local citizenid = player and player.PlayerData and player.PlayerData.citizenid
        if not citizenid then return end
        
        local sessionKey = ('%s_%s'):format(safe.id, citizenid)
        
        SafeServer.stashSessions[sessionKey] = {
            safeId = safe.id,
            citizenid = citizenid,
            movements = {},
            openedAt = os.time()
        }
    end, { typeFilter = { stash = true } })
end)

-- Hook: Track item movements - hybrid tracking
CreateThread(function()
    exports.ox_inventory:registerHook('swapItems', function(payload)
        local safe = nil
        local direction = nil
        if payload.toType == 'stash' then
            safe = getSafeByStashToken(payload.toInventory)
            direction = 'deposit'
        elseif payload.fromType == 'stash' then
            safe = getSafeByStashToken(payload.fromInventory)
            direction = 'withdraw'
        end
        if not safe then return end
        if payload.source == 0 then return end
        local player = exports.qbx_core:GetPlayer(payload.source)
        local citizenid = player and player.PlayerData and player.PlayerData.citizenid
        if not citizenid then return end
        local playerName = getPlayerNameFromSource(payload.source)
        local itemName = (direction == 'deposit' and payload.fromSlot and payload.fromSlot.name) or (payload.fromSlot and payload.fromSlot.name) or (payload.toSlot and payload.toSlot.name)
        local amount = payload.count or 0
        if not itemName or amount <= 0 then return end

        local isOwner = citizenid == safe.owner_identifier
        local hasLegitimateAccess = isOwner
        if not hasLegitimateAccess and safe.access then
            for _, entry in ipairs(safe.access) do
                if entry.player_identifier == citizenid and (entry.can_withdraw == 1 or entry.can_deposit == 1) then
                    hasLegitimateAccess = true
                    break
                end
            end
        end

        local forcedExpiry = SafeServer.forcedAccess and SafeServer.forcedAccess[safe.id] and SafeServer.forcedAccess[safe.id][citizenid]
        local isForcedAccess = forcedExpiry and forcedExpiry > os.time()

        local displayName
        if isForcedAccess then
            displayName = 'Unknown'
        else
            displayName = playerName
        end

        local sessionKey = ('%s_%s'):format(safe.id, citizenid)
        if SafeServer.stashSessions[sessionKey] then
            SafeServer.stashSessions[sessionKey].movements[#SafeServer.stashSessions[sessionKey].movements + 1] = {
                item = itemName,
                amount = amount,
                direction = direction
            }
            SafeServer.stashSessions[sessionKey].realName = playerName
        end

        if direction == 'deposit' then
            MySQL.insert('INSERT INTO safe_logs (safe_id, actor_identifier, actor_name, action, message, payload) VALUES (?, ?, ?, ?, ?, ?)', {
                safe.id, citizenid, displayName, 'deposit_item', ('Deposited %sx %s'):format(amount, itemName), json.encode({ item = itemName, amount = amount })
            })
            
            -- Hybrid tracking: Auto-update if player is linked and has deposit permission
            if safe.tracking_upgrade_owned and Config.Features.contributionTracking then
                local trackedItems = getTrackedItemsForSafe(safe.id)
                if isItemTracked(trackedItems, itemName) then
                    local linkedMember = getLinkedMember(safe.id, citizenid)
                    if linkedMember then
                        local hasDeposit = isOwner
                        if not hasDeposit and safe.access then
                            for _, entry in ipairs(safe.access) do
                                if entry.player_identifier == citizenid and entry.can_deposit == 1 then
                                    hasDeposit = true
                                    break
                                end
                            end
                        end
                        if hasDeposit then
                            upsertProgress(safe.id, linkedMember.member_name, itemName, amount)
                        end
                    end
                end
            end
            
            if SafeServer.refreshDashboard then SafeServer.refreshDashboard(safe.id) end
        elseif direction == 'withdraw' then
            MySQL.insert('INSERT INTO safe_logs (safe_id, actor_identifier, actor_name, action, message, payload) VALUES (?, ?, ?, ?, ?, ?)', {
                safe.id, citizenid, displayName, 'withdraw_item', ('Withdrew %sx %s'):format(amount, itemName), json.encode({ item = itemName, amount = amount })
            })
            if SafeServer.refreshDashboard then SafeServer.refreshDashboard(safe.id) end
        end
    end, { typeFilter = { stash = true, player = true } })
end)

AddEventHandler('ox_inventory:closedInventory', function(playerId, inventoryId)
    if not inventoryId then return end
    
    local safe = getSafeByStashToken(inventoryId)
    if not safe then return end
    if playerId == 0 then return end
    
    local player = exports.qbx_core:GetPlayer(playerId)
    local citizenid = player and player.PlayerData and player.PlayerData.citizenid
    if not citizenid then return end
    
    local sessionKey = ('%s_%s'):format(safe.id, citizenid)
    local session = SafeServer.stashSessions[sessionKey]
    
    if session and #session.movements > 0 then
        sendBatchedWebhook(safe, citizenid, session.realName or 'Unknown', session.movements)
    end
    
    SafeServer.stashSessions[sessionKey] = nil
end)

-- Events for NUI

RegisterNetEvent('qbx_premium_safes:server:getTrackerData', function(safeId)
    local src = source
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    
    if not hasViewProgress(safe, src) then return end
    
    local members = MySQL.query.await('SELECT member_name, linked_citizenid FROM safe_tracker WHERE safe_id = ?', { safeId })
    local progress = getAllMemberProgress(safeId)
    local archives = MySQL.query.await('SELECT period_start, period_end FROM safe_tracker_archive WHERE safe_id = ? ORDER BY period_end DESC LIMIT 10', { safeId })
    
    local trackedItems = getTrackedItemsForSafe(safeId)
    local safeData = {
        period_days = safe.period_days or Config.Tracking.defaultPeriodDays,
        period_start = safe.period_start,
        items = trackedItems,
        percentages = calculateItemPercentages(trackedItems)
    }
    
    TriggerClientEvent('qbx_premium_safes:client:trackerData', src, {
        safeId = safeId,
        members = members,
        progress = progress,
        archives = archives,
        safeData = safeData,
        isLeader = isLeader(safe, src)
    })
end)

RegisterNetEvent('qbx_premium_safes:server:addTrackerMember', function(safeId, memberName, linkedCitizenid)
    local src = source
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    if not isLeader(safe, src) then return end
    
    if not memberName or memberName == '' then return end
    
    addMemberToTracker(safeId, memberName, linkedCitizenid or nil)
    
    local trackedItems = getTrackedItemsForSafe(safeId)
    for _, item in ipairs(trackedItems) do
        setProgress(safeId, memberName, item.item, 0)
    end
    
    TriggerClientEvent('qbx_premium_safes:client:trackerMemberAdded', src, { safeId = safeId, memberName = memberName })
end)

RegisterNetEvent('qbx_premium_safes:server:removeTrackerMember', function(safeId, memberName)
    local src = source
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    if not isLeader(safe, src) then return end
    
    removeMemberFromTracker(safeId, memberName)
    
    TriggerClientEvent('qbx_premium_safes:client:trackerMemberRemoved', src, { safeId = safeId, memberName = memberName })
end)

RegisterNetEvent('qbx_premium_safes:server:adjustProgress', function(safeId, memberName, itemName, amount)
    local src = source
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    if not isLeader(safe, src) then return end
    
    setProgress(safeId, memberName, itemName, amount)
    
    TriggerClientEvent('qbx_premium_safes:client:progressUpdated', src, { safeId = safeId, memberName = memberName, itemName = itemName, amount = amount })
end)

RegisterNetEvent('qbx_premium_safes:server:setPeriodDays', function(safeId, days)
    local src = source
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    if not isLeader(safe, src) then return end
    
    MySQL.update.await('UPDATE safes SET period_days = ? WHERE id = ?', { days, safeId })
    SafeServer.safes[safeId].period_days = days
    
    if SafeServer.refreshDashboard then
        SafeServer.refreshDashboard(safeId)
    end
    
    TriggerClientEvent('qbx_premium_safes:client:periodDaysSet', src, { safeId = safeId, days = days })
end)

RegisterNetEvent('qbx_premium_safes:server:endPeriod', function(safeId)
    local src = source
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    if not isLeader(safe, src) then return end
    
    endPeriod(safeId)
    
    TriggerClientEvent('qbx_premium_safes:client:periodEnded', src, { safeId = safeId })
end)

RegisterNetEvent('qbx_premium_safes:server:getArchives', function(safeId)
    local src = source
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    if not hasViewProgress(safe, src) then return end
    
    local archives = MySQL.query.await('SELECT id, period_start, period_end, archive_data FROM safe_tracker_archive WHERE safe_id = ? ORDER BY period_end DESC', { safeId })
    
    TriggerClientEvent('qbx_premium_safes:client:archivesData', src, { safeId = safeId, archives = archives })
end)

local function randomToken(length)
    local chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    local result = {}
    for i = 1, length do
        local index = math.random(1, #chars)
        result[#result + 1] = chars:sub(index, index)
    end
    return table.concat(result)
end

exports('getTrackerData', function(safeId)
    local safe = SafeServer.safes[safeId]
    if not safe then return nil end
    
    local trackedItems = getTrackedItemsForSafe(safeId)
    return {
        members = MySQL.query.await('SELECT member_name, linked_citizenid FROM safe_tracker WHERE safe_id = ?', { safeId }),
        progress = getAllMemberProgress(safeId),
        period_days = safe.period_days or Config.Tracking.defaultPeriodDays,
        period_start = safe.period_start,
        items = trackedItems,
        percentages = calculateItemPercentages(trackedItems)
    }
end)

-- Temp inventory for setting tracked items
local TempTrackedItemSelectors = {}

RegisterNetEvent('qbx_premium_safes:server:beginSetTrackedItems', function(safeId)
    local src = source
    local safe = SafeServer.safes[safeId]
    if not safe then return end
    if not isLeader(safe, src) then
        TriggerClientEvent('ox_lib:notify', src, { description = 'Only leaders can set tracked items.', type = 'error' })
        return
    end
    
    local token = ('tracker_selector_%s_%s'):format(safeId, SafeShared.RandomToken(16))
    TempTrackedItemSelectors[token] = { safeId = safeId, src = src }
    
    exports.ox_inventory:RegisterStash(token, 'Set Tracked Items', 10, 50000)
    
        TriggerClientEvent('qbx_premium_safes:client:openTrackedItemSelector', src, safeId, token)
end)

RegisterNetEvent('qbx_premium_safes:server:finalizeSetTrackedItems', function(safeId, token)
    local src = source
    local session = TempTrackedItemSelectors[token]
    if not session or session.safeId ~= safeId then
        return
    end
    
    local safe = SafeServer.safes[safeId]
    if not safe then
        TempTrackedItemSelectors[token] = nil
        return
    end
    
    local inv = exports.ox_inventory:GetInventory(token)
    if not inv or not inv.items then
        TempTrackedItemSelectors[token] = nil
        return
    end
    
    local items = {}
    for slot, itemData in pairs(inv.items) do
        if itemData and itemData.name and itemData.name ~= '' then
            items[#items + 1] = { item = itemData.name, required = itemData.count or 1 }
        end
    end
    
    setTrackedItemsForSafe(safeId, items)
    
    for slot, itemData in pairs(inv.items) do
        if itemData and itemData.count and itemData.count > 0 then
            exports.ox_inventory:AddItem(src, itemData.name, itemData.count)
        end
    end
    
    exports.ox_inventory:ClearInventory(token)
    TempTrackedItemSelectors[token] = nil
    
    TriggerClientEvent('ox_lib:notify', src, { description = ('Tracked items updated. %d items registered.'):format(#items), type = 'success' })
    
    if SafeServer.refreshDashboard then
        SafeServer.refreshDashboard(safeId)
    end
end)
