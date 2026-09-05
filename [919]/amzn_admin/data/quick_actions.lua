return {
    -- Self Actions
    { key = "quickaction:ReviveSelf", title = "Revive Self", description = "Revive your character.", favorite = false, type = "self", icon = "fa-heart-pulse" },
    { key = "quickaction:FeedSelf", title = "Feed Self", description = "Replenish hunger/thirst.", favorite = false, type = "self", icon = "fa-utensils" },
    { key = "quickaction:RelieveStress", title = "Relieve Stress", description = "Remove stress from your character.", favorite = false, type = "self", icon = "fa-spa" },
    { key = "quickaction:GoBack", title = "Go Back", description = "Teleport to your previous location.", favorite = false, type = "self", icon = "fa-undo" },
    { key = "quickaction:TeleportToMarker", title = "Teleport to Marker", description = "Teleport to your map marker.", favorite = false, type = "self", icon = "fa-map-marker-alt" },
    { key = "quickaction:ClothingMenu", title = "Clothing Menu", description = "Open clothing customization.", favorite = false, type = "self", icon = "fa-shirt" },
    { key = "quickaction:ClearBlood", title = "Clear Blood", description = "Remove blood from character.", favorite = false, type = "self", icon = "fa-tint-slash" },
    { key = "quickaction:WetClothes", title = "Wet Clothes", description = "Make character appear wet.", favorite = false, type = "self", icon = "fa-water" },
    { key = "quickaction:DryClothes", title = "Dry Clothes", description = "Dry your character's outfit.", favorite = false, type = "self", icon = "fa-wind" },
    { key = "quickaction:ToggleInvisibility", title = "Toggle Invisibility", description = "Become invisible or visible.", favorite = false, type = "self", icon = "fa-eye-slash", isToggle = true },
    { key = "quickaction:ToggleFastRun", title = "Toggle Fast Run", description = "Enable or disable fast running.", favorite = false, type = "self", icon = "fa-running", isToggle = true },
    { key = "quickaction:ToggleGodMode", title = "Toggle God Mode", description = "Invincibility toggle.", favorite = false, type = "self", icon = "fa-shield-alt", isToggle = true },
    { key = "quickaction:ToggleSuperJump", title = "Toggle Super Jump", description = "Jump higher than normal.", favorite = false, type = "self", icon = "fa-angle-double-up", isToggle = true },
    { key = "quickaction:ToggleNoRagdoll", title = "Toggle No Ragdoll", description = "Prevent falling over from damage.", favorite = false, type = "self", icon = "fa-user-shield", isToggle = true },
    { key = "quickaction:ToggleInfiniteStamina", title = "Toggle Infinite Stamina", description = "Run forever without tiring.", favorite = false, type = "self", icon = "fa-battery-full", isToggle = true },
    { key = "quickaction:ToggleAdminTag", title = "Admin Tag", description = "Toggle a visible rank tag above your head.", favorite = false, type = "self", icon = "fa-id-badge", isToggle = true },

    -- Server Actions
    { key = "quickaction:ReviveAll", title = "Revive All", description = "Revive every player on the server.", favorite = false, type = "server", icon = "fa-hand-holding-medical" },
    { key = "quickaction:MessageAll", title = "Message All", description = "Send a message to all players.", favorite = false, type = "server", icon = "fa-bullhorn", requiresPrompt = true, promptPlaceholder = "Enter message" },
    { key = "quickaction:SetWeather", title = "Set Weather", description = "Change the current weather.", favorite = false, type = "server", icon = "fa-cloud-sun", requiresPrompt = true, promptPlaceholder = "Enter weather type" },
    { key = "quickaction:SetTime", title = "Set Time", description = "Change the current server time.", favorite = false, type = "server", icon = "fa-clock", requiresPrompt = true, promptPlaceholder = "Enter time (HH:MM)" },

    -- Vehicle Actions
    { key = "quickaction:RepairVehicle", title = "Repair Vehicle", description = "Fix the current vehicle.", favorite = false, type = "vehicle", icon = "fa-wrench" },
    { key = "quickaction:FillGasTank", title = "Fill Gas Tank", description = "Refuel the current vehicle.", favorite = false, type = "vehicle", icon = "fa-gas-pump" },
    { key = "quickaction:WashVehicle", title = "Wash Vehicle", description = "Clean the current vehicle.", favorite = false, type = "vehicle", icon = "fa-soap" },
    { key = "quickaction:SetVehicleColor", title = "Set Vehicle Color", description = "Change the current vehicle color.", favorite = false, type = "vehicle", icon = "fa-palette", requiresPrompt = true, promptPlaceholder = "Pick a color", promptType = "color" },
    { key = "quickaction:SetMeDriver", title = "Set Me Driver", description = "Teleport into driver's seat.", favorite = false, type = "vehicle", icon = "fa-user" },
    { key = "quickaction:SetMePassenger", title = "Set Me Passenger", description = "Teleport into passenger seat.", favorite = false, type = "vehicle", icon = "fa-user-friends" },
    { key = "quickaction:UnlockVehicle", title = "Unlock Vehicle", description = "Unlock a nearby vehicle.", favorite = false, type = "vehicle", icon = "fa-unlock" },
    { key = "quickaction:LockVehicle", title = "Lock Vehicle", description = "Lock a nearby vehicle.", favorite = false, type = "vehicle", icon = "fa-lock" },
    { key = "quickaction:MaxPerformance", title = "Max Performance", description = "Give the current vehicle max performance.", favorite = false, type = "vehicle", icon = "fa-tachometer-alt" },
    { key = "quickaction:GetKeys", title = "Get Keys", description = "Get keys for the current vehicle.", favorite = false, type = "vehicle", icon = "fa-key" },

    -- Dev Actions
    { key = "quickaction:GetVec3", title = "Get Vec3", description = "Print vector3 coordinates.", favorite = false, type = "dev", icon = "fa-map-pin" },
    { key = "quickaction:GetVec4", title = "Get Vec4", description = "Print vector4 coordinates (with heading).", favorite = false, type = "dev", icon = "fa-location-arrow" },
    { key = "quickaction:GetHeading", title = "Get Heading", description = "Print player heading/direction.", favorite = false, type = "dev", icon = "fa-compass" },
    { key = "quickaction:LoadIPL", title = "Load IPL", description = "Load an interior prop library.", favorite = false, type = "dev", icon = "fa-download", requiresPrompt = true, promptPlaceholder = "Enter IPL name" },
    { key = "quickaction:UnloadIPL", title = "Unload IPL", description = "Unload an interior prop library.", favorite = false, type = "dev", icon = "fa-upload", requiresPrompt = true, promptPlaceholder = "Enter IPL name" },

    -- Entity Actions
    { key = "quickaction:SpawnCar", title = "Spawn Car", description = "Spawn a vehicle of your choice.", favorite = false, type = "entity", icon = "fa-car", requiresPrompt = true, promptPlaceholder = "Enter vehicle name" },
    { key = "quickaction:DeleteClosestVehicle", title = "Delete Closest Vehicle", description = "Remove the nearest vehicle.", favorite = false, type = "entity", icon = "fa-car-crash" },
    { key = "quickaction:DeleteClosestPed", title = "Delete Closest Ped", description = "Remove the nearest ped/NPC.", favorite = false, type = "entity", icon = "fa-user-times" },
    { key = "quickaction:DeleteClosestObject", title = "Delete Closest Object", description = "Remove the nearest object.", favorite = false, type = "entity", icon = "fa-trash" },
    { key = "quickaction:MassDeleteVehicles", title = "Mass Delete Vehicles", description = "Clear all vehicles in the server.", favorite = false, type = "entity", icon = "fa-broom" },
    { key = "quickaction:MassDeletePeds", title = "Mass Delete Peds", description = "Clear all peds in the server.", favorite = false, type = "entity", icon = "fa-skull-crossbones" }
} 