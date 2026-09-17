# 0.7.11 / build 48

- Native clients now connect to `https://212.189.31.46/mahjong`. Android and iOS pin the new server's P-256 public key and retain the existing backup pin.
- Includes the redesigned homepage, compact live table rows, and existing member/admin permission distinctions. The title has no background panel or side border. Gameplay and audio are unchanged.
- APK uses the existing Android release signing key. IPA uses Ad Hoc signing for four registered devices; this is not an enterprise-signed package.
- Both packages contain the same 219 native web assets. Versions, signatures, Android alignment, transport settings and public-key pins were checked. No source maps, signing keys or databases are bundled. The IPA contains no `cat.dylib`, `CoreMediaServices.framework`, `silence.wav` or background-audio mode.
- Passed 54 security/deployment unit tests, four native-bundle compatibility scenarios in Chrome/WebKit and three final homepage role/layout checks. The earlier homepage regression run covered 32 scenarios. Physical-device installation was not tested.
- New-server HTTPS, native-origin CORS and WSS handshake verified. Its renewal script was backed up as `/opt/jinling-mahjong/server/renew-ip-certificate.sh.before-build48` and updated to use `--reuse-key`; timer remains active. No certificate was reissued. No game deployment, database migration or Telegram configuration change was performed.

Files are in the parent `outputs` directory:

- `金陵麻将-0.7.11-build48.apk`
- `金陵麻将-0.7.11-build48-AdHoc.ipa`

See [package verification](release-0.7.11-build48-verification.json) for hashes and sizes. These packages were built from the current working tree; this task did not commit or push it. `.env.native` is local build configuration and must retain the new endpoint when rebuilding.
