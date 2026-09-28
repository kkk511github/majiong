# White-jade / calm enamel appearance — 2026-09-29

Scope: visual materials and generated tile atlases only. Original replacement
art, tile identity/order, gameplay rules, layout metrics and atlas alpha remain
unchanged. No production deployment or mobile package release was performed.

## Changes

- Removed the previous 1.55× ink saturation/value boost. Bamboo uses 0.78
  saturation, other coloured artwork 0.90; linear-light highlights are scaled
  to 0.82. White-dragon porcelain is exempt. The realtime canvas and offline
  Blender material use the same tone operation.
- Reduced enamel engraving depth, coat/specular intensity and micro-bump;
  balanced neutral ambient/front fill against overhead light. Ivory and blank
  face regions share the same material roughness.
- Added a display-referred face shader. Cocos's default ACES output compressed
  near-white face pixels to approximately 226–227; the final screenshot's
  sampled blank face is approximately 246–250. Solid sidewalls, bevels and
  contact shadows remain physically lit.
- Realtime face textures are now 384×512 instead of 192×256, including the
  supplied white-dragon artwork (previously replaced by a drawn rectangle).
- Rebuilt all 42 faces in 18 exposed-face poses and exported the shared React
  atlas for hints/results. All merge reports have zero alpha error; frame
  dimensions and anchors are preserved.

## Verification

- `npm test`: 125 files, 1,639 tests passed, including four tone tests.
- `npm run build:web`: passed, including Creator, TypeScript and asset audit.
- `tests/production-table-3d.config.ts`: seven browser scenarios cover HD face
  material, legacy canvas, claims/tints/hints/stacks, two-round settlement,
  local bots, table layouts/actions and hand insertion animation.
- Final default-table and all-bamboo screenshots reviewed at gameplay scale.

Detailed render, merge, build/test logs and screenshots are under
`../../work/soft-jade-20260929/`. Local visual preview:
`http://127.0.0.1:5180/cocos-table/index.html?appearance=soft-jade-20260929`.

## Full-river readability follow-up

- River artwork uses 256×256 textures with reduced blank margins and nine
  mip levels. Each mip now comes directly from the original canvas instead of
  repeatedly downscaling the preceding level. River face materials use a
  restrained −0.5 mip bias; other face materials retain zero bias. Trilinear
  filtering and 4× anisotropy remain enabled. No extra colour/contrast boost.
- Small river faces additionally recover local edge contrast in the shader:
  four neighbour samples, strength 0.5, luminance-only correction capped at
  ±0.045. Flat jade/ink colours do not change, saturation is not raised, and
  larger non-river faces bypass this step entirely.
- The enlarged/cropped preview was rejected: the requirement is clarity at
  normal phone size. It has been removed. The page again displays the entire
  table, with no zoom, crop, altered geometry, or added colour/contrast boost.
- Confirmed a renderer-level blur source: Creator 3.8.8 hard-caps the web screen
  adapter at DPR 2, causing a second 1.5× browser resampling on DPR-3 phones.
  The export now patches only that audited getter to use native DPR up to 3,
  with a 4MP budget (never below 1×). CSS size, camera and touch coordinate
  calculations all use the same engine adapter; there is no DOM enlargement.
- The export fails closed if the audited engine signature changes. The patched
  engine receives a new content-derived filename and its imports are updated
  to avoid stale immutable caches. The transform is part of the runtime source
  fingerprint and portable archive integrity checks.
- In Chromium phone emulation at 844×390 CSS / DPR 3, the framebuffer is now
  native 3× instead of 2×. The 120-discard browser test also verifies normal
  uncropped layout, touch selection and viewport resizing. This is browser
  emulation, not a physical-phone performance or visual acceptance result.
  Comparison screenshots: `output/qa/river-phone-before.png` and
  `output/qa/river-phone-after.png`.
- Verification: 1,787 unit tests passed; the production browser suite covers
  all-seat supplier direction, materials, DPR-3 touch/resize, claims, hints,
  stacks and local play. Device-side frame rate/thermal testing remains outside
  this local browser verification.
