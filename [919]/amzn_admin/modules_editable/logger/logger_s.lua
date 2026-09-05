Logger = {}
local webhooks = {
    playerActions = Config.Logging.Discord.PlayerActionsWebhook,
    quickActions = Config.Logging.Discord.QuickActionsWebhook,
    screenshots = Config.Logging.Discord.ScreenshotsWebhook,
    reports = Config.Logging.Discord.ReportsWebhook,
    noClip = Config.Logging.Discord.NoClipWebhook,
    playerNames = Config.Logging.Discord.PlayerNamesWebhook
}

local function listHas(list, value)
    for i = 1, #list do
        local v = list[i]
        if v == value or v == '*' then
            return true
        end
    end
    return false
end

local function shouldRoute(route, category, action)
    return listHas(route.Categories, category) and listHas(route.Actions, action)
end

local function getDiscordColor(severity)
    if severity == 'danger' then
        return 0xe74c3c
    elseif severity == 'success' then
        return 0x2ecc71
    end
    return 3447003
end

local function sendToDiscord(webhook, title, message, color)
    if webhook == "" then return end

    local embed = {
        {
            ["title"] = title,
            ["description"] = message,
            ["type"] = "rich",
            ["color"] = color or 3447003,
            ["footer"] = {
                ["text"] = "919admin Logs • " .. os.date("%Y-%m-%d %H:%M:%S")
            }
        }
    }

    PerformHttpRequest(webhook, function(err, text, headers) end, 'POST', json.encode({
        username = "919admin Logger",
        embeds = embed
    }), { ['Content-Type'] = 'application/json' })
end

local function prefersFiveManage()
    local mode = (Config.Logging.LoggingType or ''):lower()
    return mode == 'fivemanage' and type(Config.Logging.FiveManage.FiveManageAPIKey) == 'string' and Config.Logging.FiveManage.FiveManageAPIKey ~= ''
end

local function sendToFiveManage(title, severity, meta)
    if not prefersFiveManage() then return end

    local payload = {
        level = severity or 'info',
        message = title,
        metadata = meta or {},
        resource = 'amzn_admin',
    }

    local headers = {
        ['Authorization'] = Config.Logging.FiveManage.FiveManageAPIKey,
        ['X-Fivemanage-Dataset'] = Config.Logging.FiveManage.FiveManageDataset or 'default',
        ['Content-Type'] = 'application/json',
    }

    PerformHttpRequest('https://api.fivemanage.com/api/logs', function(err, text, headers) end, 'POST', json.encode(payload), headers)
end

local function emitDiscord(category, action, title, message, severity, meta)
    local routes = Config.Logging.Discord.WebhookRoutes
    local useDefault = Config.Logging.Discord.UseDefaultWebhooks

    local sent = {}
    local color = getDiscordColor(severity)

    if useDefault then
        local defaultHook = webhooks[category]
        if defaultHook and defaultHook ~= '' then
            sent[defaultHook] = true
            sendToDiscord(defaultHook, title, message, color)
        end
    end

    for i = 1, #routes do
        local route = routes[i]
        if route.Webhook ~= '' and not sent[route.Webhook] and shouldRoute(route, category, action) then
            sent[route.Webhook] = true
            sendToDiscord(route.Webhook, title, message, color)
        end
    end
end

local function emitLog(category, action, title, message, severity, meta)
    if prefersFiveManage() then
        sendToFiveManage(title, severity, meta)
    else
        emitDiscord(category, action, title, message, severity, meta)
    end
end

local function buildDefaultMeta(adminId, targetId, action, details, identifiers)
    return {
        adminId = adminId,
        action = action,
        targetId = targetId,
        details = details or 'No additional details',
        steam = identifiers and identifiers.steam or 'n/a',
        license = identifiers and identifiers.license or 'n/a',
        discord = identifiers and identifiers.discord or 'n/a',
    }
end

local function getLicenseIdentifier(playerId)
    local lic = GetPlayerIdentifierByType(playerId, 'license')
    if FRAMEWORK == 'qbx' then
        lic = GetPlayerIdentifierByType(playerId, 'license2') or lic
    end
    return lic
end

local function getIdentifiers(playerId)
    return {
        steam = GetPlayerIdentifierByType(playerId, 'steam') or 'n/a',
        license = getLicenseIdentifier(playerId) or 'n/a',
        discord = GetPlayerIdentifierByType(playerId, 'discord') or 'n/a'
    }
end

