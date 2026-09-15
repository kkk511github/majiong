# 0.5.8 应用与接口加固

## 目标与边界

用户要求防止拿到安装包的人破解 IP、域名及游戏。联网客户端必然要知道连接目的地，域名/IP 不是凭据，不能承诺完全隐藏或绝对无法逆向。HTTPS/WSS 保护传输内容；身份和权限由服务端判断，不能用客户端藏起来的固定密钥替代认证。

## 本轮已修改

- Web 与原生构建不再生成或携带源码映射；静态服务即使出现映射、隐藏文件或非公开文件类型也拒绝返回。
- 原生生产构建必须配置 HTTPS，拒绝 HTTP、地址内账号密码、查询串和片段；错误配置直接阻止构建。
- iOS 与 Android 均显式关闭 WebView 内容调试。iOS 保持 ATS 默认安全策略，未添加任意联网例外。Android 显式禁止明文流量、继续禁止备份。
- Android Release 启用 R8 混淆、代码收缩与资源收缩。混淆只能增加逆向成本，不能保证不可反编译。
- 反馈接口改为统一会话校验，补上过期会话、未改初始密码的拒绝逻辑；静态响应增加 MIME、防嗅探、防框架嵌入及无引用来源泄露的响应头。

## 已存在并复核的保护

- 密码使用独立随机盐和 scrypt 派生，不保存明文；会话是 256 位随机令牌，数据库只存哈希。
- 普通注册不能声明管理员；新旧开桌接口均在服务端校验授权，授权不升级管理员战绩权限；撤权立即影响原连接。
- 登录轮换、退出和改密使旧会话失效。每次 WebSocket 操作重新核对当前会话，不能靠首次登录永久保留已撤销权限。
- 洗牌、合法出牌、胡牌、结算由服务端处理，客户端不能提交桌上分数作为最终结果，其他人的暗手不下发。
- 登录有账号/IP 限流和哈希并发限制，WebSocket 有消息大小、频率及未认证超时限制。
- 线上游戏容器仅映射到 127.0.0.1:18887，由既有 HTTPS 反向代理提供 API/WSS。只读检查确认外部 /mahjong/server/accounts.ts 和 /mahjong/.env 返回 404。

## 验证及尚未完成

逻辑/服务 152 项通过，包含普通账号伪造权限、令牌轮换、过期反馈拒绝和真实存在的敏感静态文件拒绝。原生 HTTP 地址构建已实际失败并核对错误原因。最新慢速语音、设置、登录、权限及手牌交互 18 项界面检查通过；此前完整 119 项回归通过。改动后两端拷贝资源均检查无 .map 文件、语音文件存在、调试开关为 false。

iOS 0.5.8 build 18 已归档并导出 Ad Hoc，Apple Distribution 严格签名核验通过、get-task-allow 为 false；4 台登记设备仍包含用户 iPhone。Android Release 构建通过，已核对无源码映射、无 debuggable 标记、禁止明文和备份，R8 映射仅留在构建目录。用户已授权切换独立正式签名：RSA 3072 位私钥存放于源码外的受限备份目录，APK v2/v3 签名及 16 KB 对齐核验通过。旧测试签名版需要由用户卸载后安装一次，服务器账号和战绩保留；此后继续使用同一正式私钥更新。详见 android-release-0.5.8-check.json。

本轮没有声称接入 App Attest / Play Integrity，也没有证书绑定、第三方加固壳或 CDN 源站隔离。这些需要结合当前 Ad Hoc / APK 分发方式、真机支持和域名部署单独实施。不能在服务端信任客户端自行上报的“未被修改”标记。当前设备本地 DNS 返回代理地址，未据此推断真实源站是否已隐藏。

本轮尚未部署 0.5.8，当前线上仍为 0.5.7。生产源代码交付包是给项目所有者的，不应当作 APK 或 IPA 分发。

参考：[Android 官方安全检查清单](https://developer.android.com/privacy-and-security/security-tips)、[R8 发布优化](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)、[Apple App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)。
