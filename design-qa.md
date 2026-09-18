# Records and Opening Redesign QA — 2026-09-18

final result: passed

## Selected design and evidence

- Source: `output/records-opening-redesign/selected-design.png` (1536×1024), the user's approved three-screen ImageGen board.
- Rendered in Codex in-app browser using production React records and Cocos table components, with development-only in-memory fixtures; no server data changed.
- Screenshots under `output/records-opening-redesign/`: `records-admin-1280.png`, `records-member-1280.png`, `details-1280.png` (1280×590 CSS/pixels, 1×); `records-admin-844.png`, `records-member-844.png`, `details-844.png` (844×390, 1×); `records-member-667.png`, `details-667.png`, `opening-keyframe-667.png`, `opening-ended-selection-667.png` (667×375, 1×); `records-admin-568.png`, `details-568.png` (568×320, 1×).
- Combined source/render comparisons inspected: `records-comparison.png`, `details-comparison.png`, `opening-comparison.png`. Each preserves image aspect ratio and places both images in one comparison. Source board panels are unusually wide (about 4:1); application screenshots use real landscape viewports. Responsive vertical expansion, real data, administrator controls, and scrollable full ledgers are intentional differences, not pixel-identical states.
- Focused ledger/score and header checks used original 844×390 and 568×320 screenshots, not only scaled contact sheets.

## Findings, fixes and verification history

1. P2: Header summary consumed too much detail height. Moved four-player totals into the modal header, removed duplicate totals, reduced short-screen spacing. Final `details-844.png` shows transfers and net changes together for the two-transfer example.
2. P2: Legacy positive-score `!important` made dark-header totals low contrast. Scoped gold override to header; verified gold positives and pale blue negatives in final details captures.
3. P1: A selected-date chip passed an empty calendar baseline, causing an invalid date. Added a separate calendar-label formatter and boundary tests. Clicked yesterday (two fixture tables), recent seven days (six), and switched back successfully.
4. P1: Re-clicking the selected scope cleared results without reloading. Added a no-op guard; verified administrator scope retained six fixture records.
5. P2: Legacy named grid areas broke the 667px top bar. Reset grid areas with scoped specificity. Final 667px and 568px captures show title, tabs, search and replay within viewport; no document horizontal overflow.
6. Preview-only HMR/root warning and missing screen-reader-only stylesheet corrected; fresh final records tab console has no errors. Earlier historical logs remain in older browser tabs; they are not presented as new failures.

## Fidelity surfaces

- Typography: retained app serif headings and legible sans-serif UI; generated golden calligraphy for 开局. Signed numbers use tabular figures. Long names truncate in four equal cells.
- Layout: horizontal date toolbar, cream cards, four score columns, left round selector, leading transfer table and green net-change strip match the selected hierarchy. Short screens scroll ledger content; header and close remain reachable.
- Color: jade header, warm ivory surfaces, watercolor edges, restrained gold controls; positive and negative values retain explicit signs as well as color.
- Assets: actual generated WebP background and alpha calligraphy are used; no CSS imitation of the illustrated scene. Intro uses a pre-rendered perspective scene with camera-style scale/translation, then dissolves to the unchanged live Cocos table. It is not a new real-time 3D table renderer. Mock avatars and fake hands are not baked into the opening scene.
- Content: 摘要 / 反馈 removed from records; dates and ledgers use actual runtime data. Special win titles use the existing scored-hand label resolver. Admin-only teams and read filters retained. Development fixtures include legacy-rule records and do not define current scoring rules.

## Verified interactions and limits

- Date filters, administrator/member switching, read marking and read filter, repeated active tab, initial direct round detail, round switching, board review tab and return-to-overview were exercised in browser.
- Opening appears, ends automatically, and returns to the actual Cocos canvas. Clicking 七筒 after completion showed 已选七筒 · 再点出牌 and raised the tile. Replay/expired/disconnected/claim/already-discarded opening guards covered by unit tests.
- Full unit suite: 43 files / 534 tests passed. After final date correction: focused date/opening/feedback suite 8 tests passed. Final TypeScript, production build and asset audit passed.
- Existing records E2E expectations updated to the new design but the Playwright CLI suite was not rerun; browser interaction verification used the in-app browser. No physical APK/IPA test, new packaging, deployment or push in this change.
- P3: Generated watercolor and default portrait assets differ from the illustrative mock's exact brushwork and faces. These are intentional reusable product assets.

