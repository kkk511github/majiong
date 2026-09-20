# 服务器续费提醒

`scripts/server-renewal-reminder.py` 使用 Python 3 标准库，供 systemd 每天北京时间 09:00 唤起一次。以 2026-09-18 为基准每隔 20 天发送，首个实际发送日为 **2026-10-08**，随后为 **10-28、11-17**。不补发 9 月 18 日提醒。若服务器错过运行时间，恢复后只补最近一期，不连续补多条历史提醒。

只向现有麻将统计 Telegram 群发送这一句：

> 服务器即将到期，请及时续费

到期且本期尚未处理时，脚本才读取私有环境变量 `TELEGRAM_RENEWAL_CHAT_ID`。该值必须是规范格式的负数 Telegram 群 ID，不应写入代码、文档或公开配置。脚本随后读取现有 `TELEGRAM_REPORT_CONFIG` 和 `TELEGRAM_BOT_TOKEN_FILE` 环境变量对应的文件，也可通过 `--config`、`--token-file` 传路径；报表配置中的顶层 `chatId` 以及所有嵌套 `chatId`/`chat_id` 必须唯一一致且等于这个私有值。缺失或非法收件人、重复 JSON 键、其他群或不一致的收件人均拒绝发送，且不会读取 token 或联网。脚本不会复制或输出收件人或 token。

```sh
# 纯只读检查：无需配置收件人，不读配置或 token，不发送，也不创建锁或发送状态。
python3 scripts/server-renewal-reminder.py --check

# 离线测试：全部网络、时间和路径均使用临时文件或 mock。
python3 -m unittest discover -s tests -p 'test_server_renewal_reminder.py' -v
```

部署时，systemd oneshot service 通过私有环境配置提供 `TELEGRAM_RENEWAL_CHAT_ID`，并复用现有 config/token 的绝对路径，通过环境变量传入后执行已安装的脚本。包含群 ID 的环境配置应限制为仅管理员可读，不能提交到仓库。timer 使用 `OnCalendar=*-*-* 09:00:00 Asia/Shanghai`、`Persistent=true`；可设置 `AccuracySec=1s`。不要为核验发送测试消息，安装后仅执行 `--check` 和只读配置收件人检查。

默认状态路径为 `/opt/jinling-mahjong/maintenance/server-renewal-reminder/state/deliveries.json`，可用 `--state` 指定。部署应预建独立私有目录（0700）。JSON 和文件锁权限均为 0600；文件锁覆盖整个发送流程，状态经临时文件、刷盘、原子替换和目录刷盘保存。

每一期日期只尝试发送一次。发送前先持久保存 `sending`，成功后保存 `sent` 和 Telegram 消息号。超时、连接错误或响应无法确认时保存 `uncertain`；进程异常中断留下的 `sending` 会转为 `uncertain`，均不会自动重发。Telegram 明确拒绝则记录 `rejected`，同样不自动重发。发出请求后若写状态失败，已保存的 `sending` 仍可阻止重复发送。人工处置前必须先核对群里是否已有该条消息，不能直接删除发送记录。

首次未到期、已有本期记录或另一个实例持锁时退出码为 0，不读取 token、不发送请求。成功发送退出码为 0；未知结果、拒绝或本地验证失败退出码为 1。输出只包含计划日期、状态及已确认的消息号；网络异常的原始信息和含 token 的 URL 不会写入 stderr 或状态。

## 部署记录

2026-09-20 已在 `212.189.31.46` 安装并启用 `server-renewal-reminder.timer`，处于 `active/waiting`，每天 `01:00 UTC`（北京时间 09:00）检查，`Persistent=yes`。服务器安装目录为 `/opt/jinling-mahjong/maintenance/server-renewal-reminder`。

只读校验确认目标为现有“麻将统计”群、首次实际提醒为 2026-10-08 09:00。部署没有启动发送 service、没有创建发送状态、没有读取或复制 token，也没有发送测试消息。当前版本 15 项离线测试通过。部署证据见 `output/server-renewal-reminder-20260920/deployment-complete.json`。
