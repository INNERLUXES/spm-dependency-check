// swift-tools-version: 5.9
// A checkout that SwiftPM put under .build; the tool never reads this folder.
import PackageDescription

let package = Package(
    name: "NetKit",
    dependencies: [
        .package(url: "http://code.example.test/kestrel-labs/socketkit.git", branch: "main")
    ],
    targets: [
        .target(name: "NetKit", dependencies: [.product(name: "SocketKit", package: "socketkit")])
    ]
)
