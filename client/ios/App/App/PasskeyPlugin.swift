import Foundation
import Capacitor
import AuthenticationServices

// Bridges the server's existing WebAuthn implementation (server/routes/
// webauthn.js + server/utils/webauthn.js — the same code the browser/web
// version already uses) to iOS's native platform passkey system, so Face
// ID/Touch ID works inside the app even though it's loaded from a locally
// bundled build (see client/capacitor.config.json — no "server" block,
// so the WKWebView's own origin is never remar-app-pq0s.onrender.com and
// plain browser navigator.credentials can't be used here).
//
// This only works once:
//   1. WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN are set on Render to the real
//      hostname (see server/routes/webauthn.js).
//   2. The "Associated Domains" capability is added to this target in
//      Xcode (Signing & Capabilities) with entry
//      "webcredentials:remar-app-pq0s.onrender.com" — see App.entitlements.
//   3. https://remar-app-pq0s.onrender.com/.well-known/apple-app-site-association
//      is reachable (see server/index.js) and lists this app's Team ID +
//      bundle ID.
// Steps 2/3 are what let iOS treat a passkey created here as belonging to
// that same web origin, even though the ceremony itself runs natively —
// the resulting attestationObject/clientDataJSON are byte-for-byte the
// same WebAuthn structures a browser would produce, with clientDataJSON's
// "origin" field set by iOS to "https://remar-app-pq0s.onrender.com" (not
// some app-specific scheme), which is exactly what the server's
// checkClientData() already expects — no server code needed changing.
@objc(PasskeyPlugin)
public class PasskeyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PasskeyPlugin"
    public let jsName = "PasskeyPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            call.resolve(["value": true])
        } else {
            call.resolve(["value": false])
        }
    }

    // Matches POST /webauthn/register/options' response shape: challenge
    // (base64url), rp.id, user.id (base64url), user.name/displayName.
    @objc func register(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("Passkeys require iOS 16 or later")
            return
        }
        guard
            let challengeB64 = call.getString("challenge"),
            let rpId = call.getString("rpId"),
            let userIdB64 = call.getString("userId"),
            let userName = call.getString("userName"),
            let challenge = Data(base64URLEncoded: challengeB64),
            let userId = Data(base64URLEncoded: userIdB64)
        else {
            call.reject("Missing or malformed registration parameters")
            return
        }
        let displayName = call.getString("userDisplayName") ?? userName

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: userName, userID: userId)
        request.displayName = displayName

        pendingCall = call
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    // Matches POST /webauthn/login/options' response shape: challenge
    // (base64url), rpId. allowCredentials is intentionally not threaded
    // through — the passwordless/discoverable-credential flow (see
    // register/options' residentKey: 'required') is what login/options
    // already returns by default, and ASAuthorization's own system UI
    // handles "which passkey" the same way Safari's does.
    @objc func authenticate(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("Passkeys require iOS 16 or later")
            return
        }
        guard
            let challengeB64 = call.getString("challenge"),
            let rpId = call.getString("rpId"),
            let challenge = Data(base64URLEncoded: challengeB64)
        else {
            call.reject("Missing or malformed authentication parameters")
            return
        }

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)

        pendingCall = call
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }
}

@available(iOS 16.0, *)
extension PasskeyPlugin: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    // Resolves the payload shape POST /webauthn/register/verify and POST
    // /webauthn/login/verify each expect — identical field names to what
    // client/src/utils/webauthn.js's browser branch already builds from
    // navigator.credentials, so server/routes/webauthn.js needs no changes
    // to accept either source.
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil

        if let reg = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
            call.resolve([
                "rawId": reg.credentialID.base64URLEncodedString(),
                "attestationObject": reg.rawAttestationObject?.base64URLEncodedString() ?? "",
                "clientDataJSON": reg.rawClientDataJSON.base64URLEncodedString()
            ])
        } else if let assertion = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
            call.resolve([
                "rawId": assertion.credentialID.base64URLEncodedString(),
                "authenticatorData": assertion.rawAuthenticatorData.base64URLEncodedString(),
                "clientDataJSON": assertion.rawClientDataJSON.base64URLEncodedString(),
                "signature": assertion.signature.base64URLEncodedString(),
                "userHandle": assertion.userID.base64URLEncodedString()
            ])
        } else {
            call.reject("Unexpected credential type returned by the system")
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let call = pendingCall
        pendingCall = nil
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call?.reject("cancelled", "cancelled", error)
        } else {
            call?.reject(error.localizedDescription, nil, error)
        }
    }
}

// Foundation's Data(base64Encoded:) only understands standard base64 —
// WebAuthn (and this app's own client/server payloads) uses base64url
// throughout, so these mirror client/src/utils/webauthn.js's
// base64urlToBuffer/bufferToBase64url on the Swift side.
private extension Data {
    init?(base64URLEncoded input: String) {
        var base64 = input.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        self.init(base64Encoded: base64)
    }

    func base64URLEncodedString() -> String {
        return base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
