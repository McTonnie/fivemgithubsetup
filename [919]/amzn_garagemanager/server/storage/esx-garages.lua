-- If another storage bridge has already initialized, skip
if GM_STORAGE_LOADED then return end

if Config.GarageSystem == "autodetect" then
    -- Prefer jg-advancedgarages when present; skip ESX bridge in that case
    if GetResourceState('jg-advancedgarages') == 'started' then
        return
    end
    if GetResourceState('es_extended') ~= 'started' then
        return
    end
end

if Config.GarageSystem ~= "esx" and Config.GarageSystem ~= "autodetect" then return end

print('Storage Bridge Loaded: ESX owned_vehicles')
GM_STORAGE_LOADED = true
GM_STORAGE_NAME = 'esx'

-- Detect optional columns on owned_vehicles
local columnCache = {
    hasGarage = false,
    hasType = false,
    hasStored = true -- most ESX schemas include stored
}

local function detectOwnedVehiclesColumns()
    local ok, res = pcall(function()
        return MySQL.query.await([[SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'owned_vehicles']])
    end)
    if not ok or not res then return end
    for i = 1, #res do
        local col = string.lower(res[i].COLUMN_NAME or res[i].column_name or '')
        if col == 'garage' or col == 'garage_id' then columnCache.hasGarage = true end
        if col == 'type' then columnCache.hasType = true end
        if col == 'stored' then columnCache.hasStored = true end
    end
end

detectOwnedVehiclesColumns()

local function coalesceGarage(target)
    return target or (Config.GarageCodes and Config.GarageCodes[1]) or 'default'
end

local function parseVehicleJson(rowVehicle)
    local ok, data = pcall(json.decode, rowVehicle or '{}')
    if not ok or type(data) ~= 'table' then data = {} end
    return data
end

lib.callback.register('garagemanager:fetchCharacterGarage', function(source, citizenId)
    if not HasPermission(source) then return {} end

    local res = MySQL.query.await('SELECT plate, vehicle' .. (columnCache.hasStored and ', stored' or '') .. (columnCache.hasGarage and ', garage' or '') .. ' FROM owned_vehicles WHERE owner = ?', {citizenId})
    local vehicles = {}
    for i = 1, #res do
        local row = res[i]
        local vdata = parseVehicleJson(row.vehicle)
        local body = tonumber(vdata.bodyHealth) or 1000.0
        local engine = tonumber(vdata.engineHealth) or 1000.0
        local fuel = tonumber(vdata.fuelLevel) or 100.0
        local state = 1
        if columnCache.hasStored then
            local storedVal = row.stored
            if storedVal == 0 or storedVal == false or storedVal == '0' then
                state = 0
            else
                state = 1
            end
        end
        local garage = columnCache.hasGarage and (row.garage or coalesceGarage(nil)) or coalesceGarage(nil)
        table.insert(vehicles, {
            model = vdata.model,
            vehicle = vdata.model,
            plate = row.plate,
            state = state,
            garage = garage,
            fuel = math.floor(fuel + 0.5),
            body = body,
            engine = engine
        })
    end
    return vehicles
end)

lib.callback.register('garagemanager:addVehicle', function(source, citizenId, plate, model, garage)
    if not HasPermission(source) then return false end

    if not plate or plate == '' then
        plate = GenerateRandomPlate()

        while true do
            local res = MySQL.query.await('SELECT plate FROM owned_vehicles WHERE plate = ?', {plate})
            if not res[1] then break end
            plate = GenerateRandomPlate()
        end
    else
        local res = MySQL.query.await('SELECT plate FROM owned_vehicles WHERE plate = ?', {plate})
        if res[1] then return false end
    end

    local modelHash = GetHashKey(model)
    local defaultVehicleJsonTbl = {
        bodyHealth = 1000.0,
        engineHealth = 1000.0,
        fuelLevel = 100.0,
        plate = plate,
        model = modelHash,
        modelName = model
    }
    local defaultVehicleJson = json.encode(defaultVehicleJsonTbl)
    local targetGarage = coalesceGarage(garage)

    if columnCache.hasGarage and columnCache.hasType then
        return MySQL.insert.await('INSERT INTO owned_vehicles (owner, plate, vehicle, stored, garage, type) VALUES (?, ?, ?, ?, ?, ?)', {citizenId, plate, defaultVehicleJson, 1, targetGarage, 'car'})
    elseif columnCache.hasGarage then
        return MySQL.insert.await('INSERT INTO owned_vehicles (owner, plate, vehicle, stored, garage) VALUES (?, ?, ?, ?, ?)', {citizenId, plate, defaultVehicleJson, 1, targetGarage})
    elseif columnCache.hasType then
        return MySQL.insert.await('INSERT INTO owned_vehicles (owner, plate, vehicle, stored, type) VALUES (?, ?, ?, ?, ?)', {citizenId, plate, defaultVehicleJson, 1, 'car'})
    else
        return MySQL.insert.await('INSERT INTO owned_vehicles (owner, plate, vehicle, stored) VALUES (?, ?, ?, ?)', {citizenId, plate, defaultVehicleJson, 1})
    end
end)

