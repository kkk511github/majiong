# 网页版发布和验收

App 和网页版使用同一套 React/Cocos 界面、游戏规则和服务端。网页版增加浏览器适配，登录、大厅、战绩与管理页面支持手机竖屏，正式牌桌保持横屏。

## 构建

运行 `npm run build:web`，输出在 `dist/`。网页固定部署在 `/play/`，账号、头像、语音和 WebSocket 使用**当前网站**的 `/mahjong/` 服务，不写死服务器 IP。原来的 `build:native` 保留 App 的 HTTPS 服务地址校验。

不要用原生安装包里的网页资源直接替代网页构建。发布时也不能只上传首页文件：必须包括 `assets/`、`cocos-table/`、音频、字体和图片。

## 更新已安装的网页版

将 `dist/` 内的完整内容压成 `web.tar.gz`。上传后在服务器运行：

```sh
bash publish-web.sh /path/to/web.tar.gz /path/to/mahjong-web 20260919-web-fix
```

第二个参数是现有 `current` 软链接所在目录，第三个参数是未使用过的版本目录名。脚本保留旧版本及其带哈希的功能模块，避免更新时仍打开的旧页面出现“战绩/管理打不开”。检查文件后原子切换 `current`，不重启游戏服务，不修改数据库。上一版本名称保存在新目录的 `previous-release.txt`，需要回退时将 `current` 原子切回该目录。

## 本地验收

```sh
npx vite build --mode web --outDir output/web-parity-20260919/web
npx playwright test -c playwright.web-parity.config.ts
```

测试使用独立本地数据库和 `/play/`、`/mahjong/` 网关布局，覆盖 Chromium/WebKit 下登录、会话恢复、会员权限、头像、报牌、复制、管理、CSV 导出、战绩详情/回放和四人真实对局，不连接生产服务。

## 本次修复的复现与验证

- 南京话音频包里的 `/audio/` 路径在 `/play/` 部署下返回 404；现按构建基础路径请求，同时保留 App 路径。声音仍需浏览器允许播放，通过首次点击/触摸释放启用。
- 自动准备/即时入桌可能第一条消息就是开局；开局提示改在客户端接收状态时记录，不依赖 React 是否渲染过等待画面。只有首把新开局触发，恢复与后续把不重复。
- Cocos 内置 WebGL 上下文丢失处理只记录错误，绘图停止后状态仍可更新。现重建画布页面并同步最新手牌；30 秒内再次失败则显示手动重试，避免循环重载。此故障可用 `WEBGL_lose_context` 复现；不代表已经证明用户反馈的所有偶发缺牌都由此导致。
- Chrome 与 WebKit 的四座位测试比对服务端完整手牌、每张实际 Sprite、摸牌独立位置；覆盖横竖屏、绘图故障恢复、真实拖牌/双击出牌。
