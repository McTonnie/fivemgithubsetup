while Core == nil do
    Wait(10)
end

local hasDonePreloading = {}

if Config.Framework == "qb-core" then
    AddEventHandler('QBCore:Server:PlayerLoaded', function(Player)
        Wait(1000)
        hasDonePreloading[Player.PlayerData.source] = true
    end)

    AddEventHandler('QBCore:Server:OnPlayerUnload', function(src)
        hasDonePreloading[src] = false
    end)

    function GiveStarterItems(source)
        local src = source
        local Player = Core.Functions.GetPlayer(src)

        for _, v in pairs(Core?.Shared.StarterItems) do
            local info = {}

            if v.item == "id_card" then
                info.citizenid = Player.PlayerData.citizenid
                info.firstname = Player.PlayerData.charinfo.firstname
                info.lastname = Player.PlayerData.charinfo.lastname
                info.birthdate = Player.PlayerData.charinfo.birthdate
                info.gender = Player.PlayerData.charinfo.gender
                info.nationality = Player.PlayerData.charinfo.nationality
            elseif v.item == "driver_license" then
                info.firstname = Player.PlayerData.charinfo.firstname
                info.lastname = Player.PlayerData.charinfo.lastname
                info.birthdate = Player.PlayerData.charinfo.birthdate
                info.type = "Class C Driver License"
            end

            Player.Functions.AddItem(v.item, v.amount, false, info, 'qb-multicharacter:GiveStarterItems')
        end
    end
elseif Config.Framework == "es_extended" then
    function ChangeESXConfig(path)
        local ESXConfigPath = GetResourcePath('es_extended') .. path
        local file = io.open(ESXConfigPath, "r")

        if not file then
            return false
        end

        local content = file:read("*all")
        file:close()

        if not content then
            Functions.Print(
            "Cannot read your es_extended config file. Please make sure that Config.Multichar in your es_extended is set to true")
            return false
        end

        local multicharExists = string.match(content, 'Config.Multichar%s*=%s*')

        if multicharExists then
            local currentMulticharValue = string.match(content, 'Config.Multichar%s*=%s*(%a+)')
            if currentMulticharValue ~= "true" then
                local updatedContent = string.gsub(content, '(Config.Multichar%s*=%s*)[^;\r\n]*', '%1true')

                file = io.open(ESXConfigPath, "w")

                if not file then
                    Functions.Print(
                    "Cannot open your es_extended config file. Please make sure that Config.Multichar in your es_extended is set to true")
                    return false
                end

                file:write(updatedContent)
                file:close()
                Functions.Print(
                "Automatically changed your es_extended/config.lua:Config.Multichar to true as it's required")
            end
        else
            Functions.Print(
            "Config.Multichar not found in your es_extended config file. Please make sure that Config.Multichar in your es_extended is set to true")
        end

        return true
    end

    CreateThread(function()
        -- OLD ESX METHOD
        if not ChangeESXConfig('/config.lua') then
            -- NEW ESX METHOD
            if not ChangeESXConfig('/shared/config/main.lua') then
                Functions.Print(
                "Cannot open your es_extended config file. Please make sure that Config.Multichar in your es_extended is set to true")
            end
        end
    end)
end

-- This function is responsible for put player back to default routing bucket after character is already selected/created
function ReturnToBucket(src)
    SetPlayerRoutingBucket(src, Config.DefaultBucket)
end

-- Fetching discord user roles from guild
function FetchDiscordRoles(memberId)
    local promise = promise.new()

    if memberId == nil then
        promise:resolve(nil)
        return
    end

    local url = ("https://discord.com/api/v10/guilds/%s/members/%s"):format(Selector.Discord.Guild, memberId)

    PerformHttpRequest(url, function(status, body)
        if status ~= 200 then
            promise:resolve(nil)
            return
        end

        local user = json.decode(body)
        promise:resolve(user.roles)
    end, "GET", "", {
        ["Authorization"] = string.format("Bot %s", Selector.Discord.Token),
        ['Content-Type'] = 'application/json'
    })

    return Citizen.Await(promise)
end

-- Returns max character slots for player
Selector.GetMaxSlots = function(src)
    local identifier = GetPlayerIdentifierByType(src, Config.PrimaryIdentifier)
    local maxCharacters = Selector.MaxCharacters

    if Selector.PlayerMaxCharacters[identifier] ~= nil then
        maxCharacters = Selector.PlayerMaxCharacters[identifier]
    end

    -- esx_multicharacter support
    if MySQL.scalar.await("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'multicharacter_slots' AND table_schema = DATABASE()") > 0 then
        maxCharacters = MySQL.scalar.await('SELECT slots FROM multicharacter_slots WHERE identifier = ?', { identifier }) or
        maxCharacters
    end

    if Selector.Discord.Enable then
        local discordId = GetPlayerIdentifierByType(src, "discord")

        if discordId then
            local userRoles = FetchDiscordRoles(discordId:gsub("discord:", ""))

            if userRoles then
                local discordSlots = 0

                for k, v in pairs(userRoles) do
                    if Selector.Discord.Roles[v] ~= nil and Selector.Discord.Roles[v] > discordSlots then
                        discordSlots = Selector.Discord.Roles[v]
                    end
                end

                if discordSlots > 0 then
                    maxCharacters = discordSlots
                end
            end
        end
    end

    return maxCharacters
end

-- Setup your own code after selecting character
Selector.CharacterChoosen = function(src, isNew)
    if Config.Framework == "qb-core" then
        repeat
            Wait(10)
        until hasDonePreloading[src]

        Core.Commands.Refresh(src)

        if isNew then
            GiveStarterItems(src)
        end
    elseif Config.Framework == "es_extended" then

    end
end

if Selector.Relog then
    RegisterCommand("relog", function(src)
        if Config.Framework == "qb-core" then
            Core.Player.Logout(src)
        elseif Config.Framework == "es_extended" then
            TriggerEvent("esx:playerLogout", src)
        end

        TriggerClientEvent("17mov_CharacterSystem:OpenSelector", src)
    end, false)
end
