while Config.Framework == "auto" do
    Wait(100)
end

if Config.Framework ~= "es_extended" then return end

local startTime = GetGameTimer()

while Core == nil do
    TriggerEvent("__cfx_export_es_extended_getSharedObject", function(getCore)
        Core = getCore()
    end)

    Wait(1000)

    if GetGameTimer() - startTime >= 25000 then
        Functions.Print("Cannot fetch your framework. Please make sure you're using ESX or QBCore, and you're starting Character System after your framework")
    end
end

if not Skin.Enabled then return end

RegisterNetEvent("esx:onPlayerSpawn", function()
    Functions.TriggerServerCallback("17mov_CharacterSystem:CheckForIlleniumSkin", function(skin)
        if skin then
            skin.isIllenium = true
            TriggerEvent("skinchanger:loadSkin", skin)
        end
    end)
end)

local PrepareOutfits = function(data, isIllenium)
    local outfits = {}

    if data[1] == nil then
        return outfits
    end

    if isIllenium then
        for k, v in pairs(data) do
            if data[k].skin then
                data[k].skin = json.decode(data[k].skin)
                outfits[k] = v
            else
                if data[k].components then
                    data[k].components = json.decode(data[k].components)
                    for k, v in pairs(data[k].components) do
                        if v.component_id then
                            v.component = v.component_id
                            v.variation = v.texture
                            v.component_id = nil
                        end
                    end

                    data[k].props = json.decode(data[k].props)
                    for k, v in pairs(data[k].props) do
                        if v.prop_id then
                            v.prop = v.prop_id
                            v.variation = v.texture
                            v.prop_id = nil
                        end
                    end
                    data[k].skin = {
                        components = data[k].components,
                        props = data[k].props
                    }

                    data[k].components = nil
                    data[k].props = nil
                end

                data[k].outfit_name = data[k].outfitname
                data[k].outfitname = nil
                outfits[#outfits+1] = v
            end
        end
        return outfits
    end

    for k, v in pairs(data) do
        local decoded = json.decode(data[k].outfit)
        data[k].skin = TranslateSkinFromESX(decoded)
        data[k].outfit = nil
        -- table.insert(outfits, v)
        outfits[#outfits+1] = v
    end

    return outfits
end

RegisterNetEvent("17mov_CharacterSystem:OpenOutfitsMenu", function()
    Functions.TriggerServerCallback('17mov_CharacterSystem:FetchOutifts', function(result)
        result = PrepareOutfits(result.outfits, result.isIllenium)
        local Elements = {}
        for k, v in pairs(result) do
            table.insert(Elements, {
                label = v.outfit_name, index = k
            })
        end

        if #Elements == 0 then
            table.insert(Elements, {
                label = _L("Bridge.Wardrobe.NoOutfits"), exit = true
            })
        end

        Core.UI.Menu.Open("default", GetCurrentResourceName(), "Example_Menu", {
            title    = _L("Bridge.Wardrobe.SelectOutfit"),
            align    = 'center',
            elements = Elements
        }, function(data, menu)
            menu.close()
            if data.current.exit then
                return menu.close()
            end
            Core.UI.Menu.Open("default", GetCurrentResourceName(), "Example_Menu", {
                title    = data.current.label,
                align    = 'center',
                elements = {
                    { label = _L("Bridge.Wardrobe.ChooseOutfit"), action = "select" },
                    { label = _L("Bridge.Wardrobe.DeleteOutfit"), action = "delete" }
                }
            }, function(data2, menu2)
                if data2.current.action == "select" then
                    local targetSkin = TranslateSkinToESX(result[data.current.index].skin)
                    TriggerEvent("skinchanger:loadClothes", nil, targetSkin)
                    if Skin.RememberLastOutfit then
                        Citizen.Wait(1000)
                        TriggerEvent("17mov_CharacterSystem:SaveCurrentSkin")
                    end
                else
                    TriggerServerEvent("17mov_CharacterSystem:Deleteoufit", data.current.label)
                end
                menu2.close()
            end, function(_, menu2)
                menu2.close()
            end)
        end, function(_, menu) -- Cancel Function
            menu.close()
        end)
    end)
end)
