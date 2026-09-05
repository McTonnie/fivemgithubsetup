function ValidateFirstnameOrLastname(value)
    local includeLetters = value:match("%a")
    local includeNumbers = value:match("%d")
    local includeSpecialCharacters = value:match("%W")

    -- By default firstname or lastname should include only letters
    return includeLetters and not includeNumbers and not includeSpecialCharacters
end
