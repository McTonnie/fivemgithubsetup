if not Skin.Enabled then return end

function RegisterIlleniumExport(name, func)
    RegisterNetEvent(("__cfx_export_illenium-appearance_%s"):format(name), function(cb)
        cb(func)
    end)
end

RegisterIlleniumExport("getPedModel", function(ped)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    return TranslateHashToString(PlayerSkin.model)
end)

RegisterIlleniumExport("getPedComponents", function(ped)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    return IlleniumDataFormat.components or {}
end)

RegisterIlleniumExport("getPedProps", function(ped)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    return IlleniumDataFormat.props or {}
end)

RegisterIlleniumExport("getPedHeadBlend", function(ped)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    return IlleniumDataFormat.headBlend or {}
end)

RegisterIlleniumExport("getPedFaceFeatures", function(ped)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    return IlleniumDataFormat.faceFeatures or {}
end)

RegisterIlleniumExport("getPedHeadOverlays", function(ped)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    return IlleniumDataFormat.headOverlays or {}
end)

RegisterIlleniumExport("getPedHair", function(ped)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    return IlleniumDataFormat.hair or {}
end)

RegisterIlleniumExport("getPedAppearance", function(ped)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    return IlleniumDataFormat
end)

RegisterIlleniumExport("setPlayerModel", function(model)
    local PlayerPed = PlayerPedId()
    local PlayerSkin = Skin.ConstructFromPed(PlayerPed)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    IlleniumDataFormat.model = model

    Skin.SetOnPed(PlayerPed, TranslateSkinFromIllenium(IlleniumDataFormat, model))
end)

RegisterIlleniumExport("setPedHeadBlend", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    IlleniumDataFormat.headBlend = data

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPedFaceFeatures", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    IlleniumDataFormat.faceFeatures = data

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPedHeadOverlays", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    IlleniumDataFormat.headOverlays = data

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPedHair", function(ped, hair, tattoos)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    IlleniumDataFormat.hair = hair
    IlleniumDataFormat.tattoos = tattoos

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPedComponent", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    for i = 1, #IlleniumDataFormat.components do
        local CurrentComponent = IlleniumDataFormat.components[i]
        if CurrentComponent.component_id == data.component_id then
            CurrentComponent.drawable = data.drawable
            CurrentComponent.texture = data.texture
        end
    end

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPedComponents", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    for i = 1, #IlleniumDataFormat.components do
        for i2 = 1, #data do
            local CurrentComponent = IlleniumDataFormat.components[i]
            if CurrentComponent.component_id == data[i2].component_id then
                CurrentComponent.drawable = data[i2].drawable
                CurrentComponent.texture = data[i2].texture
            end
        end
    end

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPedProp", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    for i = 1, #IlleniumDataFormat.props do
        local CurrentComponent = IlleniumDataFormat.props[i]
        if CurrentComponent.prop_id == data.prop_id then
            CurrentComponent.drawable = data.drawable
            CurrentComponent.texture = data.texture
        end
    end

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPedProps", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    for i = 1, #IlleniumDataFormat.props do
        for i2 = 1, #data do
            local CurrentComponent = IlleniumDataFormat.props[i]
            if CurrentComponent.prop_id == data[i2].prop_id then
                CurrentComponent.drawable = data[i2].drawable
                CurrentComponent.texture = data[i2].texture
            end
        end
    end

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPedProps", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    for i = 1, #IlleniumDataFormat.props do
        for i2 = 1, #data do
            local CurrentComponent = IlleniumDataFormat.props[i]
            if CurrentComponent.prop_id == data[i2].prop_id then
                CurrentComponent.drawable = data[i2].drawable
                CurrentComponent.texture = data[i2].texture
            end
        end
    end

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("setPlayerAppearance", function(IlleniumDataFormat)
    Skin.SetOnPed(PlayerPedId(), TranslateSkinFromIllenium(IlleniumDataFormat, IlleniumDataFormat.model))
end)

RegisterIlleniumExport("setPedAppearance", function(ped, IlleniumDataFormat)
    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, IlleniumDataFormat.model))
end)

RegisterIlleniumExport("setPedTattoos", function(ped, data)
    local PlayerSkin = Skin.ConstructFromPed(ped)
    local IlleniumDataFormat = TranslateSkinToIllenium(PlayerSkin)

    IlleniumDataFormat.tattoos = data

    Skin.SetOnPed(ped, TranslateSkinFromIllenium(IlleniumDataFormat, PlayerSkin.model))
end)

RegisterIlleniumExport("startPlayerCustomization", function()
    if GetInvokingResource() == "qb-interior" or GetInvokingResource() == "qbx_properties" then
        return
    end

    if Core ~= nil then
        Core.Functions.GetPlayerData(function(pData)
            Skin.OpenMenu({
                {
                    label = _L("Skin.Button.Save"),
                    type = "accent",
                    action = "callback",
                    actionData = {
                        callbackName = "SkinSave"
                    }
                },
            }, "creator", true, pData.charinfo.gender == 0 and 1 or 0)
        end)
    end
end)