---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "qb-houses" then return end

Housing = {}

Housing.GetPlayerHouses = function()
    local data = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetHousingData")
    local spawns = {}

    for _, v in pairs(data.owned) do
        table.insert(spawns, {
            id = v.id,
            type = "house",
            name = v.house,
            label = _L("Location.House"),
            coords = data.houses[v.house]?.coords.enter or vec3(0.0, 0.0, 0.0),
        })
    end

    return spawns
end

Housing.EnterToHouse = function(location)
    Housing.PlayerEnteredHouse = false

    TriggerEvent('qb-houses:client:enterOwnedHouse', location.name)

    local startTime = GetGameTimer()

    while not Housing.PlayerEnteredHouse do
        if GetGameTimer() - startTime > 5000 then
            break
        end

        Wait(10)
    end

    FreezeEntityPosition(PlayerPedId(), false)
end

Housing.EnterLastHouse = function(info)
    local PlayerData = Core?.Functions?.GetPlayerData()
    local timeout = GetGameTimer() + 5000

    while (PlayerData == nil or PlayerData.metadata == nil) and GetGameTimer() < timeout do
        PlayerData = Core?.Functions?.GetPlayerData()
        Wait(100)
    end

    local insideMeta = PlayerData.metadata["inside"]
    local houseId = insideMeta?.house

    if info.name == 'lastLocation' and houseId then
        TriggerEvent('qb-houses:client:LastLocationHouse', houseId)
    else
        TriggerServerEvent('qb-houses:server:SetInsideMeta', 0, false)
    end
end

RegisterNetEvent("qb-weed:client:getHousePlants", function()
    Housing.PlayerEnteredHouse = true
end)
