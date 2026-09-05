Config = {}

Config.Debug = true
Config.Locale = 'en'
Config.SafeItem = 'placablesafe'
Config.CodeCrackerItem = 'codecracker'
Config.AdminGroups = { ['god'] = true, ['admin'] = true }
Config.Admin = {
    inspectRange = 5.0,
}

Config.Features = {
    placement = true,
    pickup = true,
    ownerManagementMenu = true,
    accessList = true,
    depositWithoutCode = true,
    contributionTracking = true,
    requirements = true,
    weeklyReset = false,
    manualReset = true,
    oxTarget = true,
    groupAssignment = true,
    breakIn = true,
    codeCrackerItem = true,
    consumeCodeCrackerOnUse = true,
    consumeCodeCrackerOnFailure = false,
    minigameHook = false,
    crackAlerts = true,
    logs = true,
    crackAttemptLogs = true,
    oneSafePerOwner = false,
    adminCleanupCommands = true,
    topContributor = true,
    progressUi = true,
    totalProgressUi = true,
    storageUpgrades = true,
    webhooks = true,
}

Config.Security = {
    forcedAccess = {
        withdrawSeconds = 30,
    }
}

Config.Placement = {
    maxDistance = 3.0,
    placeDuration = 3000,
    headingSnap = 5.0,
    rayDistance = 6.0,
    allowRotation = true,
    oneSafePerOwner = false,
    nameMinLength = 3,
    nameMaxLength = 32,
}

Config.Safes = {
    props = {
        { prop = `prop_ld_int_safe_01`, displayname = 'Steel Safe' },
        { prop = `p_v_43_safe_s`, displayname = 'Wall Safe' },
    },
    defaultProp = `prop_ld_int_safe_01`,
    interactionDistance = 2.0,
    stash = {  --Default stash 
        slots = 20,
        maxWeight = 100000,
        labelPrefix = 'Secure Safe',
    },
    itemSelector = {
        slots = 5, --For adding itme to the tracker (opens a temp inventory that people can put one of the item they want to track)
        maxWeight = 25000,
    },
    targetZone = {
        size = vec3(1.2, 1.2, 1.8),
        drawSprite = false,
        debug = false,
    },
    -- Weight settings for the safe item when picked up
    baseWeight = 15000,           -- Base weight in grams (15kg) If you chnage this make sure to change the weight in ox_inventory file too 
    weightPerUpgrade = 5000,      -- How much weight increases per upgrade owned (5kg)
    maxItemWeight = 50000,        -- Maximum weight the safe item can reach (50kg)
}

Config.Access = {
    addDistance = 4.0,
    groupAssignmentTypes = {
        job = true,
        gang = true,
        business = true,
        organization = true,
        faction = true,
        police = true,
        custom = true,
    },
    defaults = {
        deposit = true,
        withdraw = false,
        manage = false,
    }
}

Config.StorageTiers = {
    currency = 'cash',
    tiers = {
        [1] = { label = 'Tier 1', price = 25000, slots = 40, maxWeight = 250000 }, --Weight is in grams but shows as KG in menu Add or remove as many tier upgrades as you want to 
        [2] = { label = 'Tier 2', price = 25000, slots = 70, maxWeight = 500000 },
        [3] = { label = 'Tier 3', price = 25000, slots = 90, maxWeight = 750000 },
        [4] = { label = 'Tier 4', price = 100000, slots = 120, maxWeight = 1000000 },
        [5] = { label = 'Tier 5', price = 100000, slots = 120, maxWeight = 1500000 },
        [6] = { label = 'Tier 6', price = 100000, slots = 120, maxWeight = 2000000 },
        [7] = { label = 'Tier 7', price = 100000, slots = 120, maxWeight = 2500000 },
        [8] = { label = 'Tier 8', price = 100000, slots = 120, maxWeight = 3000000 },
    }
}

