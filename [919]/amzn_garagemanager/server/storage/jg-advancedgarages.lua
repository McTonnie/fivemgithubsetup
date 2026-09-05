-- If another storage bridge has already initialized, skip
if GM_STORAGE_LOADED then return end

if Config.GarageSystem == "autodetect" then
    if GetResourceState('jg-advancedgarages') ~= 'started' then
        return
    end
end

if Config.GarageSystem ~= "jg-advancedgarages" and Config.GarageSystem ~= "autodetect" then return end

print('Storage Bridge Loaded: jg-advancedgarages')
GM_STORAGE_LOADED = true

-- Detect schema: QB/QBX (player_vehicles) or ESX (owned_vehicles)
local JG_DB_MODE = nil -- 'qb' | 'esx'

local function tableExists(name)
    local ok, res = pcall(function()
        return MySQL.scalar.await("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", {name})
    end)
    if not ok or not res then return false end
    return tonumber(res) and tonumber(res) > 0
end

local function detectSchema()
    local hasQB = tableExists('player_vehicles')
    local hasESX = tableExists('owned_vehicles')
    if Framework == 'esx' and hasESX then
        JG_DB_MODE = 'esx'
    elseif hasQB then
        JG_DB_MODE = 'qb'
    elseif hasESX then
        JG_DB_MODE = 'esx'
    else
        JG_DB_MODE = 'qb' -- default
    end
end

detectSchema()

-- ESX owned_vehicles optional columns
local esxColumns = { hasGarage = false, hasType = false, hasStored = true }
local function detectEsxColumns()
    if JG_DB_MODE ~= 'esx' then return end
    local ok, res = pcall(function()
        return MySQL.query.await([[SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'owned_vehicles']])
    end)
    if not ok or not res then return end
    for i = 1, #res do
        local col = string.lower(res[i].COLUMN_NAME or res[i].column_name or '')
        if col == 'garage' or col == 'garage_id' then esxColumns.hasGarage = true end
        if col == 'type' then esxColumns.hasType = true end
        if col == 'stored' then esxColumns.hasStored = true end
    end
end

detectEsxColumns()

GM_STORAGE_NAME = ('jg-advancedgarages (%s)'):format(JG_DB_MODE or 'unknown')

local function coalesceGarage(target)
    return target or (Config.GarageCodes and Config.GarageCodes[1]) or 'pillboxgarage'
end

local function parseVehicleJson(jsonStr)
    local ok, data = pcall(json.decode, jsonStr or '{}')
    if not ok or type(data) ~= 'table' then data = {} end
    return data
end

lib.callback.register('garagemanager:fetchCharacterGarage', function(source, citizenId)
    if not HasPermission(source) then return {} end
    if JG_DB_MODE == 'qb' then
        local res = MySQL.query.await('SELECT * FROM player_vehicles WHERE citizenid = ?', {citizenId})
        if not res or type(res) ~= 'table' then return {} end
        for i = 1, #res do
            res[i].state = res[i].in_garage and 1 or 0
            res[i].garage = res[i].garage_id
            -- Ensure model field exists for client display normalization
            if not res[i].model and res[i].vehicle then
                res[i].model = res[i].vehicle
            end
        end
        return res
    else
        local cols = 'plate, vehicle' .. (esxColumns.hasStored and ', stored' or '') .. (esxColumns.hasGarage and ', garage' or '')
        local res = MySQL.query.await(('SELECT %s FROM owned_vehicles WHERE owner = ?'):format(cols), {citizenId})
        if not res or type(res) ~= 'table' then return {} end
        local vehicles = {}
        for i = 1, #res do
            local row = res[i]
            local v = parseVehicleJson(row.vehicle)
            local body = tonumber(v.bodyHealth) or 1000.0
            local engine = tonumber(v.engineHealth) or 1000.0
            local fuel = tonumber(v.fuelLevel) or 100.0
            local state = 1
            if esxColumns.hasStored then
                local storedVal = row.stored
                if storedVal == 0 or storedVal == false or storedVal == '0' then state = 0 else state = 1 end
            end
            local garage = esxColumns.hasGarage and (row.garage or coalesceGarage(nil)) or coalesceGarage(nil)
            table.insert(vehicles, {
                vehicle = tostring(v.modelName or v.model or 'unknown'),
                -- Provide a numeric or string model key for client normalization
                model = v.modelName or v.model,
                plate = row.plate,
                state = state,
                garage = garage,
                fuel = math.floor(fuel + 0.5),
                body = body,
                engine = engine
            })
        end
        return vehicles
    end
end)

