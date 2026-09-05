--[[
    Apex Vehicle Studio — Framework Bridge
    ────────────────────────────────────────────────────────────
    Auto-detects the running framework and exposes ONE tiny API
    everything else consumes — no framework code anywhere else.

        Bridge.framework          'esx' | 'qb' | 'qbx' | 'standalone'
        Bridge.isESX / isQB / isQBX / isStandalone   (booleans)
        Bridge.GetCore()          framework core object (nil standalone)

        server:
        Bridge.GetPlayer(src)     framework player object (nil standalone)
        Bridge.GetIdentifier(src) stable identifier (license fallback)
        Bridge.GetCharName(src)   roleplay character name (or account name)
        Bridge.GetJob(src)        { name, grade, label }
        Bridge.GetAllPlayers()    array of connected source ids

        client:
        Bridge.GetPlayerData()    framework player data table ({} standalone)
        Bridge.GetJob()           { name, grade, label }

    Standalone fallback: when no supported framework resource is
    started, everything keeps working — identifiers fall back to
    the rockstar license and jobs report as 'unemployed'.
]]

Bridge = Bridge or {}

local IS_SERVER = IsDuplicityVersion()
local coreCache = nil

-- ─── Detection ──────────────────────────────────────────────
-- qbx_core is checked before qb-core because QBox can expose a
-- qb-core compatibility shim; we want the real one to win.
local function resourceUp(name)
    local state = GetResourceState(name)
    return state == 'started' or state == 'starting'
end

--- The owner's own adapter, if they filled one in.
local function customCfg()
    local fw = (Config and Config.framework) or {}
    local c = fw.custom
    return (type(c) == 'table') and c or {}
end

--- Call one adapter function defensively: a bad adapter must degrade
--- to standalone, never take the resource down with it.
local function customCall(fnName, ...)
    local fn = customCfg()[fnName]
    if type(fn) ~= 'function' then return nil end
    local ok, res = pcall(fn, ...)
    if not ok then
        if Utils and Utils.Warn then
            Utils.Warn(('Config.framework.custom.%s errored: %s'):format(fnName, tostring(res)))
        end
        return nil
    end
    return res
end

local function detect()
    local fw = (Config and Config.framework) or {}
    local mode = fw.mode

    -- An explicit choice always wins over sniffing.
    if mode == 'esx' or mode == 'qb' or mode == 'qbx'
        or mode == 'standalone' or mode == 'custom' then
        return mode
    end

    -- A custom adapter that says "this is me" is checked FIRST, so a
    -- server running vRP next to a leftover qb-core folder still
    -- resolves the way its owner intended.
    if customCall('detect') == true then return 'custom' end

    if resourceUp('es_extended') then return 'esx' end
    if resourceUp('qbx_core') then return 'qbx' end
    if resourceUp('qb-core') then return 'qb' end
    return 'standalone'
end

-- What was last applied, in RAW form. Bridge.framework holds the custom
-- adapter's display name in custom mode, so it cannot be compared here.
local currentFw = nil

local function applyFramework(fw)
    currentFw           = fw
    Bridge.framework    = (fw == 'custom') and tostring(customCfg().name or 'custom') or fw
    Bridge.isESX        = (fw == 'esx')
    Bridge.isQB         = (fw == 'qb')
    Bridge.isQBX        = (fw == 'qbx')
    Bridge.isCustom     = (fw == 'custom')
    Bridge.isStandalone = (fw == 'standalone')
end

-- An explicitly configured mode is final; only sniffing can be revised.
local FORCED_MODE = (function()
    local m = ((Config and Config.framework) or {}).mode
    return (m == 'esx' or m == 'qb' or m == 'qbx'
        or m == 'standalone' or m == 'custom') and m or nil
end)()

applyFramework(detect())

-- Frameworks normally start before us, but if this resource is ensured
-- too early the first answer can be WRONG rather than merely absent:
-- QBox ships qb-core for compatibility, so a server whose qbx_core has
-- not started yet resolves to 'qb'. That is not 'standalone', so the
-- old guard never re-checked and the session stayed wrong.
--
-- Re-check for a short window whatever we first concluded, and adopt any
-- change. Skipped entirely when the owner forced a mode — there is
-- nothing to discover and their choice must never be second-guessed.
if not FORCED_MODE then
    CreateThread(function()
        for _ = 1, 20 do
            Wait(500)
            local fw = detect()
            -- Compared against what is APPLIED, not against another
            -- fresh detect(): the framework can appear in the gap between
            -- load and the first poll, and seeding the baseline with a
            -- second detect() would swallow exactly that case.
            if fw ~= currentFw then
                applyFramework(fw)
                coreCache = nil
                if Utils and Utils.Log then
                    Utils.Log(('framework re-resolved to %s'):format(fw))
                end
            end
        end
    end)
end

