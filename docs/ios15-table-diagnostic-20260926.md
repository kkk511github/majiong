# iOS 15 疑似牌桌加载失败：2026-09-26诊断

## 测试限制

本机macOS 26.3.1、Xcode 26.6，仅安装iOS 26.5模拟器运行时。尝试 `xcodebuild -downloadPlatform iOS -buildVersion 15.5` 返回 `iOS 15.5 is not available for download`。**未完成iPhone 8 / iOS 15实际模拟器或真机测试**，不能将下述WebKit特征降级实验称为iOS 15实测。

## 隔离对照

读取0.8.0 Build77原始IPA解包目录，对197个Cocos文件逐一核验SHA-256，与交付验证清单一致。未修改旧包；仅在测试浏览器启动时移除 `CanvasRenderingContext2D.prototype.roundRect`。视口667×375、2倍像素、移动触摸模式，浏览器实际为当前Playwright WebKit，不伪造iOS15系统。

| 牌桌资源 | roundRect能力 | 结果 |
| --- | --- | --- |
| 0.8.0 IPA原始资源 | 原生存在 | ready=true，39个牌模型 |
| 同一份0.8.0资源 | 移除 | `Table assets TypeError … is not a function`，ready=false，0个牌模型 |
| 本地已含canvas兼容修复的资源 | 移除 | ready=true，39个牌模型 |

旧发布脚本经过混淆，错误中的方法名被编码。实验唯一变更是删除roundRect，因此能定位此API缺失会导致初始化失败。三个案例均有无害的 `minimal-ui` 视口警告，只有第二个出现牌桌初始化TypeError。

本次只诊断，不改线上服务器、账号、已发IPA及游戏业务代码；所有网络请求限定到本机测试服务器，无生产登录或开桌。兼容修复已存在于本地，尚需新iOS包及真实iOS15验收，不能据此宣称所有旧系统问题都已解决。

证据（本地忽略目录）：`output/ios15-table-probe/results.json`、`old-normal.png`、`old-no-roundRect.png`、`current-no-roundRect.png`。复现脚本 `.tmp/ios15-table-probe.mjs`。
