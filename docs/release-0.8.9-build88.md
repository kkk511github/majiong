# 0.8.9 / Build88 本地交付

2026-09-29（北京时间），按完整本地工作区构建。包含本地最新牌面/白玉材质、弃牌 POT mipmap 清晰度优化及对家碰/直杠/补杠方向修复。保留业务规则修复。版本名不变，仅原生构建号从 87 增至 88。未部署、上传、push 或修改强更策略。

产物位于 `output/release-0.8.9-build88/`，复制到桌面 `金陵麻将 0.8.9 Build88 安装包`，旧包保留。

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| jinling-mahjong-0.8.9-build88.apk | 143551023 | f21e31c392c8831d8ed674daf17ae97fca19b0c5682e2c94b8bb6955b35b5e81 |
| unsign-0.8.9-build88.ipa | 143443020 | 8e53068b6e8b0aac647b32d8c72cb3cc086be32b284639f990a8ffd294337aeb |

Android 为原正式签名，IPA 未签名，iPhoneOS arm64，最低 iOS15.0，需要外部签名后安装。

## 本次执行验证

- `npm test`：126 文件、1783 项通过。
- `playwright test -c tests/production-table-3d.config.ts`：8 项通过，包括四视角碰/杠真实模型方向、HD 面纹理及弃牌 9 级 mipmap、旧 canvas 兼容、架牌/听牌、两把机器人结算、满副露和摸牌插入。
- `playwright test -c playwright.native-compat.config.ts`：首轮 Chrome 战绩已读标记断言 `.record-read` 在 5 秒内未出现，其他 3 项通过。保存首次错误至 `native-compat-first-run-error.md`。未修改代码，完整复跑 4 项通过；不将复跑通过解释为已证明超时根因。
- native-sync/TypeScript、Android Release、iOS Release archive 成功。
- APK 签名证书与原正式证书一致，zipalign 和 APK/IPA ZIP 完整性检查通过。
- 包内 373 项网页资源与最终 dist 一致，正式原生配置，无本地演示配置。
- 42 张 art-source/ink 与 resources/face-source 一致；共享布局与 Cocos 副本一致。
- Cocos source `7414a70ab5e51c926df63e449f577f6054ffe07e8a8c918397c2f7b942eb90eb`，打包后再次验证未变化。
- Cocos runtime `86699a4887dd4efc7311528bce4d60521adb5682f8da394f118f88f5455d055e`，198 文件。

逐资源哈希及构建日志见产物目录。未进行最低系统真机安装或帧率验收。
