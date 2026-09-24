# Approved 3D table integration — 2026-09-24

## Scope

The approved blue table and physical tile view now run in the production Cocos renderer. Live games, practice and replays enter through `CocosTable` with the client-only `reference-3d` skin. No engine, Hu, scoring, account, invitation or server policy implementation changed. No production deployment, Git push or package publication was performed.

The left-top control is trustee/cancel trustee, not a decorative arrow. Player portraits, names, score, flower count and active-player indications come from the actual public state, not the reference screenshot. HUD anchors follow the approved four positions and preserve device safe-area adjustments.

## Rendering and layout

- Shared physical layout: `shared/table-3d-layout.ts`; the review preview re-exports it to prevent drift.
- Production body/material/camera implementation: `cocos-table/assets/scripts/Table3DView.ts`.
- Main renderer retains its existing command bridge, drag lifecycle, discard/claim animations, countdown, opening handshake and replay controls.
- Three discard rows and one horizontal flower row are reserved before the table fills. Side discard lanes reserve their complete length from the first card, keeping player corners and flower lanes separate.
- Final review: narrowed all four discard models from 0.35 to 0.30 width (depth 0.37 and body thickness 0.16 retained); centred their rows again without changing hand, flower or meld model sizes. Removed the redundant rules/grade/round line, keeping the central round counter. Left multiplier text respects the landscape cutout.
- Concealed hands use upright rectangular models. Legally revealed side/opposite hands in replay/settlement use full face-up models, not thin concealed-hand sprites.
- Added/concealed kong stacks anchor to the middle tile; direct open kongs remain four base tiles. Claimed pungs retain seat-relative sideways indicators.
- A near-full downstream rack reserves the lower-right corner; exceptionally long local hands use the remaining hand-row width rather than entering that corner.
- Creator builds use array iteration (not assumed-array `entries()` iterators) and ship their own face textures, standard shader and background assets.

## Verification

- TypeScript check passed.
- Full unit suite: 91 files / 1332 tests passed before the final additional replay regression; the additional four-case production suite also passed.
- Revealed replay regression checks 109 frames in four perspectives for cross-player / cross-area overlaps.
- Production Cocos/browser checks cover startup, real public HUD data, model creation, selection lift, double-click discard and trustee location.
- 16 interaction/replay browser cases passed, including 568/844/1280 layouts, real touch dragging, pending claims, safe areas, uploaded replay avatars and perspective changes.
- After the final narrower-discard and removed-rule-line changes, the 11 live-client/replay browser cases were rerun and passed; the 23 focused layout/production checks also passed.
- Protected native Vite build and Capacitor sync succeeded. Simulator Xcode build succeeded for iPhone 17 Pro Max (iOS 26.5).
- Native configuration has no dev-server URL and retains `https://212.189.31.46/mahjong` as the HTTPS game endpoint. Its read-only health endpoint reported version 0.7.37.
- Installed on the existing simulator app without erasing its data; verified real-server replay content and visible player/flower/discard separation there.

## Delivery boundary

This is a local client/simulator update, not a public APK/IPA release or a backend deployment. Existing online players and their ongoing games were not modified. Final visual approval is still the user's decision.
