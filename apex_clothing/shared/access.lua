--[[
    Apex Clothing Studio — Access control
    ────────────────────────────────────────────────────────────
    Five independent access methods, each with its own switch.
    A player gets in as soon as the FIRST enabled method says yes,
    so methods ADD UP — turning one on never removes access from
    someone who already had it.

        1. everyone      no restriction at all
        2. ace           a FiveM ace permission
        3. groups        a framework rank (admin/god/owner…)
        4. jobs          a job, from a minimum grade up
        5. identifiers   a hand-picked list of people

    All five work identically on ESX Legacy, QBCore, QBox and
    standalone — the framework is only consulted by `groups` and
    `jobs`, and both fall back to aces when there is none.

    Everything here is checked SERVER-SIDE only. The command and
    the keybind never grant access by themselves.

        Access.Check(src)        → allowed, method, detail
        Access.Explain(src)      → per-method verdict (diagnostics)
        Access.Identifiers(src)  → every identifier the player has
        Access.Summary()         → console lines for the banner

    Configs written for the single-`mode` format still work: they
    are TRANSLATED (see §Legacy), never ignored. Silently changing
    who has access during an update is not an acceptable failure.
]]

Access = Access or {}

local DEFAULT_PERMISSION = 'apex.clothing'
local DEFAULT_OWNER_ACES = { 'command', 'txadmin.everything', 'group.admin' }
local DEFAULT_GROUPS     = { 'owner', 'god', 'superadmin', 'admin' }

-- ─── Small helpers ──────────────────────────────────────────

local function isTable(v) return type(v) == 'table' end

