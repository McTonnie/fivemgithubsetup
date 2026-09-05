RegisterNUICallback("executePlayerAction", function(data, cb)
    if not data.actionKey or not data.playerId then
        cb({ status = "error", data = "Missing required data" })
        return
    end

    local success, message, extraData = lib.callback.await('amzn_admin:executePlayerAction', false, {
        actionKey = data.actionKey,
        playerId = data.playerId,
        inputs = data.inputs
    })
    
    cb({ status = success and "ok" or "error", data = { message = message, extraData = extraData } })
end)

-- Event handler for receiving admin actions feedback
RegisterNetEvent('amzn_admin:actionFeedback', function(message, type)
    SendNUIMessage({
        type = "showNotification",
        data = {
            message = message,
            type = type or "info"  
        }
    })
end) 

RegisterNetEvent('amzn_admin:client:SetLastLocation', function(coords)
    LastLocation = coords
end)

lib.callback.register('amzn_admin:client:GoBack', function()
    if not LastLocation then
        return false, "No previous location found"
    end

    SetEntityCoords(PlayerPedId(), LastLocation.x, LastLocation.y, LastLocation.z, false, false, false, false)
    return true, "Returned to previous location"
end)

RegisterNetEvent('amzn_admin:client:GoBack', function()
    if LastLocation then
        SetEntityCoords(PlayerPedId(), LastLocation.x, LastLocation.y, LastLocation.z, false, false, false, false)
    end
end)

-- Copy target player's ped appearance to the admin using a client callback
lib.callback.register('amzn_admin:client:CopyPedToMe', function(targetServerId)
    local myPed = PlayerPedId()
    local targetPlayer = GetPlayerFromServerId(targetServerId)
    if targetPlayer == -1 then
        return false, "Target not in range"
    end
    local targetPed = GetPlayerPed(targetPlayer)
    if not targetPed or targetPed == 0 then
        return false, "Target ped unavailable"
    end

    local targetModel = GetEntityModel(targetPed)
    local myModel = GetEntityModel(myPed)
    if targetModel ~= myModel then
        RequestModel(targetModel)
        while not HasModelLoaded(targetModel) do
            Wait(100)
        end
        SetPlayerModel(PlayerId(), targetModel)
        SetModelAsNoLongerNeeded(targetModel)
        myPed = PlayerPedId()
    end

    ClonePedToTarget(targetPed, myPed)
    return true, "Copied player's appearance"
end)

RegisterNetEvent('amzn_admin:client:Kill', function()
    ApplyDamageToPed(PlayerPedId(), PlayerPedId(), 1000, 0)
end)

local isFrozen = false
RegisterNetEvent('amzn_admin:client:Freeze', function()
    if isFrozen then
        FreezeEntityPosition(PlayerPedId(), false)
        isFrozen = false
    else
        FreezeEntityPosition(PlayerPedId(), true)
        isFrozen = true
    end
end)

RegisterNetEvent('amzn_admin:client:RepairVehicle', function()
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle then
        SetVehicleFixed(vehicle)
    end
end)

RegisterNetEvent('amzn_admin:client:SetModel', function(model)
    RequestModel(model)
    while not HasModelLoaded(model) do
        Wait(100)
    end
    SetPlayerModel(PlayerId(), model)
    SetPedRandomComponentVariation(PlayerPedId(), true)
    SetModelAsNoLongerNeeded(model)
end)

-- Fun Actions
RegisterNetEvent('amzn_admin:client:SetDrunk', function()
    local playerPed = PlayerPedId()
    SetPedMovementClipset(playerPed, "MOVE_M@DRUNK@VERYDRUNK", 1.0)
    SetTimecycleModifier("spectator5")
    SetPedIsDrunk(playerPed, true)
    SetPedMotionBlur(playerPed, true)
    Wait(15000) -- Duration of effect
    ClearTimecycleModifier()
    ResetPedMovementClipset(playerPed, 0.0)
    SetPedIsDrunk(playerPed, false)
    SetPedMotionBlur(playerPed, false)
end)

RegisterNetEvent('amzn_admin:client:ToggleRagdoll', function()
    local playerPed = PlayerPedId()
    if not IsEntityDead(playerPed) then
        SetPedToRagdoll(playerPed, 1000, 1000, 0, 0, 0, 0)
    end
end)

RegisterNetEvent('amzn_admin:client:SetOnFire', function()
    local playerPed = PlayerPedId()
    StartEntityFire(playerPed)
    Wait(5000)
    StopEntityFire(playerPed)
end)