local function getQBPlayer(playerId)
    if FRAMEWORK == 'qb' then
        local QBCore = exports['qb-core']:GetCoreObject()
        return QBCore.Functions.GetPlayer(playerId)
    elseif FRAMEWORK == 'qbx' then
        return exports.qbx_core:GetPlayer(playerId)
    end
    return nil
end

local function getESXPlayer(playerId)
    if FRAMEWORK == 'esx' then
        local ESX = exports['es_extended']:getSharedObject()
        return ESX.GetPlayerFromId(playerId)
    end
    return nil
end

local function getCharacterName(playerId)
    if playerId == 0 and _G.__discordBotIssuedBy then
        return _G.__discordBotIssuedBy
    end
    if FRAMEWORK == 'qb' or FRAMEWORK == 'qbx' then
        local player = getQBPlayer(playerId)
        if player and player.PlayerData and player.PlayerData.charinfo then
            return string.format('%s %s', player.PlayerData.charinfo.firstname or 'Unknown', player.PlayerData.charinfo.lastname or '')
        end
    elseif FRAMEWORK == 'esx' then
        local xPlayer = getESXPlayer(playerId)
        if xPlayer and xPlayer.getName then
            return xPlayer.getName()
        end
    end
    return GetPlayerName(playerId) or 'Unknown Player'
end

function Logger.logPlayerAction(adminSource, targetId, action, details)
    local adminName = getCharacterName(adminSource) or GetPlayerName(adminSource)
    local adminIdentifiers = getIdentifiers(adminSource)
    local targetInfo = getCharacterName(targetId)

    local message = string.format("**Admin:** %s (%d)\n**Action:** %s\n**Target:** %s (%s)\n**Details:** %s\n\n**Admin Identifiers:**\nSteam: %s\nLicense: %s\nDiscord: %s",
        adminName,
        adminSource,
        action,
        targetInfo,
        targetId,
        details or "No additional details",
        adminIdentifiers.steam,
        adminIdentifiers.license,
        adminIdentifiers.discord
    )

    local meta = buildDefaultMeta(adminSource, targetId, action, details, adminIdentifiers)
    meta.adminName = adminName
    meta.targetName = targetInfo
    emitLog('playerActions', action, "Player Action Log", message, 'info', meta)
end

function Logger.logQuickAction(adminSource, action, details)
    local adminName = getCharacterName(adminSource) or GetPlayerName(adminSource)
    local adminIdentifiers = getIdentifiers(adminSource)

    local message = string.format("**Admin:** %s (%d)\n**Action:** %s\n**Details:** %s\n\n**Admin Identifiers:**\nSteam: %s\nLicense: %s\nDiscord: %s",
        adminName,
        adminSource,
        action,
        details or "No additional details",
        adminIdentifiers.steam,
        adminIdentifiers.license,
        adminIdentifiers.discord
    )
    local meta = buildDefaultMeta(adminSource, adminSource, action, details, adminIdentifiers)
    meta.adminName = adminName
    emitLog('quickActions', action, "Quick Action Log", message, 'info', meta)
end

---@param adminSource number
---@param targetId number
---@param screenshotData string
function Logger.sendScreenshotToWebhook(adminSource, targetId, screenshotData)
    local webhook = webhooks.screenshots
    if not webhook or webhook == "" then return end
    
    local adminName = getCharacterName(adminSource) or GetPlayerName(adminSource)
    local adminIdentifiers = getIdentifiers(adminSource)
    local targetName = getCharacterName(targetId)
    local targetIdentifiers = getIdentifiers(targetId)
    
    local imageData = screenshotData:match("^data:image/webp;base64,(.+)$")
    if not imageData then
        imageData = screenshotData
    end
    
    local boundary = "----WebKitFormBoundary" .. tostring(math.random(100000000, 999999999))
    local body = string.format(
        "--%s\r\n" ..
        "Content-Disposition: form-data; name=\"content\"\r\n\r\n" ..
        "**Screenshot Captured**\n" ..
        "**Admin:** %s (ID: %d)\n" ..
        "**Target:** %s (ID: %d)\n" ..
        "**Time:** %s\n\n" ..
        "**Admin Identifiers:**\n" ..
        "Steam: %s\n" ..
        "License: %s\n" ..
        "Discord: %s\n\n" ..
        "**Target Identifiers:**\n" ..
        "Steam: %s\n" ..
        "License: %s\n" ..
        "Discord: %s\r\n" ..
        "--%s\r\n" ..
        "Content-Disposition: form-data; name=\"file\"; filename=\"screenshot_%s.webp\"\r\n" ..
        "Content-Type: image/webp\r\n" ..
        "Content-Transfer-Encoding: base64\r\n\r\n" ..
        "%s\r\n" ..
        "--%s--\r\n",
        boundary,
        adminName,
        adminSource,
        targetName,
        targetId,
        os.date("%Y-%m-%d %H:%M:%S"),
        adminIdentifiers.steam,
        adminIdentifiers.license,
        adminIdentifiers.discord,
        targetIdentifiers.steam,
        targetIdentifiers.license,
        targetIdentifiers.discord,
        boundary,
        os.date("%Y%m%d_%H%M%S"),
        imageData,
        boundary
    )
    
    PerformHttpRequest(webhook, function(err, text, headers) end, 'POST', body, {
        ['Content-Type'] = 'multipart/form-data; boundary=' .. boundary
    })
