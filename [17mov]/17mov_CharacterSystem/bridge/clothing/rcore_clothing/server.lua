if Skin.Enabled then return end

while Config.Clothing == "auto" do
    Wait(10)
end

if Config.Clothing ~= "rcore_clothing" then return end

function ChangeCharactersProperties(characters)
    for i = 1, #characters do
        if characters[i].used then
            local skin = nil

            if Config.Framework == "qb-core" then
                skin = exports["rcore_clothing"]:getSkinByIdentifier(characters[i].citizenid)
            elseif Config.Framework == "es_extended" then
                skin = exports["rcore_clothing"]:getSkinByIdentifier(characters[i].citizenid .. ":" .. characters[i].identifier)
            end

            if skin and skin.skin then
                skin.skin.model = skin.ped_model
                characters[i].skinData = skin.skin
            end
        end
    end

    return characters
end
