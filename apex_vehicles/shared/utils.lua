--[[
    Apex Vehicle Studio — Shared Utilities
    ────────────────────────────────────────────────────────────
    Pure-Lua helpers safe on BOTH sides (no natives beyond print):
    logging, string/number helpers, a correct base64 codec (used
    to decode PNG dataURLs on the server during export) and a
    share-code generator. Loaded before every other script.
]]

Utils = Utils or {}

-- ─── Logging ────────────────────────────────────────────────
-- ^1 red · ^3 yellow · ^5 cyan · ^7 reset (FiveM console codes)

local function joinArgs(...)
    local n = select('#', ...)
    local parts = {}
    for i = 1, n do
        parts[i] = tostring(select(i, ...))
    end
    return table.concat(parts, ' ')
end

--- Verbose trace output. Printed ONLY when Config.debug = true.
function Utils.Log(...)
    if not (Config and Config.debug) then return end
    print('^5[apex_vehicles]^7 ' .. joinArgs(...))
end

--- Non-fatal warning. Always printed.
function Utils.Warn(...)
    print('^3[apex_vehicles]^7 ' .. joinArgs(...))
end

--- Error. Always printed.
function Utils.Err(...)
    print('^1[apex_vehicles]^7 ' .. joinArgs(...))
end

-- ─── Localisation ───────────────────────────────────────────
-- Global L(key, fallback, ...) used by every Lua module.
-- Resolution order: active locale → English → inline fallback.
-- Extra arguments are applied through string.format, so locale
-- strings may carry %s / %d placeholders. Resolves at CALL time,
-- so it is safe even though locale files load after this one.
-- On the client a player's own language pick (KVP) overrides
-- Config.locale; Utils.ActiveLocale is the single resolver both this
-- and the NUI dictionary go through.
function Utils.ActiveLocale()
    local server = (Config and type(Config.locale) == 'string' and Config.locale ~= '')
        and Config.locale or 'en'
    if IsDuplicityVersion() then return server end
    local own = GetResourceKvpString('apex_vehicles_lang')
    if type(own) == 'string' and own ~= '' and own ~= 'auto'
        and Locales and Locales[own] then
        return own
    end
    return server
end

function L(key, fallback, ...)
    local text
    if Locales then
        local active = Utils.ActiveLocale()
        local loc = Locales[active]
        if loc and loc[key] ~= nil then text = loc[key] end
        if text == nil and Locales.en then text = Locales.en[key] end
    end
    if text == nil then text = fallback or key end
    if select('#', ...) > 0 then
        local ok, formatted = pcall(string.format, text, ...)
        if ok then return formatted end
    end
    return text
end

-- ─── Strings ────────────────────────────────────────────────

--- Trim leading/trailing whitespace.
function Utils.Trim(s)
    if type(s) ~= 'string' then return '' end
    return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

--- Reduce an arbitrary name to a safe slug: lowercase [a-z0-9_],
--- max 40 chars. Returns '' when nothing usable remains — callers
--- must treat '' as invalid input.
function Utils.Slug(name)
    if type(name) ~= 'string' then return '' end
    local s = name:lower()
    s = s:gsub('[%s%-%.]+', '_')       -- whitespace / dashes / dots → _
    s = s:gsub('[^a-z0-9_]', '')       -- drop anything else
    s = s:gsub('_+', '_')              -- collapse ___ runs
    s = s:sub(1, 40)
    s = s:gsub('^_+', ''):gsub('_+$', '')
    return s
end

-- ─── Numbers ────────────────────────────────────────────────

--- Round to `decimals` places (default 0). Integer in, integer out.
function Utils.Round(value, decimals)
    value = tonumber(value) or 0
    local places = tonumber(decimals) or 0
    if places <= 0 then
        return math.floor(value + 0.5)
    end
    local mult = 10 ^ places
    return math.floor(value * mult + 0.5) / mult
end

--- Clamp `v` into [min, max].
function Utils.Clamp(v, min, max)
    v = tonumber(v) or 0
    if v < min then return min end
    if v > max then return max end
    return v
end

-- ─── Tables ─────────────────────────────────────────────────

