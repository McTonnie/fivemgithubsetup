---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "vms_housing" then return end

local function GetIdentifier(src)
    if Config.Framework == "qb-core" then
        return Core.Functions.GetPlayer(src)?.PlayerData?.citizenid
    elseif Config.Framework == "es_extended" then
        return Core.GetPlayerFromId(src)?.identifier
    end
end

local function GetLastProperty(src)
    local identifier = GetIdentifier(src)
    local result = nil

    if Config.Framework == "qb-core" then
        result = MySQL.scalar.await('SELECT last_property FROM players WHERE citizenid = ?', { identifier })
    elseif Config.Framework == "es_extended" then
        result = MySQL.scalar.await('SELECT last_property FROM users WHERE identifier = ?', { identifier })
    end

    if result then
        local success, data = pcall(json.decode, result)

        if success then
            return data.id
        end
    end

    return nil
end

Functions.RegisterServerCallback("17mov_CharacterSystem:GetHousingData", function(src)
    local identifier = GetIdentifier(src)
    local owned = {}
    local inside = nil
    local data = {
        owned = {},
        lastProperty = nil,
    }

    if identifier then
        owned = MySQL.query.await('SELECT id, name, metadata FROM houses WHERE owner = ?', { identifier })
        inside = GetLastProperty(src)
    end

    for i = 1, #owned do
        local success, metadata = pcall(json.decode, owned[i].metadata)

        if success then
            data.owned[#data.owned + 1] = {
                id = owned[i].id,
                name = owned[i].name,
                coords = metadata?.enter and vector3(metadata.enter.x, metadata.enter.y, metadata.enter.z) or vec3(0.0, 0.0, 0.0),
            }
        end

    end

    if inside then
        data.lastProperty = inside
    end

    return data
end)

RegisterNetEvent("17mov_CharacterSystem:EnterHouse", function(propertyId)
    local src = source
    exports['vms_housing']:EnterProperty(src, propertyId)
end)

RegisterNetEvent("17mov_CharacterSystem:RemoveLastProperty", function()
    local src = source
    local identifier = GetIdentifier(src)

    if Config.Framework == "qb-core" then
        MySQL.query.await('UPDATE players SET last_property = NULL WHERE citizenid = ?', { identifier })
    elseif Config.Framework == "es_extended" then
        MySQL.query.await('UPDATE users SET last_property = NULL WHERE identifier = ?', { identifier })
    end
end)