No actionable P0/P1/P2 findings remain in the inspected states.

---

# Earlier Local Visual QA - 2026-09-18

final result: passed

Scope: colorful special-win effects, existing homepage improvement, records readability and local browser delivery. This is an improvement to the existing application, not a pixel-identical recreation of a new mockup.

## Sources And Evidence

- Source artwork: `public/art/win-v2/{sea,jade,bloom,celestial}.webp`, each 768 x 512, preserved transparent alpha. Source PNGs and prompt descriptions are listed in `docs/research/special-win-v2.md`.
- Existing home reference: `output/home-redesign/admin-1280.png`.
- Browser-rendered evidence: `output/design-v2/home-final.png`, `records-final.png`, `records-mobile-final.png`, `details-desktop.png`, `bloom-final.png`, `global-mobile.png`, `multi-mobile.png`.
- Combined comparisons inspected: `output/design-v2/asset-render-comparison.png` (art versus actual table), `home-comparison.png` (existing home versus improved home).
- Desktop browser screenshots: 1280 x 720 CSS/pixels at 1x. Earlier effect capture: 884 x 808. Mobile landscape: 568 x 320 at 1x. Portrait: 390 x 844; existing landscape-orientation prompt is preserved.
- Comparisons preserve image aspect ratio. Home comparison includes different fixture data and admission status, so it assesses retained art direction and intended layout changes rather than pixel identity.

## Findings And Fixes

- Fixed: effect nickname was vertically compressed on small screens. Reduced title sizing, expanded the copy area, and prevented the nickname from shrinking. Verified in `global-mobile.png`.
- Fixed: new homepage filter required a fourth grid row. Explicit rows now reserve heading, filter, independently scrollable table list and footer.
- Fixed: preview board extended below a desktop viewport. Its height now uses available viewport space; `bloom-final.png` shows the complete table.
- Fixed: small landscape records filters used too much vertical space. Compact dropdown/date sizing is verified in `records-mobile-final.png`. Lists remain scrollable; bottom navigation remains visible.

## Fidelity Surfaces

- Typography: original Chinese brush face retained for titles. Special names remain readable; long seven-pair names and three winners were exercised. Table totals use aligned numeric figures.
- Layout: art centered inside the table, self hand and avatar labels remain distinct. Home title has no background panel. Records retain four equal player columns, date navigation and clear detail entry.
- Colors: cyan moon/waves, emerald fishing motif, coral/gold blossom, lavender/gold rare wins. Neutral result surfaces contrast with the existing green shell. Win/loss semantics are unchanged.
- Assets: four generated images decoded successfully with genuine alpha; no black/white rectangles or stretched art. Source-to-render comparison retains the generated motif and adds readable game text intentionally.
- Content: actual scored hand labels drive effects. No scoring or audio change. Member/admin permission conditions are retained.

## Interactions And Checks

- Special preview: pattern changes, winner seat changes, replay and three-winner display; ordinary self-draw remains available.
- Home: member lacks creation entry; administrator has creation entry. Local three-step creation produced three actual local tables. Vacancy filter and empty state verified.
- Records: admin scope and member scope, room search, clearing search, final-table details and 本把明细 inspected; actual score items and transfers visible.
- Browser console: no errors in the inspected final effect and application sessions.
- TypeScript/production build and asset integrity passed. Focused scoring-label, score-copy and table-state tests: 36 passed.

No actionable P0/P1/P2 visual findings remain in the inspected states. Physical APK/IPA behavior is not verified for this local-only visual revision. Production deployment and packaging are outside this request.

## Interaction update — 0.7.14 / build 51

- Opening is restricted to the first hand of each new table. Selected tiles are discarded by upward drag and release; repeat tapping only deselects. Existing click audio is preserved.
- Chrome and WebKit: 12 production Cocos/App integration tests passed at 568, 844 and 1280px landscape widths. Tests cover too-short/downward/unselected/off-turn drags, visual tile movement, countdown pushes during a held gesture, and exactly one discard command per release.
- Cumulative personal overtime persists across hands and trustee cancellation and restores only on a new table. Unit regressions include the user example 90→87→50, independent players and server restore.
- Signed APK and Ad Hoc IPA build51 completed and all 228 packaged web resources match the frozen native build. Ad Hoc is limited to four registered devices; physical-device installation was not tested. Earlier packaging/push statements above describe their historical stages.
