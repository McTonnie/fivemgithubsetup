---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "bcs_housing" then return end

local function GetIdentifier(src)
    if Config.Framework == "qb-core" then
        return Core.Functions.GetPlayer(src)?.PlayerData?.citizenid
    elseif Config.Framework == "es_extended" then
        return Core.GetPlayerFromId(src)?.identifier
    end
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
        owned = MySQL.query.await([[
            SELECT DISTINCT h.identifier, h.name, h.entry
            FROM house_owned ho
            JOIN house h ON h.identifier = ho.identifier
            WHERE
                ho.owner = ?;
        ]], { identifier })
        inside = MySQL.scalar.await('SELECT last_property FROM players WHERE citizenid = ?', { identifier })
    end

    for i = 1, #owned do
        local success, entry = pcall(json.decode, owned[i].entry)

        if success then
            data.owned[#data.owned + 1] = {
                id = owned[i].identifier,
                address = owned[i].name,
                coords = entry and vector3(entry.x, entry.y, entry.z) or vec3(0.0, 0.0, 0.0),
            }
        end
    end

    if inside then
        data.lastProperty = inside
    end

    return data
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