RegisterNetEvent('amzn_admin:client:LaunchPlayer', function()
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)
    SetEntityCoords(playerPed, coords.x, coords.y, coords.z + 1.0)
    ApplyForceToEntity(playerPed, 1, 0.0, 0.0, 100.0, 0.0, 0.0, 0.0, 0, true, true, true, false, true)
end)

RegisterNetEvent('amzn_admin:client:ClownAttack', function()
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)
    local clownHash = GetHashKey("s_m_y_clown_01")
    
    RequestModel(clownHash)
    while not HasModelLoaded(clownHash) do Wait(1) end

    for i = 1, 3 do
        local x = coords.x + math.random(-10, 10)
        local y = coords.y + math.random(-10, 10)
        local z = coords.z
        
        local clown = CreatePed(4, clownHash, x, y, z, 0.0, true, false)
        TaskCombatPed(clown, playerPed, 0, 16)
        SetPedKeepTask(clown, true)
        CreateThread(function()
            Wait(15000) -- Duration before cleanup
            DeleteEntity(clown)
        end)
    end
    
    SetModelAsNoLongerNeeded(clownHash)
end)

RegisterNetEvent('amzn_admin:client:WildAttack', function()
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)
    local animalHash = GetHashKey("a_c_mtlion")
    
    RequestModel(animalHash)
    while not HasModelLoaded(animalHash) do Wait(1) end

    local animal = CreatePed(28, animalHash, coords.x + 20.0, coords.y, coords.z, 0.0, true, false)
    TaskCombatPed(animal, playerPed, 0, 16)
    SetPedKeepTask(animal, true)
    CreateThread(function()
        Wait(30000) -- Duration before cleanup
        DeleteEntity(animal)
    end)
    
    SetModelAsNoLongerNeeded(animalHash)
end)

RegisterNetEvent('amzn_admin:client:SpawnCompanion', function(petType)
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)
    local modelHash
    
    if petType == "dog" then
        modelHash = GetHashKey("a_c_husky")
    elseif petType == "cat" then
        modelHash = GetHashKey("a_c_cat_01")
    else
        modelHash = GetHashKey("a_c_husky")
    end
    
    RequestModel(modelHash)
    while not HasModelLoaded(modelHash) do Wait(1) end

    local pet = CreatePed(28, modelHash, coords.x + 1.0, coords.y, coords.z, 0.0, true, false)
    SetPedAsGroupMember(pet, GetPedGroupIndex(playerPed))
    TaskFollowToOffsetOfEntity(pet, playerPed, 0.0, -1.0, 0.0, 5.0, -1, 1.0, true)
    CreateThread(function()
        Wait(120000)
        if DoesEntityExist(pet) then
            DeleteEntity(pet)
        end
    end)
    
    SetModelAsNoLongerNeeded(modelHash)
end)

RegisterNetEvent('amzn_admin:client:UFOAttack', function()
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)
    local ufoHash = GetHashKey("p_spinning_anus_s")
    
    RequestModel(ufoHash)
    while not HasModelLoaded(ufoHash) do Wait(1) end

    local ufo = CreateObject(ufoHash, coords.x, coords.y, coords.z + 50.0, true, true, true)
    AttachEntityToEntity(ufo, playerPed, GetPedBoneIndex(playerPed, 60809), 0.0, 0.0, 15.0, 0.0, 0.0, 0.0, true, true, false, true, 1, false)
    
    -- UFO light effect
    CreateThread(function()
        local startTime = GetGameTimer()
        while GetGameTimer() - startTime < 10000 do
            if not DoesEntityExist(ufo) then break end
            local now = GetGameTimer() - startTime
            local ufoCoords = GetEntityCoords(ufo)

            -- Flickering green spotlight pointing down
            local flicker = math.sin(now * 0.02)
            local jitter = (math.random() - 0.5) * 0.4
            local brightness = math.max(0.5, 1.2 + 0.8 * flicker + jitter)
            DrawSpotLight(ufoCoords.x, ufoCoords.y, ufoCoords.z, 0.0, 0.0, -1.0, 0, 255, 120, 120.0, brightness, 3.0, 15.0, 1.2)

            Wait(0)
        end
    end)

    Wait(10000)
    DeleteEntity(ufo)
    
    SetModelAsNoLongerNeeded(ufoHash)
end)

