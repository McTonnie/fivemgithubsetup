# templates/ — drop your garment source files here

This folder holds the **edit-only** source of the clothing you want to design on.
It is **never streamed to players** — only the tools read it.

## What to put here

Your garment `.ydd` models and their `.ytd` textures, keeping the original
`<collection>^<drawable>` names, e.g.:

```
templates/models/female/jbib/mp_f_freemode_01^jbib_013_u.ydd
templates/models/female/jbib/mp_f_freemode_01^jbib_diff_013_a_uni.ytd
templates/models/male/jbib/mp_m_freemode_01^jbib_014_u.ydd
templates/models/male/jbib/mp_m_freemode_01^jbib_diff_014_a_uni.ytd
```

Any folder layout works — the tools read the collection/component from the file
names. Grouping by `models/<gender>/<component>/` just keeps things tidy.

## Then convert

Run **`tools/convert.bat`** (Windows) / **`tools/convert.sh`** (Linux/Mac) /
`node tools/convert.js`. It builds the web `.glb` + preview `.png` into
`stream/models/…` and updates `templates.json`, so the garments appear in the
studio's **Templates** tab.

See the main `README.md` for the full workflow.
