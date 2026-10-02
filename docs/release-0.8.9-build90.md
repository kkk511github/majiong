# 0.8.9 / Build90 本地交付

2026-09-29。纳入完整本地工作区的回放首帧等待、失败恢复、四家明牌/透明顶栏、摸牌与插牌倍速动画及战绩输入防聚焦缩放修复。原生构建号从89升为90，版本名保持0.8.9。未部署、上传、push或修改版本策略。

产物：`output/release-0.8.9-build90/`；另复制至桌面 `金陵麻将 0.8.9 Build90 安装包`，保留旧包。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| jinling-mahjong-0.8.9-build90.apk | 143555264 | 52a4b6dbe7ec81ab0a1fc8b949c9019245f6037a8d24f6766a95a064204e8f83 |
| unsign-0.8.9-build90.ipa | 143446951 | 479f5d5c1f0491564cebcab42bc92ec23454b2b371cf5e6436e5eb61c0cfd0d8 |

APK沿用正式签名；IPA未签名，iPhoneOS arm64、最低iOS15.0，需外部签名后安装。

## 验证

- `npm test`：128文件、1790项通过；TypeScript和diff检查通过。
- `playwright.replay-input.config.ts`：首轮43/44通过。一项Chrome 4倍速回放在关闭浏览器时因录制trace文件缺失失败；并行原生检查使用了其父输出目录。随后隔离输出、单独复跑该项通过，合计44项均获得通过结果。
- 原生构建检查首轮2/4通过，两项已读标记断言失败。定位模拟接口写入已读后刷新仍返回未读；修复 `tests/native-compat.e2e.ts` 的模拟持久化，未改正式业务。独立输出目录完整复跑Chrome/WebKit 4/4通过。
- native-sync/TypeScript、Android Release、iOS archive完成；373项包内网页资源与最终dist一致；正式原生配置，无演示服务器配置。
- APK签名证书符合原正式证书、zipalign通过；APK/IPA ZIP完整性通过。
- 共享table-scene/table-hand-motion与Cocos副本一致。
- Cocos source `811924908d74bac97458f53c68c69f4985c8202f7409e347911ad071451c65f2`，打包后验证未变化。
- Cocos runtime `1ee741456d4ef3ae4a57c3bdffce8d623e7f2293d5dc520a4d8d1215aa59e91d`，198文件。
- 桌面副本哈希与构建产物一致。

完整原生构建日志和逐资源校验见产物目录；独立复跑证据在其native-compat-check、replay-motion-recheck目录。浏览器覆盖不等同最低系统真机、软键盘或GPU性能验收。
