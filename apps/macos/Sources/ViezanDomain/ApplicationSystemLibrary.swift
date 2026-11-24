import Darwin
import Foundation
import Security

/// A machine-wide item is always an opt-in, direct child of a known Library folder.
struct ApplicationSystemLibraryItem: Codable, Equatable, Sendable {
    let identifier: String
    let folder: String

    private static let directories: Set<String> = [
        "Caches", "Logs", "Application Support", "Saved Application State", "HTTPStorages", "WebKit"
    ]
    private static let plists: Set<String> = ["Preferences", "LaunchAgents", "LaunchDaemons"]
    var launchService: Bool { ["LaunchAgents", "LaunchDaemons", "PrivilegedHelperTools"].contains(folder) }

    static func validIdentifier(_ id: String) -> Bool {
        let lower = id.lowercased()
        return id.utf8.count <= 200 && lower != "com.apple" && lower != "com.viezan" && !lower.hasPrefix("com.apple.") && !lower.hasPrefix("com.viezan.")
            && id.range(of: #"\A[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\z"#, options: .regularExpression) != nil
    }

    func validate(_ path: String, library: String, missing: Bool = false) throws {
        guard Self.validIdentifier(identifier),
              Self.directories.contains(folder) || Self.plists.contains(folder) || folder == "PrivilegedHelperTools"
        else { throw StorageFailure.invalidData }
        let suffix = Self.plists.contains(folder) ? ".plist" : folder == "Saved Application State" ? ".savedState" : ""
        let parent = library + "/" + folder
        guard path == parent + "/" + identifier + suffix, try ApplicationFiles.canonical(parent) == parent else { throw StorageFailure.invalidData }
        var info = stat()
        if missing {
            guard lstat(path, &info) != 0, errno == ENOENT else { throw StorageFailure.invalidData }
        } else {
            guard lstat(path, &info) == 0 else { throw StorageFailure.invalidData }
            let kind = info.st_mode & S_IFMT
            guard kind == S_IFREG || (kind == S_IFDIR && Self.directories.contains(folder)),
                  kind != S_IFREG || info.st_nlink == 1 else { throw StorageFailure.invalidData }
        }
    }

    static func signedIdentity(_ path: String) -> (identifier: String, team: String)? {
        var code: SecStaticCode?, info: CFDictionary?, trustedSigner: SecRequirement?
        guard (try? ApplicationFiles.canonical(path)) == path,
              SecStaticCodeCreateWithPath(URL(fileURLWithPath: path) as CFURL, [], &code) == errSecSuccess, let code,
              SecRequirementCreateWithString("anchor apple generic" as CFString, [], &trustedSigner) == errSecSuccess,
              let trustedSigner, SecStaticCodeCheckValidity(code, [], trustedSigner) == errSecSuccess,
              SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let dict = info as NSDictionary?, let id = dict[kSecCodeInfoIdentifier] as? String,
              let team = dict[kSecCodeInfoTeamIdentifier] as? String, !team.isEmpty else { return nil }
        return (id, team)
    }

    /// Some vendors bundle standalone signed helpers alongside their main executable.
    /// A filename alone, or just a common signing team, does not establish its identity.
    static func embeddedHelpers(_ app: InstalledApplication) -> Set<String> {
        let directory = app.path + "/Contents/MacOS"
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: directory) else { return [] }
        let candidates = files.filter { $0.hasPrefix(app.bundleID + ".") && validIdentifier($0) }
        guard !candidates.isEmpty, let main = signedIdentity(app.path), main.identifier == app.bundleID else { return [] }
        return Set(candidates.filter { name in
            guard let helper = signedIdentity(directory + "/" + name) else { return false }
            return helper.identifier == name && helper.team == main.team
        })
    }

    func serviceBlock(at path: String, app: InstalledApplication, owned: Set<String>, declaredHelpers: Set<String>) -> String? {
        guard launchService else { return nil }
        let program: String
        if folder == "PrivilegedHelperTools" { program = path }
        else {
            guard let plist = ApplicationFiles.declaredInfo(at: URL(fileURLWithPath: path)),
                  plist["Label"] as? String == identifier,
                  let target = (plist["Program"] as? String) ?? (plist["ProgramArguments"] as? [String])?.first,
                  target.hasPrefix("/"), (try? ApplicationFiles.canonical(target)) == target else { return "appProtected" }
            if let association = plist["AssociatedBundleIdentifiers"] {
                let ids = (association as? String).map { [$0] } ?? (association as? [String])
                guard let ids, !ids.isEmpty, ids.allSatisfy(Self.validIdentifier) else { return "appProtected" }
                guard ids.allSatisfy(owned.contains) else { return "appShared" }
            }
            if ApplicationFiles.within(target, app.path) {
                var info = stat()
                guard lstat(target, &info) == 0, info.st_mode & S_IFMT == S_IFREG,
                      FileManager.default.isExecutableFile(atPath: target) else { return "appProtected" }
                return nil
            }
            program = target
        }
        guard declaredHelpers.contains(identifier), let main = Self.signedIdentity(app.path),
              main.identifier == app.bundleID, let helper = Self.signedIdentity(program),
              helper.identifier == identifier, helper.team == main.team else { return "appProtected" }
        return nil
    }
}

/// Machine-wide changes require an exact identifier in the app's namespace. Declarations
/// by a second installed application are evidence of sharing, even across vendor names.
struct ApplicationLibraryOwnership {
    let app: InstalledApplication
    private let helpers: Set<String>
    private let owned: Set<String>
    private let otherIDs: [String]
    private let otherApps: [InstalledApplication]
    private let otherClaims: Set<String>

    init(app: InstalledApplication, declared: ApplicationFiles.DeclaredIdentifiers, inventory: [InstalledApplication], helpers: Set<String>) {
        self.app = app
        self.helpers = helpers
        owned = declared.bundles.union(helpers).filter { $0.hasPrefix(app.bundleID + ".") }.union([app.bundleID])
        otherApps = inventory.filter { $0.path != app.path }
        otherIDs = otherApps.map { $0.bundleID.lowercased() }
        var claimed = Set<String>()
        for other in otherApps {
            let identifiers = ApplicationFiles.declaredIdentifiers(appPath: other.path, bundleID: other.bundleID, includeGroups: false)
            claimed.formUnion(identifiers.bundles.map { $0.lowercased() })
            claimed.formUnion(identifiers.helpers.map { $0.lowercased() })
        }
        otherClaims = claimed
    }

    func block(_ item: ApplicationSystemLibraryItem, at path: String, library: String) -> String? {
        let id = item.identifier.lowercased()
        if otherIDs.contains(where: { $0 == app.bundleID.lowercased() || ApplicationFiles.identifiersOverlap($0, id) })
            || otherClaims.contains(id) { return "appShared" }
        guard owned.contains(item.identifier), (try? item.validate(path, library: library)) != nil else { return "appProtected" }
        if let block = item.serviceBlock(at: path, app: app, owned: owned, declaredHelpers: helpers) { return block }
        if otherApps.contains(where: { FileManager.default.isExecutableFile(atPath: $0.path + "/Contents/MacOS/" + item.identifier) }) {
            return "appShared"
        }
        return app.blocked
    }
}
