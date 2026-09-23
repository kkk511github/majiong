# 0.7.36 / Build 74

## Scope and source

- Saved the approved table presentation as `5abf93f` on local `main`.
- Merged local/remote `dev` (`26b487b`, synchronized opening animation) into
  `main` with merge commit `7ff7a0b`; preserved main's four-discard penalty fix.
- Added opening recovery fixes in `4d906da`: accept the cue after connection
  recovery, do not falsely complete it during WebGL recreation, and retry a
  pending server completion after reconnect/resume.
- Final table toolbar contains only trustee/result. Lobby, settings, table
  information and record toolbar buttons are absent.
- Removed the yellow supplier arrow from exposed melds. Physical turned-tile
  direction, tile values/order and the latest-discard pointer remain intact.
- Opposite hand now fits fully inside the canvas (`y=23`, height 46). Its
  hand/meld rail and avatar retain the approved rightward layout.
- Added iOS simulator-only full-pung, full-open-kong and 27-discards-per-seat
  layout demonstrations. They are development fixtures, not production deals.
- No scoring/payment rules were changed by this table presentation work.

This is a local artifact delivery. No Git remote was pushed, no production
service was deployed, and no public download/OTA entry was replaced. The new
server-side opening gate is verified locally and is included in merged main;
deploying it to the production service is a separate operation.

## Verification

- Final unit run: **83 files / 1254 tests passed**, no expected-failure cases.
- TypeScript and `git diff --check`: passed.
- Opening-entry browser coverage: 9 passed (slow assets, normal/reduced motion,
  skip/next round, reconnect cue acceptance, WebGL recreation, restore/retry).
- Resource-failure/timeout reload browser coverage: 2 passed.
- Meld direction / kong structures / full racks after arrow removal: 7 passed.
- Supplier pose matrix: 4 owners × 4 observers × 3 sources, all 48 combinations.
- Broad Chromium feature pass: 60 of 61 passed in one run; the remaining voice
  fixture used a retired preview route. It was migrated to current managed
  snapshots and passed separately while retaining actual audio-signal checks.
- Final protected native-web compatibility: **4 passed** across Chromium and
  WebKit, including restored games without `randomUUID`/`structuredClone`,
  records, replay and lazy admin resources.
- iPhone 17 Pro / iOS 26.5 simulator debug build succeeded; full-pung,
  full-open-kong and busy-river scenes were displayed and inspected.
- Final release artifacts were **not installed on physical phones**.

## Package verification

Both artifacts use application ID `com.jinling.mahjong`, version `0.7.36`,
build `74`. All **272 web assets** in each artifact match the frozen native
`dist` output byte-for-byte. Production Capacitor configuration has no
simulator live-server URL, no demo app ID and no enabled WebView debugging.
No source maps or signing-key files are included in the archives.

Android:

- Release APK, original RSA-3072 certificate, v2 signature verification passed.
- Certificate SHA-256:
  `d07fd4c522490b38e1d1d7aa8ea5c86cc3bd14a0e46cd86d86ec183e430b0928`.
- `zipalign -c -P 16 4`: passed. minSdk 24, targetSdk 36.

iOS:

- Release iPhoneOS arm64 archive, minimum iOS 15.0.
- **Unsigned IPA**, following the previous Build73 delivery convention.
- No `_CodeSignature`, embedded provisioning profile or main executable
  `LC_CODE_SIGNATURE`. External signing is required before device installation.

## Artifacts

Artifacts and machine-readable verification are under
`output/release-0.7.36-build74/` (generated outputs, not committed binaries).

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `jinling-mahjong-0.7.36-build74.apk` | 127153149 | `3dfd60535b5c1ad47a35b39b45a26a28848166379b100d55331e6b8d0daafb92` |
| `unsign-0.7.36-build74.ipa` | 127194003 | `ae6c3aecb7ad5065a35184d1f18eaadb2a3d1eec61b3bf287015f1e5db96ae3e` |

`verification.json` records the per-file hashes. Verification can be repeated
against the frozen native output using `scripts/verify-mobile-assets.mjs`.
