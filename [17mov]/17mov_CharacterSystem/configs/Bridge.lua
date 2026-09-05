-- FRAMEWORK CONFIGURATION
Config.Framework = "auto"
--[[
    List of supported frameworks:
    > "auto"        - Auto-detect framework
    > "es_extended" - es_extended: https://github.com/esx-framework/esx_core/tree/main/%5Bcore%5D/es_extended
    > "qb-core"     - qb-core: https://github.com/qbcore-framework/qb-core
    > "qbx_core"    - qbx_core: https://github.com/Qbox-project/qbx_core (Works as bridge to qb-core)
]]

-- HOUSING CONFIGURATION
Config.Housing = "auto"
--[[
    List of supported housing systems:
    > "auto"             - Auto-detect housing
    > "qb-houses"        - qb-houses: https://github.com/qbcore-framework/qb-houses
    > "ps-housing"       - ps-housing: https://github.com/Project-Sloth/ps-housing
    > "loaf_housing"     - loaf_housing: https://store.loaf-scripts.com/package/4310850
    > "nolag_properties" - nolag_properties: https://teamsgg.dev/scripts/properties
    > "RxHousing"        - RxHousing: https://store.rxscripts.xyz/scripts/advanced-housing
    > "vms_housing"      - vms_housing: https://www.vames-store.com/package/6923949
    > "bcs_housing"      - bcs_housing: https://masbagus.tebex.io/package/5090952
    > "rtx_housing"      - rtx_housing: https://rtx.tebex.io/package/7181359
    > "standalone"       - Choose this if you are not using any housing or your housing is not listed. Note that some features may not work properly without configurating all of functions from bridge/housing/standalone
]]

-- APARTMENTS CONFIGURATION
Config.Apartments = "auto"
--[[
    List of supported housing systems:
    > "auto"          - Auto-detect housing
    > "qb-apartments" - qb-apartments: https://github.com/qbcore-framework/qb-apartments
    > "ps-housing"    - ps-housing: https://github.com/Project-Sloth/ps-housing
    > "standalone"    - Choose this if you are not using any housing or your housing is not listed. Note that some features may not work properly without configurating all of functions from bridge/housing/standalone
]]

-- CLOTHING CONFIGURATION (Basically used to make some things work with Character System resource)
Config.Clothing = "auto"
--[[
    List of supported clothing systems:
    > "auto"                - Auto-detect clothing
    > "qb-clothing"         - qb-clothing: https://github.com/qbcore-framework/qb-clothing
    > "illenium-appearance" - illenium-appearance: https://github.com/iLLeniumStudios/illenium-appearance
    > "rcore_clothing"      - rcore_clothing: https://store.rcore.cz/package/6430968
]]

--[[
    AUTO-DETECTION LOGIC
    It should be touched unless you know what you are doing.
]]

local function isResourceProvided(resourceName)
    local numMetadata = GetNumResourceMetadata(resourceName, "provide")

    if numMetadata > 0 then
        for j = 0, numMetadata - 1 do
            local providedResource = GetResourceMetadata(resourceName, "provide", j)

            if providedResource == resourceName then
                return true
            end
        end
    end

    return false
end

local function isResourceStartedOrStarting(resourceName)
    local state = GetResourceState(resourceName)
    return not isResourceProvided(resourceName) and (state == "started" or state == "starting")
end

-- qbx_core works as bridge to qb-core
if Config.Framework == "qbx_core" then
    Config.Framework = "qb-core"
end

CreateThread(function()
    if Config.Framework == "auto" then
        local function detectFramework()
            local resources = { "qbx_core", "qb-core", "es_extended" }

            for i = 1, #resources do
                if isResourceStartedOrStarting(resources[i]) then
                    return resources[i]
                end
            end

            return "auto"
        end

        -- We cannot do nothing without framework, so wait until we detect it
        local startTimer = GetGameTimer()
        local detectedFramework = Config.Framework

        while detectedFramework == "auto" do
            detectedFramework = detectFramework()

            -- After 10 seconds of trying to detect, start printing error
            if GetGameTimer() - startTimer > 10000 then
                print("^5[17mov_CharacterSystem] ^1ERROR: No supported framework detected! This resource can only work with framework that has official support. Please make sure that you are using a supported framework and starting it before 17mov_CharacterSystem.^0")
            end

            Wait(100)
        end

        -- qbx_core works as bridge to qb-core
        if detectedFramework == "qbx_core" then
            detectedFramework = "qb-core"
        end

        Config.Framework = detectedFramework
    end
end)

CreateThread(function()
    if Config.Housing == "auto" then
        local function detectHousing()
            local resources = { "qb-houses", "ps-housing", "loaf_housing", "nolag_properties", "RxHousing", "vms_housing", "bcs_housing", "rtx_housing" }

            for i = 1, #resources do
                if isResourceStartedOrStarting(resources[i]) then
                    return resources[i]
                end
            end

            return "auto"
        end

        -- Let's give some more change to detect in case if resource is starting before housing
        for i = 1, 100 do
            if Config.Housing == "auto" then
                Config.Housing = detectHousing()
            else
                break
            end

            Wait(50)
        end

        -- If housing is still not detected, switch to standalone
        if Config.Housing == "auto" then
            Config.Housing = "standalone"
        end

        -- Warn user if no housing detected
        if Config.Housing == "standalone" then
            print("^5[17mov_CharacterSystem] ^3WARN: No supported housing detected, make sure that you are starting 17mov_CharacterSystem AFTER your housing resource - switching to standalone mode.^0")
        end
    end
end)

CreateThread(function()
    if Config.Apartments == "auto" then
        local function detectApartments()
            local resources = { "qb-apartments", "ps-housing", "qbx_properties" }

            for i = 1, #resources do
                if isResourceStartedOrStarting(resources[i]) then
                    return resources[i]
                end
            end

            return "auto"
        end

        -- Let's give some more change to detect in case if resource is starting before apartments
        for i = 1, 100 do
            if Config.Apartments == "auto" then
                Config.Apartments = detectApartments()
            else
                break
            end

            Wait(50)
        end

        -- If apartments is still not detected, switch to standalone
        if Config.Apartments == "auto" then
            Config.Apartments = "standalone"
        end

        -- Warn user if no apartments detected
        if Config.Apartments == "standalone" then
            print("^5[17mov_CharacterSystem] ^3WARN: No supported apartments detected, make sure that you are starting 17mov_CharacterSystem AFTER your apartments resource - switching to standalone mode.^0")
        end
    end
end)

CreateThread(function()
    if Config.Clothing == "auto" then
        local function detectClothing()
            local resources = { "rcore_clothing", "illenium-appearance", "qb-clothing" }

            for i = 1, #resources do
                if isResourceStartedOrStarting(resources[i]) then
                    return resources[i]
                end
            end

            return "auto"
        end

        -- It's not blocking any other module, so we can give it more time to detect
        local startTimer = GetGameTimer()

        while Config.Clothing == "auto" do
            Config.Clothing = detectClothing()

            -- After 20 seconds of trying to detect, just break and set to "none"
            if GetGameTimer() - startTimer > 20000 then
                Config.Clothing = "none"
                break
            end

            Wait(100)
        end

        if Skin?.Enabled and Config.Clothing ~= "none" then
            print(("^5[17mov_CharacterSystem] ^1ERROR: You are using 17mov_CharacterSystem Skin system with %s. This generates conflicts and may cause unexpected behavior. Please disable one of the systems to avoid issues.^0"):format(Config.Clothing))
        end
    end
end)
