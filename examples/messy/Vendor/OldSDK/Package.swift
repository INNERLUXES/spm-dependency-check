// swift-tools-version: 5.7
// A copy of a payment SDK kept for reference; ../../config.json leaves Vendor/ out of the review.
import PackageDescription

let package = Package(
    name: "OldSDK",
    dependencies: [
        .package(url: "ssh://code.example.test/payments/old-sdk-core.git", branch: "master")
    ],
    targets: [
        .target(name: "OldSDK", dependencies: [.product(name: "OldSDKCore", package: "old-sdk-core")])
    ]
)
