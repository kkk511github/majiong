# 金陵麻将

南京麻将联机 App，使用 React、TypeScript、Cocos Creator、Capacitor 与 Node.js。当前源码为 **0.7.10 / build 47**，包含 iOS、Android、Web 客户端和完整服务端。源码更新不代表服务器已部署。

## 本次更新

- 未摸牌时也能点选、切换和放下手牌；轮到自己出牌时清除预选，防止误打。点击与出牌保持原音效。
- 同步胡牌、点炮及回放展示，断线恢复、战绩导出和战队日结/周结报表；报表排除单人练习，按期末战队汇总并显示总计。
- 版本与安装包验证见 [0.7.10 发布说明](docs/RELEASE-0.7.10-build47.md)，报表运行方式见 [战队定时统计](docs/TELEGRAM-REPORTS.md)。

- 重做“我的”页面，支持照片头像、昵称和设置弹窗；普通成员不显示管理及开桌授权入口。注册和修改密码最低 4 位。
- 碰牌来源使用金色内凹箭头，固定显示在中间牌面；明杠显示在上叠的中间牌面，暗杠不显示来源。自己的副露使用带厚度的平放牌图，两侧花牌紧贴排列。
- 同步当前南京进园子、敞开头规则开发代码、比下胡状态、独立桌外记分及战绩回放明细，旧牌局保留原规则版本。本次包含最新规则图核对结果、管理员战绩已读状态、输入框键盘适配和听牌提示更新。
- 牌桌与回放统一使用 Cocos Creator 3.8.8 和多角度预渲染牌图，iOS、Android 共用布局与素材。保留独立的手牌、花槽、碰杠和弃牌区域，杠牌第四张叠在中间。
- 四家弃牌围绕方形区域排列；花牌按各自卡槽投影摆放。碰杠、胡牌和弃牌指向器使用独立特效层。
- 战绩左侧按日期筛选，右侧展示整桌四人总战绩；详情全屏展示每把积分、牌面与回放 ID，支持复制 ID 和直接播放。
- 会员 ID 正常显示，战队名称仅管理员可见。日期和房间号可以组合查询，日期栏和对局列表独立滚动。
- 人类玩家托管时优先摸什么打什么，遇到碰杠胡请求自动过；托管按钮单击即可取消。电脑练习对手保留原有决策。
- 保留南京男女声、背景音乐、语音聊天、后台恢复、服务端行动校验和手牌隐私。

## 功能

- 四人联机、断线恢复、碰杠胡、补花、听牌提示、超时托管与单人练习。
- 新会员由管理员分配战队后参与联机；可停用牌局权限、管理战队、按时间查询和导出积分及局数。
- 管理员管理权限只授予 `guanli@1`，其他管理账号按授权操作。
- 每局展示四家最终手牌和本局分数；10 秒后继续下一局，整桌结束汇总总分。
- 每局拥有唯一牌局 ID。所有登录会员都能查看已结束牌局的完整动态回放，支持全屏牌桌、切换视角、明牌、播放/暂停、逐步、拖动进度和倍速。
- 回放根据服务端保存的实际事件还原，不重新发牌或推演结果。功能上线前的旧局只有结算记录时，仅展示结算牌面。
- 南京话报牌与碰杠胡等动作播报、背景音乐、系统后台返回恢复音频。

规则与计分实现见 `shared/engine.ts`、`shared/settlement.ts` 与 [规则说明](docs/RULES.md)。该项目仅统计积分和局数，没有微信收付款功能。

## 本地运行

使用 Node.js 22.21 以上（包含 `node:sqlite`），推荐 Node.js 24。

```sh
npm ci
npm ci --prefix server/report-xlsx --ignore-scripts
npm run build:cocos
npm run dev
```

表格导出的 ExcelJS 依赖独立安装在 `server/report-xlsx/`；首次拉取后需执行上面两条安装命令，构建和测试也会用到该依赖。

打开 `http://localhost:5173`，服务端端口为 8787。数据库默认位于 `data/mahjong.sqlite`。初次启动会创建表结构；管理员由 `scripts/admin-account.ts` 初始化，该脚本从标准输入读取 `{"password":"自行设置的密码"}`，首次登录需要修改密码。普通账号通过注册创建。

Cocos 工程在 `cocos-table/`，预渲染素材和源图包含在仓库中。`npm run build:cocos` 优先校验并解包与源码匹配的运行包，可在没有 Creator 的机器上运行；修改 Cocos 资源或场景后，需要通过 `COCOS_CREATOR` 指定 Creator 3.8.8 重新生成。详细约定见 [牌桌重构](docs/COCOS-TABLE-REBUILD.md)。

配置项示例见 `.env.example`。Vite 原生构建使用 `VITE_GAME_SERVER_URL`，服务端使用 `DATABASE_PATH`、`PORT`。Web 默认使用同源服务。

