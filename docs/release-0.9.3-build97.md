# 0.9.3 / Build97

2026-10-01，用户追加要求版本号递增、清理之前安装包。以当前工作区源码重新构建，版本从0.9.2升至0.9.3，构建号97。package/package-lock、Android、iOS均已同步；保留所有本地改动，未修改业务规则。

产物目录：`output/release-0.9.3-build97/`。桌面副本：`/Users/kk/Desktop/金陵麻将 0.9.3 Build97 安装包/`。

- APK：`jinling-mahjong-0.9.3-build97.apk`，正式签名，143565228字节；SHA256 `436fedf758af30a5c0bfa9e1af80d5dedbdafc61c40678d7614ab3146e6fdc0a`。
- IPA：`unsign-0.9.3-build97.ipa`，未签名iPhoneOS包，143456606字节；SHA256 `182f8237071b6cee06392894c16cf0e84c810b924940af9f97c80749077ab63a`。需上传超级签后台完成签名，不能直接安装。

验证：TypeScript、Cocos资源完整性、Android Release、iOS archive通过；APK证书与原正式证书一致、zipalign通过；373份网页资源与dist逐项一致；双端版本/生产配置、敏感文件排查、ZIP完整性、桌面副本哈希一致性通过。Chromium/WebKit兼容测试4/4通过。完整测试日志与资源清单保留在产物目录。未进行最低系统真机或超级签真机安装验收。

旧包清理：项目常规发布目录和桌面金陵麻将目录共83个旧APK/IPA、11810184247字节，含临时生成的Build96，已移至`/Users/kk/.Trash/金陵麻将旧安装包-20261001-build97/`，保留恢复清单。没有清空废纸篓，因此不声明释放了磁盘空间。保留源代码、证书、构建归档、测试材料、生产备份、服务器发布包以及其他项目的包。

没有上传、发布、部署、更改强制更新策略或push。此前战绩读取慢本次未新增修复，重新打包不代表已解决该问题。
