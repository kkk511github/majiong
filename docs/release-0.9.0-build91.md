# 0.9.0 / Build91 本地交付

2026-09-29。按用户要求将 package/package-lock、Android 和 iOS 版本统一为 0.9.0，原生构建号从90升为91。保留并纳入当前本地修改（牌面、回放首帧与动画、战绩输入等），未部署、上传、push或修改强更策略。

产物：`output/release-0.9.0-build91/`；桌面副本：`金陵麻将 0.9.0 Build91 安装包`。旧安装包保留。

- APK：`jinling-mahjong-0.9.0-build91.apk`，沿用正式签名，SHA-256 `f22f1932837a28acaa61d1349c14320369435f3466eaf63cff04ea341ec37bed`。
- IPA：`unsign-0.9.0-build91.ipa`，未签名 iPhoneOS 包，需要外部签名后安装，SHA-256 `cb610e9a53bcc4904c900550cc853666c1dbaa04b48681520a35ef178895b751`。

验证：128个单元测试文件、1790项通过；Chrome/WebKit原生构建兼容检查4/4通过；TypeScript、Android Release和iOS archive成功；包内网页资源与最终dist逐项匹配、生产原生配置检查通过；APK正式证书、zipalign、两包ZIP完整性、桌面副本一致性通过。详细日志与资源哈希见产物目录和 verification.json。

本次未进行真机安装或最低系统真机验收；浏览器兼容检查不等同真机验证。
