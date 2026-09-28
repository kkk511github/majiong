# 0.8.9 / Build86 本地交付

北京时间 2026-09-29，以当前工作区完整源码和用户本地牌面修改打包。未部署、上传或推送代码。

## 产物

位于 `output/release-0.8.9-build86/`，另复制到桌面 `金陵麻将 0.8.9 安装包`：

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| jinling-mahjong-0.8.9-build86.apk | 143573803 | d3f2e6d1627dbf96a7e93e7333f9e1a1c1a2aca3998b072462f9eb094200f47b |
| unsign-0.8.9-build86.ipa | 143464628 | ac5a9ebb073a87abf0b6355232a2ce1f12744d7483fff7fae02118e0961a1567 |

Android 原正式签名、API24 起；IPA 未签名，iPhoneOS arm64，最低 iOS15.0，需要外部签名。

## 内容与核对

- 本地 42 张新牌面、牌面图集、材质与布局变更纳入构建。
- 当前源码中的无花果资格、听牌及胡牌优先处理修复一并包含。
- 42 张 art-source/ink 与 resources/face-source 字节一致。
- Cocos source：`159390a05dbd5796204935757e9457d220a1d6dd5760884d8ab224936e51875d`。
- Cocos runtime：`ea1478e1b11d401520ca3268483205d40d9c5c969f59a305cf5acbd8aabf1ef7`，197 文件。
- `npm test`：124 文件、1635 测试通过。
- `playwright test -c playwright.native-compat.config.ts`：Chrome/WebKit 共 4 项通过。首次因命令 PATH 缺少 node_modules/.bin 未启动，补足 PATH 后完整通过。
- 包装校验：372 项网页资源与 dist 一致，正式原生配置，无本地演示配置；APK 签名、对齐与两个 ZIP 完整性校验通过。
- 日志、完整资源哈希见产物目录 verification.json 及各构建日志。

未验证最低系统真机安装、性能或实际联机对局，不将浏览器兼容测试等同于真机验收。
