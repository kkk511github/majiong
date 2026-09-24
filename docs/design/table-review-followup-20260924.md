# Table theme and review follow-up

## User-approved scope

- P1 (`CanvasRenderingContext2D.roundRect` on early iOS 15) explicitly deferred at the user's request. Calls and minimum iOS version remain unchanged. This compatibility risk is **not resolved**.
- Trustee moved to the reserved upper-right corner, with a compact 64×34 visual plate inside a 64×44 hit area. Quick phrases remain present and use the same ocean-blue theme.
- Pung/kong use new circular ivory porcelain sprites; Hu uses a brighter celadon disc and cinnabar text, pass a slate disc. These do not reuse the rectangular toolbar asset. Labels, legal actions and command IDs are unchanged.
- Replay header/controls override the lobby gold skin with a blue/cyan palette.
- Opposite discards face the local viewer; other hands, flowers and melds keep their original orientation.
- A retained drawn tile uses a visual lift/insert/settle path after a different own physical tile appears in the authoritative discard river. Directly discarding the drawn tile, reconnecting or moving tiles to a kong does not trigger the insertion.

## Review fixes

- Native paths normalized to `node_modules/@capacitor/...`; `native:sync` and the Windows build normalize generated pnpm paths automatically. npm/package-lock.json remains the supported workflow; local pnpm files are ignored, not deleted.
- Room communication now receives `tableStyle`; shortcut placement, phrase panel and speech bubbles use the current HUD anchors. Added responsive/safe-area regression tests.
- The 42 face images and table background now load via Cocos `resources.load()`. Root URL copies were removed from the export. `check-cocos-image-copies.mjs` checks one byte-identical copy of each of the 43 images.
- The Hu hint strip now uses the blue theme and new Hu medallion. Its image margin is reset and tile height is calculated from the inner content box, with responsive containment checks at 568×320, 844×390, 1280×590 and 680×843.
- Follow-up HUD: all four score/flower rows retain their bounds and fully opaque text but no painted backing. The pending claim-source panel (who discarded which tile / choose action) uses the blue translucent theme in both React controls and standalone Cocos, distinct from the confirmed-pung animation.
- Export measured after deduplication: approximately 51.6 MB; compressed runtime approximately 48.2 MB. Rendering/shader changes may slightly alter the final totals.
- New required source/assets/materials/tests are to be included in the staged source snapshot; unrelated local lobby/profile concepts are not part of this task.

## Delivery boundary

No server changes, public deployment or package overwrite. Previously delivered 0.7.38/76 APK and unsigned IPA do not include this follow-up; new packages must be generated to ship it. No Git commit or remote push is implied by staging/reproducibility verification.

Generated UI asset and built-in ImageGen prompt: [table-tools-blue-v3.md](table-tools-blue-v3.md).

New action asset/prompt set: [action-discs-v1.md](action-discs-v1.md).

## Follow-up verification

- 93 unit files / 1342 tests passed.
- Production export: two startup/interaction/insertion browser checks passed.
- Fourteen app/short-phrase browser cases passed after the new circular controls; a further replay case verified the blue header colours and captured the rendered toolbar.
- A staged source snapshot, without the local pnpm files, passed the documented root + report-xlsx npm installs and `npm run build`. The Cocos portable runtime restored and verified without a Creator installation in the snapshot.
- A byte-hash audit found exactly one packaged copy of each of the 43 Cocos image assets.
- Required new sources, assets, material metadata and tests are staged. No commit, push, server deployment or repackaging was performed in this follow-up.
- Final action treatment removes captions, adds restrained readiness/press rings, respects reduced-motion and emits a short confirmed-pung cue off the hand faces. Distinct self-kong choices retain tiny tile thumbnails and accessible names.
