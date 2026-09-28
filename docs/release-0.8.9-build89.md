# 0.8.9 / Build89 本地交付

2026-09-29（北京时间），从完整工作区构建，含 Build88 后的弃牌直接源图 mipmap、局部锐化及最高 3×/4MP 渲染预算改动，保留最新牌面材质和碰杠方向修复。版本名保持 0.8.9，Android/iOS 构建号递增为 89。未部署、上传、push 或调整强更策略。

产物位于 `output/release-0.8.9-build89/`，复制到桌面 `金陵麻将 0.8.9 Build89 安装包`，旧包未覆盖。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| jinling-mahjong-0.8.9-build89.apk | 143551888 | b1d181ebb8295294904c68ec6386212618a7ba80a76c535af86c81925fd4806e |
| unsign-0.8.9-build89.ipa | 143443093 | 658b2c94d8a8df3e7e975d079b01de5ff5f76604ead15d0828149f7dcd46fdd6 |

Android 正式签名；IPA 未签名，iPhoneOS arm64、最低 iOS15.0，需外部签名后安装。

## 本次验证

- `npm test`：127 文件、1787 项通过。
- `playwright test -c playwright.native-compat.config.ts`：Chrome/WebKit 共 4 项一次通过。
- `playwright test -c tests/production-table-3d.config.ts`：9 项通过，涵盖全视角碰/杠方向、高清纹理、120 张弃牌和原生 3× 画布、触摸/缩放、旧 canvas 兼容、提示/叠牌、两把机器人结算、完整布局与摸牌插入。
- native-sync/TypeScript、Android Release、iOS archive 完成。
- APK 签名证书与原正式证书一致，zipalign 通过；两个 ZIP 完整性通过。
- 包内 373 项网页资源与最终 dist 一致，正式原生配置，无本地演示配置。
- 42 张源牌面与导入资源一致，共享布局与 Cocos 副本一致。
- Cocos source `670a810c38b7b5e8c7b09bf8cc8b63b5a3d4878c7b8b36547f8d5e18a81e2495`，打包结束后再次确认未变化。
- Cocos runtime `d96bebda5c7768f05d2f660b56384d3632a39e96f42964a7e56169fe2668862e`，198 文件。
- 桌面副本 SHA-256 与构建产物一致。

构建日志和逐文件校验见产物目录。未作最低系统真机安装、旧机 GPU 性能或耗电验收，不将浏览器通过等同于真机验证。
