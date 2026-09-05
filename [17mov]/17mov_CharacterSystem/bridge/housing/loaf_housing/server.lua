---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "loaf_housing" then return end

local function GetIdentifier(src)
    if Config.Framework == "qb-core" then
        return Core.Functions.GetPlayer(src)?.PlayerData?.citizenid
    elseif Config.Framework == "es_extended" then
        return Core.GetPlayerFromId(src)?.identifier
    end
end

Functions.RegisterServerCallback("17mov_CharacterSystem:GetHousingData", function(src)
    local identifier = GetIdentifier(src)
    local data = {}
    local owned = {}

    if identifier then
        owned = MySQL.query.await('SELECT id, propertyid FROM loaf_properties WHERE owner = ?', { identifier })
    end

    for i = 1, #owned do
        local house = exports["loaf_housing"]:GetHouse(owned[i].propertyid)

        data[i] = {
            id = owned[i].id,
            propertyid = owned[i].propertyid,
            house = house.label,
            coords = vector3(house.entrance.x, house.entrance.y, house.entrance.z),
        }
    end

    return data
end)

Functions.RegisterServerCallback("17mov_CharacterSystem:GetLastHouse", function(src)
    local identifier = GetIdentifier(src)
    local lastProperty = MySQL.single.await("SELECT `propertyid`, `id` FROM `loaf_current_property` WHERE `identifier`=?", { identifier })

    if lastProperty ~= nil then
        MySQL.update.await("DELETE FROM `loaf_current_property` WHERE `identifier`=?", { identifier })
    end

    return lastProperty
end)

RegisterNetEvent("17mov_CharacterSystem:RemoveLastProperty", function()
    local src = source
    local identifier = GetIdentifier(src)
    MySQL.update.await("DELETE FROM `loaf_current_property` WHERE `identifier`=?", { identifier })
end)