-- Spawn a clone of the player that attacks them and despawns after a timeout
RegisterNetEvent('amzn_admin:client:CloneAttack', function()
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)

    -- Create a non-networked clone with head blend copied
    local clone = ClonePed(playerPed, false, false, true)
    if not clone or clone == 0 then return print('clone failed') end

    SetEntityCoords(clone, coords.x + 5.0, coords.y, coords.z)
    SetEntityHeading(clone, GetEntityHeading(playerPed))
    SetPedAsEnemy(clone, true)
    SetPedCombatAbility(clone, 2)
    SetPedCombatMovement(clone, 2)
    SetPedCombatRange(clone, 2)
    SetPedFleeAttributes(clone, 0, false)
    SetPedConfigFlag(clone, 281, true) -- Always fight
    GiveWeaponToPed(clone, `WEAPON_BAT`, 1, false, true)
    TaskCombatPed(clone, playerPed, 0, 16)
    SetPedKeepTask(clone, true)

    CreateThread(function()
        Wait(20000)
        if DoesEntityExist(clone) then
            DeleteEntity(clone)
        end
    end)
end)

RegisterNetEvent('amzn_admin:client:ShowWarning', function(reason)
    SetNuiFocus(true, true)
    SendNUIMessage({
        type = "showWarningScreen",
        data = {
            reason = reason
        }
    })
end)

RegisterNUICallback("warningClosed", function(data, cb)
    SetNuiFocus(false, false)
    cb({ status = "ok" })
end)

