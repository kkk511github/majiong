# 0.9.0 / Build92

2026-09-30。用户要求服务器、网页与本地安装包一并更新。保留版本0.9.0，Android/iOS构建号从91升为92；本地已有UI、回放、牌面等修改一并纳入，并包含B档风牌软花修复与规则说明。

- APK：`jinling-mahjong-0.9.0-build92.apk`，143554236字节，SHA256 `0a1d0e78c4c326528edefc2279a0898d4c1ee8c2c9c4fb59ba1a537c42a98466`。
- IPA：`unsign-0.9.0-build92.ipa`，143446837字节，SHA256 `d520cee0b659f8cd0ed47ce55f3b4a22d02d5baf6d062fb767df327e4bb96a53`。

APK沿用正式签名，证书比对、zipalign与版本检查通过。IPA为未签名iPhoneOS归档，需要外部签名才能安装，不是可直接安装的已签名包。

Android Release、iOS archive成功；两包373份网页资源逐项与最终dist一致，生产原生配置与敏感文件检查通过。详细验证在 `output/release-0.9.0-build92/verification.json`。

Chrome/WebKit原生构建兼容检查4/4通过，包括从实际混淆后的构建进入“玩法”，确认对子不计软花及风牌各类杠合计2朵的文字。两包ZIP完整性检查通过。桌面交付目录：`金陵麻将 0.9.0 Build92 安装包`，副本哈希与产物一致。

本次未进行真机或最低系统真机验收。没有上传安装包到更新后台，没有改变强制更新策略，也未push代码。服务器与网页版部署情况见 `deployment-wind-soft-20260930.md`。