end

---@param playerId number
---@param playerName string
---@param reportId number
---@param reportMessage string
function Logger.sendReportToWebhook(playerId, playerName, reportId, reportMessage)
    local webhook = webhooks.reports
    if not webhook or webhook == "" then return end
    
    local playerIdentifiers = getIdentifiers(playerId)
    
    local embed = {
        {
            ["title"] = "New Player Report #" .. reportId,
            ["description"] = reportMessage,
            ["type"] = "rich",
            ["color"] = 0xffa500,
            ["fields"] = {
                {
                    ["name"] = "Player",
                    ["value"] = string.format("%s (ID: %d)", playerName, playerId),
                    ["inline"] = true
                },
                {
                    ["name"] = "Report ID",
                    ["value"] = tostring(reportId),
                    ["inline"] = true
                },
                {
                    ["name"] = "Player Identifiers",
                    ["value"] = string.format("Steam: %s\nLicense: %s\nDiscord: %s", 
                        playerIdentifiers.steam, 
                        playerIdentifiers.license, 
                        playerIdentifiers.discord
                    ),
                    ["inline"] = false
                }
            },
            ["footer"] = {
                ["text"] = "919admin Reports • " .. os.date("%Y-%m-%d %H:%M:%S")
            }
        }
    }

    PerformHttpRequest(webhook, function(err, text, headers) end, 'POST', json.encode({
        username = "919admin Reports",
        embeds = embed
    }), { ['Content-Type'] = 'application/json' })
end

---@param adminSource number
---@param enabled boolean
---@param coords vector3
function Logger.logNoClip(adminSource, enabled, coords)
    local adminName = getCharacterName(adminSource) or GetPlayerName(adminSource)
    local adminIdentifiers = getIdentifiers(adminSource)
    local state = enabled and "Enabled" or "Disabled"
    local coordsStr = coords and string.format("%.2f, %.2f, %.2f", coords.x, coords.y, coords.z) or "Unknown"

    local message = string.format("**Admin:** %s (%d)\n**Action:** NoClip %s\n**Position:** %s\n\n**Admin Identifiers:**\nSteam: %s\nLicense: %s\nDiscord: %s",
        adminName,
        adminSource,
        state,
        coordsStr,
        adminIdentifiers.steam,
        adminIdentifiers.license,
        adminIdentifiers.discord
    )
    
    local meta = buildDefaultMeta(adminSource, adminSource, "NoClip", state, adminIdentifiers)
    meta.adminName = adminName
    meta.coords = coordsStr
    meta.enabled = enabled
    emitLog('noClip', 'NoClip', "NoClip Log", message, 'info', meta)
end

---@param adminSource number
---@param enabled boolean
function Logger.logPlayerNames(adminSource, enabled)
    local adminName = getCharacterName(adminSource) or GetPlayerName(adminSource)
    local adminIdentifiers = getIdentifiers(adminSource)
    local state = enabled and "Enabled" or "Disabled"

    local message = string.format("**Admin:** %s (%d)\n**Action:** Player Names %s\n\n**Admin Identifiers:**\nSteam: %s\nLicense: %s\nDiscord: %s",
        adminName,
        adminSource,
        state,
        adminIdentifiers.steam,
        adminIdentifiers.license,
        adminIdentifiers.discord
    )
    
    local meta = buildDefaultMeta(adminSource, adminSource, "PlayerNames", state, adminIdentifiers)
    meta.adminName = adminName
    meta.enabled = enabled
    emitLog('playerNames', 'PlayerNames', "Player Names Log", message, 'info', meta)
end
 