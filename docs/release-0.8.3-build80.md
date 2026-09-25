# 0.8.3 / Build 80 安装包

2026-09-26本地打包交付，两平台版本0.8.3、构建号80、应用标识com.jinling.mahjong。未上传安装包服务、未发布更新、未提高强更最低版本；生产服务端保持已部署的0.8.2，支持本包诊断协议。

## 包含

- 旧系统缺少Canvas roundRect时的牌桌绘图兼容路径，避免初始化失败。此次已实际打入IPA，不再只存在于本地源代码。
- iOS/安卓原生诊断能力，用户“我的→帮助与反馈→上传日志”；后台采集、自动异常及用户主动上传三种来源。
- 最近24小时的脱敏日志、账号切换清理、后台7天保留及隐私说明更新。
- 旧安卓低高度/大字体等待页布局适配，及已批准的现有牌桌功能。

## 校验

- 全量99文件1378项测试通过，4项Chromium/WebKit已编译资源回归通过；包含禁用roundRect、Array.at、randomUUID、structuredClone的兼容场景。
- Android正式Release构建通过，APK v2签名校验及16KB对齐通过。签名证书SHA-256与旧版一致：`d07fd4c522490b38e1d1d7aa8ea5c86cc3bd14a0e46cd86d86ec183e430b0928`。
- iPhoneOS Release archive成功，IPA明确未签名，需要用户自行签名后安装/发布。原生可执行文件包含AppDiagnosticsPlugin。
- 两包366项网页资源与同一份native dist逐字节一致；生产appId，无本地演示server配置，WebView调试关闭，没有密钥、源映射及开发凭据。
- iOS最低系统声明为15.0，Android最低API24；**未声称兼容iOS15以下，也未完成iOS15真机实测**。低版本系统框架适配须另行明确目标。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| jinling-mahjong-0.8.3-build80.apk | 144744748 | d5298aad110fa028c09813b528c9bdd0c01fb98e034a18768c4226b29f625a4c |
| unsign-0.8.3-build80.ipa | 144731454 | 0179e9b352b6253937846a08d53929191989b87a4d8135f1aae7b37f16db2925 |

交付：`/Users/kk/Desktop/金陵麻将 0.8.3 安装包/`。产物与验证清单：`output/release-0.8.3-build80/`。
