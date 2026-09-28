# 0.8.9 / Build87 本地交付

2026-09-29（北京时间）。在 Build86 后纳入用户新修改，包含白玉牌面、低饱和墨色、高清面纹理及独立牌面 shader。版本名保持 0.8.9，Android/iOS 构建号递增为 87。未部署、上传或 push。

产物位于 `output/release-0.8.9-build87/`，复制到桌面 `金陵麻将 0.8.9 Build87 安装包`，保留旧包。

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| jinling-mahjong-0.8.9-build87.apk | 143550787 | d36af2c4eacb83447f5f72df82822953d3f6b2f8b9fb3a63b93739ceb61cd3a3 |
| unsign-0.8.9-build87.ipa | 143443115 | e1120dcebeb553ff04a2a23ec439bade7b5df241f47b10ef4034f8fa4c1c4284 |

Android 沿用正式签名，IPA 未签名，iPhoneOS arm64，最低 iOS15.0，需外部签名。

## 本次执行验证

- `npm test`：125 文件、1639 测试通过。
- `playwright test -c playwright.native-compat.config.ts`：Chrome/WebKit 共 4 项通过，使用最终 native dist。
- native-sync、TypeScript、Android Release、iOS Release archive 成功。
- APK 签名证书符合原正式证书，zipalign 通过；APK/IPA ZIP 完整性通过。
- 打包验证器确认 373 项网页资源与最终 dist 一致、正式原生配置、无本地机器人演示配置。
- 42 张 art-source/ink 与 resources/face-source 字节一致。
- Cocos source `27c5facd2fff78a78c8e0e85581491ccf34309b2018dadd7b3f17a394e5b1ef6`。
- Cocos runtime `e6f0a6068b574e87482c913c15fcaf660433108659c221e82a35f3207437abe8`，198 文件。

详细日志及逐资源校验见产物目录。未进行最低系统真机安装或帧率验收。
