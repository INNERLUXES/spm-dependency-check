# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own and what to change. The same points are in src/data.js and are shown by `--explain`;
research/sources.md has a longer note on each page. The tool reads Package.swift, Package.resolved and the Xcode
project files on disk as text: a point says what a page says, and a finding says what a file holds. A clean result is
not a package resolution and not a build.

## The rules

| Rule | Default level | Points |
| --- | --- | --- |
| `branch-requirement` | error | `branchNotPublishable`, `xcodeBranchRule`, `xcodeVersionRule` |
| `insecure-url` | error | `httpsExamples`, `dependencyForms`, `ciSsh` |
| `conflicting-requirement` | error | `dependencyForms`, `exactConflicts`, `resolvedRecords` |
| `unpinned-dependency` | error | `resolvedRecords`, `resolvedCommitted`, `ciResolved` |
| `resolved-outside-requirement` | error | `resolvedRecords`, `resolveKeeps`, `semverOrder` |
| `revision-requirement` | warning | `xcodeCommitRule`, `branchNotPublishable` |
| `missing-resolved` | warning | `resolvedAbsent`, `resolvedCommitted`, `ciResolved` |
| `stale-pin` | warning | `resolvedRecords`, `resolveKeeps` |
| `wide-range` | warning | `semverMajor`, `fromAdvised`, `xcodeVersionRule` |
| `deprecated-package` | warning | `repositoriesMove` |
| `unreadable-requirement` | warning | `semverTags`, `dependencyForms` |
| `local-package` | info | `localDevelopment`, `localNoVersion` |
| `unreadable-file` | error, always | `jsonRepeatedNames`, `resolvedRecords` |
| `scan-limit` | error, always | `resolvedRecords` |

### `branch-requirement`

A dependency follows a branch.

- `branchNotPublishable` (Package (Swift Package Manager, PackageDescription API on swift.org)): a package with a branch-based or commit-based requirement cannot be used by a package that uses a version-based requirement, so such requirements are removed before a version is published.
- `xcodeBranchRule` (Adding package dependencies to your app (Apple Developer Documentation, Xcode)): a branch rule is meant for packages developed together whose versions are not published.
- `xcodeVersionRule` (Adding package dependencies to your app (Apple Developer Documentation, Xcode)): Xcode advises the version rule, up to the next major or minor version, a range or an exact version, for a package that follows semantic versioning.

The tool's own choice: a .package call with branch: or .branch(...) in a Package.swift, and a package reference of an Xcode project whose requirement kind is branch; what the branch points at changes with every push to it, so two resolutions of the same commit can get different code.

What to change: depend on a released version, such as from: "1.2.0"; if the package publishes no versions, pin a revision for now and ask its owners for a tag.

### `insecure-url`

A remote package is not named by an https URL.

- `httpsExamples` (Adding dependencies to a Swift package (Swift Package Manager documentation)): a remote package is named by the URL of its Git repository, written with https in the examples, and its version is taken from its tags.
- `dependencyForms` (Package.Dependency (Apple Developer Documentation, PackageDescription)): a remote dependency is a Git URL with a requirement: a minimum version up to the next major, an exact version, a half-open or a closed range, a branch or a revision; a local dependency is a path.
- `ciSsh` (Building Swift packages or apps that use them in continuous integration workflows (Apple Developer Documentation, Xcode)): a package that needs authentication can be named by an SSH URL, with keys set up on every machine that builds.

The tool's own choice: the URL of a remote package in a manifest or an Xcode project whose scheme is not https: http://, git://, ssh://, the form user@host:path that git reads as SSH, file:// and a text with no scheme; http and git:// travel unencrypted, and an SSH URL needs a key on every machine and names the package differently from its https URL; a team whose private packages need SSH can set this rule to warning.

What to change: name the package by the https URL of its Git repository; for a private package, give the machines that build a credential for https, or set this rule to warning for the SSH URLs your team agreed on.

### `conflicting-requirement`

The same package is declared twice with different requirements.

