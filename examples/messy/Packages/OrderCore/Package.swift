// swift-tools-version: 5.9
// The ordering logic of Copperleaf Orders, shared by the app and its widget.
import PackageDescription

let package = Package(
    name: "OrderCore",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "OrderCore", targets: ["OrderCore"])
    ],
    dependencies: [
        .package(url: "https://code.example.test/kestrel-labs/netkit.git", from: "5.0.0"),
        .package(url: "http://code.example.test/kestrel-labs/imagecache.git", from: "2.1.0"),
        .package(url: "https://code.example.test/orbit-ui/keychain-store.git", branch: "develop"),
        .package(
            url: "https://code.example.test/orbit-ui/markdownview.git",
            revision: "4f1c2a9e7b3d5f6a8c0e1b2d3f4a5c6e7b8d9f0a"
        ),
        .package(url: "https://code.example.test/orbit-ui/featureflags.git", "1.0.0"..<"99.0.0"),
        .package(url: "https://code.example.test/old-tools/swift-retry.git", from: "1.4.0"),
        // Tried during a spike and dropped; the reader passes over comments:
        // .package(url: "http://code.example.test/spikes/fastjson.git", branch: "main"),
        /* .package(url: "ssh://code.example.test/spikes/tracing.git", revision: "abc123") */
        .package(path: "../DesignTokens")
    ],
    targets: [
        .target(
            name: "OrderCore",
            dependencies: [
                .product(name: "NetKit", package: "netkit"),
                .product(name: "ImageCache", package: "imagecache"),
                .product(name: "KeychainStore", package: "keychain-store"),
                .product(name: "MarkdownView", package: "markdownview"),
                .product(name: "FeatureFlags", package: "featureflags"),
                .product(name: "Retry", package: "swift-retry"),
                .product(name: "DesignTokens", package: "DesignTokens")
            ]
        ),
        .testTarget(name: "OrderCoreTests", dependencies: ["OrderCore"])
    ]
)
