---@diagnostic disable: duplicate-set-field
while Config.Apartments == "auto" do
    Wait(100)
end

if Config.Apartments ~= "qbx_properties" then return end

local function GetApartmentsConfig()
    local resourceName = "qbx_properties"
    local fileName = "config/shared.lua"
    local content = LoadResourceFile(resourceName, fileName)

    if not content then
        return print(("^1Error loading: @%s/%s: no such file directory^0"):format(resourceName, fileName))
    end

    local chunk, err = load(content, ("@%s"):format(fileName), "t")

    if not chunk then
        return print(("^1Error loading: @%s/%s^0"):format(resourceName, err))
    end

    local success, result = pcall(chunk)

    if not success then
        return print(("^1Error loading: @%s/%s^0"):format(resourceName, result))
    end

    return result.apartmentOptions or {}
end

Apartments = {
    Locations = GetApartmentsConfig()
}

Functions.RegisterServerCallback("17mov_CharacterSystem:GetApartmentsLocations", function()
    return Apartments.Locations
end)

Functions.RegisterServerCallback('17mov_CharacterSystem:GetPlayerApartments', function(src)
    local cid = Core.Functions.GetPlayer(src)?.PlayerData?.citizenid
    if not cid then
        return {}
    end
    local result = MySQL.query.await("SELECT * FROM properties WHERE owner = ?", { cid })

    return result
end)

RegisterNetEvent('17mov_CharacterSystem:SetcurrentId', function()
    local src = source
    local player = exports.qbx_core:GetPlayer(src)
    if not player then return end
    player.Functions.SetMetaData('currentPropertyId', nil)
end)