-- ─── Core object ────────────────────────────────────────────
function Bridge.GetCore()
    if coreCache ~= nil then return coreCache end
    if Bridge.isESX then
        local ok, core = pcall(function()
            return exports['es_extended']:getSharedObject()
        end)
        if ok then coreCache = core end
    elseif Bridge.isQB then
        local ok, core = pcall(function()
            return exports['qb-core']:GetCoreObject()
        end)
        if ok then coreCache = core end
    elseif Bridge.isQBX then
        -- QBox still ships GetCoreObject for compatibility; most
        -- calls below use qbx_core exports directly instead.
        local ok, core = pcall(function()
            return exports['qbx_core']:GetCoreObject()
        end)
        if ok then coreCache = core end
    end
    return coreCache
end

-- ─── Job normalizer ─────────────────────────────────────────
-- Everything downstream sees { name, grade, label } regardless
-- of the framework's own job table shape.
local function normalizeJob(job)
    if type(job) ~= 'table' then
        return { name = 'unemployed', grade = 0, label = 'Unemployed' }
    end
    local grade = 0
    if type(job.grade) == 'table' then
        grade = tonumber(job.grade.level) or 0        -- qb/qbx shape
    else
        grade = tonumber(job.grade) or 0              -- esx shape
    end
    return {
        name  = job.name or 'unemployed',
        grade = grade,
        label = job.label or job.name or 'Unemployed',
    }
end

-- ════════════════════════════════════════════════════════════
if IS_SERVER then
-- ════════════════════════════════════════════════════════════

    local function licenseOf(src)
        local id = GetPlayerIdentifierByType(src, 'license')
        if id then return id end
        -- Extremely defensive: scan the identifier list as a
        -- final fallback (older artifacts / odd environments).
        for i = 0, GetNumPlayerIdentifiers(src) - 1 do
            local ident = GetPlayerIdentifier(src, i)
            if ident and ident:find('license:', 1, true) == 1 then
                return ident
            end
        end
        return ('src:%s'):format(src)
    end

    function Bridge.GetPlayer(src)
        src = tonumber(src)
        if not src then return nil end
        if Bridge.isESX then
            local core = Bridge.GetCore()
            if core and core.GetPlayerFromId then
                return core.GetPlayerFromId(src)
            end
        elseif Bridge.isQB then
            local core = Bridge.GetCore()
            if core and core.Functions and core.Functions.GetPlayer then
                return core.Functions.GetPlayer(src)
            end
        elseif Bridge.isQBX then
            local ok, player = pcall(function()
                return exports['qbx_core']:GetPlayer(src)
            end)
            if ok then return player end
        end
        return nil
    end

    function Bridge.GetIdentifier(src)
        if Bridge.isCustom then
            local id = customCall('getIdentifier', src)
            if type(id) == 'string' and id ~= '' then return id end
        end
        local player = Bridge.GetPlayer(src)
        if player then
            if Bridge.isESX and player.identifier then
                return player.identifier
            end
            if (Bridge.isQB or Bridge.isQBX) and player.PlayerData
                and player.PlayerData.citizenid then
                return player.PlayerData.citizenid
            end
        end
        return licenseOf(src)
    end

    function Bridge.GetCharName(src)
        if Bridge.isCustom then
            local n = customCall('getName', src)
            if type(n) == 'string' and n ~= '' then return n end
        end
        local player = Bridge.GetPlayer(src)
        if player then
            if Bridge.isESX then
                if player.getName then
                    local ok, name = pcall(player.getName)
                    if ok and name and name ~= '' then return name end
                end
            elseif Bridge.isQB or Bridge.isQBX then
                local info = player.PlayerData and player.PlayerData.charinfo
                if info and info.firstname then
                    local full = ('%s %s'):format(info.firstname, info.lastname or '')
                    return (full:gsub('%s+$', ''))
                end
            end
        end
        return GetPlayerName(src) or ('Player %s'):format(src)
    end

    function Bridge.GetJob(src)
        if Bridge.isCustom then
            local j = customCall('getJob', src)
            if type(j) == 'table' then return normalizeJob(j) end
        end
        local player = Bridge.GetPlayer(src)
        if player then
            if Bridge.isESX and player.job then
                return normalizeJob(player.job)
            end
            if (Bridge.isQB or Bridge.isQBX) and player.PlayerData then
                return normalizeJob(player.PlayerData.job)
            end
        end
        return normalizeJob(nil)
    end

    function Bridge.GetAllPlayers()
        -- The natives list works identically on every framework
        -- and on standalone, so it is the one source of truth.
        local out = {}
        for _, id in ipairs(GetPlayers()) do
            out[#out + 1] = tonumber(id)
        end
        return out
    end

-- ════════════════════════════════════════════════════════════
else -- client
-- ════════════════════════════════════════════════════════════

    function Bridge.GetPlayerData()
        if Bridge.isESX then
            local core = Bridge.GetCore()
            if core and core.GetPlayerData then
                return core.GetPlayerData() or {}
            end
        elseif Bridge.isQB then
            local core = Bridge.GetCore()
            if core and core.Functions and core.Functions.GetPlayerData then
                return core.Functions.GetPlayerData() or {}
            end
        elseif Bridge.isQBX then
            local ok, data = pcall(function()
                return exports['qbx_core']:GetPlayerData()
            end)
            if ok and type(data) == 'table' then return data end
        end
        return {}
    end

    function Bridge.GetJob()
        local data = Bridge.GetPlayerData()
        return normalizeJob(data and data.job)
    end

end
