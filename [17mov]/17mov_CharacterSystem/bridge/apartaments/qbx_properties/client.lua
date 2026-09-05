---@diagnostic disable: duplicate-set-field
while Config.Apartments == "auto" do
    Wait(100)
end

if Config.Apartments ~= "qbx_properties" then return end

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
            name = v.label,
            label = _L("Location.Apartment"),
            street = v.label,
            coords = v.enter,
            id = k,
        })
    end

    return spawns
end

local findApartmentByLabel = function(label, apartments)
    for i=1, #apartments do
        if apartments[i].label == label then
            return apartments[i], i
        end
    end
end


Apartments.GetPlayerApartments = function()
    local spawns = {}
    local owned = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetPlayerApartments")
    if not owned or #owned == 0 then return {} end 

    for i = 1, #owned do
        local coords = json.decode(owned[i].coords)
        coords = vector3(coords.x, coords.y, coords.z)
        table.insert(spawns, {
            type = "apartment",
            appType = owned[i].id,
            name = owned[i].property_name,
            label = _L("Location.Apartment"),
            street = owned[i].property_name,
            coords = coords,
            id = owned[i].id,
        })
    end

    return spawns
end

Apartments.EnterToApartment = function(location, isNew)
    Apartments.PlayerEnteredApartment = false

    if isNew then
        TriggerServerEvent("qbx_properties:server:apartmentSelect", location.appType)
    else
        TriggerServerEvent("qbx_properties:server:enterProperty", {
            id = location.id,
            isSpawn = true,
        })
    end

    local startTime = GetGameTimer()

    local PlayerData = Core?.Functions?.GetPlayerData()

    while not PlayerData?.metadata?.currentPropertyId do
        if GetGameTimer() - startTime > 5000 then
            break
        end

        Wait(10)
        PlayerData = Core?.Functions?.GetPlayerData()
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

    local insideMeta = PlayerData?.metadata?["currentPropertyId"]

    if info.name == 'lastLocation' and insideMeta then
        TriggerServerEvent('qbx_properties:server:enterProperty', {
            id = insideMeta,
            isSpawn = true,
        })
    elseif not info.type or info.type ~= 'apartment' then
        TriggerServerEvent('17mov_CharacterSystem:SetcurrentId')
    end
end