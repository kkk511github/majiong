import UIKit
import Capacitor

/// Installation remains a system/Safari operation; opening the page is not success.
@objc(AppUpdatePlugin)
final class AppUpdatePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AppUpdatePlugin"
    let jsName = "AppUpdate"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openInstallPage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProgress", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    @objc func getInfo(_ call: CAPPluginCall) {
        call.resolve([
            "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
            "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "",
            "packageName": Bundle.main.bundleIdentifier ?? "",
            "osVersion": UIDevice.current.systemVersion
        ])
    }
    @objc func openInstallPage(_ call: CAPPluginCall) {
        guard let url = URL(string: "https://212.189.31.46/app/jinling-mahjong?platform=ios") else { call.reject("安装页面地址无效"); return }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve(["status": "page-opened"]) }
                else { call.reject("无法打开安装页面，请稍后重试") }
            }
        }
    }
    @objc func getProgress(_ call: CAPPluginCall) { call.resolve(["status": "idle", "received": 0, "total": 0, "percent": 0]) }
    @objc func cancel(_ call: CAPPluginCall) { call.resolve() }
}
