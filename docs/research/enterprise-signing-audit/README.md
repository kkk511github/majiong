# adaSignbot 返回 IPA 的静态检查（0.7.9 / build 46）

检查日期：2026-09-17。对象为用户本机已下载的 `signed_金陵麻将-0.7.9-build46-AdHoc.ipa`，SHA-256：`333b8fff71ac0180c0ffe83e0779b042807848c69a79fa645453f3507121a668`。

## 结论

不能认定此包安全，也没有足够证据断言它是木马或已经窃取数据。它不是仅替换证书的重签包：加入了可执行原生组件并修改后台运行配置。应取得签名方对新增组件的说明或无注入签名包，再决定是否分发和启用自动发布。

本次未安装、执行这些库，未向其网络端点发送请求，未向第三方样本服务上传 IPA。未将返回包发布到服务器。

## 已确认事实

1. 原始 IPA 不包含 `cat.dylib`、`CoreMediaServices.framework`、`silence.wav`，返包新增这三个组件。主程序加载命令中出现了两个新增库，因此不是无效附带文件。
2. `Info.plist` 唯一差异为增加 `UIBackgroundModes = [audio]`。`silence.wav` 是 8000 Hz、单声道、16 位 PCM、1 秒、全部样本为零的静音文件。
3. `cat.dylib` 为约 202 KiB 的 arm64 动态库。导入符号包含 NSURLSession、NSMutableURLRequest、NSJSONSerialization、UIDevice、NSLocale、NSTimeZone、class_replaceMethod、dlsym 等。Objective-C load 方法及相关启动函数存在，代码和字符串明显混淆。网络目标及实际传输内容尚未确认。
4. `CoreMediaServices.framework` 为约 7.1 MiB 的第三方 arm64 框架，位于应用包中，并非根据名称即可认定的 Apple 系统框架。导入符号包含 NSURLSession/WebSocket、SecItemCopyMatching/SecItemAdd/SecItemDelete、UIGraphicsGetImageFromCurrentImageContext/UIImageJPEGRepresentation，以及 mach/thread/VM 操作。Objective-C 元数据含 remoteRead:to:size:、remote_write:from:size:、bindTarget:pid:useFilterAssist: 等名称。不能仅凭这些导入与名称断言相关功能已执行或成功。
5. 本机上一版 0.7.8 / build 45 的机器人返包也包含这三个组件和 audio 模式；并非此次游戏特效修改新增。
6. 游戏网页资源与原始包逐字节一致。原始 APK、原始 Ad Hoc IPA 和服务器源代码没有这两个新增原生组件。
7. codesign 严格完整性检查通过，但不证明运行行为安全、证书未被撤销或真机必然可安装。企业描述文件的团队为 Chowbus, Inc.，到期日 2027-03-10。包标识仍为 com.jinling.mahjong，签名 entitlement application-identifier 为 22788Y94CY.com.chowbus.posEnt；与标准同标识签名路径不同，未做真机验证。

## 推断与限制

- 静音文件结合后台 audio 声明，疑似为后台保活；尚未通过运行轨迹确认是否循环播放。若执行，可能增加耗电和后台运行时间。
- 网络、设备信息、钥匙串及进程操作接口说明需要进一步审计，不能证明全都用于恶意目的，也不能推断可读取整部手机的所有密码。iOS 权限、沙盒和签名 entitlement 仍影响可访问范围。
- 没有抓包、真机隔离运行或完整反混淆，因此不能给出“不会联网”“不会采集数据”等保证。没有发现实际录音或外传的证据；audio 声明本身不等于麦克风录音。
- 建议要求无注入的纯签名包；若签名方声称新增组件用于授权校验、防撤销或兼容，需要可核验的说明、数据项和网络目的地，不能仅凭名称接受该解释。

## Apple 参考

- https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes
- https://developer.apple.com/documentation/Xcode/configuring-background-execution-modes

符号列表和逐文件差异见本目录其余文件。自动签名接入方式已由用户选择 Telegram 账号单独登录，但服务器授权和自动发布尚未启用。
