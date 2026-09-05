if Config.GarageSystem == "autodetect" then
    if GetResourceState('qbx_garages') ~= 'started' and GetResourceState('qb-garages') ~= 'started' then
        return
    end
end

if Config.GarageSystem ~= "qb-qbx" and Config.GarageSystem ~= "autodetect" then return end

print('Storage Bridge Loaded: qb/qbx garages')
GM_STORAGE_LOADED = true
GM_STORAGE_NAME = 'qb/qbx garages'

lib.callback.register('garagemanager:fetchCharacterGarage', function(source, citizenId)
    if not HasPermission(source) then return end

    local res = MySQL.query.await('SELECT * FROM player_vehicles WHERE citizenid = ?', {citizenId})
    return res
end)

lib.callback.register('garagemanager:addVehicle', function(source, citizenId, plate, model, garage)
    if not HasPermission(source) then return end
    
    if not plate or plate == '' then
        plate = GenerateRandomPlate()

        while true do
            local res = MySQL.query.await('SELECT plate FROM player_vehicles WHERE plate = ?', {plate})
            if not res[1] then break end
            plate = GenerateRandomPlate()
        end
    else
        local res = MySQL.query.await('SELECT plate FROM player_vehicles WHERE plate = ?', {plate})
        if res[1] then return false end
    end

    local res = MySQL.query.await('SELECT license FROM players WHERE citizenid = ?', {citizenId})
    local license = res[1].license

    local defaultModsJson = [[{"bodyHealth":1000.0,"engineHealth":1000.0,"fuelLevel":100.0,"plate":"%s","model":"%s"}]]
    defaultModsJson = string.format(defaultModsJson, plate, model)
    local targetGarage = garage or (Config.GarageCodes and Config.GarageCodes[1]) or 'pillboxgarage'
    return MySQL.insert.await('INSERT INTO player_vehicles (license, citizenid, plate, vehicle, hash, mods, garage, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', {license, citizenId, plate, model, GetHashKey(model), defaultModsJson, targetGarage, 1})
end)

lib.callback.register('garagemanager:deleteVehicle', function(source, plate)
    if not HasPermission(source) then return end
    return MySQL.prepare.await('DELETE FROM player_vehicles WHERE plate = ?', {plate})
end)

lib.callback.register('garagemanager:sendToGarage', function(source, plate, garage)
    if not HasPermission(source) then return end
    local targetGarage = garage or (Config.GarageCodes and Config.GarageCodes[1]) or 'pillboxgarage'
    return MySQL.prepare.await('UPDATE player_vehicles SET garage = ?, state = 1 WHERE plate = ?', {targetGarage, plate})
end)

lib.callback.register('garagemanager:doesPlateExist', function(source, plate)
    if not HasPermission(source) then return end
    local res = MySQL.query.await('SELECT plate FROM player_vehicles WHERE plate = ?', {plate})
    return res[1] and true or false
end)

lib.callback.register('garagemanager:setPlate', function(source, plate, newPlate)
    if not HasPermission(source) then return end
    local res = MySQL.query.await('SELECT mods FROM player_vehicles WHERE plate = ?', {plate})
    local mods = json.decode(res[1].mods)
    mods.plate = newPlate

    return MySQL.prepare.await('UPDATE player_vehicles SET mods = ?, plate = ? WHERE plate = ?', {json.encode(mods), newPlate, plate})
end)

lib.callback.register('garagemanager:repairVehicle', function(source, plate)
    if not HasPermission(source) then return end
    local res = MySQL.query.await('SELECT mods FROM player_vehicles WHERE plate = ?', {plate})
    local mods = json.decode(res[1].mods)
    mods.bodyHealth = 1000.0
    mods.engineHealth = 1000.0

    return MySQL.prepare.await('UPDATE player_vehicles SET mods = ?, engine = 1000, body = 1000 WHERE plate = ?', {json.encode(mods), plate})
end)

lib.callback.register('garagemanager:refuelVehicle', function(source, plate)
    if not HasPermission(source) then return end
    local res = MySQL.query.await('SELECT mods FROM player_vehicles WHERE plate = ?', {plate})
    local mods = json.decode(res[1].mods)
    mods.fuelLevel = 100.0
    
    return MySQL.prepare.await('UPDATE player_vehicles SET mods = ?, fuel = 100 WHERE plate = ?', {json.encode(mods), plate})
end)

-- Provide vehicle data for spawning on client
lib.callback.register('garagemanager:getVehicleForSpawn', function(source, plate)
    if not HasPermission(source) then return {} end
    local res = MySQL.query.await('SELECT vehicle, mods FROM player_vehicles WHERE plate = ?', {plate})
    if not res or not res[1] then return nil end
    local row = res[1]
    local mods = {}
    if row.mods then
        local ok, parsed = pcall(json.decode, row.mods)
        if ok and type(parsed) == 'table' then mods = parsed end
    end
    return { model = row.vehicle, props = mods }
end)