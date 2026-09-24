# 0.7.38 / Build 76 — installation packages

## Included

- Approved blue 3D table in the production Cocos view for live/practice games and replays.
- Updated avatar anchors using real public player data, left-top trustee control, no decorative back arrow, and no redundant rules/grade line.
- Narrower rectangular discard models; fixed discard/flower bands and player gutters.
- Full face-up replay/settlement hands, middle-anchored kong overlays and preserved owner-relative pung indicators.
- Existing selection, drag, opening, replay, trustee and server command protocols retained. No Hu/scoring or server logic changes.

## Verification

- Version 0.7.38 / build 76 / bundle ID `com.jinling.mahjong` on both platforms.
- Full unit run: 91 files, 1333 tests passed.
- The approved production table previously passed 16 interaction/replay checks. After the final narrower-discard/rules-line change, 11 live-client/replay cases passed again.
- Android Release build succeeded; original RSA-3072 signer, APK v2 verification, and 16-KB zip alignment passed.
- Certificate SHA-256: `d07fd4c522490b38e1d1d7aa8ea5c86cc3bd14a0e46cd86d86ec183e430b0928`.
- iPhoneOS Release archive succeeded with signing disabled. IPA is **unsigned** and requires external signing before installation; no embedded provisioning profile or signature folders.
- All **405** bundled web assets match the same protected native `dist` byte-for-byte in APK and IPA.
- No source maps, private signing material, demo application ID, dev-server URL or enabled WebView debugging in either package.
- Native endpoint remains `https://212.189.31.46/mahjong`. No backend deployment or public download publication was performed.

## Artifacts

Directory: `output/release-0.7.38-build76/`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `jinling-mahjong-0.7.38-build76.apk` | 144573545 | `e8521cf83f21dddfb814adf70c2a11f70738fa255029742c933ab2f19333fcfa` |
| `unsign-0.7.38-build76.ipa` | 144579240 | `c6b7ebcb7d7c1df4332ca5718bfda453714370a1bb99dcb5a5d9c47fb4863c73` |

`verification.json` contains per-resource hashes. The simulator UI was verified against real-server replay data during implementation; the release packages themselves have not been installed on physical phones in this packaging turn.
