local locales = {}

locales.en = require('locales.en')
locales.es = require('locales.es')


-- The below ones don't exist yet, but you can add them using the format below.

-- locales.it = require('locales.it')
-- locales.fr = require('locales.fr')
-- locales.de = require('locales.de')
-- locales.nl = require('locales.nl')
-- locales.pt = require('locales.pt')
-- locales.ru = require('locales.ru')
-- locales.tr = require('locales.tr')
-- locales.ar = require('locales.ar')
-- locales.zh = require('locales.zh')
-- locales.ja = require('locales.ja')
-- locales.ko = require('locales.ko')
-- locales.hi = require('locales.hi')
-- locales.bn = require('locales.bn')
-- locales.pa = require('locales.pa')

RegisterNUICallback('getLocales', function(_, cb)
    cb(locales)
end)