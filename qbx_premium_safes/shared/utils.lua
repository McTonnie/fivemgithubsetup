SafeShared = {}

SafeShared.StashId = function(id)
    return ('safe_%s'):format(id)
end

SafeShared.SafeLabel = function(safe)
    local name = safe.safe_name and safe.safe_name ~= '' and safe.safe_name or ('Safe #%s'):format(safe.id)
    return ('%s - %s'):format(Config.Safes.stash.labelPrefix, name)
end

SafeShared.Round = function(value, decimals)
    local power = 10 ^ (decimals or 0)
    return math.floor((value * power) + 0.5) / power
end

SafeShared.Trim = function(value)
    if type(value) ~= 'string' then return value end
    return value:match('^%s*(.-)%s*$')
end

SafeShared.DeepCopy = function(tbl)
    if type(tbl) ~= 'table' then return tbl end
    local copy = {}
    for k, v in pairs(tbl) do
        copy[k] = SafeShared.DeepCopy(v)
    end
    return copy
end

SafeShared.TableContains = function(tbl, target)
    for i = 1, #tbl do
        if tbl[i] == target then return true end
    end
    return false
end

SafeShared.BuildUiTheme = function()
    return SafeShared.DeepCopy(Config.Theme.tokens)
end

SafeShared.SanitizeSafeName = function(name)
    name = SafeShared.Trim(tostring(name or ''))
    if #name < Config.Placement.nameMinLength or #name > Config.Placement.nameMaxLength then
        return nil, ('Name length must be between %s and %s characters'):format(Config.Placement.nameMinLength, Config.Placement.nameMaxLength)
    end
    return name
end

SafeShared.DecodeTrackedItems = function(value)
    if type(value) == 'table' then return value end
    if type(value) ~= 'string' or value == '' then return {} end
    local ok, decoded = pcall(json.decode, value)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

SafeShared.EncodeTrackedItems = function(items)
    return json.encode(items or {})
end

SafeShared.RandomToken = function(length)
    local chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    local result = {}
    for i = 1, length do
        local index = math.random(1, #chars)
        result[#result + 1] = chars:sub(index, index)
    end
    return table.concat(result)
end
