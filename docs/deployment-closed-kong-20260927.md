# 补杠门清修复生产发布

2026-09-27北京时间23:07，按用户授权激活`jinling-mahjong:0.8.8-closed-kong-20260927`，节点`closed-kong-20260927`，私有服务`mahjong-closed-kong`。

## 范围与保护

基于当前生产`0.8.5-rob-winner-20260927`，仅更新shared/scoring-nanjing.ts的当前B档门清逻辑、版本元数据和相关测试。不把未发布网页美术/控件或live手牌载荷裁剪混入本次服务端发布；这些客户端显示改动已在安装包中。
规则：暗杠、直杠、补杠均算杠；当前没有碰牌即门清，门清有独立免4硬花资格；仍有碰牌不算。旧v2档保持原规则，杠费及其他算分不变。

切换前活动桌：795709第3把、593451第5把。两桌保持rob-winner-20260927原归属/原计分规则直到整桌结束，没有强制迁移、收桌或踢人。旧引擎未停止、未退役；之后如需退役必须再次检查playing/claiming/ended全部清空，不能直接停容器。
activate只转移2张waiting桌，并将新建桌入口设为修复版。不要把“新入口已升级”描述为两张旧桌也已中途改规则。

稳定前门、旧引擎、Caddy、安装包服务、Telegram报表容器ID/启动时间/重启次数前后一致。未重发账单，未修改强更设置，未上传发布APK/IPA。

## 验证

- 候选Docker 115文件1504项测试通过，TypeScript及完整发行源码哈希校验通过，未接生产数据库运行合成牌局。
- 本地122文件1547项测试通过；新包正式资源Chrome/WebKit4项兼容回归通过。
- 生产SQLite热备份后启动候选，健康通过才activate；历史2323条牌局、2323条回放、9292条积分流水和1条强更设置的原有行指纹不变；integrity_check=ok；两张进行中桌归属保持。
- 新引擎health报告version=0.8.8、protocol=1。公网额外复核见output/deploy-closed-kong-20260927/public-verification.json。

生产发行及审计目录：`/opt/jinling-mahjong/releases/0.8.8-closed-kong-20260927`，包含before.sqlite热备份、私密Compose/env备份、candidate-tested、tests.log、typecheck.log、manifest-check.log、activation.json、activated、data-verified.json、status-after.json。
客户端：0.8.8/Build85，桌面“金陵麻将 0.8.8 安装包”；APK正式签名，IPA未签名。旧客户端听牌提示不会因服务端部署自动更新，需要安装新包；已在玩的旧版本桌须等整桌结束后使用新规则。
