exports(Config.SafeItem, function(event, item, inventory, slot, data)
    if event ~= 'usingItem' then return true end
    TriggerClientEvent('qbx_premium_safes:client:startPlacement', inventory.id or inventory)
    return false
end)
