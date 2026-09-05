---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "ps-housing" then return end

Housing = {
    PlayerEnteredApartment = false,
    InitializedProperties = false,
}

Housing.GetPlayerHouses = function()
    local data = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetHousingData")
    local spawns = {}

    for _, v in pairs(data.owned) do
        local coords = vec3(0.0, 0.0, 0.0)

        if v.shell ~= "mlo" then
            coords = vector3(v.door_data.x, v.door_data.y, v.door_data.z)
        elseif v.zone_data?.points?[1] then
            coords = vector3(v.zone_data.points[1].x, v.zone_data.points[1].y, v.zone_data.points[1].z)
        end

        table.insert(spawns, {
            id = v.property_id,
            type = "house",
            name = v.house,
            label = _L("Location.House"),
            coords = coords,
        })
    end

    return spawns
end

Housing.EnterToHouse = function(location)
    Apartments.PlayerEnteredApartment = false

    if not Apartments.InitializedProperties then
        TriggerEvent("ps-housing:client:initialiseProperties")
        local startTimer = GetGameTimer()

        while not Apartments.InitializedProperties do
            if GetGameTimer() - startTimer > 5000 then
                Functions.Print("Failed to initialise properties in time. Is it already initialised?")
                break
            end

            Wait(100)
        end
    end

    TriggerServerEvent("ps-housing:server:enterProperty", location.id)

    local startTime = GetGameTimer()

    while not Apartments.PlayerEnteredApartment do
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
    local propertyId = insideMeta.property_id

    if info.name == 'lastLocation' and propertyId ~= nil then
        TriggerServerEvent('ps-housing:server:enterProperty', tostring(propertyId))
    else
        TriggerServerEvent('ps-housing:server:resetMetaData')
    end
end

RegisterNetEvent("ps-housing:client:enterProperty", function()
    Apartments.PlayerEnteredApartment = true
end)

RegisterNetEvent("ps-housing:client:initialisedProperties", function()
    Apartments.InitializedProperties = true
end)