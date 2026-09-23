# 0.7.37 / Build 75 — local delivery, deployment pending

Update: the main service, web and administration frontend were subsequently deployed on 2026-09-24 with explicit user authorization. See [deployment record](deployment-0.7.37-20260924.md). The pending/authentication status below is the original packaging-time record; APK/unsigned IPA delivery hashes remain unchanged. Mandatory update remains disabled.

## Included

- Online table invitations with accept/refuse, authenticated seating and expiry.
- Opening completion capability negotiation for legacy/new mixed clients.
- Invitation eligibility limited to managed tables; participant-indexed refresh outside game-action publication.
- Restored Cocos `TableSceneCommand` import and previous approved HUD readability changes.
- Server-authoritative minimum-version admission policy with a live administrator switch.
- Grandfathered active table/seat protection through all rounds, reconnect and server restart; mandatory update applies at final settlement/dissolution and to new tables.
- Administrator policy persistence, audit, revision conflict handling, explicit enable confirmation, and client recheck after disabling.
- No Hu/scoring/payment rule changes.

## Verification

- 87 test files / 1291 tests passed after the version bump.
- Production browser, control-panel and protected native-web builds passed.
- Four protected native compatibility checks passed (Chromium/WebKit, restore and lazy features).
- Earlier same-source checks: 10 control UI cases and 2 mandatory-update browser cases passed.
- All 272 web assets in APK and IPA match native `dist` byte-for-byte.
- Both packages: `com.jinling.mahjong`, version `0.7.37`, build `75`; no demo server URL, no WebView debugging, no source maps or signing secrets.
- Android release signed with the original RSA-3072 certificate; v2 signature and 16-KB zip alignment checks passed. Certificate SHA-256: `d07fd4c522490b38e1d1d7aa8ea5c86cc3bd14a0e46cd86d86ec183e430b0928`.
- iPhoneOS Release archive succeeded with signing disabled. IPA is unsigned and must be signed externally before installation. It has no embedded profile or `_CodeSignature` directory.
- No physical-phone installation was performed this turn.

## Artifacts

Directory: `output/release-0.7.37-build75/`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `jinling-mahjong-0.7.37-build75.apk` | 127168293 | `6d9a9b69c76132d6ead738bed105bbce767bc452929ea0e51f1498ecab6c38e7` |
| `unsign-0.7.37-build75.ipa` | 127210543 | `d5396d472ec86b6d25cf3be448726d2c2327ec43441849bff124f996e292800a` |

`verification.json` contains per-resource hashes. Frozen `web.tar.gz`, `control.tar.gz` and `native-web.tar.gz` are also prepared.

## Deployment status — NOT deployed

- Intended production endpoint remains `https://212.189.31.46/mahjong`.
- Strict-TLS public health check during this turn returned version **0.7.35**.
- Local SSH alias `212-majiong` resolves to **212.189.31.194**, not this production server. It was checked read-only; no deployment or modification was performed there.
- Direct SSH to `root@212.189.31.46` failed authentication. A historical SSH control socket was no longer present. Valid production SSH credentials are required to proceed.
- No production containers, database rows, policy switches, public web/control symlinks or download entries were changed. No Git remote push was performed.
- Before activation: verify current production state/source, back up the database/configuration, preserve the current forced-update setting, deploy service plus web/control assets, and run public/protected health and policy checks. Do not overwrite production data with a local database.
- Do not replace the published iOS package until the user returns a signed IPA and confirms publication. New invitation/policy features require the corresponding server deployment; delivering these local packages is not evidence of production activation.