lib.callback.register('garagemanager:addVehicle', function(source, citizenId, plate, model, garage)
    if not HasPermission(source) then return false end
    if JG_DB_MODE == 'qb' then
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
        local targetGarage = coalesceGarage(garage)
        return MySQL.insert.await('INSERT INTO player_vehicles (license, citizenid, plate, vehicle, hash, mods, garage, state, in_garage, garage_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', {license, citizenId, plate, model, GetHashKey(model), defaultModsJson, targetGarage, 1, 1, targetGarage})
    else
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
        local v = { bodyHealth = 1000.0, engineHealth = 1000.0, fuelLevel = 100.0, plate = plate, model = modelHash, modelName = model }
        local targetGarage = coalesceGarage(garage)
        if esxColumns.hasGarage and esxColumns.hasType then
            return MySQL.insert.await('INSERT INTO owned_vehicles (owner, plate, vehicle, stored, garage, type) VALUES (?, ?, ?, ?, ?, ?)', {citizenId, plate, json.encode(v), 1, targetGarage, 'car'})
        elseif esxColumns.hasGarage then
            return MySQL.insert.await('INSERT INTO owned_vehicles (owner, plate, vehicle, stored, garage) VALUES (?, ?, ?, ?, ?)', {citizenId, plate, json.encode(v), 1, targetGarage})
        elseif esxColumns.hasType then
            return MySQL.insert.await('INSERT INTO owned_vehicles (owner, plate, vehicle, stored, type) VALUES (?, ?, ?, ?, ?)', {citizenId, plate, json.encode(v), 1, 'car'})
        else
            return MySQL.insert.await('INSERT INTO owned_vehicles (owner, plate, vehicle, stored) VALUES (?, ?, ?, ?)', {citizenId, plate, json.encode(v), 1})
        end
    end
end)

lib.callback.register('garagemanager:deleteVehicle', function(source, plate)
    if not HasPermission(source) then return false end
    if JG_DB_MODE == 'qb' then
        return MySQL.prepare.await('DELETE FROM player_vehicles WHERE plate = ?', {plate})
    else
        return MySQL.prepare.await('DELETE FROM owned_vehicles WHERE plate = ?', {plate})
    end
end)

lib.callback.register('garagemanager:sendToGarage', function(source, plate, garage)
    if not HasPermission(source) then return false end
    local targetGarage = coalesceGarage(garage)
    if JG_DB_MODE == 'qb' then
        return MySQL.prepare.await('UPDATE player_vehicles SET garage = ?, state = 1, in_garage = 1, garage_id = ? WHERE plate = ?', {targetGarage, targetGarage, plate})
    else
        if esxColumns.hasGarage then
            return MySQL.prepare.await('UPDATE owned_vehicles SET stored = 1, garage = ? WHERE plate = ?', {targetGarage, plate})
        else
            return MySQL.prepare.await('UPDATE owned_vehicles SET stored = 1 WHERE plate = ?', {plate})
        end
    end
end)

lib.callback.register('garagemanager:doesPlateExist', function(source, plate)
    if not HasPermission(source) then return false end
    if JG_DB_MODE == 'qb' then
        local res = MySQL.query.await('SELECT plate FROM player_vehicles WHERE plate = ?', {plate})
        return res[1] and true or false
    else
        local res = MySQL.query.await('SELECT plate FROM owned_vehicles WHERE plate = ?', {plate})
        return res[1] and true or false
    end
end)

