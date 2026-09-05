while Core == nil do
    Wait(10)
end

function DisableSpawnManager()
    if GetResourceState("spawnmanager") == "started" then
        exports.spawnmanager:setAutoSpawn(false)
    end
end

RegisterNetEvent("17mov_CharacterSystem:SkinMenuOpened", function()
    -- You can add custom code after skin menu open

    if GetResourceState("qs-inventory") ~= "missing" then
        exports['qs-inventory']:setInClothing(true)
    end
end)

RegisterNetEvent("17mov_CharacterSystem:SkinMenuClosed", function()
    -- You can add custom code after skin menu open

    if GetResourceState("qs-inventory") ~= "missing" then
        exports['qs-inventory']:setInClothing(false)
    end
end)

function Register.OpenCustom(characterId)
    -- Here you can implement your custom register system when using Register.Enable = false
    print("Opened character register for slot:", characterId)
end

function Location.PlayerSpawned(isNew, info)
    -- Here you can add some custom code after player spawned
    if Config.Framework == "qb-core" then
        TriggerServerEvent('QBCore:Server:OnPlayerLoaded')
        TriggerEvent('QBCore:Client:OnPlayerLoaded')
    elseif Config.Framework == "es_extended" then
        -- Added for players who are using "illenium-appearance", because it's not marking player as "spawned" after loading player skin.
        -- When ESX see that player is not "spawned" then it's just returning function that saves players with no information.
        -- Result: Player is not saved after exiting
        if not Skin.Enabled then
            TriggerServerEvent("esx:onPlayerSpawn")
        end
        -- Here you can add your custom code
    end

    if not isNew then
        Housing.EnterLastHouse(info)
        Apartments.EnterLastApartment(info)
    end

    if Skin.DisableHealthRegen then
        -- Fix of issue where player health stays at 50%
        CreateThread(function()
            Wait(5000)
            local player = PlayerId()
            SetPlayerHealthRechargeMultiplier(player, 0.0)
            SetPlayerHealthRechargeLimit(player, 0.0)
        end)
    end

    DisplayRadar(true)

    if isNew then
        TriggerEvent("inventory:client:GiveStarterItems")
    end
end

function ShowHelpNotification(msg)
    if msg == nil then return end
    AddTextEntry('HelpNotification', msg)
    DisplayHelpTextThisFrame('HelpNotification', false)
end

function Notify(msg)
    if Config.Framework == "qb-core" then
        Core?.Functions?.Notify(msg)
    elseif Config.Framework == "es_extended" then
        Core?.ShowNotification(msg)
    else
        SetNotificationTextEntry('STRING')
        AddTextComponentString(msg)
        DrawNotification(false, true)
    end
end

function GetJob()
    if Config.Framework == "qb-core" then
        local playerData = Core?.Functions?.GetPlayerData()
        return playerData?.job?.name
    elseif Config.Framework == "es_extended" then
        local playerData = Core?.GetPlayerData()
        return playerData?.job?.name
    end

    return nil
end

function GetGang()
    if Config.Framework == "qb-core" then
        local playerData = Core?.Functions?.GetPlayerData()
        return playerData?.gang?.name
    elseif Config.Framework == "es_extended" then
        -- No default gang system, need to implement at your own
    end

    return nil
end

function GetIdentifier()
    if Config.Framework == "qb-core" then
        local playerData = Core?.Functions?.GetPlayerData()
        return playerData?.license
    elseif Config.Framework == "es_extended" then
        local playerData = Core?.GetPlayerData()
        return playerData?.identifier
    end

    return nil
end

function OnSelectorEnter()

end

function OnSelectorExit()

end

-- Used to display data about selected character in selector (at right side of screen)
function GetCharacterDetails(character)
    local function FormatMoney(amount)
        if amount == nil then amount = 0 end
        local isMinus = amount < 0
        amount = math.abs(amount)

        local separator = Config.MoneySeparator or "."
        local formatted = tostring(amount)
        local k = 0

        while true do
            formatted, k = string.gsub(formatted, "^(-?%d+)(%d%d%d)", '%1' .. separator .. '%2')
            if k == 0 then break end
            Wait(0)
        end

        formatted = "$" .. formatted

        if isMinus then
            formatted = "-" .. formatted
        end

        return formatted
    end

    return {
        {
            label = _L("Selector.Info.Cash"),
            value = FormatMoney(character.cash),
        },
        {
            label = _L("Selector.Info.Bank"),
            value = FormatMoney(character.bank),
        },
        {
            label = _L("Selector.Info.Nationality"),
            value = character.nationality,
        },
        {
            label = _L("Selector.Info.DateOfBirth"),
            value = character.dateOfBirth,
        },
        {
            label = _L("Selector.Info.Gender"),
            value = character.isMale and _L("Selector.Info.Male") or _L("Selector.Info.Female"),
        },
    }
end

