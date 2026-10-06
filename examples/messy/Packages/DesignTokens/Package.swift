// swift-tools-version: 5.9
// Colors, type and spacing of Copperleaf Orders, with no dependency of its own.
import PackageDescription

let package = Package(
    name: "DesignTokens",
    products: [
        .library(name: "DesignTokens", targets: ["DesignTokens"])
    ],
    targets: [
        .target(name: "DesignTokens")
    ]
)