- `dependencyForms` (Package.Dependency (Apple Developer Documentation, PackageDescription)): a remote dependency is a Git URL with a requirement: a minimum version up to the next major, an exact version, a half-open or a closed range, a branch or a revision; a local dependency is a path.
- `exactConflicts` (Package (Swift Package Manager, PackageDescription API on swift.org)): upToNextMinor stops before the next minor version, and an exact version is not advised because it can cause conflicts in the dependency graph.
- `resolvedRecords` (Resolving and updating dependencies (Swift Package Manager documentation)): Package.resolved records the result of dependency resolution, and the versions in it are used for a top-level package; it is ignored when the package is a dependency of another.

The tool's own choice: two declarations of one package identity, in the manifests and the Xcode projects of the folder, whose requirements allow different versions; from: "5.0.0", .upToNextMajor(from: "5.0.0"), "5.0.0"..<"6.0.0" and upToNextMajorVersion 5.0.0 count as one requirement; each declaration after the first that differs is reported, with the place of the first; two locations with one identity are named in the message.

What to change: give the package one requirement in every manifest and Xcode project that declares it, or declare it in one place, such as a local package the app depends on.

### `unpinned-dependency`

A dependency is missing from Package.resolved.

- `resolvedRecords` (Resolving and updating dependencies (Swift Package Manager documentation)): Package.resolved records the result of dependency resolution, and the versions in it are used for a top-level package; it is ignored when the package is a dependency of another.
- `resolvedCommitted` (Adding package dependencies to your app (Apple Developer Documentation, Xcode)): Xcode writes Package.resolved with the commit each dependency resolves to, and the file is committed so that everyone uses the same versions.
- `ciResolved` (Building Swift packages or apps that use them in continuous integration workflows (Apple Developer Documentation, Xcode)): Package.resolved is committed so that CI does not build with unexpected versions, and xcodebuild gets -disableAutomaticPackageResolution so that it uses the file as it is.

The tool's own choice: a remote dependency of a manifest or an Xcode project whose identity no Package.resolved of the folder pins, when the folder holds at least one Package.resolved; the files are pooled, so a pin in any of them counts.

What to change: resolve the packages again (swift package resolve, or File > Packages > Resolve Package Versions in Xcode) and commit the Package.resolved it writes.

### `resolved-outside-requirement`

Package.resolved pins a version the requirement does not allow.

- `resolvedRecords` (Resolving and updating dependencies (Swift Package Manager documentation)): Package.resolved records the result of dependency resolution, and the versions in it are used for a top-level package; it is ignored when the package is a dependency of another.
- `resolveKeeps` (Resolving and updating dependencies (Swift Package Manager documentation)): swift package resolve keeps the versions of Package.resolved while they are still eligible, and swift package update moves to the latest eligible versions and writes the file again.
- `semverOrder` (Semantic Versioning 2.0.0 (semver.org)): versions are compared by major, minor and patch as numbers, a pre-release is lower than its release, and build metadata does not count.

The tool's own choice: a pin of a Package.resolved whose version is outside the bounds of a version requirement of the same identity, compared by the order of semantic versions with build metadata left out; a pin with no version under a version requirement, a pin on another branch under a branch requirement and a pin on another commit under a revision requirement count too; a version that is not a semantic version is reported as such.

What to change: resolve the packages again so the pin follows the requirement, and commit the Package.resolved; if the pin is the version you want, change the requirement to allow it.

### `revision-requirement`

A dependency is pinned to a bare revision.

- `xcodeCommitRule` (Adding package dependencies to your app (Apple Developer Documentation, Xcode)): a commit rule is not advised and is for exceptional cases: it holds one commit and brings no updates.
- `branchNotPublishable` (Package (Swift Package Manager, PackageDescription API on swift.org)): a package with a branch-based or commit-based requirement cannot be used by a package that uses a version-based requirement, so such requirements are removed before a version is published.

The tool's own choice: a .package call with revision: or .revision(...), and a package reference of an Xcode project whose requirement kind is revision; it is a warning, not an error, because a revision does not move, but it brings no updates and no version the team can read.

What to change: depend on the released version that holds the commit, such as exact: "1.2.0" or from: "1.2.0".

### `missing-resolved`

Remote dependencies are declared and no Package.resolved is there.