function ShutDownLoadingScreen()
    ShutdownLoadingScreen()
    ShutdownLoadingScreenNui()
end

-- Target system
if Config.UseTarget then
    if Config.Framework == "qb-core" then
        Config.TargetSystem = "qb-target"
    else
        Config.TargetSystem = "qtarget"
    end

    if GetResourceState("ox_target") ~= "missing" then
        Config.TargetSystem = "qtarget" -- OX_Target have a backward compability to qtarget
    end
end

function AddTargetStorePed(ped, shopType, shopIndex)
    exports[Config.TargetSystem]:AddTargetEntity(ped, {
        options = {
            {
                event = "17mov_CharacterSystem:OpenStore",
                icon = "fa-solid fa-shirt",
                label = _L("Store.Use"),
                shopType = shopType,
                shopIndex = shopIndex,
                canInteract = function(entity)
                    return #(GetEntityCoords(PlayerPedId()) - GetEntityCoords(entity)) <
                        (Config.Stores[shopIndex]?.radius or 3.0)
                end
            },
        },
        distance = Config.Stores[shopIndex]?.radius or 3.0
    })
end

if Skin.EnableRefreshSkinCommand then
    local isCommandBlocked = false
    local lastCommandTime = 0
    local commandCooldown = 5000
    RegisterCommand("refreshSkin", function()
        local currentTime = GetGameTimer()
        if isCommandBlocked or currentTime - lastCommandTime < commandCooldown then
            return Notify(_L("Skin.RefreshSkinCommand.Unavalible"))
        end

        lastCommandTime = currentTime

        local PlayerPed = PlayerPedId()
        local maxhealth = GetEntityMaxHealth(PlayerPed)
        local health = GetEntityHealth(PlayerPed)
        local maxArmor = GetPlayerMaxArmour(PlayerId())
        local armor = GetPedArmour(PlayerPed)
        local startTime = GetGameTimer()
        local skinToSet = nil

        if Config.Framework == "qb-core" then
            Core.Functions.TriggerCallback("qb-clothing:server:getPlayerSkin", function(data)
                skinToSet = TranslateSkinFromQB(data.skin, data.model)
            end)
        else
            Core.TriggerServerCallback("esx_skin:getPlayerSkin", function(skin)
                skinToSet = TranslateSkinFromESX(skin)
            end)
        end

        while not skinToSet do
            if GetGameTimer() - startTime > 3000 then
                return Functions.Debug("CANNOT FETCH SKINDATA")
            end

            Wait(10)
        end

        if IsModelInCdimage(skinToSet.model) then
            Functions.LoadModel(skinToSet.model)
            SetPlayerModel(PlayerId(), skinToSet.model)
        end

        Skin.SetOnPed(PlayerPedId(), skinToSet)

        Wait(1000)

        local PlayerPed = PlayerPedId()

        if maxhealth > 0 then
            SetPedMaxHealth(PlayerPed, maxhealth)
        end

        if health > 0 then
            SetEntityHealth(PlayerPed, health)
        end

        if maxArmor > 0 then
            SetPlayerMaxArmour(PlayerId(), maxArmor)
        end

        if armor > 0 then
            SetPedArmour(PlayerPed, armor)
        end

    end, false)

    exports("BlockRefreshSkinCommand", function()
        isCommandBlocked = true
    end)

    exports("UnblockRefreshSkinCommand", function()
        isCommandBlocked = false
    end)

    exports("IsRefreshSkinCommandBlocked", function()
        return isCommandBlocked
    end)
end

if GetResourceState("rcore_clothing") ~= "missing" then
    CreateThread(function()
        while Skin == nil and Skin.SetOnPed == nil do
            Citizen.Wait(100)
        end

        ---@diagnostic disable-next-line: duplicate-set-field
        Skin.SetOnPed = function(ped, skinData)
            if skinData ~= nil and skinData.components then
                for k, v in pairs(skinData.components) do
                    if not (type(k) == "string" and type(tonumber(k)) == "number" and type(v) == "string") then
                        return
                    end
                end

                exports.rcore_clothing:setPedSkin(ped, skinData)
            end
        end
    end)
end

local _SetPlayerModel = SetPlayerModel
SetPlayerModel = function(player, model)
    local returnValue = _SetPlayerModel(player, model)
    if Skin.DisableHealthRegen then
        SetPlayerHealthRechargeMultiplier(PlayerId(), 0.0)
        SetPlayerHealthRechargeLimit(PlayerId(), 0.0)
    end
    return returnValue
end

local _ChangePlayerPed = ChangePlayerPed
ChangePlayerPed = function(player, ped, b2, resetDamage)
    local returnValue = _ChangePlayerPed(player, ped, b2, resetDamage)
    if Skin.DisableHealthRegen then
        SetPlayerHealthRechargeMultiplier(PlayerId(), 0.0)
        SetPlayerHealthRechargeLimit(PlayerId(), 0.0)
    end
    return returnValue
end