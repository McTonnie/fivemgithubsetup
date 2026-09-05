---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "RxHousing" then return end

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
        owned = MySQL.query.await('SELECT id, label, coords FROM rx_housing WHERE owner = ?', { identifier })
        inside = MySQL.single.await('SELECT * FROM rx_housing_inside WHERE identifier = ?', { identifier })
    end

    for i = 1, #owned do
        local success, coords = pcall(json.decode, owned[i].coords)

        if success then
            data.owned[#data.owned + 1] = {
                id = owned[i].id,
                label = owned[i].label,
                coords = coords?.entrance and vector3(coords.entrance.x, coords.entrance.y, coords.entrance.z) or vec3(0.0, 0.0, 0.0),
            }
        end
    end

    if inside then
        data.lastProperty = inside.propertyId
    end

    return data
end)

RegisterNetEvent("17mov_CharacterSystem:RemoveLastProperty", function()
    local src = source
    local identifier = GetIdentifier(src)

    MySQL.query.await('DELETE FROM rx_housing_inside WHERE identifier = ?', { identifier })
end)