## 验证

```sh
npm test
npx playwright test -c playwright.records.config.ts
npx playwright test -c playwright.nanjing.config.ts
npx playwright test -c playwright.profile.config.ts
npx playwright test -c playwright.meld-marker.config.ts
npm run build
```

单元测试覆盖规则、积分守恒、鉴权、实时手牌保密、持久化和回放访问权限。战绩与回放的专项测试覆盖 Chromium / WebKit、手机横屏和宽屏；需要本机 Google Chrome 与 Playwright WebKit（`npx playwright install webkit`）。完整旧版浏览器测试中仍有依赖旧牌桌 DOM 的用例，迁移到 Cocos 的用例见 `playwright.cocos-release.config.ts`。

本地战绩交互预览：`http://localhost:5173/tests/previews/records.html`。预览使用内存演示数据，不修改账号或数据库，不作为正式构建入口。

## 原生安装包

首次拉取或改动页面后，先构建并同步：

```sh
# 在本机 .env.native 中配置可访问的 HTTPS 对局服务。
npm run native:sync
```

iOS 需要 macOS 与 Xcode 26，使用 Swift Package Manager。打开 `ios/App/App.xcodeproj`，选择自己的签名团队；真机安装需要有效签名和描述文件。

```sh
npm run ios
# 无签名模拟器构建
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -derivedDataPath /tmp/mahjong-ios CODE_SIGNING_ALLOWED=NO build
```

Android 需要 JDK 21、Android SDK 36 和 Build Tools 36.0.0。可使用 Android Studio 或 Gradle Wrapper：

```sh
cd android
./gradlew assembleDebug
```

正式包使用 R8 和资源压缩。签名通过环境变量 `MAHJONG_KEYSTORE`、`MAHJONG_STORE_PASSWORD`、`MAHJONG_KEY_ALIAS`、`MAHJONG_KEY_PASSWORD` 提供；签名文件不属于源码。Windows 可运行根目录 `build-android.cmd`。

## 部署

```sh
npm ci
npm ci --prefix server/report-xlsx --ignore-scripts
npm run build
npm run server
```

也可使用 `Dockerfile` 与 `compose.yaml`。进程同时提供静态网页、HTTP API 和 WebSocket 服务。生产入口配置 HTTPS 和 WebSocket 升级，持久化并备份数据库。当前为单实例房间服务，多副本部署需先实现共享房间协调。

## 协议与隐私

首次使用由 `LegalGate` 展示用户协议和隐私说明；拒绝时不会挂载游戏或恢复账号连接。协议不预勾选，版本变化时重新询问，“我的”里保留阅读入口。正文源文件为 `src/legal-copy.ts`。仅供娱乐，禁止用积分或输赢进行现金、财物交易、赌博及资金结算。

当前文案按需求没有填写实际运营主体及联系方式，因此不应宣称已满足完整的信息披露或运营资质要求。

## 传输与安装包保护

- 正式包使用本地 JavaScript 字符串混淆、R8、资源压缩和正式签名，不携带源码映射，关闭原生 WebView 调试及 Android 备份。
- HTTPS/WSS、系统证书校验、证书公钥固定及备用公钥。固定配置位于 Android 网络安全配置与 iOS `MahjongTrustPlugin`；更换服务端时必须同步更新地址及两组 pin，并验证原生客户端连接。
- iOS 固定校验接入 WKWebView 的服务端认证回调，受系统和 WebKit 网络路径约束，不等于抵御一切设备端 Hook。
- 公网 IP 可使用支持 IP 标识的公开 CA 证书。六日证书必须自动续期，续期后重载 Nginx；固定叶公钥时复用原密钥，轮换前部署备用 pin。私钥不得放进客户端或仓库。
- 联机发牌、验牌、计分及权限由服务端负责，实时视图不包含他人暗手、牌墙或未结束的回放。
- 加固不能隐藏网络路由目的 IP，也不能保证客户端永不被修改。即使知道地址，未授权请求仍应被服务端拒绝。

## 目录

| 目录 | 内容 |
| --- | --- |
| `src/` | 大厅、牌桌、管理、战绩和回放界面 |
| `shared/` | 规则引擎、计分、回放帧和协议类型 |
| `server/` | 账号、房间、战队、积分与持久化服务 |
| `public/` | 牌面、场景、声音和图标 |
| `cocos-table/` | Creator 工程、预渲染素材、制作工具与可校验运行包 |
| `ios/`、`android/` | 原生工程 |
| `tests/` | 单元、服务端与浏览器测试 |
| `scripts/`、`deploy/` | 素材生成、账号初始化和部署辅助 |

源码仓库不包含运行数据库、会话、签名密钥、APK/IPA 或本机环境配置。`cocos-table/runtime/` 包含用于跨平台构建的 Cocos Web 运行包，并由源码指纹和 SHA-256 校验。
