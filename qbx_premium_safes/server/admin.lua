
local function isAdmin(src)
    return src == 0 or IsPlayerAceAllowed(src, ('command.%s'):format(Config.Commands.cleanup)) or IsPlayerAceAllowed(src, ('command.%s'):format(Config.Commands.forceRemove))
end

RegisterCommand(Config.Commands.cleanup, function(source, args)
    if source > 0 and not isAdmin(source) then return end
    local safeId = tonumber(args[1])
    local ok, msg = SafeServer.forceRemoveSafe(safeId, source, false)
    print(ok and ('Admin cleanup removed safe #%s'):format(safeId) or (msg or 'Failed'))
end, true)

RegisterCommand(Config.Commands.forceRemove, function(source, args)
    if source > 0 and not isAdmin(source) then return end
    local safeId = tonumber(args[1])
    local ok, msg = SafeServer.forceRemoveSafe(safeId, source, false)
    print(ok and ('Force removed safe #%s'):format(safeId) or (msg or 'Failed'))
end, true)

RegisterCommand(Config.Commands.reset, function(source, args)
    if source > 0 and not isAdmin(source) then return end
    local safeId = tonumber(args[1])
    if not safeId then return end
    MySQL.update.await('DELETE FROM safe_contributions WHERE safe_id = ?', { safeId })
    if SafeServer.refreshDashboard then SafeServer.refreshDashboard(safeId) end
    print(('Progress reset for safe #%s'):format(safeId))
end, true)

RegisterCommand(Config.Commands.clearCrack, function(source, args)
    if source > 0 and not isAdmin(source) then return end
    local safeId = tonumber(args[1])
    if not safeId then return end
    SafeServer.forcedAccess[safeId] = nil
    print(('Forced crack access cleared for safe #%s'):format(safeId))
end, true)
