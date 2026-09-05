if Skin.Enabled then return end

while Config.Clothing == "auto" do
    Wait(10)
end

if Config.Clothing ~= "rcore_clothing" then return end

RegisterNetEvent("17mov_CharacterSystem:PlayerSpawned", function(isNew)
    if isNew then
        local model = Register.LastEnteredGender == "male" and `mp_m_freemode_01` or `mp_f_freemode_01`
        Functions.LoadModel(model)
        SetPlayerModel(PlayerId(), model)
        TriggerEvent('rcore_clothing:openCharCreator')
    end
end)
