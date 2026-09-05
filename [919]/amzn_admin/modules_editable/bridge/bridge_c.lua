Bridge = {}

Bridge.ReviveSelf = function()
    TriggerServerEvent('amzn_admin:server:ReviveSelf')
end

Bridge.FeedSelf = function()
    TriggerServerEvent('amzn_admin:server:FeedSelf')
end

Bridge.FillFuel = function(vehicle)
    if GetResourceState('LegacyFuel') == 'started' then
        exports['LegacyFuel']:SetFuel(vehicle, 100)
    elseif GetResourceState('ox_fuel') == 'started' then
        SetVehicleFuelLevel(vehicle, 100)
        Entity(vehicle).state:set('fuel', 100)
    elseif GetResourceState('cdn-fuel') == 'started' then
        exports['cdn-fuel']:SetFuel(vehicle, 100)
    elseif GetResourceState('lc_fuel') == 'started' then
        exports["lc_fuel"]:SetFuel(vehicle, 100)
    elseif GetResourceState('gacha_fuel') == 'started' then
        exports['gacha_fuel']:SetFuel(vehicle, 100)
    end
end

Bridge.OpenClothingMenu = function()
    if GetResourceState('qb-clothing') == 'started' then
        TriggerEvent('qb-clothing:client:openMenu')
    elseif GetResourceState('illenium-appearance') == 'started' then
        TriggerEvent('illenium-appearance:client:openClothingShop', true)
    end
end

RegisterNetEvent('amzn_admin:tk_policejob:uncuff', function()
    if GetResourceState('tk_policejob') ~= 'started' then return print('tk_policejob not started') end
    if exports.tk_policejob:isHandcuffed() then
        exports.tk_policejob:unCuff()
    else
        exports.tk_policejob:hardCuff()
    end
end)