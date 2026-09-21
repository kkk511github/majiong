# 公告、版本与人员管理后台 · 设计稿

使用内置 image_gen，以当前金陵麻将品牌图标和真实首页截图为参考生成。以下为界面设计，尚未实现或部署；图中的 0.7.31 / Build 68 是未来版本的文案示例，不代表已发布安装包。

## 独立网页后台

- 公告管理：编辑标题与正文、保存草稿、成员端预览、发布与撤回。
- 版本管理：分别管理 Android APK 和用户完成签名后回传的 iOS IPA；上传校验后再明确发布。
- 人员管理：搜索账号、ID 或昵称，按战队和状态筛选，新注册优先；修改昵称和战队、重置密码、暂停及恢复使用。角色与开桌资格分别展示，继续保留既有开桌规则。
- 普通成员在 APP 查看公告和更新提示；发布操作放在独立网页后台。

![人员管理](/Users/kk/Documents/Codex/2026-09-13/new-chat/outputs/nanjing-mahjong/docs/design/announcement-admin-v1/personnel-admin-v1.png)

![公告管理](/Users/kk/Documents/Codex/2026-09-13/new-chat/outputs/nanjing-mahjong/docs/design/announcement-admin-v1/announcement-admin-v2.png)

![版本管理](/Users/kk/Documents/Codex/2026-09-13/new-chat/outputs/nanjing-mahjong/docs/design/announcement-admin-v1/version-admin-v2.png)

## APP 公告与更新提示

弹窗沿用现有牌桌大厅背景，使用米白面板、墨绿主按钮、金色细线。公告与更新单层依次显示；正在牌局延后到大厅，不覆盖牌面。公告按发布版本记录已读状态，避免同一条反复弹出。

![APP 弹窗对照](/Users/kk/Documents/Codex/2026-09-13/new-chat/outputs/nanjing-mahjong/docs/design/announcement-admin-v1/app-dialogs-v1.png)

[交互规格](/Users/kk/Documents/Codex/2026-09-13/new-chat/outputs/nanjing-mahjong/docs/design/announcement-update-v1-notes.md) · [完整最终提示词](/Users/kk/Documents/Codex/2026-09-13/new-chat/outputs/nanjing-mahjong/docs/design/announcement-admin-v1/prompts-v2.json) · [原始生成结果与文件校验](/Users/kk/Documents/Codex/2026-09-13/new-chat/outputs/nanjing-mahjong/docs/design/announcement-admin-v1/manifest-v2.json)
