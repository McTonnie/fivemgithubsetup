---@diagnostic disable: duplicate-set-field
while Config.Housing == "auto" do
    Wait(100)
end

if Config.Housing ~= "standalone" then return end

Housing = {
    PlayerEnteredApartment = false,
    InitializedProperties = false,
}

Housing.GetPlayerHouses = function()
    return {}
end

Housing.EnterToHouse = function(location)
end

Housing.EnterLastHouse = function(info)
end