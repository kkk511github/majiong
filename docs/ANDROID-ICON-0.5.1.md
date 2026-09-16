# 安卓图标 0.5.1

修复原来把整张方形场景用作自适应前景，导致桌面图标放大裁切的问题。保持红色“中”字麻将，使用真正透明的独立主体，居中放在玉绿色背景上。

- Android 8+：前景 108 dp，麻将主体限制在 40×52 dp 内，可容纳于中央 66 dp 安全圆。mdpi 至 xxxhdpi 全套资源。
- Android 13+：提供独立单色矢量层，主题图标也能正确显示“中”。
- 旧版入口：独立圆角方形和圆形位图。
- iOS 保持现有品牌图；删除未被使用的安卓模板前景。

规范依据：[Android 自适应图标官方说明](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)。

生成方式：内置 image_gen 编辑模式；输入为本项目 public/brand-icon.png。生成的透明原图保存在 `public/android-icon-foreground.png`，由 `npm run icons` 排版、缩放并输出原生资源；不是界面截图。预览文件为 `public/icon-preview/adaptive.png`、`public/icon-preview/monochrome.png`。

最终提示词：

> Use case: background-extraction. Edit the supplied Jinling Mahjong app icon image to create one production-quality Android adaptive icon foreground asset. Preserve the exact single upright ivory ceramic mahjong tile, carved red Chinese character 中, glossy emerald green thickness, rounded bevel, original perspective and fine material detail. Remove ALL green scenic background, table, floor, background lights and ground shadow. Isolate only the complete intact tile on a genuinely transparent alpha background, with clean antialiased edges; no checkerboard painted into pixels, no white rectangle, no border, no extra objects or lettering. Center the complete tile in a square 1024x1024 transparent PNG canvas with approximately 12% transparent clearance above and below so no edge of the tile is clipped. This is a clean foreground cutout for later layout into Android's 108dp canvas, not a phone mockup. Keep 中 correct and large.
