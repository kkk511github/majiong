# 0.8.8 / Build85 安装包

2026-09-27生成。两平台appId com.jinling.mahjong，沿用正式生产地址。包含0.8.7全部客户端改动，并加入当前B档“补杠也算杠、当前没有碰牌即门清”的共享计分/听牌提示及规则说明。

200954第8把匿名牌型回归：九条补杠+二万直杠，硬花2张，六筒摸入后去掉八筒，听二条/北。当前门清30分/份（倍率1）；客户端提示、出牌听口箭头及服务端引擎合法胡/实际结算共用修正逻辑。仍有碰牌则不恢复门清，杠费和其他免花条件不变。历史记录不回算。

交付位置：`/Users/kk/Desktop/金陵麻将 0.8.8 安装包/`。旧0.8.7包保留。

- Android Release正式签名，证书与旧包一致，签名验证与16KB ZIP对齐通过。
- IPA为未签名iPhoneOS arm64包，需要外部签名；最低iOS15.0。Android最低API24未改。
- 372项网页资源与同一native dist逐字节一致；ZIP完整性通过，无模拟器server URL/调试配置、源映射、密钥、Mac元数据或重复路径。
- 正式编译资源Chromium/WebKit共4项兼容回归通过，包含缺失roundRect/Array.at/randomUUID/structuredClone后的加载与战绩/回放/后台入口。日志.tmp/build85-native-compat.log。
- 相关引擎全量及补充门清回归见.tmp/added-kong-closed-all-final.log和.tmp/build85-unit.log。不声称最低系统真机验收通过。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| jinling-mahjong-0.8.8-build85.apk | 140917735 | ad664324598e2569bfa58b24862b5cf3e964a2c2a3a814ef9dc6e66bbdff18c6 |
| unsign-0.8.8-build85.ipa | 140846077 | 6a912a10866b3c684f5f1ac8442c10846ea44091ac80567710fe471532877266 |

用户同时另行授权部署该门清修复，生产切换结果以deployment-closed-kong-20260927.md为准。按桌升级时正在打的旧桌继续原规则直到整桌结束，新桌使用修复规则；不能把新包发给旧桌就宣称旧桌已切换计分版本。
没有代用户上传或发布安装包、没有修改强更策略。此次服务端候选仅含门清计分补丁及版本元数据，不把其他未发布的网页/后台资源或仅胡者亮牌的数据裁剪顺带上线。
