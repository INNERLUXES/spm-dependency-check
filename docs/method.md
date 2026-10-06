# Method

This document says exactly what the tool reads, how it reads a manifest, an Xcode project file and a Package.resolved,
what each rule looks at and cannot see, and how the report is built. The names used here are the defaults;
docs/inputs.md says how the configuration changes them. The tool reads the files of an iOS or macOS app or package on
disk as text, and fetches nothing. It is a review of the dependency setup, not a package resolution and not a build: a
finding points at a line worth a look, and a clean run says only that the project holds none of the problems below. It
never says what the latest version of a package is.

## What is read

The input is one project folder. It is listed with a list of folders of the tool's own, with no recursion
(src/walk.js), in the order of the names. Three kinds of files are read:

- every file named Package.swift: the manifest of the app's own packages, of a package at the top of the folder, and of
  a tool of the repository;
- every file named Package.resolved: next to a manifest, under xcshareddata/swiftpm of an Xcode workspace
  (App.xcworkspace/xcshareddata/swiftpm/Package.resolved), and under the workspace inside an Xcode project
  (App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved);
- every file named project.pbxproj inside a folder whose name ends with .xcodeproj.

The folders .build, DerivedData, Pods and .git are counted and passed over, because they hold the checkouts and output
of SwiftPM and Xcode, CocoaPods and history, and not the dependency setup as written; so is every path that matches an
exclude pattern (`exclude` of the configuration and `--exclude`). A symbolic link (or a junction on Windows) is counted
and never followed. Version-specific manifests such as Package@swift-5.9.swift are not read (docs/limits.md).

Each file is read once (src/files.js), decoded by its byte order mark: UTF-16 little or big endian with one, UTF-8 with
or without one. A file that holds a null byte, bytes that are not valid UTF-8, or more than 8 MB is an `unreadable-file`
finding and nothing in it is checked.

## How a manifest is read

