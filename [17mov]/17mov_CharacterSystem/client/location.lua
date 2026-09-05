Location.IsNew = nil
Location.Active = false

Location.Enter = function(lastLocation, isNew)
    Location.Active = true
    local spawns = Functions.DeepCopy(Location.Spawns)
    local ped = PlayerPedId()

    FreezeEntityPosition(ped, true)
    SetEntityVisible(ped, false, false)

    if lastLocation ~= nil then
        table.insert(spawns, 1, {
            name = "lastLocation",
            coords = lastLocation,
            label = _L("Location.LastLocation"),
            type = "location",
        })
    end

    if Location.SelectApartmentAtFirstSpawn and isNew then
        local apartaments = Apartments.GetApartments()
        spawns = {}

        for i = 1, #apartaments do
            table.insert(spawns, apartaments[i])
        end
    else
        if Location.EnableSpawningInHouse then
            local houses = Housing.GetPlayerHouses()

            for i = 1, #houses do
                table.insert(spawns, houses[i])
            end
        end

        if Location.EnableSpawningInApartment then
            local apartments = Apartments.GetPlayerApartments()

            for i = 1, #apartments do
                table.insert(spawns, apartments[i])
            end
        end
    end

    if #spawns == 0 then
        spawns = Functions.DeepCopy(Location.Spawns)

        if lastLocation ~= nil then
            table.insert(spawns, 1, {
                name = "lastLocation",
                coords = lastLocation,
                label = _L("Location.LastLocation"),
                type = "location",
            })
        end
    end

    Location.IsNew = isNew
    spawns = Location.UpdateLocationStreets(spawns)

    SetNuiFocusKeepInput(true)
    SetNuiFocus(true, true)
    Functions.SendNuiMessage("ToggleLocation", {
        state = true,
        locations = spawns
    })
end

Location.Exit = function()
    FreezeEntityPosition(ped, false)
    SetEntityVisible(ped, true, false)

    for i = 1, #Location.Spawns do
        if Location.Spawns[i].name == "lastLocation" then
            table.remove(Location.Spawns, i)
            break
        end
    end

    Location.IsNew = nil
    SetNuiFocus(false, false)
    Functions.SendNuiMessage("ToggleLocation", {
        state = false
    })
end

Location.UpdateLocationStreets = function(spawns)
    for k, v in pairs(spawns) do
        if not v.street then
            v.street = GetNameOfZone(v.coords.x, v.coords.y, v.coords.z)
        end
    end

    return spawns
end

Location.SpawnPlayer = function(info, isNew)
    PlyEnteredApartment = false

    CreateThread(function()
        if not isNew then
            isNew = false
        end

        DoScreenFadeOut(100)
        FreezeEntityPosition(PlayerPedId(), true)
        if Config.Showcase then
            Wait(200)
            SetNuiFocus(false, false)

            if info.type == "location" then
                info.coords = vec4(-1876.39, -1213.57, 13.02, 267.04)
                SetEntityCoords(PlayerPedId(), info.coords.x, info.coords.y, info.coords.z - 1.0, false, false, false, false)

                if info.coords.w then
                    SetEntityHeading(PlayerPedId(), info.coords.w)
                end

                RequestCollisionAtCoord(info.coords.x, info.coords.y, info.coords.z)

                while not HasCollisionLoadedAroundEntity(PlayerPedId()) do
                    Wait(10)
                end
            else
                SetEntityCoords(PlayerPedId(), -1876.39, -1213.57, 13.02, false, false, false, false)
                SetEntityHeading(PlayerPedId(), 267.04)
            end
        else
            if info.type == "location" then
                if type(info.coords) == "table" then
                    if info.coords.x and info.coords.y and info.coords.z then
                        info.coords = vector3(info.coords.x, info.coords.y, info.coords.z)
                    elseif info.coords.x and info.coords.y and info.coords.z and info.coords.w then
                        info.coords = vector4(info.coords.x, info.coords.y, info.coords.z, info.coords.w)
                    end
                end

                if not info.coords then
                    info.coords = Location.DefaultSpawnLocation
                end

                if #info.coords > 20000 then
                    info.coords = Location.InvalidLastLocationSpawnLocation
                    CreateThread(function()
                        Wait(5000)
                        Notify(_L("Location.InvalidCoords"))
                    end)
                end

                SetEntityCoords(PlayerPedId(), info.coords.x, info.coords.y, info.coords.z - 1.0, false, false, false, false)

                if info.coords.w then
                    SetEntityHeading(PlayerPedId(), info.coords.w)
                end

                RequestCollisionAtCoord(info.coords.x, info.coords.y, info.coords.z)

                while not HasCollisionLoadedAroundEntity(PlayerPedId()) do
                    Wait(10)
                end
            elseif info.type == "apartment" then
                Apartments.EnterToApartment(info, isNew)
            elseif info.type == "house" then
                Housing.EnterToHouse(info)
            end

            Location.PlayerSpawned(isNew, info)
        end

        Wait(100)
        FreezeEntityPosition(PlayerPedId(), false)

        TriggerServerEvent("17mov_CharacterSystem:ReturnToBucket")
        DoScreenFadeIn(250)
        SetEntityVisible(PlayerPedId(), true, true)

        if Config.Showcase then
            Citizen.Wait(1000)
            SetNuiFocus(false, false)
        end

        if not Location.Enable then
            TriggerEvent("17mov_CharacterSystem:PlayerSpawned", isNew)
        end
    end)
end

RegisterNUICallback("SelectLocation", function(body, cb)
    CreateThread(function()
        if Location.Active then
            local isNew = Location.IsNew
            Location.Active = false
            Location.SpawnPlayer(body.selected, isNew)
            Location.Exit()

            Citizen.Wait(500)
            TriggerEvent("17mov_CharacterSystem:PlayerSpawned", isNew)
        end
    end)

    cb("ok")
end)