lib.callback.register('garagemanager:setPlate', function(source, plate, newPlate)
    if not HasPermission(source) then return false end
    if JG_DB_MODE == 'qb' then
        local res = MySQL.query.await('SELECT mods FROM player_vehicles WHERE plate = ?', {plate})
        local mods = json.decode(res[1].mods)
        mods.plate = newPlate
        return MySQL.prepare.await('UPDATE player_vehicles SET mods = ?, plate = ? WHERE plate = ?', {json.encode(mods), newPlate, plate})
    else
        local res = MySQL.query.await('SELECT vehicle FROM owned_vehicles WHERE plate = ?', {plate})
        if not res[1] then return false end
        local v = parseVehicleJson(res[1].vehicle)
        v.plate = newPlate
        return MySQL.prepare.await('UPDATE owned_vehicles SET vehicle = ?, plate = ? WHERE plate = ?', {json.encode(v), newPlate, plate})
    end
end)

lib.callback.register('garagemanager:repairVehicle', function(source, plate)
    if not HasPermission(source) then return false end
    if JG_DB_MODE == 'qb' then
        local res = MySQL.query.await('SELECT mods FROM player_vehicles WHERE plate = ?', {plate})
        local mods = json.decode(res[1].mods)
        mods.bodyHealth = 1000.0
        mods.engineHealth = 1000.0
        return MySQL.prepare.await('UPDATE player_vehicles SET mods = ?, engine = 1000, body = 1000 WHERE plate = ?', {json.encode(mods), plate})
    else
        local res = MySQL.query.await('SELECT vehicle FROM owned_vehicles WHERE plate = ?', {plate})
        if not res[1] then return false end
        local v = parseVehicleJson(res[1].vehicle)
        v.bodyHealth = 1000.0
        v.engineHealth = 1000.0
        return MySQL.prepare.await('UPDATE owned_vehicles SET vehicle = ? WHERE plate = ?', {json.encode(v), plate})
    end
end)

lib.callback.register('garagemanager:refuelVehicle', function(source, plate)
    if not HasPermission(source) then return false end
    if JG_DB_MODE == 'qb' then
        local res = MySQL.query.await('SELECT mods FROM player_vehicles WHERE plate = ?', {plate})
        local mods = json.decode(res[1].mods)
        mods.fuelLevel = 100.0
        return MySQL.prepare.await('UPDATE player_vehicles SET mods = ?, fuel = 100 WHERE plate = ?', {json.encode(mods), plate})
    else
        local res = MySQL.query.await('SELECT vehicle FROM owned_vehicles WHERE plate = ?', {plate})
        if not res[1] then return false end
        local v = parseVehicleJson(res[1].vehicle)
        v.fuelLevel = 100.0
        return MySQL.prepare.await('UPDATE owned_vehicles SET vehicle = ? WHERE plate = ?', {json.encode(v), plate})
    end
end)

-- Provide vehicle data for spawning on client
lib.callback.register('garagemanager:getVehicleForSpawn', function(source, plate)
    if not HasPermission(source) then return {} end
    if JG_DB_MODE == 'qb' then
        local res = MySQL.query.await('SELECT vehicle, mods FROM player_vehicles WHERE plate = ?', {plate})
        if not res or not res[1] then return nil end
        local row = res[1]
        local mods = {}
        if row.mods then
            local ok, parsed = pcall(json.decode, row.mods)
            if ok and type(parsed) == 'table' then mods = parsed end
        end
        return { model = row.vehicle, props = mods }
    else
        local res = MySQL.query.await('SELECT vehicle FROM owned_vehicles WHERE plate = ?', {plate})
        if not res or not res[1] then return nil end
        local v = parseVehicleJson(res[1].vehicle)
        local model = v.modelName or v.model
        return { model = model, props = v }
    end
end)