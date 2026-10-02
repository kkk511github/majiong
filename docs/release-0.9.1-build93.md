# 0.9.1 / Build93

2026-09-30，按用户要求将上次交付的0.9.0 Build92改为0.9.1 Build93并重新构建。package/package-lock、Android和iOS版本统一；保留本地全部已有改动与软花修复，未修改计分逻辑。

产物目录：`output/release-0.9.1-build93/`。桌面副本：`金陵麻将 0.9.1 Build93 安装包`，旧包保留。

- APK：`jinling-mahjong-0.9.1-build93.apk`，正式签名，SHA256 `8ea77a271562eeeb1fc0fa6cce734b0600981d7b151091e126b36840b0e26214`。
- IPA：`unsign-0.9.1-build93.ipa`，未签名iPhoneOS包，需外部签名才能安装，SHA256 `d791d98dcc121ed91ccefb5d03616248fbb3772a686c70a0f3e4da981ed332fe`。

TypeScript、Android Release、iOS archive通过；APK正式证书、zipalign、双端版本、373份包内网页资源与dist逐项比对、生产配置与敏感文件检查通过。两包ZIP完整性及桌面副本哈希一致性通过。Chrome/WebKit兼容测试4/4通过，包含实际构建的修正版软花规则说明。

本次仅重新打包，未再次部署服务器/网页、未上传更新后台、未改强更策略、未push。上轮部署的软花修复继续生效。未进行真机或最低系统真机验收。