- `resolvedAbsent` (Resolving and updating dependencies (Swift Package Manager documentation)): without a Package.resolved each person and each build resolves on its own, and a new user starts from the latest eligible versions.
- `resolvedCommitted` (Adding package dependencies to your app (Apple Developer Documentation, Xcode)): Xcode writes Package.resolved with the commit each dependency resolves to, and the file is committed so that everyone uses the same versions.
- `ciResolved` (Building Swift packages or apps that use them in continuous integration workflows (Apple Developer Documentation, Xcode)): Package.resolved is committed so that CI does not build with unexpected versions, and xcodebuild gets -disableAutomaticPackageResolution so that it uses the file as it is.

The tool's own choice: the folder declares at least one remote dependency in a manifest or an Xcode project and holds no Package.resolved, next to a manifest or under xcshareddata/swiftpm of a workspace; reported once, at the first remote dependency; a package that is only a library for others may leave the file out on purpose, so it is a warning.

What to change: resolve the packages and commit the Package.resolved, next to Package.swift or in the xcshareddata/swiftpm folder of the workspace.

### `stale-pin`

Package.resolved pins a package nothing declares.

- `resolvedRecords` (Resolving and updating dependencies (Swift Package Manager documentation)): Package.resolved records the result of dependency resolution, and the versions in it are used for a top-level package; it is ignored when the package is a dependency of another.
- `resolveKeeps` (Resolving and updating dependencies (Swift Package Manager documentation)): swift package resolve keeps the versions of Package.resolved while they are still eligible, and swift package update moves to the latest eligible versions and writes the file again.

The tool's own choice: a pin whose identity no manifest and no Xcode project of the folder declares, remote or local, and that indirectPins does not list; the tool fetches nothing, so it cannot see the packages a dependency brings in, and lists them for you to put in indirectPins once checked.

What to change: resolve the packages again so the pin of a removed dependency goes away; if a dependency brings the package in, add its identity to indirectPins.

### `wide-range`

A version range reaches past the next major version.

- `semverMajor` (Semantic Versioning 2.0.0 (semver.org)): the major version is raised for every change that breaks the public API.
- `fromAdvised` (Package (Swift Package Manager, PackageDescription API on swift.org)): from: is the advised way to name a remote dependency, and takes the versions up to the next major version.
- `xcodeVersionRule` (Adding package dependencies to your app (Apple Developer Documentation, Xcode)): Xcode advises the version rule, up to the next major or minor version, a range or an exact version, for a package that follows semantic versioning.

The tool's own choice: a range "a"..<"b" whose upper bound is above the next major version of a, a closed range "a"..."b" that holds it, and a versionRange of an Xcode project of the same kind; such a range takes versions that may break the API, so "1.0.0"..<"99.0.0" says no more than "any version".

What to change: use from: with the lowest version you need, which stops before the next major version, or end the range at the next major version.

### `deprecated-package`

A package of the list of deprecated or moved packages is declared.

- `repositoriesMove` (The Swift project moves to a new GitHub organization (swift.org blog)): the Swift project moves its repositories from the apple organization on GitHub to the swiftlang organization, so the address of a package can change while the package stays the same.

The tool's own choice: a remote package of a manifest or an Xcode project whose normalized location matches a pattern of deprecatedPackages; the list is empty by default, because which packages a team has left behind, and where a repository moved, is not something the tool can look up.

What to change: move to the package or location the message names, and resolve again.

### `unreadable-requirement`

A dependency the reader cannot read.

- `semverTags` (Adding dependencies to a Swift package (Swift Package Manager documentation)): a version tag has all three parts of a semantic version, major, minor and patch; a tag with one or two parts is not read as a version.
- `dependencyForms` (Package.Dependency (Apple Developer Documentation, PackageDescription)): a remote dependency is a Git URL with a requirement: a minimum version up to the next major, an exact version, a half-open or a closed range, a branch or a revision; a local dependency is a path.

The tool's own choice: a .package call whose URL, path or requirement is written with a variable, with string interpolation or in a form the reader does not take; a version that is not a semantic version major.minor.patch; a range that holds no version; and a package reference of an Xcode project with no URL, no requirement or a kind the reader does not know; its URL is still checked, but its requirement is not compared with other declarations or with Package.resolved.

What to change: write the dependency with string literals in one of the documented forms, such as .package(url: "https://...", from: "1.2.0"), or check it by hand.

