import UIKit
import Capacitor
import CryptoKit
import Security

/// Validate normal system trust and the independently pinned server key.
/// The certificate may renew; its key must be retained or rotated to the backup pin.
@objc(MahjongTrustPlugin)
final class MahjongTrustPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "MahjongTrustPlugin"
    let jsName = "MahjongTrust"
    let pluginMethods: [CAPPluginMethod] = []
    private let pins: Set<String> = [
        "0r4Pzsa3t/R8xk3xj2soZuk3yEmLPsPB+0akbI8jwYE=",
        "dfm3bK4EvX/RSw9BIqLe/NtrFl7IuV4EMshqVxWX0kA="
    ]
    override func handleWKWebViewURLAuthenticationChallenge(_ challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) -> Bool {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else { return false }
        guard challenge.protectionSpace.host == "212.189.31.194",
              let trust = challenge.protectionSpace.serverTrust,
              SecTrustEvaluateWithError(trust, nil),
              let key = SecTrustCopyKey(trust),
              let bytes = SecKeyCopyExternalRepresentation(key, nil) as Data?,
              bytes.count == 65 else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return true
        }
        // ASN.1 SubjectPublicKeyInfo prefix for the server's prime256v1 EC public key.
        let prefix: [UInt8] = [0x30,0x59,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x03,0x42,0x00]
        let digest = Data(SHA256.hash(data: Data(prefix) + bytes)).base64EncodedString()
        guard pins.contains(digest) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return true
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
        return true
    }
}

final class MahjongBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MahjongTrustPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MahjongBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
