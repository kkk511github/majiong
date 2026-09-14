# 金陵麻将

南京麻将联机 App，使用 React、TypeScript、Capacitor 与 Node.js。当前安卓版本为 **0.6.7 / build 27**（iOS 为 0.6.5 / build 25），包含 iOS、Android、Web 客户端和完整服务端源码。

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
npm run dev
```

打开 `http://localhost:5173`，服务端端口为 8787。数据库默认位于 `data/mahjong.sqlite`。初次启动会创建表结构；管理员由 `scripts/admin-account.ts` 初始化，该脚本从标准输入读取 `{"password":"自行设置的密码"}`，首次登录需要修改密码。普通账号通过注册创建。

配置项示例见 `.env.example`。Vite 原生构建使用 `VITE_GAME_SERVER_URL`，服务端使用 `DATABASE_PATH`、`PORT`。Web 默认使用同源服务。

## 验证

```sh
npm test
npm run test:e2e
npm run build
```

浏览器测试使用本机 Google Chrome。测试覆盖规则、积分守恒、鉴权、实时手牌保密、持久化、回放访问权限、四家牌桌布局、箭头方向、音频恢复和会员操作。

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
| `ios/`、`android/` | 原生工程 |
| `tests/` | 单元、服务端与浏览器测试 |
| `scripts/`、`deploy/` | 素材生成、账号初始化和部署辅助 |

源码仓库不包含运行数据库、会话、签名密钥、构建产物或本机环境配置。
