# 网络波动排查与针对性优化（2026-09-26）

## 证据及结论边界

- 黄色“网络波动”只在connected且ready时显示；平滑RTT≥600ms、尚未解除的心跳超时观察、或最近回复超过45秒均可触发。它不是服务器拒绝出牌的提示，也不直接改变计分。
- 20:04:56（北京时间）Caddy发生配置重载；已收到的两台不同平台客户端日志在同一秒记录socket-close 1001后重新连接。主服务、网关容器均未重启，因此仅看RestartCount无法排除配置重载。
- 系统证书定时任务于20:04:53启动。原脚本每6小时检查证书后，无条件执行 `caddy reload --force`；Caddy默认会关闭被卸载配置持有的WebSocket。这是已确认的集中断线来源，不等于所有1006或所有截图黄条都来自它。
- 排查时17条HTTPS连接TCP RTT中位数约192ms，范围约138–290ms；没有≥600ms连接。此为传输层瞬时样本，混有其他HTTPS连接，不等于每个玩家的App端往返耗时，也不能用累计重传数直接推断当时丢包率。
- 主机负载约0.11，可用内存约14GB；主服务无近期异常日志或容器重启。未修改TCP拥塞算法、防火墙或游戏超时参数。

## 已上线：避免无效网关重载

`deploy/renew-ip-certificate.sh`保留原Certbot续证、`--reuse-key`及24小时有效期检查。比较磁盘证书与127.0.0.1:443实际服务证书的SHA-256指纹：

- 指纹相同：跳过reload，不打断WebSocket。
- 指纹不同：实际续证后才reload，并再次核验服务证书。
- 续证、探测或验证失败：明确失败；不以盲目reload掩盖探测失败。reload失败后下次仍可通过指纹差异重试。
- `--check-only`只检查，不续证、不reload，供上线前后核验。

21:02安装至 `/opt/jinling-mahjong/server/renew-ip-certificate.sh`，新文件SHA-256为 `3afbdb2443f5617e36eef9171f96b9abb256be028e571e5659ab3f31bf79e5b5`。

备份：`/opt/jinling-mahjong/maintenance/network-cert-reload-20260926T130237Z/renew-before.sh`。安装前后指纹检查均输出证书相同、跳过reload；四个服务容器ID/启动时间/重启次数保持一致，安装期间没有新网关配置重载日志。没有执行真实续证或网关重载，原定时器排期不变。

真实证书发生变化时仍需加载新证书，因此此项不能宣称今后绝无断线；其目标是消除每天多次对相同配置的无意义强制重载。

## 客户端优化（后续已打入 0.8.4 / Build 81）

- 新连接清空旧连接RTT、平滑值及测量窗口，避免上一条链路的高延迟污染已恢复连接。累计断线/操作超时计数保留，超时恢复仍需3次成功心跳。
- network事件字符串标记为Network，不再将socket-open显示成Error。
- 600ms慢网判定、5秒普通心跳超时、8秒操作确认超时和未确认操作不自动重放的保护均未放宽。

新增证书脚本8项隔离测试，覆盖相同证书、真实变更、失败重试、探测失败和只读检查。实现时全量101文件1391项测试及TypeScript通过；Chromium/WebKit共8项连接恢复回归通过。0.8.3安装包不含本节客户端优化，后续已打入并交付0.8.4 / Build81，见 [安装包记录](release-0.8.4-build81.md)；未上传发布更新。服务端脚本优化无需用户重装。

依据：[Caddy WebSocket重载行为](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming)。
