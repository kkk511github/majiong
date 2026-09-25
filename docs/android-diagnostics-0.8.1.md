# Android 0.8.1 / Build 78：诊断采集与旧 WebView 修复

状态：客户端、后台及服务端代码已实现并完成本地验证；本次未部署生产诊断接口/后台，未上传安装包、未启用强更。现有线上版本统计不等于新增的诊断采集。iOS 工程版本和已交付 IPA 未更新，采集逻辑在 iOS/网页关闭。

## 后台主动采集

后台“人员管理”每行新增“诊断日志”。管理员发起采集后，已登录且声明 androidDiagnostics 能力的安卓客户端自动响应，不要求玩家每次点击。

- 后台：`GET/POST /api/control/members/:id/diagnostics`，仅管理员可用。采集记录保存操作管理员ID、目标账号、时间、状态和报告。
- WebSocket：diagnosticRequest / diagnosticUpload / diagnosticAck，独立于出牌 requestId、revision 和操作锁。不得包含可执行命令、任意文件路径或回传URL。
- 设备离线：请求保存在数据库，等待下一次受支持的连接，24小时失效。
- 在线旧客户端或 iOS：显示“不支持”，不下发未知指令。0.8.0及更早版本没有采集能力，无法事后获取其本地日志。
- 关键JS/React/牌桌加载/图形错误可自动上报。后台报告保留7天，全局最多2000份；每账号后台采集间隔至少1分钟、自动报告至少10分钟。相同待处理请求合并。
- 只保留本 App 最近24小时内最多32条结构化事件。记录应用/构建版本、Android版本、机型、WebView包及版本、圆角API能力、加载阶段和脱敏错误；每条事件可关联发生时的房号。
- 不读取系统 logcat、其他App、联系人、定位、聊天、完整手牌或墙牌；不申请 READ_LOGS、录音、存储读取权限；清除密码/令牌、邮件、电话、外部URL参数和长不透明字符串。
- 上报前再次校验会话账号，服务端按真实登录身份关联；不能代其他会员提交报告。换账号/退出登录清理本地记录，删号清理后台诊断。
- 上传异步、限量，错误不会变成游戏操作错误弹窗。日志采集不能唤醒已被系统杀死的 App；完全不能启动/认证时只能等待其恢复后上传已有记录，不是远程读取整部手机。
- 隐私说明已明确采集范围，协议版本为2026-09-25.1。首次新版使用沿用现有隐私确认流程；每次采集不再弹确认框。

## 兼容修复

- 原生 Canvas `roundRect` 缺失时，以 moveTo/lineTo/arcTo 绘制同一圆角边框；支持的内核保留原生实现。
- 短句与听牌相关代码的 Array.at 改为等价的 slice(-1)[0]，不改变判断或计分。
- Cocos 初始化失败上报阶段、错误名与堆栈给安卓诊断；图形上下文丢失、iframe失败和握手超时均可记录。
- 新增 AppDiagnostics 原生插件只读取版本、系统与WebView元数据；正式APK调试关闭，R8明确保留桥方法。

## 真实旧内核对照

独立AVD：Jinling_Compat30_20260925，Android 11/API30，原装 com.android.webview 83.0.4103.120。没有生产账号登录、真实开桌或服务器数据写入。

使用独立签名的 framework-only instrumentation 测试程序驱动已安装APK自身的 `https://localhost/cocos-table/index.html`；没有给旧APK注入兼容补丁，也没有更改旧APK字节。测试程序不包含在交付包内。

| 项目 | 已发布0.8.0 Build77 | 修复0.8.1 Build78 |
| --- | --- | --- |
| WebView | 83.0.4103.120 | 同一个内核 |
| roundRect | undefined | undefined |
| 牌桌 ready | false | true |
| 3D模型 | 未创建 | enabled=true，39张示例牌 |
| 错误 | Table assets TypeError：函数不存在 | 无初始化错误 |
| 原生诊断 | 不支持 | capability=true，正确读取App/WebView版本 |

旧APK SHA-256仍为 `8d23064f08638244b348385286f2748a91796649657a9106196274aa936c4575`。
结果和修复后原生截图：`output/android-diagnostics-compat/`。

这证明一个真实旧WebView兼容故障已复现并修复，不代表已经在“激情岁月”的具体实体手机上验收；仍建议由该手机安装测试包复核。

## 验证与交付

- 99文件、1368项单元/服务端集成测试通过。
- 后台13项浏览器检查、生产牌桌6项检查通过。
- 编译后资源在 Chromium/WebKit 的4项兼容回归通过，包含移除 roundRect、Array.at、randomUUID、structuredClone 的场景。
- 后台采集/离线等待/旧端拒绝、真实WS大于8KB报告及游戏ping互不干扰、脱敏和权限边界已在隔离测试验证；原生插件与实际APK绘制在上述Android模拟器验证。没有宣称完成真实手机→生产后台的全链路验收。
- APK沿用正式签名，v2签名及16KB zipalign检查通过，366项网页资源与native dist逐字节匹配。
- `output/release-0.8.1-build78/jinling-mahjong-0.8.1-build78.apk`，144745124字节。
- SHA-256：`1731bdcce5f051d340d1c5fa24b26262bf44d0ed6d223a5a587829579e4a78e7`。
- 副本已放桌面“金陵麻将 0.8.1 安卓测试”。尚未制作新版IPA。