### `local-package`

A dependency is a local package.

- `localDevelopment` (Package (Swift Package Manager, PackageDescription API on swift.org)): a local dependency is for a package under development or for packages tied closely together.
- `localNoVersion` (Adding dependencies to a Swift package (Swift Package Manager documentation)): a local dependency has no version constraint and uses whatever is at the path.

The tool's own choice: a .package(path:) call and a local package reference of an Xcode project; a note, because a local package inside the repository is a normal way to split an app, but one outside it, or one that stands in for a remote package during development, is worth a look.

What to change: keep a local package inside the repository; if it stands in for a remote package during development, switch back to the URL before the change is merged.

### `unreadable-file`

A manifest, a Package.resolved or an Xcode project that cannot be read.

- `jsonRepeatedNames` (RFC 8259, The JSON Data Interchange Format): when an object repeats a name the behavior of the software that reads it cannot be predicted, so the JSON reader of this tool refuses a repeated name.
- `resolvedRecords` (Resolving and updating dependencies (Swift Package Manager documentation)): Package.resolved records the result of dependency resolution, and the versions in it are used for a top-level package; it is ignored when the package is a dependency of another.

The tool's own choice: a file over its size limit, a binary file, a file that is not valid UTF-8 or UTF-16 with its byte order mark, a Package.resolved that is not strict JSON or not of format 1, 2 or 3, and an Xcode project file that is not a property list the reader takes; nothing in it is checked; this rule cannot be set lower or off.

What to change: save the file as UTF-8; for a Package.resolved, resolve the packages again so the tool that owns it writes it anew.

### `scan-limit`

The input is larger than the limits of a run.

- `resolvedRecords` (Resolving and updating dependencies (Swift Package Manager documentation)): Package.resolved records the result of dependency resolution, and the versions in it are used for a top-level package; it is ignored when the package is a dependency of another.

The tool's own choice: a project with more files, folders, manifests, Package.resolved or Xcode project files, package declarations or pins than the limits of docs/limits.md, or folders nested deeper; the rest is not read, so the run fails; this rule cannot be set lower or off.

What to change: exclude the folders that are not part of the app, or check the parts of the project in runs of their own.

## The points

