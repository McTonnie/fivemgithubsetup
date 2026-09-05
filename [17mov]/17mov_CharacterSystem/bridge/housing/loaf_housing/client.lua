---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "loaf_housing" then return end

Housing = {}

local propertyIds = {}

local function TeleportToEnterance(propertyid)
    local houseData = exports["loaf_housing"]:GetHouse(propertyid)

    if not houseData then
        return
    end

    local coords = houseData.entrance
    local playerPed = PlayerPedId()

    SetEntityCoords(playerPed, coords.x, coords.y, coords.z, false, false, false, false)
    Wait(500)

    while not HasCollisionLoadedAroundEntity(playerPed) do
        Wait(500)
        SetEntityCoords(playerPed, coords.x, coords.y, coords.z, false, false, false, false)
    end

    SetEntityCoords(playerPed, coords.x, coords.y, coords.z, false, false, false, false)

    if coords.w then
        SetEntityHeading(playerPed, coords.w)
    end
end

Housing.GetPlayerHouses = function()
    local data = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetHousingData")
    local spawns = {}

    for i = 1, #data do
        propertyIds[data[i].id] = data[i].propertyid

        table.insert(spawns, {
            id = data[i].id,
            type = "house",
            name = data[i].house,
            label = _L("Location.House"),
            coords = data[i].coords,
        })
    end

    return spawns
end

Housing.EnterToHouse = function(location)
    local uniqueId = location.id
    local propertyId = propertyIds[uniqueId]

    local success = exports["loaf_housing"]:EnterProperty(propertyId, uniqueId)
    FreezeEntityPosition(PlayerPedId(), false)

    if success then
        return
    end

    TeleportToEnterance(lastHouse.propertyid)
end

Housing.EnterLastHouse = function(info)
    local lastHouse = Functions.TriggerServerCallback.await("17mov_CharacterSystem:GetLastHouse")

    if not lastHouse or info.name ~= 'lastLocation' then
        if info.name ~= 'lastLocation' then
            TriggerServerEvent("17mov_CharacterSystem:RemoveLastProperty")
        end

        return
    end

    local success = exports["loaf_housing"]:EnterProperty(lastHouse.propertyid, lastHouse.id)

    if success then
        return
    end

    TeleportToEnterance(lastHouse.propertyid)
end