Config.AlarmUpgrade = {
    enabled = true,
    label = 'Silent Alarm',
    currency = 'cash',
    price = 35000,
    notifyOwner = true,
    notifyMessage = 'Your safe alarm has been triggered. Someone is attempting to break in.',
    blipSeconds = 120, -- How long the map blip stays active during a break-in
    soundFile = 'sound1', -- Name of the .ogg file in web/sounds/ folder (without .ogg extension)
    visualEffect = {
        enabled = true,
        duration = 9000,
        title = 'SAFE UNDER ATTACK',
        subtitle = 'Break-in attempt detected',
        pulseCount = 3,
    }
}

Config.OwnerOnlineRequirement = {
    enabled = true,
    label = 'Owner Online Requirement',
    currency = 'cash',
    price = 40000,
    description = 'Requires the safe owner to be online before break-ins are possible'
}

Config.TrackingUpgrade = {
    enabled = true,
    label = 'Member Tracking',
    currency = 'cash',
    price = 30000,
    description = 'Enables member contribution tracking and progress goals'
}

Config.AccessUpgrade = {
    enabled = true,
    label = 'Access Control',
    currency = 'cash',
    price = 25000,
    description = 'Restricts stash access to allowed users only. Without this upgrade, anyone can access the stash.'
}

Config.Cracking = {
    cooldownSeconds = 3,
    crackDuration = 1000,
    successChance = 100,
    failedLockoutSeconds = 180,
    allowedGroups = {},
    anyoneCanAttempt = true,
    grantsTemporaryWithdrawAccess = true,
}

Config.Tracking = {
    enabledByDefault = true,
    allowMultipleTrackedItems = true,
    items = {
        { name = 'money', label = 'Cash', required = 5000 },
        { name = 'goldbar', label = 'Gold Bar', required = 10 },
    },
    defaultPeriodDays = 7,
    autoReset = {
        enabled = false,
        weekday = 1,
        hour = 4,
    }
}

Config.Theme = {
    name = 'midnight',
    tokens = {
        primary = '#7c5cff',
        secondary = '#1c2333',
        accent = '#19c2ff',
        background = 'rgba(8, 11, 19, 0.88)',
        surface = 'rgba(18, 23, 36, 0.92)',
        surfaceAlt = 'rgba(28, 35, 51, 0.88)',
        border = 'rgba(255,255,255,0.08)',
        text = '#f4f7fb',
        textMuted = '#9ea8bc',
        success = '#29c46d',
        warning = '#f3b33d',
        danger = '#ef5350',
        progressStart = '#7c5cff',
        progressEnd = '#19c2ff',
        shadow = '0 20px 80px rgba(0,0,0,0.45)',
        radiusLg = '20px',
        radiusMd = '14px',
        radiusSm = '10px',
        spacing = '14px',
        fontFamily = "'Inter', 'Segoe UI', sans-serif",
        blur = '18px',
        hoverBrightness = '1.08',
        transition = '180ms ease',
    }
}

Config.Logging = {
    resourcePrefix = '^5[qbx_premium_safes]^7',
    webhooks = {
        default = '',
        crack = '',
        admin = '',
    }
}

Config.Commands = {
    inspect = 'safeinspect',
    cleanup = 'safecleanup',
    reset = 'saferesetprogress',
    clearCrack = 'safeclearforced',
    forceRemove = 'safeforceremove',
}

Config.Hooks = {
    policeAlert = function(payload) --Made to support origin_dispatch you can edit this for whatever dispatch you use 
        exports['origin_dispatch']:SendDispatch({
            job = 'police',
            calls = 'Safe Break-In',
            coords = payload.coords,
            information = ('Break-in attempt at safe: %s'):format(payload.safeName or ('#' .. tostring(payload.safeId))),
        })
        if Config.Debug then
            print(('[ALERT] Safe crack attempt at %s by %s'):format(payload.safeId, payload.playerName))
        end
    end,
    minigame = function(source, safeId)
        return true
    end,
    canAssignGroup = function(source, assignmentType, assignmentName)
        return true
    end,
    resolveBusinessMembers = function(assignmentType, assignmentName)
        return {}
    end,
    onSafePlaced = function(safe) end,
    onSafeRemoved = function(safe) end,
}
