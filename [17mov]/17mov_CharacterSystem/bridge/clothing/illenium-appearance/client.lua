if Skin.Enabled then return end

while Config.Clothing == "auto" do
    Wait(10)
end

if Config.Clothing ~= "illenium-appearance" then return end

RegisterNetEvent("17mov_CharacterSystem:PlayerSpawned", function(isNew)
    if isNew then
        -- Easy way to open native illenium menu depending on framework:
        if Config.Framework == "es_extended" then
            TriggerEvent("esx_skin:resetFirstSpawn")
            Wait(10)
            TriggerEvent("esx_skin:playerRegistered")
        elseif Config.Framework == "qb-core" then
            TriggerEvent("qb-clothes:client:CreateFirstCharacter")
        end
    end
end)
