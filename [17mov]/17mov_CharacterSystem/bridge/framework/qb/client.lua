while Config.Framework == "auto" do
    Wait(100)
end

if Config.Framework ~= "qb-core" then return end

local startTime = GetGameTimer()

while Core == nil do
    TriggerEvent("__cfx_export_qb-core_GetCoreObject", function(getCore)
        Core = getCore()

        if GetResourceState("qbx_core") ~= "missing" then
            load(LoadResourceFile("ox_lib", "init.lua"))()
        end
    end)

    Wait(1000)

    if GetGameTimer() - startTime >= 25000 then
        Functions.Print("Cannot fetch your framework. Please make sure you're using ESX or QBCore, and you're starting Character System after your framework")
    end
end

if Config.Showcase then return end
if not Skin.Enabled then return end

RegisterNetEvent("17mov_CharacterSystem:LoadWardrobeOutfit", function(data)
    TriggerEvent("qb-clothing:client:loadOutfit", data)
    if Skin.RememberLastOutfit then
        Wait(1000)
        TriggerEvent("17mov_CharacterSystem:SaveCurrentSkin")
    end
end)

RegisterNetEvent("17mov_CharacterSystem:ManageOutfit", function(data)
    if GetResourceState("qb-menu") ~= "missing" then
        local data = {
            {
                header = data.myName,
                isMenuHeader = true,
            },
            {
                header = _L("Bridge.Wardrobe.ChooseOutfit"),
                params = {
                    event = "17mov_CharacterSystem:LoadWardrobeOutfit",
                    args = data.data
                }
            },
            {
                header = _L("Bridge.Wardrobe.DeleteOutfit"),
                params = {
                    event = "qb-clothing:server:removeOutfit",
                    isServer = true,
                    args = {
                        name = data.myName,
                        id = data.myId,
                    }
                }
            }
        }

        exports["qb-menu"]:openMenu(data)
    else
        local options = {
            {
                label = _L("Bridge.Wardrobe.ChooseOutfit"),
                args = data.data
            },
            {
                label = _L("Bridge.Wardrobe.DeleteOutfit"),
                args = {
                    name = data.myName,
                    id = data.myId
                }
            }
        }

        lib.registerMenu({
            id = "17mov_CharacterSystem:manageOutfitMenu",
            title = data.myName,
            options = options,
            position = "top-right"
        }, function (selected, scrollIndex, args, checked)
            if selected == 1 then
                TriggerEvent("17mov_CharacterSystem:LoadWardrobeOutfit", args)
            elseif selected == 2 then
                TriggerServerEvent("qb-clothing:server:removeOutfit", args)
            end
        end)
        lib.showMenu("17mov_CharacterSystem:manageOutfitMenu")
    end
end)

AddEventHandler('QBCore:Client:OnPlayerLoaded', function()
    Core.Functions.TriggerCallback("qb-clothing:server:getPlayerSkin", function(data)
        if data.isGenerated then
            Wait(250)
            TriggerEvent("qb-clothes:client:CreateFirstCharacter")
        end
    end)
end)
