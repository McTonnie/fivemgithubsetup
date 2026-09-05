---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "bcs_housing" then return end

Housing = {}

Housing.GetPlayerHouses = function()
    local data = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetHousingData")
    local spawns = {}

    for i = 1, #data.owned do
        table.insert(spawns, {
            id = data.owned[i].id,
            type = "house",
            name = data.owned[i].address,
            label = _L("Location.House"),
            coords = data.owned[i].coords,
        })
    end

    Housing.LastProperty = data.lastProperty

    return spawns
end

Housing.EnterToHouse = function(location)
    TriggerEvent('Housing:client:EnterHome', location.id)
    FreezeEntityPosition(PlayerPedId(), false)
end

Housing.EnterLastHouse = function(info)
    if info.name == 'lastLocation' and Housing.LastProperty then
        TriggerServerEvent('17mov_CharacterSystem:EnterHouse', Housing.LastProperty)
    else
        TriggerServerEvent('17mov_CharacterSystem:RemoveLastProperty')
    end
end
