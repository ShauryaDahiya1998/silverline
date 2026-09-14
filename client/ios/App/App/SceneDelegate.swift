import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // MainViewController (not the plain CAPBridgeViewController) — its
        // capacitorDidLoad() override is what registers PasskeyPlugin (see
        // that file's own header comment). Using the base class here meant
        // that override never ran, so PasskeyPlugin's JS header was never
        // injected into Capacitor.PluginHeaders, producing "PasskeyPlugin
        // not implemented on iOS" regardless of Main.storyboard/module-name
        // fixes, since this code path never consulted the storyboard at all.
        window?.rootViewController = MainViewController()
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
