// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ViezanNative",
    platforms: [.macOS(.v15)],
    products: [.executable(name: "ViezanNative", targets: ["ViezanNative"])],
    targets: [
        .target(name: "ViezanDomain", resources: [.process("Resources")]),
        .executableTarget(name: "ViezanNative", dependencies: ["ViezanDomain"]),
        .testTarget(name: "ViezanDomainTests", dependencies: ["ViezanDomain"]),
        .testTarget(name: "ViezanNativeTests", dependencies: ["ViezanNative"]),
    ]
)
