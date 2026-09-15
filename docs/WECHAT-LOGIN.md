# 微信授权登录接入方案

核对日期：2026-09-15。当前版本保留账号密码登录，尚未开通微信登录；上线需要运营方完成微信开放平台审核并提供应用配置。

## 需要准备

1. 微信开放平台开发者账号、已审核的移动应用和微信登录接口权限。移动应用的 AppID 公开使用，AppSecret 仅存服务器环境变量或密钥管理中，不放入 IPA、APK、Git 或聊天记录。
2. 安卓包名 `com.jinling.mahjong`，并在开放平台登记当前正式签名证书对应的应用签名；调试签名不能代替正式签名。
3. iOS Bundle ID `com.jinling.mahjong`、微信 URL Scheme 和 Universal Links 配置。Universal Links 需要 HTTPS 域名、Associated Domains 与 apple-app-site-association 文件。现有 API 可以继续使用已配置证书校验的 HTTPS 连接；微信 iOS 回跳另需准备可验证的 HTTPS 域名。
4. 应用实际发布信息与平台审核要求。官方当前提示：通过认证但未上架的移动应用存在每日调用额度限制，不能把开发调试状态直接当正式用户登录服务。

## 实现流程

- 在 Capacitor iOS/Android 原生层接入微信 OpenSDK，检测是否安装微信；未安装时继续允许账号密码登录。
- 用户点“微信登录”后发起 `snsapi_userinfo` 授权，生成一次性 state。取消授权正常返回登录页，重复点击不并发创建授权。
- 回跳获得短期、一次性 code。原生层将 code 与 state 交给我们的服务器；服务器校验 state、一次性使用和来源，再向微信交换身份。
- 服务器以 `(AppID, openid)` 唯一绑定微信身份；有可用 unionid 时做跨应用关联，但不以昵称、头像或前端自报 openid 识别用户。
- 已有会员登录后主动绑定微信，经现有账号身份校验后保留原会员 ID、战队、权限和战绩；不得仅因同名就合并账号。
- 新微信用户创建普通会员并分配唯一会员 ID。未经管理员分配战队不得入桌；停用状态、禁止开桌、管理员权限继续执行现有服务器校验。微信登录不会自动赋予管理员权限。
- 微信令牌留在服务器；客户端只拿我们自己的短期会话。加入限流、日志脱敏、错误处理、绑定冲突提示及解除绑定前的备用登录方式校验。

## 上线验证

在正式签名 Android 和真机 iOS 上验证首次登录、已有账号绑定、拒绝/取消、微信未安装、过期 code、重复回调、断网重试、冷启动回跳、后台回跳、账号禁用、未分配战队和退出登录。所有应用密钥由部署环境注入，不能硬编码进客户端。

## 官方资料

- [微信登录开发指南](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Development_Guide.html)
- [iOS 接入指南](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/Access_Guide/iOS.html)
- [Android 接入指南](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/Access_Guide/Android.html)