| Point | Page | What it says |
| --- | --- | --- |
| `dependencyForms` | Package.Dependency (Apple Developer Documentation, PackageDescription) | a remote dependency is a Git URL with a requirement: a minimum version up to the next major, an exact version, a half-open or a closed range, a branch or a revision; a local dependency is a path |
| `fromAdvised` | Package (Swift Package Manager, PackageDescription API on swift.org) | from: is the advised way to name a remote dependency, and takes the versions up to the next major version |
| `exactConflicts` | Package (Swift Package Manager, PackageDescription API on swift.org) | upToNextMinor stops before the next minor version, and an exact version is not advised because it can cause conflicts in the dependency graph |
| `branchNotPublishable` | Package (Swift Package Manager, PackageDescription API on swift.org) | a package with a branch-based or commit-based requirement cannot be used by a package that uses a version-based requirement, so such requirements are removed before a version is published |
| `localDevelopment` | Package (Swift Package Manager, PackageDescription API on swift.org) | a local dependency is for a package under development or for packages tied closely together |
| `localNoVersion` | Adding dependencies to a Swift package (Swift Package Manager documentation) | a local dependency has no version constraint and uses whatever is at the path |
| `httpsExamples` | Adding dependencies to a Swift package (Swift Package Manager documentation) | a remote package is named by the URL of its Git repository, written with https in the examples, and its version is taken from its tags |
| `semverTags` | Adding dependencies to a Swift package (Swift Package Manager documentation) | a version tag has all three parts of a semantic version, major, minor and patch; a tag with one or two parts is not read as a version |
| `xcodeVersionRule` | Adding package dependencies to your app (Apple Developer Documentation, Xcode) | Xcode advises the version rule, up to the next major or minor version, a range or an exact version, for a package that follows semantic versioning |
| `xcodeBranchRule` | Adding package dependencies to your app (Apple Developer Documentation, Xcode) | a branch rule is meant for packages developed together whose versions are not published |
| `xcodeCommitRule` | Adding package dependencies to your app (Apple Developer Documentation, Xcode) | a commit rule is not advised and is for exceptional cases: it holds one commit and brings no updates |
| `resolvedCommitted` | Adding package dependencies to your app (Apple Developer Documentation, Xcode) | Xcode writes Package.resolved with the commit each dependency resolves to, and the file is committed so that everyone uses the same versions |
| `resolvedRecords` | Resolving and updating dependencies (Swift Package Manager documentation) | Package.resolved records the result of dependency resolution, and the versions in it are used for a top-level package; it is ignored when the package is a dependency of another |
| `resolvedAbsent` | Resolving and updating dependencies (Swift Package Manager documentation) | without a Package.resolved each person and each build resolves on its own, and a new user starts from the latest eligible versions |
| `resolveKeeps` | Resolving and updating dependencies (Swift Package Manager documentation) | swift package resolve keeps the versions of Package.resolved while they are still eligible, and swift package update moves to the latest eligible versions and writes the file again |
| `ciResolved` | Building Swift packages or apps that use them in continuous integration workflows (Apple Developer Documentation, Xcode) | Package.resolved is committed so that CI does not build with unexpected versions, and xcodebuild gets -disableAutomaticPackageResolution so that it uses the file as it is |
| `ciSsh` | Building Swift packages or apps that use them in continuous integration workflows (Apple Developer Documentation, Xcode) | a package that needs authentication can be named by an SSH URL, with keys set up on every machine that builds |
| `repositoriesMove` | The Swift project moves to a new GitHub organization (swift.org blog) | the Swift project moves its repositories from the apple organization on GitHub to the swiftlang organization, so the address of a package can change while the package stays the same |
| `semverOrder` | Semantic Versioning 2.0.0 (semver.org) | versions are compared by major, minor and patch as numbers, a pre-release is lower than its release, and build metadata does not count |
| `semverMajor` | Semantic Versioning 2.0.0 (semver.org) | the major version is raised for every change that breaks the public API |
| `csvRecords` | RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice |
| `csvInjection` | CSV Injection (OWASP) | a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file |
| `jsonUtf8` | RFC 8259, The JSON Data Interchange Format | JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start |
| `jsonRepeatedNames` | RFC 8259, The JSON Data Interchange Format | when an object repeats a name the behavior of the software that reads it cannot be predicted, so the JSON reader of this tool refuses a repeated name |
| `githubAnnotations` | Workflow commands for GitHub Actions (GitHub Docs) | a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run |

## The pages

| Page | Address |
| --- | --- |
| Package (Swift Package Manager, PackageDescription API on swift.org) | https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html |
| Package.Dependency (Apple Developer Documentation, PackageDescription) | https://developer.apple.com/documentation/packagedescription/package/dependency |
| Adding dependencies to a Swift package (Swift Package Manager documentation) | https://github.com/swiftlang/swift-package-manager/blob/main/Sources/PackageManagerDocs/Documentation.docc/Dependencies/AddingDependencies.md |
| Resolving and updating dependencies (Swift Package Manager documentation) | https://github.com/swiftlang/swift-package-manager/blob/main/Sources/PackageManagerDocs/Documentation.docc/ResolvingPackageVersions.md |
| Adding package dependencies to your app (Apple Developer Documentation, Xcode) | https://developer.apple.com/documentation/xcode/adding-package-dependencies-to-your-app |
| Building Swift packages or apps that use them in continuous integration workflows (Apple Developer Documentation, Xcode) | https://developer.apple.com/documentation/xcode/building-swift-packages-or-apps-that-use-them-in-continuous-integration-workflows |
| The Swift project moves to a new GitHub organization (swift.org blog) | https://www.swift.org/blog/swiftlang-github/ |
| Semantic Versioning 2.0.0 (semver.org) | https://semver.org/spec/v2.0.0.html |
| RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | https://www.rfc-editor.org/rfc/rfc4180 |
| RFC 8259, The JSON Data Interchange Format | https://www.rfc-editor.org/rfc/rfc8259 |
| CSV Injection (OWASP) | https://community.owasp.org/attacks/CSV_Injection |
| Workflow commands for GitHub Actions (GitHub Docs) | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |
