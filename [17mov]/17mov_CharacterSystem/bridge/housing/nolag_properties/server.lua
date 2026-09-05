---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "nolag_properties" then return end

local function GetIdentifier(src)
    if Config.Framework == "qb-core" then
        return Core.Functions.GetPlayer(src)?.PlayerData?.citizenid
    elseif Config.Framework == "es_extended" then
        return Core.GetPlayerFromId(src)?.identifier
    end
end

local function GetJobName(src)
    if Config.Framework == "qb-core" then
        local job = Core.Functions.GetPlayer(src)?.PlayerData?.job
        return job?.name
    elseif Config.Framework == "es_extended" then
        local job = Core.GetPlayerFromId(src)?.job
        return job?.name
    end
end

Functions.RegisterServerCallback("17mov_CharacterSystem:GetHousingData", function(src)
    local identifier = GetIdentifier(src)
    local job = GetJobName(src)
    local owned = {}
    local data = {}

    if identifier then
        owned = MySQL.query.await([[
            SELECT DISTINCT p.id, p.address, p.metadata
            FROM properties_owners po
            JOIN properties p ON p.id = po.property_id
            WHERE
                (po.type = 'user' AND po.identifier = ?)
            OR (po.type = 'society' AND po.identifier = ?);
        ]], { identifier, job })
    end

    for i = 1, #owned do
        local success, metadata = pcall(json.decode, owned[i].metadata)

        if success then
            data[#data + 1] = {
                id = owned[i].id,
                address = owned[i].address,
                coords = metadata.enterData and vector3(metadata.enterData.x, metadata.enterData.y, metadata.enterData.z) or vec3(0.0, 0.0, 0.0),
            }
        end
    end

    return data
end)
