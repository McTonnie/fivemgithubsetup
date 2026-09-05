Locales = Locales or {}
CurrentLocale = CurrentLocale or 'en'

function _L(key, ...)
    local dict = Locales[CurrentLocale] or Locales['en'] or {}
    local val = dict[key] or key
    if select('#', ...) > 0 then
        local ok, formatted = pcall(string.format, val, ...)
        if ok then return formatted end
    end
    return val
end

-- Helper to set locale at runtime if needed
function SetLocale(locale)
    CurrentLocale = locale
end

-- Initialize from config if available
if Config and Config.Locale then
    CurrentLocale = Config.Locale
end