# Windows 编译安卓安装包

当前交付 0.5.9 / versionCode 19。正式 APK 已启用 R8 混淆和资源收缩，并使用独立 RSA 3072 位发布签名。正式私钥单独保管，不包含在源码里。Windows 构建沿用该私钥即可覆盖更新今后的正式版本；旧测试签名版需卸载后安装一次，服务器账号和战绩保留，本机设置会清除。

## 准备环境

1. 将源码解压到较短的目录，例如 `C:\projects\nanjing-mahjong`。后续命令均在包含 `package.json` 的目录执行。
2. 安装 Node.js 22.21 以上；本项目建议使用 Node.js 24。
3. 安装 Android Studio 2025.2.1 或更新版本。通过 SDK Manager 安装 **Android SDK Platform 36**、**Build-Tools 36.0.0** 和 **Platform-Tools**，接受 SDK 许可。
4. 使用 **JDK 21**，将 `JAVA_HOME` 指向 JDK 根目录（不是 `bin` 目录）。Android Studio 自带运行时若为 JDK 21 也可使用；在 Gradle JDK 设置中选同一 JDK。
5. 将 `ANDROID_HOME` 指向 SDK 根目录。默认通常为 `%LOCALAPPDATA%\Android\Sdk`，以 SDK Manager 显示的路径为准。安装或修改环境变量后重新打开终端。

Capacitor 环境要求见[官方环境说明](https://capacitorjs.com/docs/getting-started/environment-setup)。项目自身固定 JDK 21、SDK 36，具体配置见 `android/variables.gradle` 和 `android/app/capacitor.build.gradle`。

## 编译测试版

打开命令提示符（CMD），进入项目目录，执行：

```bat
build-android.cmd
```

脚本依次安装锁定的依赖、构建前端、同步 Android 资源、编译 Debug APK；任何一步失败都会停止。它不会启动模拟器或安装到手机。首次运行需要下载 npm 和 Gradle/Maven 依赖。

也可以在 CMD 或 PowerShell 中逐行执行以下命令，每步成功后再执行下一步：

```bat
npm.cmd ci
npm.cmd run build:native
npx.cmd cap sync android
.\android\gradlew.bat -p android assembleDebug
```

Windows 请使用 `cap sync android`，避免触发 iOS 同步。`package-lock.json` 与 Gradle Wrapper 已包含，不需要复制 Mac 的 `node_modules` 或另装系统 Gradle。

APK 输出路径：

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

喜欢使用 Android Studio 的话，执行到 `cap sync android` 后，用 Android Studio 打开项目的 `android` 文件夹，等待 Gradle 同步完成再构建。命令行构建原理见 [Android 官方说明](https://developer.android.com/build/building-cmdline)。

## 后端和后续修改

`.env.native` 已配置公开服务地址 `https://safelink.chat/mahjong`。`build:native` 会将它写入客户端；好友桌使用该后端，离线电脑练习随 App 内置，无需 Windows 另外部署服务。

修改界面、规则、音乐或素材后，重新执行 `npm.cmd run build:native`、`npx.cmd cap sync android` 和 Gradle 编译。更新依赖时才需要重新安装；首次解压必须执行 `npm.cmd ci`。不要仅编译原生工程，否则可能打入旧的前端资源。

Debug 包仅用于开发测试，不要用它覆盖正式签名版。请按下节使用已有正式私钥，不要另生成一套密钥。

## 编译正式版

将单独交付的签名备份复制到安全目录。进入项目目录，用 PowerShell 设置环境变量，再编译；下面不会输出密码，Gradle 不使用常驻进程保存本次构建环境。示例路径请替换为自己的路径。

```powershell
$signingBackup = 'D:\Private\金陵麻将-安卓正式签名备份'
$env:MAHJONG_KEYSTORE = Join-Path $signingBackup 'jinling-release.p12'
$env:MAHJONG_STORE_PASSWORD = (Get-Content -LiteralPath (Join-Path $signingBackup '签名密码.txt') -Raw).Trim()
$env:MAHJONG_KEY_ALIAS = 'jinling-release'
try {
  npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败' }
  npm.cmd run build:native
  if ($LASTEXITCODE -ne 0) { throw '前端编译失败' }
  npx.cmd cap sync android
  if ($LASTEXITCODE -ne 0) { throw '原生资源同步失败' }
  .\android\gradlew.bat -p android --no-daemon assembleRelease
  if ($LASTEXITCODE -ne 0) { throw 'APK 编译失败' }
  $signer = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat'
  & $signer verify --verbose --print-certs '.\android\app\build\outputs\apk\release\app-release.apk'
  if ($LASTEXITCODE -ne 0) { throw 'APK 签名校验失败' }
} finally {
  Remove-Item Env:MAHJONG_KEYSTORE, Env:MAHJONG_STORE_PASSWORD, Env:MAHJONG_KEY_ALIAS -ErrorAction SilentlyContinue
}
```

正式 APK：`android\app\build\outputs\apk\release\app-release.apk`。

核对证书 SHA-256 为 `d07fd4c522490b38e1d1d7aa8ea5c86cc3bd14a0e46cd86d86ec183e430b0928`。私钥的 key password 默认与 store password 相同，若使用其他密钥可用 `MAHJONG_KEY_PASSWORD` 指定。没有设置签名变量时，`assembleRelease` 仅生成未签名包；配置一半会明确失败，不会偷偷退回测试签名。

以后发更新请提升 Android versionCode，继续使用本次正式私钥。密码、私钥、R8 mapping 文件不得随 APK 或公共源码分发。

## 验证范围

0.5.9 Release 已在 macOS/JDK 21 重新编译，包含四家固定 8 张换行、手牌与弃牌分区、提示移到底栏。正式 APK 的 v2 签名、16 KB 对齐、版本、关闭调试/明文/备份和 81 个资源核验通过。本次 Gradle 未启用 v3 密钥轮换，不把 v3 写作已通过。162 项逻辑/服务测试、141 项最终完整界面回归通过。源码清洁解压后 npm ci / build:native 通过。Windows 命令未在 Windows 实机运行，Android 实体设备及本版原生触摸尚未验收。详见 `android-release-0.5.9-check.json` 与 `TABLE-FLOW-0.5.9.md`。
