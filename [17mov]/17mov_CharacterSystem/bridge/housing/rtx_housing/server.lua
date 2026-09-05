---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "rtx_housing" then return end

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
        owned = MySQL.query.await('SELECT houseid, propertyname, housedata FROM houses WHERE owneridentifier = ?', { identifier })
        inside = MySQL.scalar.await('SELECT houseid FROM lastproperty WHERE identifier = ?', { identifier })
    end

    for i = 1, #owned do
        local success, housedata = pcall(json.decode, owned[i].housedata)
        local coords = housedata?.enter?.coords

        if success then
            data.owned[#data.owned + 1] = {
                id = owned[i].houseid,
                label = owned[i].propertyname,
                coords = coords and vector3(coords.x, coords.y, coords.z) or vec3(0.0, 0.0, 0.0),
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
    exports["rtx_housing"]:EnterPropertyPlayer(src, propertyId)
end)

RegisterNetEvent("17mov_CharacterSystem:RemoveLastProperty", function()
    local src = source
    local identifier = GetIdentifier(src)

    MySQL.query.await('DELETE FROM lastproperty WHERE identifier = ?', { identifier })
end)
