---@diagnostic disable: duplicate-set-field
while Config.Apartments == "auto" do
    Wait(100)
end

if Config.Apartments ~= "qb-apartments" then return end

function GetApartmentsConfig()
    local resourceName = "qb-apartments"
    local fileName = "config.lua"
    local content = LoadResourceFile(resourceName, fileName)

    if not content then
        return print(("^1Error loading: @%s/%s: no such file directory^0"):format(resourceName, fileName))
    end

    local env = setmetatable({}, {
        __index = function(_, key)
            return _G[key]
        end
    })
    local chunk, err = load(content, ("@%s"):format(fileName), "t", env)

    if not chunk then
        return print(("^1Error loading: @%s/%s^0"):format(resourceName, err))
    end

    local success, err = pcall(chunk)

    if not success then
        return print(("^1Error loading: @%s/%s^0"):format(resourceName, err))
    end

    return env?.Apartments?.Locations or {}
end

Apartments = {
    Locations = GetApartmentsConfig()
}

Functions.RegisterServerCallback("17mov_CharacterSystem:GetApartmentsLocations", function()
    return Apartments.Locations
end)

Functions.RegisterServerCallback("17mov_CharacterSystem:GetPlayerApartment", function(src)
    local cid = Core.Functions.GetPlayer(src)?.PlayerData?.citizenid

    if not cid then
        return {}
    end

    return MySQL.single.await('SELECT * FROM apartments WHERE citizenid = ?', { cid }) or {}
end)

RegisterNetEvent("apartments:server:setCurrentApartment", function()
    local src = source
    TriggerClientEvent("17mov_CharacterSystem:PlayerEnteredApartment", src)
end)
