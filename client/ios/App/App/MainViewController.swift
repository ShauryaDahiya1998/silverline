import Capacitor
import AppTrackingTransparency

// Registers PasskeyPlugin (client/ios/App/App/PasskeyPlugin.swift) in code,
// instead of via capacitor.config.json's "packageClassList".
//
// Why: that JSON file is a build artifact — `npx cap sync ios` regenerates
// it from scratch every time (see @capacitor/cli's iosplugin.js:
// writePluginJSON()), and its generator only scans installed *npm*
// Capacitor plugins for @objc(...) class names. It has no idea PasskeyPlugin
// exists (it's a local file, not an npm package), so every `cap sync`
// silently drops "PasskeyPlugin" from that list — which is exactly what
// caused the "PasskeyPlugin not implemented in iOS" error after syncing.
//
// registerPluginInstance(_:) (unlike registerPluginType(_:)) isn't gated by
// the config-driven autoRegisterPlugins flag, so calling it here survives
// every future `cap sync` regardless of what's in capacitor.config.json.
//
// This is also the standard Capacitor pattern for registering a plugin
// that isn't installed from npm — see Main.storyboard, whose root view
// controller's custom class now points here instead of directly at
// Capacitor's own CAPBridgeViewController.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PasskeyPlugin())
        requestTrackingAuthorizationIfNeeded()
    }

    // App Tracking Transparency (ATT). Without the user granting this,
    // Facebook's native iOS SDK silently restricts what profile data it
    // hands back from the Graph API — specifically, GET /me omits the
    // email field even when the "email" permission was granted and the
    // access token validates fine. That was the root cause of native
    // Facebook Login failing on-device with "Your Facebook account has no
    // email address available to sign in with" (see server/routes/auth.js's
    // /facebook route) despite working correctly on web. Requesting ATT —
    // regardless of whether the person allows or denies it — is what makes
    // Facebook release the email field again; this app doesn't otherwise
    // use the tracking data itself. A short delay avoids requesting before
    // the window is actually key/visible, which iOS silently no-ops.
    private func requestTrackingAuthorizationIfNeeded() {
        guard #available(iOS 14, *) else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            ATTrackingManager.requestTrackingAuthorization { _ in }
        }
    }
}
