---@diagnostic disable: duplicate-set-field
while Config.Apartments == "auto" do
    Wait(100)
end

if Config.Apartments ~= "ps-housing" then return end

Apartments = {
    PlayerEnteredApartment = false,
    InitializedProperties = false,
}

Apartments.GetApartments = function()
    local locations = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetApartmentsLocations")
    local spawns = {}

    for k, v in pairs(locations) do
        table.insert(spawns, {
            type = "apartment",
            appType = k,
            name = v.name,
            label = _L("Location.Apartment"),
            street = v.label,
            coords = vector3(v.door.x, v.door.y, v.door.z),
            id = k,
        })
    end

    return spawns
end

Apartments.GetPlayerApartments = function()
    local locations = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetApartmentsLocations")
    local owned = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetPlayerApartment")
    local spawns = {}
    local apartment = locations?[owned?.apartment]

    if apartment then
        table.insert(spawns, {
            type = "apartment",
            appType = owned.apartment,
            name = apartment.name,
            label = _L("Location.Apartment"),
            street = apartment.label,
            coords = vector3(apartment.door.x, apartment.door.y, apartment.door.z),
            id = owned.property_id,
        })
    end

    return spawns
end

Apartments.EnterToApartment = function(location, isNew)
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

    if isNew then
        TriggerServerEvent("ps-housing:server:createNewApartment", location.appType)
    else
        TriggerServerEvent("ps-housing:server:enterProperty", location.id)
    end

    local startTime = GetGameTimer()

    while not Apartments.PlayerEnteredApartment do
        if GetGameTimer() - startTime > 5000 then
            break
        end

        Wait(10)
    end

    FreezeEntityPosition(PlayerPedId(), false)
end

Apartments.EnterLastApartment = function(info)
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