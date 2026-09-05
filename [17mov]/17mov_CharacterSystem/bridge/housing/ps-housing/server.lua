---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "ps-housing" then return end

Functions.RegisterServerCallback("17mov_CharacterSystem:GetHousingData", function(src)
    local cid = Core.Functions.GetPlayer(src)?.PlayerData?.citizenid

    if not cid then
        return {}
    end

    local owned = MySQL.query.await('SELECT * FROM properties WHERE owner_citizenid = ? AND apartment IS NULL', { cid })

    for i = 1, #owned do
        owned[i].door_data = json.decode(owned[i].door_data)
        owned[i].garage_data = json.decode(owned[i].garage_data)
        owned[i].zone_data = json.decode(owned[i].zone_data)
    end

    return {
        owned = owned,
    }
end)
