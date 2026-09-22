# v0.7.35 · Build 73

这是原始打包发布记录。之后服务端已部署允许明杠、暗杠建立全球架牌的修正，见[2026-09-22 部署记录](deployment-0.7.35-anchor-20260922.md)；下方原发布时“暗杠不会建立架牌”的描述已被覆盖，客户端安装包未因此重新打包。

## 本次规则

- 三嘴外包：前三嘴责任成立后，第四嘴碰或杠立即结束并结算原责任人，不收本次杠费、不补牌。
- 三清外包：前三组同一数牌花色即可，不要求同一家供牌，暗杠也算。第四组同花色明碰或明杠立即结束，由本次供牌者承担外包。正常清一色点炮由最终点炮者承担。
- 三嘴与三清同时成立时三嘴优先；同一胡者不叠收多项外包。普通外包50，比下胡100，桌外记账。
- 前三嘴不同家、又不符合三清即时外包时，第四嘴暗杠正常收费补牌，继续等待胡牌。暗杠不会建立全球独钓架牌。
- 包含已有离线托管、重连处理和对局头像左置改动。历史战绩未手工改分。

## 验证

- 78 个测试文件、1080 项测试通过；TypeScript 与原生资源构建通过。
- Chrome/WebKit 四种屏幕尺寸共8项头像布局检查通过，包含双向安全区、截图及像素非空检查。
- APK / IPA 的257个网页资源均与本次构建逐文件一致。
- Android: 包名 com.jinling.mahjong，versionName 0.7.35，versionCode 73，正式签名验证通过。
- iOS: 包名 com.jinling.mahjong，CFBundleShortVersionString 0.7.35，CFBundleVersion 73；主程序未签名，交付后需签名才能安装。
- 服务端镜像 jinling-mahjong:0.7.35-build73，容器健康，公开健康接口返回0.7.35。引擎、计分和牌桌源码哈希与本地一致。
- 数据库和旧APK备份：服务器 /opt/jinling-mahjong/backups/0.7.35-build73；SQLite integrity_check 为 ok。
- APK 已发布至原固定下载入口。现有线上 iOS 0.7.32 / Build69 保持不变。
- 本轮没有进行真实手机安装验收。

## 交付

- APK: 金陵麻将-0.7.35-build73.apk
- APK SHA256: 395c9713d992c21cf130ccc43e511435b2123de575c1291236976b0ac9aa9d9c
- IPA: unsign-0.7.35-build73.ipa
- IPA SHA256: 807a2f4f42a8c4c82df89366f8658bf70a7073f35c263dd3bee3cb65109dc340
- Android: https://212.189.31.46/app/jinling-mahjong?platform=android

本记录中的三嘴、三清即时结算和暗杠口径覆盖此前历史规则文档中的相反描述。
