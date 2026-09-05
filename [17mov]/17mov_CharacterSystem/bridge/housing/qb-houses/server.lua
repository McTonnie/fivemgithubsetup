---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "qb-houses" then return end

Functions.RegisterServerCallback("17mov_CharacterSystem:GetHousingData", function(src)
    local garages = {}
    local houses = {}
    local owned = {}

    local cid = Core.Functions.GetPlayer(src)?.PlayerData?.citizenid
    local result = MySQL.query.await('SELECT * FROM houselocations', {})

    if cid then
        owned = MySQL.query.await('SELECT * FROM player_houses WHERE citizenid = ?', { cid })
    end

    if result[1] ~= nil then
        for _, v in pairs(result) do
            local owned = false
            if tonumber(v.owned) == 1 then
                owned = true
            end
            local garage = v.garage ~= nil and json.decode(v.garage) or {}
            houses[v.name] = {
                coords = json.decode(v.coords),
                owned = owned,
                price = v.price,
                locked = true,
                adress = v.label,
                tier = v.tier,
                garage = garage,
                decorations = {},
            }
            garages[v.name] = {
                label = v.label,
                takeVehicle = garage,
            }
        end
    end

    TriggerClientEvent("qb-garages:client:houseGarageConfig", src, garages)
    TriggerClientEvent("qb-houses:client:setHouseConfig", src, houses)

    return {
        houses = houses,
        owned = owned,
    }
end)
