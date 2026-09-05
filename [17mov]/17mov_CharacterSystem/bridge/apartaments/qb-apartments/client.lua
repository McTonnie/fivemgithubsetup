---@diagnostic disable: duplicate-set-field
while Config.Apartments == "auto" do
    Wait(100)
end

if Config.Apartments ~= "qb-apartments" then return end

Apartments = {
    PlayerEnteredApartment = false,
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
            coords = v.coords.enter,
            id = k,
        })
    end

    return spawns
end

Apartments.GetPlayerApartments = function()
    local locations = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetApartmentsLocations")
    local owned = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetPlayerApartment")
    local spawns = {}
    local apartment = locations?[owned?.type]

    if apartment then
        table.insert(spawns, {
            type = "apartment",
            appType = owned.type,
            name = apartment.name,
            label = _L("Location.Apartment"),
            street = apartment.label,
            coords = apartment.coords.enter,
            id = owned.id,
        })
    end

    return spawns
end

Apartments.EnterToApartment = function(location, isNew)
    Apartments.PlayerEnteredApartment = false

    if isNew then
        TriggerServerEvent("apartments:server:CreateApartment", location.appType, location.label, true)
    else
        TriggerEvent("qb-apartments:client:LastLocationHouse", location.appType, location.name)
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
    local apartmentType = insideMeta?.apartment?.apartmentType
    local apartmentId = insideMeta?.apartment?.apartmentId

    if info.name == 'lastLocation' and apartmentType and apartmentId then
        TriggerEvent('qb-apartments:client:LastLocationHouse', apartmentType, apartmentId)
    else
        TriggerServerEvent('qb-apartments:server:SetInsideMeta', 0, 0, false)
    end
end

RegisterNetEvent("17mov_CharacterSystem:PlayerEnteredApartment", function()
    Apartments.PlayerEnteredApartment = true
end)
