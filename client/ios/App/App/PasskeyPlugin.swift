import Foundation
import Capacitor
import LocalAuthentication
import Security
import CryptoKit

// Local Keychain / Secure Enclave-backed Face ID / Touch ID sign-in.
//
// This does NOT use Apple's system Passkey UI (ASAuthorizationPlatform-
// PublicKeyCredentialProvider) — that requires the "Associated Domains"
// capability, which Apple restricts to paid Apple Developer Program
// accounts (personal/free teams get an explicit build error). Instead,
// this plugin builds its own minimal WebAuthn-*shaped* credential
// entirely on-device: a real ECDSA P-256 key pair generated in the
// device's Secure Enclave (falling back to a software-backed key if SE
// isn't available, e.g. the Simulator), with the private key gated by
// `biometryCurrentSet` access control — so Face ID/Touch ID is the only
// way to ever use it, enforced by iOS itself, not by this app's own code.
//
// The attestationObject/authenticatorData/clientDataJSON/signature this
// produces are byte-for-byte the same structures a real WebAuthn ceremony
// produces (see server/utils/webauthn.js's decodeCbor/parseAuthenticatorData
// and server/routes/webauthn.js's checkClientData/verifyAssertionSignature)
// — so the existing server code needs zero changes and treats this
// exactly like a browser-originated credential. The one thing that is
// NOT cryptographically real here is clientDataJSON's "origin" field:
// since there's no actual web page this ceremony is happening on, it's
// just set to a constant string matching WEBAUTHN_ORIGIN so the server's
// origin check passes. That's fine — the actual security boundary (the
// private key never leaving Secure Enclave, unusable without Face ID/
// Touch ID) is fully real and enforced by iOS, not by that string.
//
// One credential per device: registering replaces any previous one (see
// EditHelperProfile.jsx/EditBeneficiaryProfile.jsx, which re-captures on
// every "enable" toggle) and the device remembers which account it
// belongs to (defaultsUserIdKey) so the passwordless Login-page flow
// (see client/src/utils/webauthn.js's getAssertion) doesn't need to ask
// which account first — same UX the real WebAuthn passwordless flow was
// designed around (server/routes/webauthn.js's login/options).
@objc(PasskeyPlugin)
public class PasskeyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PasskeyPlugin"
    public let jsName = "PasskeyPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeCredential", returnType: CAPPluginReturnPromise)
    ]

    private let keyTag = "ch.remarschweizverein.app.passkeyKey".data(using: .utf8)!
    private let defaultsUserIdKey = "ch.remarschweizverein.app.passkeyUserId"
    private let defaultsCredentialIdKey = "ch.remarschweizverein.app.passkeyCredentialId"

    @objc func isAvailable(_ call: CAPPluginCall) {
        var error: NSError?
        let available = LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        call.resolve(["value": available])
    }

    // Capacitor dispatches plugin call methods on a background bridge
    // queue, not the main thread. Keychain operations that carry
    // kSecUseAuthenticationContext (i.e. that can trigger the Face ID/
    // Touch ID system UI) must run on the main thread or iOS silently
    // cancels the authentication request (LAError.userCancel / errSecUser-
    // Canceled) without ever showing the prompt — which is exactly the
    // "was cancelled" symptom. Route the actual Keychain/biometric work
    // through here from register()/authenticate() below.
    private func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
    }

    // Matches POST /webauthn/register/options' response shape: challenge
    // (base64url), rp.id, user.id (base64url), user.name/displayName —
    // displayName/name aren't actually used in the credential we build
    // (no system UI shows them here), only user.id, which is remembered
    // locally so authenticate() below can report it back as userHandle.
    @objc func register(_ call: CAPPluginCall) {
        guard
            let challengeB64 = call.getString("challenge"),
            let rpId = call.getString("rpId"),
            let userIdB64 = call.getString("userId")
        else {
            call.reject("Missing registration parameters")
            return
        }

        onMain {
            do {
                let credentialId = self.randomBytes(16)
                let publicKeyBytes = try self.createReplacementKeyPair()
                let authData = self.buildAuthenticatorData(rpId: rpId, flags: 0x45, credentialId: credentialId, publicKeyBytes: publicKeyBytes)
                let attestationObject = self.buildAttestationObject(authData: authData)
                let clientDataJSON = self.buildClientDataJSON(type: "webauthn.create", challengeB64: challengeB64, rpId: rpId)

                UserDefaults.standard.set(userIdB64, forKey: self.defaultsUserIdKey)
                UserDefaults.standard.set(credentialId.base64URLEncodedString(), forKey: self.defaultsCredentialIdKey)

                call.resolve([
                    "rawId": credentialId.base64URLEncodedString(),
                    "attestationObject": attestationObject.base64URLEncodedString(),
                    "clientDataJSON": clientDataJSON.base64URLEncodedString()
                ])
            } catch {
                call.reject("Could not set up Face ID / Fingerprint: \(error.localizedDescription)", nil, error)
            }
        }
    }

    // Matches POST /webauthn/login/options' response shape: challenge
    // (base64url), rpId. No allowCredentials/userId needed from the
    // caller — this device only ever has one enrolled credential, and it
    // already remembers which account it belongs to (see register above).
    @objc func authenticate(_ call: CAPPluginCall) {
        guard
            let challengeB64 = call.getString("challenge"),
            let rpId = call.getString("rpId")
        else {
            call.reject("Missing authentication parameters")
            return
        }
        guard
            let credentialIdB64 = UserDefaults.standard.string(forKey: defaultsCredentialIdKey),
            let userIdB64 = UserDefaults.standard.string(forKey: defaultsUserIdKey)
        else {
            call.reject("No Face ID / Fingerprint set up on this device yet")
            return
        }

        onMain {
            let context = LAContext()
            context.localizedReason = "Sign in to Remar"

            let clientDataJSON = self.buildClientDataJSON(type: "webauthn.get", challengeB64: challengeB64, rpId: rpId)
            let clientDataHash = Data(SHA256.hash(data: clientDataJSON))
            let authData = self.buildAuthenticatorData(rpId: rpId, flags: 0x05, credentialId: nil, publicKeyBytes: nil)
            let signedData = authData + clientDataHash

            do {
                let signature = try self.sign(data: signedData, context: context)
                call.resolve([
                    "rawId": credentialIdB64,
                    "authenticatorData": authData.base64URLEncodedString(),
                    "clientDataJSON": clientDataJSON.base64URLEncodedString(),
                    "signature": signature.base64URLEncodedString(),
                    "userHandle": userIdB64
                ])
            } catch {
                call.reject("Face ID / Fingerprint sign-in failed or was cancelled", nil, error)
            }
        }
    }

    // Called from EditHelperProfile.jsx/EditBeneficiaryProfile.jsx's
    // disable-toggle path (see client/src/utils/webauthn.js's
    // removeCredential), alongside the existing DELETE
    // /webauthn/credentials/:type call — clears the on-device key so a
    // disabled toggle doesn't leave an orphaned Secure Enclave credential
    // (and a confusing "Unrecognized credential" error) behind.
    @objc func removeCredential(_ call: CAPPluginCall) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: keyTag,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate
        ]
        SecItemDelete(query as CFDictionary)
        UserDefaults.standard.removeObject(forKey: defaultsUserIdKey)
        UserDefaults.standard.removeObject(forKey: defaultsCredentialIdKey)
        call.resolve()
    }

    // MARK: - Key management

    private func createReplacementKeyPair() throws -> Data {
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: keyTag,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            nil
        ) else {
            throw PasskeyError.generic("Could not create Keychain access control")
        }

        var attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: keyTag,
                kSecAttrAccessControl as String: access
            ]
        ]
        // Secure Enclave only exists on real devices, not the Simulator —
        // try it first, then fall back to a software-backed key (still
        // gated by the same biometryCurrentSet access control above) so
        // this doesn't hard-fail there.
        attributes[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave

        var error: Unmanaged<CFError>?
        var privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error)
        if privateKey == nil {
            attributes.removeValue(forKey: kSecAttrTokenID as String)
            error = nil
            privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error)
        }
        guard let key = privateKey else {
            throw (error?.takeRetainedValue() as Error?) ?? PasskeyError.generic("Key generation failed")
        }
        guard let publicKey = SecKeyCopyPublicKey(key) else {
            throw PasskeyError.generic("Could not derive public key")
        }
        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            throw (error?.takeRetainedValue() as Error?) ?? PasskeyError.generic("Could not export public key")
        }
        // Uncompressed EC point: 0x04 || X(32) || Y(32) — SecKey's own
        // external representation for kSecAttrKeyTypeECSECPrimeRandom.
        return publicKeyData
    }

    private func sign(data: Data, context: LAContext) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: keyTag,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
            kSecReturnRef as String: true,
            kSecUseAuthenticationContext as String: context
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else {
            throw PasskeyError.generic("Face ID / Fingerprint key not found or authentication failed (status \(status))")
        }
        let secKey = item as! SecKey // swiftlint:disable:this force_cast
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(secKey, .ecdsaSignatureMessageX962SHA256, data as CFData, &error) as Data? else {
            throw (error?.takeRetainedValue() as Error?) ?? PasskeyError.generic("Signing failed")
        }
        return signature
    }

    // MARK: - WebAuthn-shaped structure building
    // Every byte layout below mirrors server/utils/webauthn.js's
    // decodeCbor / parseAuthenticatorData / parseAttestationObject exactly
    // — see that file for the authoritative format being matched.

    private func buildClientDataJSON(type: String, challengeB64: String, rpId: String) -> Data {
        let origin = "https://\(rpId)"
        let dict: [String: Any] = ["type": type, "challenge": challengeB64, "origin": origin]
        return (try? JSONSerialization.data(withJSONObject: dict)) ?? Data()
    }

    // flags: 0x45 (UP+UV+AT) for registration (includes attested credential
    // data), 0x05 (UP+UV only) for a login assertion.
    private func buildAuthenticatorData(rpId: String, flags: UInt8, credentialId: Data?, publicKeyBytes: Data?) -> Data {
        var data = Data()
        data.append(Data(SHA256.hash(data: Data(rpId.utf8))))
        data.append(flags)
        data.append(contentsOf: [0, 0, 0, 0]) // signCount = 0, always — see webauthn.js's replay-check comment: a counter that never increases from 0 is spec-valid, not treated as a clone.
        if let credentialId = credentialId, let publicKeyBytes = publicKeyBytes {
            data.append(Data(repeating: 0, count: 16)) // aaguid — none assigned
            var credIdLen = UInt16(credentialId.count).bigEndian
            data.append(Data(bytes: &credIdLen, count: 2))
            data.append(credentialId)
            data.append(coseKey(fromUncompressedPoint: publicKeyBytes))
        }
        return data
    }

    // CBOR map {"fmt":"none","attStmt":{},"authData":<bytes>} — matches
    // parseAttestationObject(), which only actually reads the "authData"
    // key, but this keeps the full spec shape for future-proofing.
    private func buildAttestationObject(authData: Data) -> Data {
        var out = Data([0xA3]) // map, 3 entries
        out.append(cborTextString("fmt"))
        out.append(cborTextString("none"))
        out.append(cborTextString("attStmt"))
        out.append(Data([0xA0])) // empty map
        out.append(cborTextString("authData"))
        out.append(cborByteString(authData))
        return out
    }

    // Uncompressed EC point (0x04||X||Y, 65 bytes for P-256) -> COSE EC2
    // key CBOR map matching server's coseKeyToJwk():
    // {1:2 (kty=EC2), 3:-7 (alg=ES256), -1:1 (crv=P-256), -2:X, -3:Y}.
    private func coseKey(fromUncompressedPoint point: Data) -> Data {
        let x = point.subdata(in: 1..<33)
        let y = point.subdata(in: 33..<65)
        var out = Data([0xA5]) // map, 5 entries
        out.append(Data([0x01, 0x02])) // key 1 (kty)  : value 2 (EC2)
        out.append(Data([0x03, 0x26])) // key 3 (alg)  : value -7 (ES256)   [-1-6=-7]
        out.append(Data([0x20, 0x01])) // key -1 (crv) : value 1 (P-256)   [-1-0=-1]
        out.append(Data([0x21]))       // key -2 (x)                      [-1-1=-2]
        out.append(cborByteString(x))
        out.append(Data([0x22]))       // key -3 (y)                      [-1-2=-3]
        out.append(cborByteString(y))
        return out
    }

    private func cborTextString(_ s: String) -> Data {
        return cborLengthPrefixed(majorType: 3, bytes: Data(s.utf8))
    }

    private func cborByteString(_ bytes: Data) -> Data {
        return cborLengthPrefixed(majorType: 2, bytes: bytes)
    }

    private func cborLengthPrefixed(majorType: UInt8, bytes: Data) -> Data {
        var out = Data()
        let len = bytes.count
        let major = majorType << 5
        if len < 24 {
            out.append(major | UInt8(len))
        } else if len < 256 {
            out.append(major | 24)
            out.append(UInt8(len))
        } else {
            out.append(major | 25)
            var len16 = UInt16(len).bigEndian
            out.append(Data(bytes: &len16, count: 2))
        }
        out.append(bytes)
        return out
    }

    private func randomBytes(_ count: Int) -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes)
    }
}

private enum PasskeyError: Error, LocalizedError {
    case generic(String)
    var errorDescription: String? {
        switch self {
        case .generic(let msg): return msg
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
