---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "nolag_properties" then return end

Housing = {}

Housing.GetPlayerHouses = function()
    local owned = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetHousingData")
    local spawns = {}

    for i = 1, #owned do
        table.insert(spawns, {
            id = owned[i].id,
            type = "house",
            name = owned[i].address,
            label = _L("Location.House"),
            coords = owned[i].coords,
        })
    end

    return spawns
end

Housing.EnterToHouse = function(location)
    TriggerEvent('nolag_properties:client:spawnAtProperty', location.id)
    FreezeEntityPosition(PlayerPedId(), false)
end

Housing.EnterLastHouse = function(info)
    -- Not found a way to get the last entered property, so this is just a placeholder for now
end
