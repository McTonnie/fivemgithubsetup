---@diagnostic disable: duplicate-set-field
while Config.Apartments == "auto" do
    Wait(100)
end

if Config.Apartments ~= "standalone" then return end

Apartments = {
    PlayerEnteredApartment = false,
    InitializedProperties = false,
}

Apartments.GetApartments = function()
    return {}
end

Apartments.GetPlayerApartments = function()
    return {}
end

Apartments.EnterToApartment = function(location)
end

Apartments.EnterLastApartment = function(info)
end
