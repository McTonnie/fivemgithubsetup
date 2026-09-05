# stream/ — your clothing templates

The studio **retextures clothing that the game can already put on the ped.**
So before an item shows up in the studio, its 3D mesh (`.ydd`) + textures
(`.ytd`) + variation metadata (`.ymt`) must be **streamed as an addon**. Drop
that addon here and it becomes selectable in the wardrobe.

> The studio does **not** turn loose `.ydd`/`.ytd` files into wearable clothing
> on its own — that needs the mesh + metadata (`.ymt`/`.meta`), which come with
> the clothing pack or are made in tools like OpenIV / CodeWalker. The studio's
> job is the **texture design + live preview + export**, not mesh authoring.

---

## What to put here

For a male-torso pack (your `jbib_012` example), the folder looks like this:

```
apex_clothing/
├─ fxmanifest.lua
└─ stream/
   ├─ mp_m_freemode_01_apex_templates.ymt          ← variation metadata (drawable/texture counts)
   ├─ mp_m_freemode_01_apex_templates^jbib_012_u.ydd        ← the mesh
   ├─ mp_m_freemode_01_apex_templates^jbib_diff_012_a_uni.ytd   ← texture a
   ├─ mp_m_freemode_01_apex_templates^jbib_diff_012_b_uni.ytd   ← texture b
   ├─ …                                             (c … j)
   └─ mp_m_freemode_01_apex_templates.meta          ← ShopPedApparel (NOT auto-streamed)
```

Everything with a `.ydd` / `.ytd` / `.ymt` extension **auto-streams** just by
being inside `stream/` — you do not list them anywhere.

The caret (`^`) prefix `mp_m_freemode_01_apex_templates^` is what binds the
files to the `mp_m_freemode_01` ped under the collection `apex_templates`.
Your extracted files (`jbib_012_u.ydd`, `jbib_diff_012_a_uni.ytd` …) are the
right-hand side — just prefix them.

## The ShopPedApparel meta

Create `stream/mp_m_freemode_01_apex_templates.meta`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ShopPedApparel>
  <pedName>mp_m_freemode_01</pedName>
  <dlcName>apex_templates</dlcName>
  <fullDlcName>mp_m_freemode_01_apex_templates</fullDlcName>
  <eCharacter>SCR_CHAR_MULTIPLAYER</eCharacter>  <!-- female: SCR_CHAR_MULTIPLAYER_F -->
  <includeFile />
  <fistFile />
  <pedOutfits />
  <pedComponents />
  <pedProps />
</ShopPedApparel>
```

Then, in `fxmanifest.lua`, uncomment / add the matching line:

```lua
data_file 'SHOP_PED_APPAREL_META_FILE' 'stream/mp_m_freemode_01_apex_templates.meta'
```

Restart the resource: `refresh` then `restart apex_clothing`.

## Using it in the studio

1. `/clothingstudio`
2. In the left preview, click the **Torso / Top** slot in the component strip.
3. Use the **Drawable** stepper `‹ › ` to reach your streamed item (its index
   is appended after the base-game drawables — keep stepping to the end).
4. Paint / generate the texture on the right — the ped updates live.
5. **Export → Live** to apply it for everyone, or **Package** for a portable
   resource.

The collection badge under the preview shows `apex_templates` when you are on a
streamed item, so you know the studio resolved its texture name correctly.

---

### Female clothes

Use `mp_f_freemode_01_...` prefixes, `<pedName>mp_f_freemode_01</pedName>`, and
`<eCharacter>SCR_CHAR_MULTIPLAYER_F</eCharacter>`. Give each gender/pack its own
`dlcName` and its own `data_file` line.

### Other slots

Swap the `jbib` prefix for the component you are streaming:
`head, berd, hair, uppr, lowr, hand, feet, teef, accs, task, decl, jbib`
(props use `p_head`, `p_eyes`, `p_ears`, `p_lwrist`, `p_rwrist`).
