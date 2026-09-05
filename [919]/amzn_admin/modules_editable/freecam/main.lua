
local Wait = Citizen.Wait
local vector3 = vector3
local IsPauseMenuActive = IsPauseMenuActive
local GetSmartControlNormal = GetSmartControlNormal

local SETTINGS = _G.CONTROL_SETTINGS
local CONTROLS = _G.CONTROL_MAPPING

local SCROLL_UP = 241
local SCROLL_DOWN = 242
local SPEED_MIN = 0.1
local SPEED_MAX = 10.0
local SPEED_STEP = 1.35

local speedLevel = 1.0

-------------------------------------------------------------------------------
local function GetSpeedMultiplier()
  if IsDisabledControlJustPressed(0, SCROLL_UP) then
    speedLevel = math.min(speedLevel * SPEED_STEP, SPEED_MAX)
  end
  if IsDisabledControlJustPressed(0, SCROLL_DOWN) then
    speedLevel = math.max(speedLevel / SPEED_STEP, SPEED_MIN)
  end

  local fastNormal = GetSmartControlNormal(CONTROLS.MOVE_FAST)
  local slowNormal = GetSmartControlNormal(CONTROLS.MOVE_SLOW)

  local baseSpeed = SETTINGS.BASE_MOVE_MULTIPLIER
  local fastSpeed = 1 + ((SETTINGS.FAST_MOVE_MULTIPLIER - 1) * fastNormal)
  local slowSpeed = 1 + ((SETTINGS.SLOW_MOVE_MULTIPLIER - 1) * slowNormal)

  local frameMultiplier = GetFrameTime() * 60
  local speedMultiplier = baseSpeed * fastSpeed / slowSpeed * speedLevel

  return speedMultiplier * frameMultiplier
end

local function UpdateCamera()
  if not IsFreecamActive() or IsPauseMenuActive() then
    return
  end

  if not IsFreecamFrozen() then
    local vecX, vecY = GetFreecamMatrix()
    local vecZ = vector3(0, 0, 1)

    local pos = GetFreecamPosition()
    local rot = GetFreecamRotation()

    -- Get speed multiplier for movement
    local speedMultiplier = GetSpeedMultiplier()

    -- Get rotation input
    local lookX = GetSmartControlNormal(CONTROLS.LOOK_X)
    local lookY = GetSmartControlNormal(CONTROLS.LOOK_Y)

    -- Get position input
    local moveX = GetSmartControlNormal(CONTROLS.MOVE_X)
    local moveY = GetSmartControlNormal(CONTROLS.MOVE_Y)
    local moveZ = GetSmartControlNormal(CONTROLS.MOVE_Z)

    -- Calculate new rotation.
    local rotX = rot.x + (-lookY * SETTINGS.LOOK_SENSITIVITY_X)
    local rotZ = rot.z + (-lookX * SETTINGS.LOOK_SENSITIVITY_Y)
    local rotY = rot.y

    -- Adjust position relative to camera rotation.
    pos = pos + (vecX *  moveX * speedMultiplier)
    pos = pos + (vecY * -moveY * speedMultiplier)
    pos = pos + (vecZ *  moveZ * speedMultiplier)

    -- Adjust new rotation
    rot = vector3(rotX, rotY, rotZ)

    -- Update camera
    SetFreecamPosition(pos.x, pos.y, pos.z)
    SetFreecamRotation(rot.x, rot.y, rot.z)

    return pos, rotZ
  end

  -- Trigger a tick event. Resources depending on the freecam position can
  -- make use of this event.
  -- TriggerEvent('freecam:onTick')
end

-------------------------------------------------------------------------------
local keysTable = {
  {'Speed Mult', SCROLL_UP},
  {'Slower', CONTROLS.MOVE_SLOW},
  {'Faster', CONTROLS.MOVE_FAST},
  {'Down', CONTROLS.MOVE_Z[2]},
  {'Up', CONTROLS.MOVE_Z[1]},
  {'Left/Right', CONTROLS.MOVE_X},
  {'Fwd/Back', CONTROLS.MOVE_Y},
}

local function makeFivemInstructionalScaleform(keysTable)
  local scaleform = RequestScaleformMovie("instructional_buttons")
  while not HasScaleformMovieLoaded(scaleform) do
      Wait(10)
  end
  BeginScaleformMovieMethod(scaleform, "CLEAR_ALL")
  EndScaleformMovieMethod()

  BeginScaleformMovieMethod(scaleform, "SET_CLEAR_SPACE")
  ScaleformMovieMethodAddParamInt(200)
  EndScaleformMovieMethod()

  for btnIndex, keyData in ipairs(keysTable) do
      local btn = GetControlInstructionalButton(0, keyData[2], true)

      BeginScaleformMovieMethod(scaleform, "SET_DATA_SLOT")
      ScaleformMovieMethodAddParamInt(btnIndex - 1)
      ScaleformMovieMethodAddParamPlayerNameString(btn)
      BeginTextCommandScaleformString("STRING")
      AddTextComponentSubstringKeyboardDisplay(keyData[1])
      EndTextCommandScaleformString()
      EndScaleformMovieMethod()
  end

  BeginScaleformMovieMethod(scaleform, "DRAW_INSTRUCTIONAL_BUTTONS")
  EndScaleformMovieMethod()

  BeginScaleformMovieMethod(scaleform, "SET_BACKGROUND_COLOUR")
  ScaleformMovieMethodAddParamInt(0)
  ScaleformMovieMethodAddParamInt(0)
  ScaleformMovieMethodAddParamInt(0)
  ScaleformMovieMethodAddParamInt(80)
  EndScaleformMovieMethod()

  return scaleform
end

function StartFreecamThread()
  speedLevel = 1.0

  -- Camera/Pos updating thread
  Citizen.CreateThread(function()
    local ped = PlayerPedId()
    local initialPos = GetEntityCoords(ped)
    SetFreecamPosition(initialPos[1], initialPos[2], initialPos[3])
    local veh = GetVehiclePedIsIn(ped, false)
    if IsPedOnMount(ped) then
      veh = GetMount(ped)
    end

    local function updatePos(pos, rotZ)
      -- Intentionally left blank: freecam should not move the player's ped or vehicle while active.
    end

    local frameCounter = 0
    local loopPos, loopRotZ
    while IsFreecamActive() do
      loopPos, loopRotZ = UpdateCamera()
      frameCounter = frameCounter + 1
      -- Do not move ped/vehicle while freecam is active
      if frameCounter > 100 then frameCounter = 0 end
      Wait(0)
    end

    -- No relocation here; relocation is handled on exit by the freecam controller
  end)

  -- Start instructional thread
  CreateThread(function()
    local fivemScaleform = makeFivemInstructionalScaleform(keysTable)
    while IsFreecamActive() do
      DrawScaleformMovieFullscreen(fivemScaleform, 255, 255, 255, 255, 0)
      Wait(0)
    end

    --cleanup of the scaleform movie
    SetScaleformMovieAsNoLongerNeeded(fivemScaleform)
  end)
end

--------------------------------------------------------------------------------

-- When the resource is stopped, make sure to return the camera to the player.
AddEventHandler('onResourceStop', function (resourceName)
  if resourceName == GetCurrentResourceName() then
    SetFreecamActive(false)
  end
end)