local function copyList(src, fallback)
    if type(src) == 'string' then return { src } end
    -- ABSENT means "use the default". An explicitly EMPTY list means the
    -- owner wrote {} on purpose, and quietly swapping in the built-in
    -- admin groups there would grant access to people they never listed.
    -- Silently widening access during an update is exactly what the
    -- header of this file promises not to do.
    if not isTable(src) then return fallback or {} end
    local out = {}
    for _, v in ipairs(src) do
        if type(v) == 'string' and v ~= '' then out[#out + 1] = v end
    end
    return out
end

-- ─── Normalizer: legacy (single `mode`) → five switches ─────
-- Old shape:  { mode = 'ace'|'jobs'|'everyone', ace = 'perm',
--               aceOnly = bool, frameworkAdmin = bool, jobs = {…} }

local function normalize(raw)
    raw = isTable(raw) and raw or {}

    -- Already the five-switch format? (any method table with `enabled`)
    local isNew = false
    for _, key in ipairs({ 'everyone', 'ace', 'groups', 'jobs', 'identifiers' }) do
        if isTable(raw[key]) and raw[key].enabled ~= nil then isNew = true break end
    end

    local cfg = {
        everyone    = { enabled = false },
        ace         = { enabled = false, permissions = { DEFAULT_PERMISSION },
                        acceptOwnerAces = true, ownerAces = DEFAULT_OWNER_ACES },
        groups      = { enabled = false, list = DEFAULT_GROUPS },
        jobs        = { enabled = false, list = {} },
        identifiers = { enabled = false, list = {} },
    }

    if isNew then
        local e, a = raw.everyone, raw.ace
        local g, j, i = raw.groups, raw.jobs, raw.identifiers
        cfg.everyone.enabled = isTable(e) and e.enabled == true or false

        if isTable(a) then
            cfg.ace.enabled     = a.enabled == true
            cfg.ace.permissions = copyList(a.permissions, { DEFAULT_PERMISSION })
            cfg.ace.acceptOwnerAces = (a.acceptOwnerAces ~= false)
            cfg.ace.ownerAces   = copyList(a.ownerAces, DEFAULT_OWNER_ACES)
        elseif type(a) == 'string' and a ~= '' then
            -- A half-migrated config: some keys in the new shape, but
            -- `ace` still the legacy string. Without this the owner's
            -- custom permission was dropped and everyone fell back to
            -- the built-in one.
            cfg.ace.enabled     = true
            cfg.ace.permissions = { a }
        end
        if isTable(g) then
            cfg.groups.enabled = g.enabled == true
            cfg.groups.list    = copyList(g.list, DEFAULT_GROUPS)
        end
        if isTable(j) then
            cfg.jobs.enabled = j.enabled == true
            if isTable(j.list) then cfg.jobs.list = j.list end
        end
        if isTable(i) then
            cfg.identifiers.enabled = i.enabled == true
            cfg.identifiers.list    = copyList(i.list, {})
        end
        return cfg, false
    end

    -- ── Legacy translation ──
    local mode = tostring(raw.mode or 'ace')
    cfg.ace.permissions = copyList(raw.ace, { DEFAULT_PERMISSION })
    if isTable(raw.jobs) then cfg.jobs.list = raw.jobs end

    if mode == 'everyone' then
        cfg.everyone.enabled = true
    elseif mode == 'jobs' then
        cfg.jobs.enabled = true
    else -- 'ace' and anything unrecognised
        cfg.ace.enabled = true
        if raw.aceOnly == true then cfg.ace.acceptOwnerAces = false end
        if raw.frameworkAdmin == true then cfg.groups.enabled = true end
    end

    return cfg, true
end

Access.config, Access.legacy = normalize(Config and Config.access)

-- ════════════════════════════════════════════════════════════
-- Everything below is SERVER-ONLY (ace/framework natives).
-- ════════════════════════════════════════════════════════════
if not IsDuplicityVersion() then return end

-- ─── Identifiers ────────────────────────────────────────────

function Access.Identifiers(src)
    src = tonumber(src)
    local out = {}
    if not src or src <= 0 then return out end
    local count = GetNumPlayerIdentifiers(src) or 0
    for i = 0, count - 1 do
        local ident = GetPlayerIdentifier(src, i)
        if ident and ident ~= '' then out[#out + 1] = ident end
    end
    return out
end

-- ─── Method 1: everyone ─────────────────────────────────────

local function checkEveryone()
    return true, 'no restriction is configured'
end

-- ─── Method 2: ace ──────────────────────────────────────────

local function checkAce(src)
    local ace = Access.config.ace
    for _, perm in ipairs(ace.permissions) do
        if IsPlayerAceAllowed(src, perm) then
            return true, ('has ace "%s"'):format(perm)
        end
    end
    if ace.acceptOwnerAces then
        for _, perm in ipairs(ace.ownerAces) do
            if IsPlayerAceAllowed(src, perm) then
                return true, ('has owner ace "%s"'):format(perm)
            end
        end
    end
    return false
end

-- ─── Method 3: framework groups ─────────────────────────────
-- Each name is looked for in four places, which is what makes
-- this work on any server: ESX group, QBCore permission, QBox
-- permission, and plain aces (so it works with NO framework).

local function playerGroup(src)
    if not Bridge or not Bridge.isESX then return nil end
    local player = Bridge.GetPlayer(src)
    if not player then return nil end
    if type(player.getGroup) == 'function' then
        local ok, group = pcall(function() return player.getGroup() end)
        if ok and type(group) == 'string' then return group end
    end
    if type(player.group) == 'string' then return player.group end
    return nil
end

local function hasFrameworkPermission(src, name)
    -- QBox exposes HasPermission as a resource export, NOT on the core
    -- object, so this one call goes direct instead of through the
    -- bridge. It is pcall'd and only reached when QBox is the detected
    -- framework, so it cannot fire anywhere else.
    if Bridge and Bridge.isQBX then
        local ok, res = pcall(function()
            return exports['qbx_core']:HasPermission(src, name)
        end)
        if ok and res then return true end
    end
    if Bridge and Bridge.isQB then
        local core = Bridge.GetCore()
        if core and core.Functions and core.Functions.HasPermission then
            local ok, res = pcall(function()
                return core.Functions.HasPermission(src, name)
            end)
            if ok and res then return true end
        end
    end
    return false
end

local function checkGroups(src)
    local group = playerGroup(src)
    for _, name in ipairs(Access.config.groups.list) do
        if group and group == name then
            return true, ('framework group "%s"'):format(name)
        end
        if hasFrameworkPermission(src, name) then
            return true, ('framework permission "%s"'):format(name)
        end
        -- Ace fallback — works with no framework at all.
        for _, ace in ipairs({ name, 'group.' .. name, 'qbcore.' .. name, 'qbx.' .. name }) do
            if IsPlayerAceAllowed(src, ace) then
                return true, ('ace "%s"'):format(ace)
            end
        end
    end
    return false
end

-- ─── Method 4: jobs ─────────────────────────────────────────

local function checkJobs(src)
    local job = Bridge and Bridge.GetJob and Bridge.GetJob(src)
    if type(job) ~= 'table' or not job.name then return false end
    local minGrade = Access.config.jobs.list[job.name]
    if minGrade == nil then return false end
    local grade = tonumber(job.grade) or 0
    if grade >= (tonumber(minGrade) or 0) then
        return true, ('job "%s" grade %d (needs %s)')
            :format(job.name, grade, tostring(minGrade))
    end
    return false
end

-- ─── Method 5: identifiers ──────────────────────────────────

local function checkIdentifiers(src)
    local mine = Access.Identifiers(src)
    for _, wanted in ipairs(Access.config.identifiers.list) do
        for _, ident in ipairs(mine) do
            if ident == wanted then
                return true, ('identifier "%s"'):format(wanted)
            end
        end
    end
    return false
end

-- ─── The gate ───────────────────────────────────────────────
-- Ordered cheapest-first; the first enabled method that passes wins.

local METHODS = {
    { key = 'everyone',    fn = checkEveryone },
    { key = 'ace',         fn = checkAce },
    { key = 'identifiers', fn = checkIdentifiers },
    { key = 'groups',      fn = checkGroups },
    { key = 'jobs',        fn = checkJobs },
}

function Access.Check(src)
    src = tonumber(src)
    if not src or src <= 0 then return false end
    for _, method in ipairs(METHODS) do
        if Access.config[method.key].enabled then
            -- ⚠ pcall per method. `groups` and `jobs` call into the
            -- framework, and a framework export that errors used to
            -- throw all the way out of here — killing the event handler
            -- before it could answer the client, so the studio just hung.
            -- A method that blows up grants nothing; the others still run.
            local pok, ok, detail = pcall(method.fn, src)
            if not pok then
                if Utils and Utils.Warn then
                    Utils.Warn(('access method "%s" errored: %s'):format(
                        method.key, tostring(ok)))
                end
            elseif ok then
                return true, method.key, detail
            end
        end
    end
    return false
end

-- ─── Diagnostics ────────────────────────────────────────────
-- Turns "it says I don't have access" into a line that names
-- exactly what has to change.

function Access.Explain(src)
    local out = {}
    for _, method in ipairs(METHODS) do
        local enabled = Access.config[method.key].enabled
        local pass, detail = false, nil
        if enabled then pass, detail = method.fn(src) end
        out[#out + 1] = {
            method  = method.key,
            enabled = enabled,
            pass    = pass and true or false,
            detail  = detail,
        }
    end
    return out
end

function Access.Summary()
    local cfg = Access.config
    local lines, on = {}, {}
    for _, method in ipairs(METHODS) do
        if cfg[method.key].enabled then on[#on + 1] = method.key end
    end

    if #on == 0 then
        lines[#lines + 1] = 'access checks: ^1EVERY METHOD IS OFF^7 — nobody can open the studio.'
        lines[#lines + 1] = ('  fix it in shared/config.lua, e.g. ace = { enabled = true, permissions = { \'%s\' } }')
            :format(DEFAULT_PERMISSION)
        return lines
    end

    lines[#lines + 1] = ('access checks ON: %s'):format(table.concat(on, ', '))
    if cfg.everyone.enabled then
        lines[#lines + 1] = '  ^3everyone: ANY player can open the studio and retexture the server^7'
        lines[#lines + 1] = '  ^3          turn it off in shared/config.lua before going live^7'
    end
    if cfg.ace.enabled then
        local extra = ''
        if cfg.ace.acceptOwnerAces then
            extra = (' (+ owner aces: %s)'):format(table.concat(cfg.ace.ownerAces, ', '))
        end
        lines[#lines + 1] = ('  ace: %s%s'):format(table.concat(cfg.ace.permissions, ', '), extra)
        lines[#lines + 1] = ('  grant it with:  add_ace group.admin %s allow'):format(cfg.ace.permissions[1])
    end
    if cfg.groups.enabled then
        lines[#lines + 1] = ('  groups: %s'):format(table.concat(cfg.groups.list, ', '))
    end
    if cfg.jobs.enabled then
        local parts = {}
        for name, grade in pairs(cfg.jobs.list) do
            parts[#parts + 1] = ('%s>=%s'):format(name, tostring(grade))
        end
        table.sort(parts)
        lines[#lines + 1] = ('  jobs: %s'):format(#parts > 0 and table.concat(parts, ', ') or '(empty list)')
    end
    if cfg.identifiers.enabled then
        lines[#lines + 1] = ('  identifiers: %d listed'):format(#cfg.identifiers.list)
    end
    if Access.legacy then
        lines[#lines + 1] = '  (config is in the old single-mode format — translated, still works)'
    end
    return lines
end

-- ─── Denial message ─────────────────────────────────────────
-- Printed whenever someone is refused, with the two exact lines
-- that would fix it — already filled in with that player's own
-- license, so a screenshot from a customer answers itself.

function Access.PrintDenial(src, label)
    local cfg = Access.config
    local name = GetPlayerName(src) or ('player ' .. tostring(src))
    print(('^1[%s]^7 ACCESS DENIED for %s (id %s)'):format(label, name, tostring(src)))
    if cfg.ace.enabled then
        local license
        for _, ident in ipairs(Access.Identifiers(src)) do
            if ident:find('license:', 1, true) == 1 then license = ident break end
        end
        print(('^5[%s]^7   add_ace group.admin %s allow'):format(label, cfg.ace.permissions[1]))
        print(('^5[%s]^7   add_principal identifier.%s group.admin')
            :format(label, license or 'license:PASTE_THE_LICENSE_HERE'))
        print(('^3[%s]^7   note: server.cfg aces only apply on server START — '
            .. 'paste both lines into the live console to apply them now'):format(label))
    else
        print(('^5[%s]^7   no ace method enabled — see shared/config.lua → Config.access'):format(label))
    end
end
