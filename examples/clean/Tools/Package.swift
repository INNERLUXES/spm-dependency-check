// swift-tools-version: 5.9
// A small command-line tool of the repository that checks the note templates before a release.
import PackageDescription

let package = Package(
    name: "NotesLint",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://code.example.test/orbit-ui/argument-kit.git", .upToNextMinor(from: "1.2.0"))
    ],
    targets: [
        .executableTarget(
            name: "notes-lint",
            dependencies: [.product(name: "ArgumentKit", package: "argument-kit")]
        )
    ]
)
