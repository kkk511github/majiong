# 秦淮晚风

为本项目编排的 72 BPM、32 小节舒缓配乐，约 106.67 秒。钢琴主旋律配尼龙吉他与少量长笛。应用只发布预先渲染的 AAC 文件，运行时无实时合成器或外部音乐服务。

乐器渲染使用 [GeneralUser GS](https://github.com/mrbumpy409/GeneralUser-GS) 2.0.3（S. Christian Collins）；其 [许可证](https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/documentation/LICENSE.txt) 允许个人及商业音乐制作。SoundFont 本体不包含在项目或安装包中。

复现：把这里的脚本复制到独立工作目录，下载 SoundFont 到该目录，在 macOS 执行：

```sh
python3 compose.py
swiftc render.swift -o render
./render GeneralUser-GS.sf2 score.json raw.wav
afconvert -f WAVE -d LEI16 raw.wav pcm.wav
python3 master.py # 需要 numpy
afconvert -f m4af -d aac -b 160000 -q 127 qinhuai-evening.wav qinhuai-evening.m4a
```

将结果放到 `public/audio/qinhuai-evening.m4a`，不要把渲染中间文件或 SoundFont 提交到仓库。
