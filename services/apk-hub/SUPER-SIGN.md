# 轻装 iOS 超级签

> 2026-10-01：按用户要求停止生产超级签分发，恢复接入前企业签原包。
> 下文保留为可选方案文档，不代表当前生产方式。生产 `IOS_SIGNING_URL`
> 已设为空；部署时可最后叠加 `compose.signed-ipa.yaml`，避免历史超级签
> 覆盖文件重新启用登记入口。普通发布必须上传已签名且适配设备的 IPA。

保持原来的轻装上传、发布、下架、分享和安卓下载接口。设置
`IOS_SIGNING_URL=https://212.189.31.46:8443` 后，公开 iOS 安装按钮进入
`/hub/<原应用ID>`，不再直接安装上传的 IPA。未签名 IPA 可作为输入；
App Store DRM 加密包、损坏包仍不能重新签名。

公共元数据新增 `installation_method=super_sign` 和 `signing_url`。旧
`install_url` 字段保留既有格式，兼容已安装 App 的“是否可更新”判断；
它们实际安装操作一直打开固定分发网页。未签名源包的原始 manifest 始终
拒绝安装，不把原始 IPA 伪装成已经签名的成品。

签名服务通过专用容器网络读取轻装既有公开应用 API，只读挂载 packages
目录，不接触轻装数据库、管理员会话或密码。用户点击开始安装后，自动校验
SHA256、包标识、版本、Mach-O/权限并导入。没有手工搬包和另建邀请链接。
准备资源不会调用苹果 API；经设备回传校验后才登记设备并进入真实签名队列。

桥接邀请没有业务设备配额和到期时间，原分发链接持续指向当前已发布版本。
下架、删除或替换旧版本后，旧签名入口不再提供安装；已经安装的应用不会因此
被卸载。Safari 内经验证的设备 cookie 可在新版本复用，换浏览器或 cookie
过期时需要重新验证设备，苹果已注册设备不会因为再次验证重复占用名额。

保留管理员权限、CSRF、文件体积/空间保护、请求限流和签名队列容量保护。
这些是服务安全保护，不是套餐/收费/下载次数限制。苹果开发者设备名额、设备
启用等待、证书有效期无法取消。首次安装仍需用户按 iOS 提示安装设备登记
描述文件，不能在后台静默完成系统确认。

测试分别执行（旧测试文件共享模块名，不能在同进程 discover）：

```
python3 services/apk-hub/tests/test_unified_release.py
python3 services/apk-hub/tests/test_management_releases.py
python3 services/apk-hub/tests/test_super_sign.py
```

超级签仓库执行 `python -m pytest -q tests/test_portal.py tests/test_hub_bridge.py`。
上线只更换轻装和签名 web/worker，不更换麻将服务或 Telegram 服务。
保持已有在线 APK/IPA 版本，不借接入操作自动发布本地的新包。