lib.callback.register('garagemanager:deleteVehicle', function(source, plate)
    if not HasPermission(source) then return false end
    return MySQL.prepare.await('DELETE FROM owned_vehicles WHERE plate = ?', {plate})
end)

lib.callback.register('garagemanager:sendToGarage', function(source, plate, garage)
    if not HasPermission(source) then return false end
    local targetGarage = coalesceGarage(garage)
    if columnCache.hasGarage then
        return MySQL.prepare.await('UPDATE owned_vehicles SET stored = 1, garage = ? WHERE plate = ?', {targetGarage, plate})
    else
        return MySQL.prepare.await('UPDATE owned_vehicles SET stored = 1 WHERE plate = ?', {plate})
    end
end)

lib.callback.register('garagemanager:doesPlateExist', function(source, plate)
    if not HasPermission(source) then return false end
    local res = MySQL.query.await('SELECT plate FROM owned_vehicles WHERE plate = ?', {plate})
    return res[1] and true or false
end)

lib.callback.register('garagemanager:setPlate', function(source, plate, newPlate)
    if not HasPermission(source) then return false end
    local res = MySQL.query.await('SELECT vehicle FROM owned_vehicles WHERE plate = ?', {plate})
    if not res[1] then return false end
    local vdata = parseVehicleJson(res[1].vehicle)
    vdata.plate = newPlate
    local enc = json.encode(vdata)
    return MySQL.prepare.await('UPDATE owned_vehicles SET vehicle = ?, plate = ? WHERE plate = ?', {enc, newPlate, plate})
end)

lib.callback.register('garagemanager:repairVehicle', function(source, plate)
    if not HasPermission(source) then return false end
    local res = MySQL.query.await('SELECT vehicle FROM owned_vehicles WHERE plate = ?', {plate})
    if not res[1] then return false end
    local vdata = parseVehicleJson(res[1].vehicle)
    vdata.bodyHealth = 1000.0
    vdata.engineHealth = 1000.0
    local enc = json.encode(vdata)
    return MySQL.prepare.await('UPDATE owned_vehicles SET vehicle = ? WHERE plate = ?', {enc, plate})
end)

lib.callback.register('garagemanager:refuelVehicle', function(source, plate)
    if not HasPermission(source) then return false end
    local res = MySQL.query.await('SELECT vehicle FROM owned_vehicles WHERE plate = ?', {plate})
    if not res[1] then return false end
    local vdata = parseVehicleJson(res[1].vehicle)
    vdata.fuelLevel = 100.0
    local enc = json.encode(vdata)
    return MySQL.prepare.await('UPDATE owned_vehicles SET vehicle = ? WHERE plate = ?', {enc, plate})
end)

-- Provide vehicle data for spawning on client
lib.callback.register('garagemanager:getVehicleForSpawn', function(source, plate)
    if not HasPermission(source) then return false end
    local res = MySQL.query.await('SELECT vehicle FROM owned_vehicles WHERE plate = ?', {plate})
    if not res or not res[1] then return nil end
    local v = parseVehicleJson(res[1].vehicle)
    local model = v.modelName or v.model
    return { model = model, props = v }
end)