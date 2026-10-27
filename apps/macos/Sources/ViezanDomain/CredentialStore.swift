import Foundation
import Security

public enum CredentialFailure: Error { case invalidProvider, invalidSecret, unavailable }
public enum CredentialStore {
    private static let service = "com.viezan.native.providers"
    public static let providers = ["openai", "claude", "gemini", "groq", "tavily", "brave", "jina", "elevenlabs"]
    private static func query(_ provider: String) throws -> [String: Any] {
        guard providers.contains(provider) else { throw CredentialFailure.invalidProvider }
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                kSecAttrAccount as String: provider, kSecAttrSynchronizable as String: false]
    }
    public static func save(_ secret: String, provider: String) throws {
        guard !secret.isEmpty, secret.utf8.count <= 4096,
              !secret.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { throw CredentialFailure.invalidSecret }
        let query = try query(provider)
        let attributes: [String: Any] = [kSecValueData as String: Data(secret.utf8)]
        let update = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if update == errSecItemNotFound {
            var entry = query.merging(attributes) { _, new in new }
            entry[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { throw CredentialFailure.unavailable }
        } else if update != errSecSuccess { throw CredentialFailure.unavailable }
    }
    // Internal only: views can inspect presence, never retrieve existing key material.
    static func read(_ provider: String) throws -> String {
        var query = try query(provider)
        query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data, let secret = String(data: data, encoding: .utf8), !secret.isEmpty else { throw CredentialFailure.unavailable }
        return secret
    }
    public static func has(_ provider: String) -> Bool {
        guard var query = try? query(provider) else { return false }
        query[kSecReturnAttributes as String] = true
        query[kSecUseAuthenticationUI as String] = kSecUseAuthenticationUIFail
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }
    public static func remove(_ provider: String) throws {
        let status = SecItemDelete(try query(provider) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw CredentialFailure.unavailable }
    }
}