A Package.swift is read as text, by src/swift.js. The tool does not run Swift and does not compile the manifest; it
reads the file once into tokens, with its comments (// and /* */, which nest in Swift) left out and its string literals
kept with their values: strings in double quotes with their escapes, multi-line strings in three double quotes, and raw
strings with # around them. Then it looks for two forms by their shape. This is a heuristic. What it reads:

- a package dependency: `.package(` with its arguments, where `url:` is the URL of a remote package, `path:` the path of
  a local package and `id:` the id of a registry package, and the requirement is one of `from: "1.2.3"`,
  `exact: "1.2.3"`, `branch: "main"`, `revision: "..."`, `"1.0.0"..<"2.0.0"`, `"1.0.0"..."2.0.0"`,
  `.upToNextMajor(from: "1.2.3")`, `.upToNextMinor(from: "1.2.3")`, `.exact("1.2.3")`, `.branch("main")` or
  `.revision("...")`; `name:` and `traits:` are passed over;
- a product of a package a target uses: `.product(name: "...", package: "...")`, counted for the table of packages.

Nothing in a comment counts, so a dependency that is commented out is not reported, and a string that holds
`.package(` is a string. A URL, a path or a version written with a variable, with string interpolation or in another
form is not guessed: it is an `unreadable-requirement` finding.

## How an Xcode project is read

A project.pbxproj is an old-style property list: dictionaries in braces with `key = value;` pairs, lists in
parentheses, strings with or without double quotes, and comments. src/pbxproj.js is a targeted reader: it walks that
grammar once, with a list of open dictionaries and lists of its own and no recursion, and then reads only three kinds
of entries of the objects dictionary, by their isa:

- XCRemoteSwiftPackageReference: `repositoryURL` and the `requirement` dictionary, whose `kind` is
  upToNextMajorVersion or upToNextMinorVersion (with minimumVersion), exactVersion (with version), versionRange (with
  minimumVersion and maximumVersion, the maximum left out of the range), branch (with branch) or revision (with
  revision);
- XCLocalSwiftPackageReference: `relativePath`;
- XCSwiftPackageProductDependency: `productName` and the `package` it comes from.

Targets, build settings, files and every other entry are not read. A file that is not a property list the reader takes
(a missing semicolon, a key given twice in one dictionary, a string or a dictionary that is not closed) is an
`unreadable-file` finding with its line and column; a reference with no URL, no requirement or a kind the reader does
not know is an `unreadable-requirement` finding.

## How a Package.resolved is read

A Package.resolved is read with the strict JSON reader of src/json.js (no comments, no trailing comma, no name given
twice) by src/resolved.js, in its three formats: format 1 with `object.pins` and each pin's `package`, `repositoryURL`
and `state`; format 2 with `pins` and each pin's `identity`, `kind`, `location` and `state`; and format 3, which adds
`originHash`. The state holds `version`, `branch` and `revision`. Any other format version is an `unreadable-file`
finding. The line of each pin, and of its version, is kept.

## Identities, locations and requirements

A package is known by its identity, as Package.resolved names it: the last part of the path of its URL in lowercase,
with no .git. Two declarations are the same package when their identities are the same. Each URL is also normalized
(src/urls.js): the host and path in lowercase, with no scheme, no user, no default port, no trailing slash and no .git,
so https://Code.Example.test/Owner/Repo.git and git@code.example.test:owner/repo are one location.

A requirement is turned into the bounds it allows (src/semver.js): from: "5.0.0" and .upToNextMajor(from: "5.0.0") are
5.0.0..<6.0.0, .upToNextMinor(from: "2.3.0") is 2.3.0..<2.4.0, exact: "3.1.0" is 3.1.0 alone, a half-open range leaves
out its upper bound and a closed range holds it. Versions are semantic versions major.minor.patch, with an optional
pre-release and build metadata, and are ordered as the Semantic Versioning specification orders them; build metadata
does not count. A version with one or two parts is not a semantic version.

The folder is one review: the Package.resolved files read are pooled, so a pin in any of them counts for a declaration
in any manifest or project.

## The rules

### `branch-requirement`

Reports a requirement that follows a branch: `branch:` or `.branch(...)` in a manifest, and the kind branch in an Xcode
project. What a branch points at moves with every push, and a package with a branch requirement cannot be used by a
package that depends on it by version. An error by default.

### `insecure-url`

Reports the URL of a remote package whose scheme is not https: http:// and git://, which travel unencrypted; ssh:// and
the form user@host:path, which git reads as SSH and which need a key on every machine; file://; and a text with no
scheme. A team whose private packages need SSH can set this rule to warning; Apple's page on CI describes SSH URLs for
packages that need authentication.

### `conflicting-requirement`

Groups every remote and registry declaration of the manifests and the Xcode projects by identity and reports each
declaration whose requirement allows other versions than the first one, with the place of the first. Two forms that
allow the same versions (from: "5.0.0", .upToNextMajor(from: "5.0.0"), "5.0.0"..<"6.0.0" and upToNextMajorVersion
5.0.0) are one requirement. When the two declarations name different locations, the message says so. A local package
is not compared.

### `unpinned-dependency`

When the folder holds at least one Package.resolved, reports a remote or registry package that a manifest or an Xcode
project declares and that no Package.resolved pins, once per identity, at its first declaration.

### `resolved-outside-requirement`

Compares every pin with every requirement of its identity, once per pin and requirement: a version below the lower
bound or at or above the upper bound (above it for a closed range or an exact version), a version that is not a
semantic version, a pin with no version under a version requirement, a pin on another branch under a branch
requirement, and a pin on another commit under a revision requirement (a short revision matches the start of the
commit, in any case). The finding points at the version of the pin and names the declaration.

### `revision-requirement`

Reports a requirement that names one commit and no version: `revision:` or `.revision(...)`, and the kind revision of
an Xcode project. A warning, because a commit does not move, but it takes no fix and says nothing about its version.

### `missing-resolved`

Reports, once, a folder that declares at least one remote package and holds no Package.resolved, at the first remote
declaration. A Package.resolved that is there but cannot be read is an `unreadable-file` finding instead. A warning,
because a package that is only a library for others may leave the file out on purpose.

### `stale-pin`

Reports a pin whose identity no manifest and no Xcode project of the folder declares, remote or local, and that
`indirectPins` does not list. The tool fetches nothing, so it cannot tell a pin left from a removed dependency from one
that a dependency brings in; the second kind goes into `indirectPins` once it is checked.

### `wide-range`

Reports a half-open range whose upper bound is above the next major version of its lower bound, and a closed range
that holds that version, in a manifest or as versionRange in an Xcode project. "1.0.0"..<"2.0.0" is not reported;
"1.0.0"..<"99.0.0" and "1.0.0"..."2.0.0" are.

### `deprecated-package`

Reports a remote package whose normalized location matches a pattern of `deprecatedPackages`, with the text of its
`use`. The list is empty by default.

### `unreadable-requirement`

Reports a declaration the reader cannot read as written: a URL, a path or a requirement written with a variable, with
string interpolation or in another form, a version that is not a semantic version, a range that holds no version, and
an Xcode reference with no URL, no requirement or a kind the reader does not know. The URL of such a declaration is
still checked, but its requirement is not compared with other declarations or with Package.resolved.

### `local-package`

Reports a local package, `.package(path:)` in a manifest or XCLocalSwiftPackageReference in an Xcode project, as a note,
and says when its path starts with .. or / and so reaches outside the folder of its file.

### `unreadable-file`

Reports a manifest, a Package.resolved or an Xcode project file that cannot be read: over 8 MB, binary, not valid
UTF-8 or UTF-16 with its byte order mark, a Package.resolved that is not strict JSON or not of format 1, 2 or 3, and an
Xcode project file that is not a property list the reader takes. Nothing in such a file is checked. This rule has no
key and is always an error, so a run never passes because a file could not be read.

### `scan-limit`

Reports a project past a limit of docs/limits.md: more files and folders than the listing reads, folders nested more
than 32 deep, more manifests, Package.resolved and Xcode project files, a manifest with more tokens or declarations, or
a Package.resolved with more pins. The rest is not read, so the run fails. This rule has no key and is always an error.

## The report

Every finding has its rule, its level, the file, the line and the column, what was found and what to change; with
`--explain`, also the rule, the points of the public pages it rests on and the tool's own choice. Findings are sorted by
level, then file, line, column and rule. A rule lists at most 500 findings; the rest are counted in a note and still
count for the result. The table of files gives, for each file, its kind, its remote and local declarations, its pins,
its products and its findings by level; the table of packages gives every identity declared or pinned, whether it is
remote, local or only pinned, how many times it is declared, its requirements, what it is pinned at and how many
products targets use from it; the summary counts the packages, the declarations, the requirement kinds, the pins and
the products.

The run fails when a finding is at or above the fail-on level (`error` by default): exit code `1`; otherwise `0`. A
usage or input error gives `2` and no result.
