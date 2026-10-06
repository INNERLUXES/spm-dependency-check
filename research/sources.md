# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which parts of the tool lean on it. Nothing here is a copy of a page: read the page itself for its exact
wording. src/data.js holds the pages and the points the reports show, and test/data.test.js checks that every page in
src/data.js is listed here.
Each page was fetched and read before it was listed.

The tool reads Package.swift, Package.resolved and the Xcode project files on disk as text; a clean result is not a
package resolution and not a build, and the tool never says what the latest version of a package is. These notes say
what the pages say so a reader can follow a finding back to its source; they are not advice on how to build any one
app. The pages were chosen with web addresses that hold no number that reads like a year, and the notes name no
release by its date.

Two of the Apple pages and the two pages of the Swift Package Manager documentation are rendered in the browser; their
text was read from the data the page loads (for the Apple pages) and from the source of the documentation in the Swift
Package Manager repository, which is the address given here.

## Swift Package Manager

### Package (Swift Package Manager, PackageDescription API on swift.org)

https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html

The reference of the manifest API, with a section on Package.Dependency. A remote dependency is named with
.package(url:from:), which the page calls the advised way and which takes versions up to the next major version, or
with .upToNextMajor(from:), .upToNextMinor(from:), .exact(_:), a half-open range that leaves out its upper bound and a
closed range that holds it. An exact version is not advised, because it can make the dependency graph conflict. A
dependency can also follow a branch or name a commit; the page says that a package with such a requirement cannot be
used by a package that depends on it by version, and that they are removed before a version is published. A local
dependency, .package(path:), is for a package under development or for packages tied closely together.
`branch-requirement`, `revision-requirement`, `wide-range`, `conflicting-requirement` and `local-package` lean on it.

### Package.Dependency (Apple Developer Documentation, PackageDescription)

https://developer.apple.com/documentation/packagedescription/package/dependency

The same type in the Apple documentation, listing every way to create a dependency: by URL with from:, exact:, a range
or a closed range, a branch or a revision; by registry id with the same version forms; and by path. A dependency is a
Git URL with a requirement, and the result of dependency resolution is recorded in Package.resolved. The manifest reader
of src/swift.js reads these forms, and `insecure-url` and `unreadable-requirement` lean on it.

### Adding dependencies to a Swift package (Swift Package Manager documentation)

https://github.com/swiftlang/swift-package-manager/blob/main/Sources/PackageManagerDocs/Documentation.docc/Dependencies/AddingDependencies.md

How a package adds a dependency: .package with the URL of a Git repository, written with https in the examples, and a
requirement such as from:, which allows any version up to the next major version. Version tags need all three parts of
a semantic version, major, minor and patch; a tag with one or two parts is not read as a version. A local dependency
has no version constraint and uses whatever is at the path. The rule that a version is major.minor.patch, and
`insecure-url` and `local-package`, lean on it.

### Resolving and updating dependencies (Swift Package Manager documentation)

https://github.com/swiftlang/swift-package-manager/blob/main/Sources/PackageManagerDocs/Documentation.docc/ResolvingPackageVersions.md

Package.resolved records the result of dependency resolution at the top of a package, and its versions are used when
that package is the top-level one; they are ignored when the package is a dependency of another. swift package resolve
keeps the versions of the file while they are still eligible, and --force-resolved-versions holds to them;
swift package update moves to the latest eligible versions and writes the file again. Without the file, each person and
each build resolves on its own and a new user starts from the latest eligible versions, so the file is kept in source
control to coordinate versions. `missing-resolved`, `unpinned-dependency`, `stale-pin` and
`resolved-outside-requirement` lean on it.

## Xcode

### Adding package dependencies to your app (Apple Developer Documentation, Xcode)

https://developer.apple.com/documentation/xcode/adding-package-dependencies-to-your-app

How an app adds a package in Xcode. The version rule, up to the next major or minor version, a range or an exact
version, is the advised one, for packages that follow semantic versioning. A branch rule is for packages developed
together that do not publish versions, and a commit rule is not advised and is for exceptional cases, since it brings
no updates. Xcode writes Package.resolved, with the commit each dependency resolves to, under the xcshareddata/swiftpm
folder of the workspace inside the project, and the page says to commit it so that everyone uses the same versions.
`branch-requirement`, `revision-requirement`, `unpinned-dependency` and `missing-resolved` lean on it, and the walk of
src/walk.js looks for Package.resolved in that folder.

### Building Swift packages or apps that use them in continuous integration workflows (Apple Developer Documentation, Xcode)

https://developer.apple.com/documentation/xcode/building-swift-packages-or-apps-that-use-them-in-continuous-integration-workflows

How a CI pipeline builds an app with packages. Package.resolved is committed so that CI does not build with versions
nobody expected, and xcodebuild is given -disableAutomaticPackageResolution so that it uses the file as it is. For a
package that needs authentication, the page describes SSH URLs with keys set up on the machine that builds. That is why
`insecure-url` says a team can set it to warning for the SSH URLs it agreed on, and why `missing-resolved` and
`unpinned-dependency` matter in a pipeline.

### The Swift project moves to a new GitHub organization (swift.org blog)

https://www.swift.org/blog/swiftlang-github/

The Swift project moves its repositories from the apple organization on GitHub to a new swiftlang organization, the
compiler and core tools first and other packages over time. The address of a package can change while the package
stays the same; `deprecated-package` and its configuration, deprecatedPackages, let a team list such moves and the
packages it has left behind. The list is empty by default, because which repositories moved, and when, is not
something the tool can look up.

## Versions

### Semantic Versioning 2.0.0 (semver.org)

https://semver.org/spec/v2.0.0.html

The specification of semantic versions. Major, minor and patch are compared as numbers, left to right; a pre-release
is lower than its release, and its identifiers are compared one by one, numbers as numbers and lower than words; build
metadata does not count in the order. The major version is raised for every change that breaks the public API.
src/semver.js orders versions this way, `resolved-outside-requirement` uses that order, and `wide-range` leans on the
meaning of the major version.

## Output and safe reading

### RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files

https://www.rfc-editor.org/rfc/rfc4180

The CSV format: one record a line, ended by CRLF, an optional header line, and a field with a comma, a double quote or
a line break put in double quotes, with a double quote inside written twice. The CSV report follows it.

### RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON format. JSON exchanged between systems must be UTF-8, and a reader may ignore a byte order mark. When the
names of an object are not unique, the behavior of the software that reads it is unpredictable, so the JSON reader of
the configuration and of Package.resolved refuses a name given twice.

### CSV Injection (OWASP)

https://community.owasp.org/attacks/CSV_Injection

A spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is
safe in every program. The CSV report puts a single quote in front of such a field, and the threat model says to open a
report built from files you do not trust with formulas turned off.

### Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The error, warning and notice commands with file, line, col and title parameters create annotations on a file and a
line of the repository. The GitHub format writes one command per finding and escapes what a command gives a meaning
to.