--- Count entries in ANY table (works for hash tables where #t lies).
function Utils.TableCount(t)
    if type(t) ~= 'table' then return 0 end
    local count = 0
    for _ in pairs(t) do count = count + 1 end
    return count
end

-- ─── Base64 ─────────────────────────────────────────────────
-- Correct, dependency-free codec (RFC 4648). The decoder accepts
-- embedded whitespace/newlines, enforces proper '=' padding and
-- returns nil for anything malformed — it never produces garbage
-- bytes that would corrupt an exported PNG.

local B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local B64_PAD = string.byte('=')
local B64_ENC = {}   -- value (0..63) → char byte
local B64_DEC = {}   -- char byte → value (0..63)
for i = 1, 64 do
    local byte = B64_ALPHABET:byte(i)
    B64_ENC[i - 1] = byte
    B64_DEC[byte] = i - 1
end

--- Encode a binary string to base64. Returns nil for non-strings.
function Utils.B64Encode(data)
    if type(data) ~= 'string' then return nil end
    local out = {}
    local len = #data
    local full = len - (len % 3)
    local i = 1
    while i <= full do
        local a, b, c = string.byte(data, i, i + 2)
        local n = (a << 16) | (b << 8) | c
        out[#out + 1] = string.char(
            B64_ENC[(n >> 18) & 63],
            B64_ENC[(n >> 12) & 63],
            B64_ENC[(n >> 6) & 63],
            B64_ENC[n & 63]
        )
        i = i + 3
    end
    local rem = len % 3
    if rem == 1 then
        local a = string.byte(data, len)
        local n = a << 16
        out[#out + 1] = string.char(
            B64_ENC[(n >> 18) & 63],
            B64_ENC[(n >> 12) & 63]
        ) .. '=='
    elseif rem == 2 then
        local a, b = string.byte(data, len - 1, len)
        local n = (a << 16) | (b << 8)
        out[#out + 1] = string.char(
            B64_ENC[(n >> 18) & 63],
            B64_ENC[(n >> 12) & 63],
            B64_ENC[(n >> 6) & 63]
        ) .. '='
    end
    return table.concat(out)
end

--- Decode a base64 string to binary. Whitespace is tolerated.
--- Returns nil on invalid characters, bad length or misplaced
--- padding; returns '' for an empty input.
function Utils.B64Decode(str)
    if type(str) ~= 'string' then return nil end
    str = str:gsub('%s', '')
    if str == '' then return '' end
    local len = #str
    if (len % 4) ~= 0 then return nil end
    local out = {}
    for i = 1, len, 4 do
        local b1, b2, b3, b4 = string.byte(str, i, i + 3)
        local v1, v2 = B64_DEC[b1], B64_DEC[b2]
        if not v1 or not v2 then return nil end
        if b4 == B64_PAD then
            -- Padding is only legal in the very last quad.
            if i + 3 < len then return nil end
            if b3 == B64_PAD then
                out[#out + 1] = string.char(
                    ((v1 << 2) | (v2 >> 4)) & 255
                )
            else
                local v3 = B64_DEC[b3]
                if not v3 then return nil end
                out[#out + 1] = string.char(
                    ((v1 << 2) | (v2 >> 4)) & 255,
                    (((v2 & 15) << 4) | (v3 >> 2)) & 255
                )
            end
        else
            if b3 == B64_PAD then return nil end   -- '=' mid-quad
            local v3, v4 = B64_DEC[b3], B64_DEC[b4]
            if not v3 or not v4 then return nil end
            out[#out + 1] = string.char(
                ((v1 << 2) | (v2 >> 4)) & 255,
                (((v2 & 15) << 4) | (v3 >> 2)) & 255,
                (((v3 & 3) << 6) | v4) & 255
            )
        end
    end
    return table.concat(out)
end

-- ─── Codes ──────────────────────────────────────────────────

-- Unambiguous alphabet: no 0/O and no 1/I so codes survive being
-- read aloud or copied by hand from a screenshot.
local CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
local CODE_ALPHABET_LEN = #CODE_ALPHABET

--- Generate a random share code of length n (default 8).
function Utils.RandomCode(n)
    n = tonumber(n) or 8
    if n < 1 then n = 1 end
    local out = {}
    for i = 1, n do
        local idx = math.random(1, CODE_ALPHABET_LEN)
        out[i] = CODE_ALPHABET:sub(idx, idx)
    end
    return table.concat(out)
end
