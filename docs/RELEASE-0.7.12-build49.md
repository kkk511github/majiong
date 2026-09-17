# 0.7.12 / build 49

- End-of-hand tile views no longer show the crowded inline scoring chips. Each saved hand now has a 本把明细 action before 查看牌面, with tabs for switching between the two views. Scoring tables separate each item, its calculation, and its points; actual transfers and opening/closing balances are also shown.
- Special wins use their scored hand names, including 杠上开花 and 全球独钓. The original gold brush font, arrival animation and player-relative placement are retained. The same licensed Ma Shan Zheng font was subset again to cover all 40 required characters.
- In the B profile, flower kongs collect 10 points from each opponent, or 20 in a doubled round. Heavenly wins charge each opponent a fixed 400 points, capped by their available balance, without stacking other scoring items or the round multiplier. Opponents with 150/50/100 pay 150/50/100; the winner collects 300 and the table ends.
- Includes the preceding concealed-kong correction: 5 points from each opponent, doubled to 10; direct/added kongs charge their supplier 10, doubled to 20. Immediate kong fees remain separate from the soft flowers awarded when winning. Concealed kongs show three backs and one face; the opposite river runs right to left.
- Native clients connect to https://212.189.31.46/mahjong using the established certificate pins. APK uses the existing release key. IPA is Ad Hoc for four registered devices, not enterprise signing. No injection libraries or background audio were added.

Validation: 527 unit tests; 21 focused Chromium UI scenarios, three special-win WebKit scenarios, four native-bundle compatibility scenarios, plus replay and external-score regression checks. APK signature/alignment, IPA codesign/profile, versions and all 220 shared native web files verified. Physical-device installation was not tested.

Source archive SHA256: `fe4b4c8d2e05304f28f12d997b13f038714719fe390ae9bf27a29eb41fc9bb6d`.

Deployment completed on `212.189.31.46`. The release image passed all 527 tests on Linux, and startup against a database snapshot preserved stored records and accounts. Production HTTPS, authentication guards, native CORS and WebSocket authentication were checked after activation. Backup and deployment audit: `/opt/jinling-mahjong/database-backups/0.7.12-build49`. The Telegram worker also uses the 0.7.12-build49 image; its report schedules and delivery state were backed up and verified unchanged.

The old server `212.189.31.194` was backed up to `/opt/jinling-mahjong/database-backups/retired-20260918-build49`. Its mahjong and Telegram-report containers are stopped with restart policies disabled. Data and host administration remain available; no old data was migrated to the new machine.

Deployment audit: all 521 committed source files in the archive match the deployed source byte for byte; all 520 files included by Docker also match both running application containers. One generated Python bytecode cache is excluded from the commit manifest. The IP certificate, renewal timer, persistent database mount, restart policies and Telegram heartbeat were checked. The public API is exposed through HTTPS; the internal game port is not published.

Packages are in the parent outputs directory. See `release-0.7.12-build49-verification.json` for package hashes. The deployed source revision and file manifest are recorded separately under `/opt/jinling-mahjong/database-backups/0.7.12-build49` so they can identify the final Git commit without embedding a self-referential hash here.
