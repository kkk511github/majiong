# 0.8.4 / Build 81 安装包

2026-09-26 本地打包。两平台应用标识均为 `com.jinling.mahjong`。产物位于 `output/release-0.8.4-build81/`，交付至 `/Users/kk/Desktop/金陵麻将 0.8.4 安装包/`，旧安装包保留。

## 2026-09-27：IPA 干净封装替换（当前交付）

首次 IPA 使用 ditto 封装时夹带 578 个 AppleDouble 元数据条目，之前的资源校验未检查这类多余文件。现从同一 iPhoneOS 归档无扩展属性复制并重新 ZIP 封装，版本仍为 0.8.4 / Build 81，不重新编译、不改变功能。

- 新 IPA：`output/release-0.8.4-build81/unsign-0.8.4-build81-clean.ipa`，144645936 字节，SHA-256 `d1a1e45dff0819609c37e323cff6f60482d97ce8e082e8b7f74e23a9e4f7ba90`。
- 桌面同名 `unsign-0.8.4-build81.ipa` 已替换为此干净包；原包移至该目录的 `旧包备份（勿上传）/`，可恢复。
- 578 个 Mac 元数据条目全部移除，389 个实际应用文件与原 IPA 逐字节一致；主程序和两份 framework 的可执行权限保留。
- ZIP 完整性及两平台 366 个网页资源对照通过；版本、正式应用标识及未签名状态不变。验证清单 `verification-clean.json`。
- `verify-mobile-assets.mjs` 新增 AppleDouble、__MACOSX、.DS_Store 及重复条目拒绝检查，已验证旧包被拒绝、新包通过。
- APK 未修改；本次没有部署服务、发布更新或重发账单。

以下记录及哈希表为 **9 月 26 日首次打包**；IPA 以后续干净包为准。

## 包含的客户端更新

- 三家独立摸牌背及满明杠边界留位；四家同牌即时扣分提示的布局、付款人及可读时长。
- 3D 牌模型复用、静态变换缓存、减少相同状态跨 iframe 发送。
- 拖牌回位、快速/慢速二次点击、迟到选牌确认处理；服务端确认、防重复及拒绝/断线回位保留。
- 重连时重置上一连接的 RTT 测量，正常网络事件不再误标为 Error。
- 本地规则计算与文案包含大小杠开花本身不免硬花的修正。
- 保留旧系统 Canvas 等兼容路径、双平台日志上传与后台采集支持。

## 验证

- 打包前全量 102 文件、1471 项测试通过。原生构建的 TypeScript 检查通过。
- Android Release 构建成功，版本 0.8.4、versionCode 81、最低 API 24；APK v2 签名与旧版证书一致，16KB zip 对齐校验通过。
- iPhoneOS Release archive 成功，版本 0.8.4、build 81、最低 iOS 15.0。IPA 未签名，需要外部签名后安装或分发。
- APK/IPA 各 366 个网页资源与同一份 native dist 逐字节一致；生产 appId、无模拟器 server URL、WebView 调试关闭，没有源映射或签名私钥。
- 4 项已编译资源的 Chromium/WebKit 回归通过，涵盖移除 roundRect、Array.at、randomUUID、structuredClone 后加载、战绩详情、回放及后台懒加载资源。不是 iOS 15 或旧安卓真机测试。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| jinling-mahjong-0.8.4-build81.apk | 144752200 | 9d838c134e61164e9fc2f119f08ad1befc24ad3c10473e5d765c466c19dca1df |
| unsign-0.8.4-build81.ipa | 144937083 | 04a85b1c17e7b9e5730460ec7a3df3adc74f0871010cbcf8ae58c7ab557c63ed |

## 尚未执行

没有部署服务器或报表工作进程，没有上传安装包、发布更新、改变强更策略或重发账单。175382 的花数门槛需要部署服务端才会在线上实际判胡中生效；整桌查询性能及周结最新快照修复也须部署对应服务，不能靠安装本包生效。
