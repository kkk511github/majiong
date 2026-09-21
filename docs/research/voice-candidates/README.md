# 胡牌女声试听候选

- `hu-female-ai-v2.wav`：用户确认采用的 AI 合成“胡了”，参考原包南京女声，0.617 秒、24 kHz、单声道 PCM16。
- 用户于 2026-09-16 明确确认“已获得声音复刻授权”。参考文件为 `南京麻将_njyz/girl/chat_05_乖乖，我手气好的一塌带一麻，又自摸了！.mp3`。
- 全程本机推理，参考录音未上传。模型为 [Qwen3-TTS 0.6B Base 4bit](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit)，模型 Apache-2.0；使用 [MLX Audio](https://github.com/Blaizzy/mlx-audio) 0.5.4。
- 自动转写得到“糊了”（同音）；此项仅辅助检查发音，音色相似度、南京语气仍需人工试听。
- 用户于 2026-09-16 试听后确认采用此版本。正式副本为 `public/audio/hu-female-ai-v2.wav`，女声语音包的胡牌和自摸使用此录音；男声继续使用 `public/audio/hu-male-user-v1.wav`。
- 生成参数、授权记录、参考/产物哈希见 `hu-female-generation.json`。生成后已清理此次下载的 1.7 GB 模型临时文件。
