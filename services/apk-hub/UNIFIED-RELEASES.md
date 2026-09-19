# 金陵麻将固定分发入口

固定入口：`https://212.189.31.46/app/jinling-mahjong`。Android、iPhone/iPad共用此链接，页面按设备选择平台，也可以手动切换。iPad桌面浏览器模式同样识别为iOS。微信/QQ内嵌浏览器提示使用系统浏览器；iOS沿用HTTPS manifest与itms-services安装方式。

Android网页交给浏览器下载APK，浏览器和系统决定能否弹出安装界面；否则用户需点下载通知/列表里的文件。网页无法承诺下载结束后自动安装或代替系统确认。

后台上传包名/应用标识为 `com.jinling.mahjong` 的新包时，自动替换该平台当前包，保留应用ID、固定链接、发布/仅链接状态、描述和累计下载请求数。Android和iOS独立替换。全新平台首次上传仍为草稿，需要启用；既有已启用平台上传成功即可生效。其他应用保留原有上传草稿行为。

服务先接收完整包并解析，之后在SQLite事务中切换当前文件。文件按内容哈希命名，不原地覆盖正在下载的字节；切换成功后删除旧包及旧图标。失败不删除原包，清理失败的文件进入待清理队列，在后续上传/启动时重试。下载使用强ETag，旧If-Range续传会改为完整新文件，避免拼接两个版本。

一次性整理旧版本调用：

```python
import server
server.consolidate_jinling()
```

它为两平台保留已绑定版本，首次按已发布优先、构建号和上传时间选择。旧记录转为别名，旧分发页跳转固定入口，旧下载和iOS清单链接仍可取得当前包。只删除金陵麻将的重复记录及文件，其他应用不变。正式执行前备份数据库，并在数据副本验证选择结果。

后续发布请使用后台 `/api/upload` 或 `server.install_release(metadata, staging_package, staging_icon, values)`，不要直接INSERT新应用记录：数据库对金陵同平台设有唯一约束。`GET /api/products/jinling-mahjong`仅返回已启用平台。

测试：

```sh
python3 services/apk-hub/tests/test_unified_release.py
python3 services/apk-hub/tests/test_delete.py
```

需要Python3.11/3.12和Pillow，与容器依赖一致。测试使用临时数据和本地随机端口，覆盖替换、并发、失败回滚、删除、旧链接、续传和正在下载时更新。

## 点击尝试打开 Safari

iPhone/iPad在微信或QQ中打开固定链接时，会显示“尝试用 Safari 打开”。点击通过系统注册的 `x-safari-https` URL scheme尝试打开当前站点的固定页面，不在加载时自动触发，不接受外部跳转地址。普通Safari和安卓不显示此按钮。

微信/QQ和不同iOS版本仍可能拒绝该跳转，因此始终保留右上角菜单与复制链接指引。按钮显示备用提示，不声称已经成功唤起Safari。已核对本机iOS26.5 Safari注册该scheme；浏览器检查验证触发与备用流程，不等同于微信真机放行验收。
