# 安装包更新链路

固定产品入口为 `https://212.189.31.46/app/jinling-mahjong`，公开元数据复用 `/api/products/jinling-mahjong`。同平台上传继续使用原有原子替换流程及发布状态。原生只检查这一产品；网页不触发原生升级。

## iOS 发布顺序（用户确认）

每次生成 IPA 后，必须先交给用户签名。只有收到用户签名后回传的 IPA，才能上传分发平台并替换线上 iOS 包。未经此步骤，不自动上传本地生成的 Ad Hoc、开发签名或未签名 IPA，也不自动送第三方机器人签名。等待期间保留线上现有 iOS 包；Android 可独立更新。

## 行为

- 版本检查不下载。用户点击更新后再次确认当前已发布版本、构建号、摘要和可安装状态。
- Android 在原生工作线程下载，限定固定 HTTPS 主机和 APK 下载路径，拒绝重定向，使用现有系统信任及证书固定配置。取消会断开连接并清理未完成文件；进程被系统终止时不会擅自重启下载，用户下次可重新点击。
- 安装前核对文件大小、SHA-256、应用标识、构建号、最低系统版本和当前安装应用的签名证书集合。不支持跨签名覆盖升级；错误原因返回应用界面。
- 完整包存放在私有 `files/updates`，通过 FileProvider 只向系统安装意图临时授权读取。需要安装来源授权时先打开本应用的系统设置；授权返回后重新校验已下载包，再拉起系统安装确认。没有静默安装，也不把打开安装器当成安装成功。
- 下载完成但应用在后台时，等回前台再打开系统安装界面。已校验的来源授权等待信息保存在应用私有配置内，可在进程重建后继续；不会仅因版本检查而下载或安装。
- iOS 使用当前已安装版本与系统版本判断更新及最低系统要求。沿用分发服务现有 IPA 签名/有效期检查，用户点击后打开固定安装页，由 Safari 与 iOS 完成签名、设备与安装确认。插件只返回 `page-opened`，不声称安装成功。
- 旧安装包本身没有新原生插件，首次启用需要先安装含此功能的新版本。

公开产品接口只允许 `capacitor://localhost`、`https://localhost`、`http://localhost`、`https://212.189.31.46` 的 GET/OPTIONS 跨域读取，不开放 Cookie 凭据或管理接口。

## 验证

`tests/app-update.test.ts` 使用离线模拟元数据与原生桥，覆盖数字构建号、失效签名、系统版本、替换竞态、显式安装及网页无原生动作。分发 HTTP 回归使用临时数据库、假安装包和回环端口，覆盖原子替换及精确 CORS。原生编译只针对模拟器/构建目标，不向用户设备发出安装请求。

## 官方依据

- Android 安装来源授权：<https://developer.android.com/reference/android/provider/Settings#ACTION_MANAGE_UNKNOWN_APP_SOURCES>
- FileProvider 临时读授权：<https://developer.android.com/training/secure-file-sharing/share-file>
- Capacitor 自定义 Android / iOS 插件：<https://capacitorjs.com/docs/android/custom-code>、<https://capacitorjs.com/docs/ios/custom-code>
- Apple 企业内部应用分发、HTTPS 清单及系统安装流程：<https://support.apple.com/guide/deployment/distribute-proprietary-in-house-apps-depce7cefc4d/web>
