import Foundation
import Testing
@testable import ViezanDomain

private struct SignatureFixture: Decodable { let publicKey: String; let manifest: String; let signature: String; let releaseSignature: String }

@Test func updatesAcceptOnlyAManifestSignedByTheUpdateKey() throws {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../contracts/native-workbench/update-signature-fixture.json")
    let fixture = try JSONDecoder().decode(SignatureFixture.self, from: Data(contentsOf: url))
    let manifest = Data(fixture.manifest.utf8), signature = Data(fixture.signature.utf8)
    #expect(NativeUpdates.signed(manifest, signature: signature, key: fixture.publicKey))
    #expect(NativeUpdates.signed(manifest, signature: Data((fixture.signature + "\n").utf8), key: fixture.publicKey))
    #expect(!NativeUpdates.signed(Data(fixture.manifest.replacingOccurrences(of: "9.9.9", with: "9.9.8").utf8), signature: signature, key: fixture.publicKey))
    #expect(!NativeUpdates.signed(manifest, signature: Data(String(fixture.signature.reversed()).utf8), key: fixture.publicKey))
    #expect(!NativeUpdates.signed(manifest, signature: Data(), key: fixture.publicKey))
    #expect(!NativeUpdates.signed(manifest, signature: signature, key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="))
    #expect(!NativeUpdates.signed(manifest, signature: signature, key: ""))
    // The key the app ships with accepts a release signature and nothing signed by another key.
    #expect(NativeUpdates.signed(manifest, signature: Data(fixture.releaseSignature.utf8)))
    #expect(!NativeUpdates.signed(manifest, signature: signature))
}