lib.callback.register('amzn_admin:client:GetCurrentVehicleProps', function()
	local ped = PlayerPedId()
	local veh = GetVehiclePedIsIn(ped, false)
	if veh == nil or veh == 0 then return false end

	local function round(value, numDecimalPlaces)
		if not numDecimalPlaces then return math.floor(value + 0.5) end
		local power = 10 ^ numDecimalPlaces
		return math.floor((value * power) + 0.5) / (power)
	end

	local function trim(value)
		if not value then return nil end
		return (string.gsub(value, '^%s*(.-)%s*$', '%1'))
	end

	local function getVehicleProperties(vehicle)
		if not DoesEntityExist(vehicle) then return nil end

		local pearlescentColor, wheelColor = GetVehicleExtraColours(vehicle)
		local colorPrimary, colorSecondary = GetVehicleColours(vehicle)
		if GetIsVehiclePrimaryColourCustom(vehicle) then
			local r, g, b = GetVehicleCustomPrimaryColour(vehicle)
			colorPrimary = { r, g, b }
		end
		if GetIsVehicleSecondaryColourCustom(vehicle) then
			local r, g, b = GetVehicleCustomSecondaryColour(vehicle)
			colorSecondary = { r, g, b }
		end

		local extras = {}
		for extraId = 0, 12 do
			if DoesExtraExist(vehicle, extraId) then
				local state = IsVehicleExtraTurnedOn(vehicle, extraId) == 1
				extras[tostring(extraId)] = state
			end
		end

		local modLivery = GetVehicleMod(vehicle, 48)
		if GetVehicleMod(vehicle, 48) == -1 and GetVehicleLivery(vehicle) ~= 0 then
			modLivery = GetVehicleLivery(vehicle)
		end

		local tireHealth = {}
		for i = 0, 3 do
			tireHealth[i] = GetVehicleWheelHealth(vehicle, i)
		end

		local tireBurstState = {}
		for i = 0, 5 do
			tireBurstState[i] = IsVehicleTyreBurst(vehicle, i, false)
		end

		local tireBurstCompletely = {}
		for i = 0, 5 do
			tireBurstCompletely[i] = IsVehicleTyreBurst(vehicle, i, true)
		end

		local windowStatus = {}
		for i = 0, 7 do
			windowStatus[i] = IsVehicleWindowIntact(vehicle, i) == 1
		end

		local doorStatus = {}
		for i = 0, 5 do
			doorStatus[i] = IsVehicleDoorDamaged(vehicle, i) == 1
		end

		local xenonColor
		local hasCustom, r, g, b = GetVehicleXenonLightsCustomColor(vehicle)
		if hasCustom then
			xenonColor = { r, g, b }
		else
			xenonColor = GetVehicleXenonLightsColor(vehicle)
		end

		return {
			model = GetEntityModel(vehicle),
			plate = trim(GetVehicleNumberPlateText(vehicle)),
			plateIndex = GetVehicleNumberPlateTextIndex(vehicle),
			bodyHealth = round(GetVehicleBodyHealth(vehicle), 0.1),
			engineHealth = round(GetVehicleEngineHealth(vehicle), 0.1),
			tankHealth = round(GetVehiclePetrolTankHealth(vehicle), 0.1),
			fuelLevel = round(GetVehicleFuelLevel(vehicle), 0.1),
			dirtLevel = round(GetVehicleDirtLevel(vehicle), 0.1),
			oilLevel = round(GetVehicleOilLevel(vehicle), 0.1),
			color1 = colorPrimary,
			color2 = colorSecondary,
			pearlescentColor = pearlescentColor,
			dashboardColor = GetVehicleDashboardColour(vehicle),
			wheelColor = wheelColor,
			wheels = GetVehicleWheelType(vehicle),
			wheelSize = GetVehicleWheelSize(vehicle),
			wheelWidth = GetVehicleWheelWidth(vehicle),
			tireHealth = tireHealth,
			tireBurstState = tireBurstState,
			tireBurstCompletely = tireBurstCompletely,
			windowTint = GetVehicleWindowTint(vehicle),
			windowStatus = windowStatus,
			doorStatus = doorStatus,
			neonEnabled = {
				IsVehicleNeonLightEnabled(vehicle, 0),
				IsVehicleNeonLightEnabled(vehicle, 1),
				IsVehicleNeonLightEnabled(vehicle, 2),
				IsVehicleNeonLightEnabled(vehicle, 3)
			},
			neonColor = { table.unpack({ GetVehicleNeonLightsColour(vehicle) }) },
			interiorColor = GetVehicleInteriorColour(vehicle),
			extras = extras,
			tyreSmokeColor = { table.unpack({ GetVehicleTyreSmokeColor(vehicle) }) },
			xenonColor = xenonColor,
			modSpoilers = GetVehicleMod(vehicle, 0),
			modFrontBumper = GetVehicleMod(vehicle, 1),
			modRearBumper = GetVehicleMod(vehicle, 2),
			modSideSkirt = GetVehicleMod(vehicle, 3),
			modExhaust = GetVehicleMod(vehicle, 4),
			modFrame = GetVehicleMod(vehicle, 5),
			modGrille = GetVehicleMod(vehicle, 6),
			modHood = GetVehicleMod(vehicle, 7),
			modFender = GetVehicleMod(vehicle, 8),
			modRightFender = GetVehicleMod(vehicle, 9),
			modRoof = GetVehicleMod(vehicle, 10),
			modEngine = GetVehicleMod(vehicle, 11),
			modBrakes = GetVehicleMod(vehicle, 12),
			modTransmission = GetVehicleMod(vehicle, 13),
			modHorns = GetVehicleMod(vehicle, 14),
			modSuspension = GetVehicleMod(vehicle, 15),
			modArmor = GetVehicleMod(vehicle, 16),
			modKit17 = GetVehicleMod(vehicle, 17),
			modTurbo = IsToggleModOn(vehicle, 18),
			modKit19 = GetVehicleMod(vehicle, 19),
			modSmokeEnabled = IsToggleModOn(vehicle, 20),
			modKit21 = GetVehicleMod(vehicle, 21),
			modXenon = IsToggleModOn(vehicle, 22),
			modFrontWheels = GetVehicleMod(vehicle, 23),
			modBackWheels = GetVehicleMod(vehicle, 24),
			modCustomTiresF = GetVehicleModVariation(vehicle, 23),
			modCustomTiresR = GetVehicleModVariation(vehicle, 24),
			modPlateHolder = GetVehicleMod(vehicle, 25),
			modVanityPlate = GetVehicleMod(vehicle, 26),
			modTrimA = GetVehicleMod(vehicle, 27),
			modOrnaments = GetVehicleMod(vehicle, 28),
			modDashboard = GetVehicleMod(vehicle, 29),
			modDial = GetVehicleMod(vehicle, 30),
			modDoorSpeaker = GetVehicleMod(vehicle, 31),
			modSeats = GetVehicleMod(vehicle, 32),
			modSteeringWheel = GetVehicleMod(vehicle, 33),
			modShifterLeavers = GetVehicleMod(vehicle, 34),
			modAPlate = GetVehicleMod(vehicle, 35),
			modSpeakers = GetVehicleMod(vehicle, 36),
			modTrunk = GetVehicleMod(vehicle, 37),
			modHydrolic = GetVehicleMod(vehicle, 38),
			modEngineBlock = GetVehicleMod(vehicle, 39),
			modAirFilter = GetVehicleMod(vehicle, 40),
			modStruts = GetVehicleMod(vehicle, 41),
			modArchCover = GetVehicleMod(vehicle, 42),
			modAerials = GetVehicleMod(vehicle, 43),
			modTrimB = GetVehicleMod(vehicle, 44),
			modTank = GetVehicleMod(vehicle, 45),
			modWindows = GetVehicleMod(vehicle, 46),
			modKit47 = GetVehicleMod(vehicle, 47),
			modLivery = modLivery,
			modKit49 = GetVehicleMod(vehicle, 49),
			liveryRoof = GetVehicleRoofLivery(vehicle),
		}
	end

	local props = getVehicleProperties(veh)
	if not props then return false end
    local vehname = GetEntityArchetypeName(veh):lower()
	return true, props, vehname
end)