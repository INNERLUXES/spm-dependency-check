# spm-dependency-check

Swift Package Manager dependency check for iOS and macOS apps and packages. Give it the folder of the project. It reads
every Package.swift, every Package.resolved and the package references of every Xcode project file as text, fetches
nothing, and lists what a team finds when it takes over or reviews the codebase: dependencies that follow a branch or
name a bare revision, package URLs that are not https, one package declared twice with different requirements, remote
dependencies with no Package.resolved, pins nothing declares, declared packages Package.resolved does not pin, a pinned
version the requirement does not allow, ranges that reach past the next major version, packages of a list of
deprecated or moved packages, and local packages. Each file and each package gets a line with its counts. Every finding
has its file, line and column and what to change, and the run exits with a code a pipeline can act on.

**It is a review of the files, not a package resolution and not a build.** It runs no Swift and no Xcode, never looks a
version up and never says what the latest version is; it reads what the manifests, the Xcode project and
Package.resolved say, and a clean run means only that none of the problems of its rules were found.

The advised way to name a dependency is from:, which takes the versions up to the next major version, and a package
with a branch requirement cannot be used by a package that depends on versions
(https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html). Xcode writes Package.resolved and
asks for it to be committed so that everyone uses the same versions
(https://developer.apple.com/documentation/xcode/adding-package-dependencies-to-your-app). These mistakes build without
a word, and surface later as a version nobody chose, a package two targets see in two versions or a branch that moved
under the app; each is visible in the files. This tool reads them on every change.

- **One check per problem.** Twelve rules, each with what it looks at, what it cannot see, the public pages it rests on
  and what to change, and two rules of input problems that are always errors.
- **Requirements as bounds.** A small comparer of semantic versions turns every requirement into the versions it
  allows, so from: "5.0.0", .upToNextMajor(from: "5.0.0"), "5.0.0"..<"6.0.0" and upToNextMajorVersion 5.0.0 are one
  requirement, and a pin is checked against each of them.
- **Readers of its own.** Package.swift is read as text with comments and strings set apart; project.pbxproj with a
  targeted reader of the property list grammar that reads only the package references; Package.resolved in its
  formats 1, 2 and 3 with a strict JSON reader. Each refuses what it does not read, with its place.
- Reports as text, JSON, CSV with one row per finding and GitHub workflow annotations, with an exit code for a
  pipeline: `0` no finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 118
pass 116
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link, a device or file permissions (links in the project to a file and to a folder, a project and a
configuration named through a link, `/dev/null` named as a project, and a manifest with no read access); they are
guarded with `process.platform`, run on Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs
the same tests with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install, and no Xcode or Swift toolchain is needed.

```
git clone https://github.com/INNERLUXES/spm-dependency-check.git
cd spm-dependency-check
node bin/spm-dependency-check.js examples/messy --config examples/config.json
```

Or without a clone, in the folder of your own app or package:

```
npx --yes github:INNERLUXES/spm-dependency-check .
```

`examples/` holds two made-up projects. `examples/messy/` is the ordering app of a coffee chain whose codebase a new
team is about to take over: a local package that names one package by an `http://` URL and with another requirement
than the Xcode project, follows the branch `develop` with another, pins a third to a bare revision and takes a fourth
in the range `"1.0.0"..<"99.0.0"`; a package from an organization the team's list says has moved; and a
Package.resolved that pins one package below its requirement, another past its exact version, still pins a package
nothing declares, and does not pin the package of the wide range. It also holds what must not be reported: dependencies
in comments, a pin a dependency brings in, a checkout under `.build` and a vendor folder the configuration leaves out.
`examples/clean/` is a notes app whose setup is in good order, with a Package.resolved of format 3 and one of format 1.

## Usage

```
spm-dependency-check <project folder> [--exclude <pattern>]... [--config <file>] [options]
```

```
--exclude <pattern>       a path of the project to leave out, relative to it, such as Vendor/** or **/Examples/**;
                          may be given more than once, and adds to exclude of the configuration
--config <file>           settings in strict JSON: rules, deprecatedPackages, indirectPins, exclude, minSeverity
                          and failOn (--print-defaults shows them)
--format <name>           text, json, csv or github (default: text); csv writes one row per finding, github writes
                          workflow commands that GitHub shows as annotations
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: info, warning, error (default: minSeverity of
                          the configuration, else info)
--fail-on <level>         the lowest level of a finding that fails the run: info, warning, error (default: failOn of
                          the configuration, else error)
--explain                 show the rule, the public sources and the tool's own choice behind each finding
--print-defaults          print the built-in configuration and exit
--help                    show the usage
--version                 show the version
```

Name one project folder, the one that holds the .xcodeproj, the .xcworkspace or Package.swift. The paths in the report
are relative to the folder you run the command in, with forward slashes on every system, followed by the line.

The report of the messy example starts with what was read, the configuration, the rules and the findings in one line
each; then every file with its kind, its remote and local declarations, its pins, its products and its findings; then
every package with its kind, how many times it is declared, its requirements, what it is pinned at and the products
targets use from it; then the summary; then the count of findings of every rule; then the findings, errors first, each
with what to change:

```
spm-dependency-check: examples/messy
input: 2 manifests; 1 Xcode project; 1 Package.resolved; 1 other file passed over; 1 folder named .build, DerivedData, Pods or .git passed over; 1 path excluded; 0 links not followed
config: examples/config.json (Copperleaf dependency review): deprecated packages code.example.test/old-tools/*; indirect pins logkit; exclude Vendor/**; minimum severity info; fail on error
rules: branch-requirement (error); insecure-url (error); conflicting-requirement (error); unpinned-dependency (error); resolved-outside-requirement (error); revision-requirement (warning); missing-resolved (warning); stale-pin (warning); wide-range (warning); deprecated-package (warning); unreadable-requirement (warning); local-package (info); unreadable-file (error); scan-limit (error)
findings: 12 (6 error, 4 warning, 2 info)

Files (4)

  file                                                                                                 kind                 remote  local  pins  products  error  warning  info
  examples/messy/CopperleafOrders.xcodeproj/project.pbxproj                                            Xcode project        3       1      0     4         0      0        1
  examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved  Package.resolved v3  0       0      8     0         2      1        0
  examples/messy/Packages/DesignTokens/Package.swift                                                   manifest             0       0      0     0         0      0        0
  examples/messy/Packages/OrderCore/Package.swift                                                      manifest             6       1      0     7         4      3        1

Packages (11)

  package          kind      declared  requirement                                        resolved                       products
  analytics-kit    remote    1         exact 3.1.0                                        3.1.2                          1
  designtokens     local     1         local path                                         -                              1
  featureflags     remote    1         1.0.0..<99.0.0                                     -                              1
  imagecache       remote    2         up to next minor from 2.3.0 / from 2.1.0           2.3.4                          2
  keychain-store   remote    1         branch develop                                     branch develop (a3f6c9e2b5d8)  1
  legacy-promises  pin only  0         -                                                  6.2.0                          0
  logkit           pin only  0         -                                                  1.6.0                          0
  markdownview     remote    1         revision 4f1c2a9e7b3d5f6a8c0e1b2d3f4a5c6e7b8d9f0a  revision 4f1c2a9e7b3d          1
  netkit           remote    2         from 5.0.0                                         4.9.0                          2
  ordercore        local     1         local path                                         -                              1
  swift-retry      remote    1         from 1.4.0                                         1.4.2                          1

Summary

  packages: 11 (7 remote, 2 local), in 11 declarations
  requirement kinds: 4 up to next major, 1 up to next minor, 1 exact, 1 range, 1 branch, 1 revision, 2 local path
  resolved: 8 pins in 1 Package.resolved file
  products used by targets: 11

Rules (14)

  rule                          level    findings
  branch-requirement            error    1
  insecure-url                  error    1
  conflicting-requirement       error    1
  unpinned-dependency           error    1
  resolved-outside-requirement  error    2
  revision-requirement          warning  1
  missing-resolved              warning  0
  stale-pin                     warning  1
  wide-range                    warning  1
  deprecated-package            warning  1
  unreadable-requirement        warning  0
  local-package                 info     2
  unreadable-file               error    0
  scan-limit                    error    0

Findings (12)

  ERROR    resolved-outside-requirement  examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved:10
           Package.resolved pins "analytics-kit" at 3.1.2, which the requirement exact 3.1.0 in examples/messy/CopperleafOrders.xcodeproj/project.pbxproj:79 does not allow (above 3.1.0)
           fix: resolve the packages again so the pin follows the requirement, and commit the Package.resolved; if the pin is the version you want, change the requirement to allow it

  ERROR    resolved-outside-requirement  examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved:63
           Package.resolved pins "netkit" at 4.9.0, which the requirement from 5.0.0 in examples/messy/CopperleafOrders.xcodeproj/project.pbxproj:63 does not allow (lower than 5.0.0)
           fix: resolve the packages again so the pin follows the requirement, and commit the Package.resolved; if the pin is the version you want, change the requirement to allow it

  ERROR    insecure-url                  examples/messy/Packages/OrderCore/Package.swift:13
           the package "imagecache" is named by http://code.example.test/kestrel-labs/imagecache.git: it is a plain http URL, so the code of the package and the answers of the server travel unencrypted and can be changed on the way
           fix: name the package by the https URL of its Git repository; for a private package, give the machines that build a credential for https, or set this rule to warning for the SSH URLs your team agreed on

  ERROR    conflicting-requirement       examples/messy/Packages/OrderCore/Package.swift:13
           the package "imagecache" has the requirement from 2.1.0 here and up to next minor from 2.3.0 in examples/messy/CopperleafOrders.xcodeproj/project.pbxproj:71; the two allow different versions
           fix: give the package one requirement in every manifest and Xcode project that declares it, or declare it in one place, such as a local package the app depends on

  ERROR    branch-requirement            examples/messy/Packages/OrderCore/Package.swift:14
           the package "keychain-store" follows the branch develop: what it resolves to changes with every push to that branch, and a package that depends on a branch cannot be used by a package that depends on versions
           fix: depend on a released version, such as from: "1.2.0"; if the package publishes no versions, pin a revision for now and ask its owners for a tag

  ERROR    unpinned-dependency           examples/messy/Packages/OrderCore/Package.swift:19
           the package "featureflags" (code.example.test/orbit-ui/featureflags) is declared, but no Package.resolved of the folder pins it, so its version is chosen anew by each resolution
           fix: resolve the packages again (swift package resolve, or File > Packages > Resolve Package Versions in Xcode) and commit the Package.resolved it writes

  WARNING  stale-pin                     examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved:31
           Package.resolved pins "legacy-promises" (https://code.example.test/kestrel-labs/legacy-promises.git) at 6.2.0, but no manifest or Xcode project of the folder declares it: a dependency that was removed, or one that a dependency brings in
           fix: resolve the packages again so the pin of a removed dependency goes away; if a dependency brings the package in, add its identity to indirectPins

  WARNING  revision-requirement          examples/messy/Packages/OrderCore/Package.swift:17
           the package "markdownview" is pinned to the revision 4f1c2a9e7b3d with no version: it takes no fix, and the commit does not say which version it holds
           fix: depend on the released version that holds the commit, such as exact: "1.2.0" or from: "1.2.0"

  WARNING  wide-range                    examples/messy/Packages/OrderCore/Package.swift:19
           the package "featureflags" takes the range 1.0.0..<99.0.0, which reaches past 2.0.0, the next major version of 1.0.0; versions in it may break the API
           fix: use from: with the lowest version you need, which stops before the next major version, or end the range at the next major version

  WARNING  deprecated-package            examples/messy/Packages/OrderCore/Package.swift:20
           the package "swift-retry" (code.example.test/old-tools/swift-retry) matches code.example.test/old-tools/* of deprecatedPackages: the old-tools organization moved to code.example.test/ridge-tools; point the URL there
           fix: move to the package or location the message names, and resolve again

  INFO     local-package                 examples/messy/CopperleafOrders.xcodeproj/project.pbxproj:53
           the package at the path "Packages/OrderCore" is a local package: it has no version and uses whatever is at the path
           fix: keep a local package inside the repository; if it stands in for a remote package during development, switch back to the URL before the change is merged

  INFO     local-package                 examples/messy/Packages/OrderCore/Package.swift:24
           the package at the path "../DesignTokens" is a local package: it has no version and uses whatever is at the path; the path reaches outside the folder of this file
           fix: keep a local package inside the repository; if it stands in for a remote package during development, switch back to the URL before the change is merged

note: 1 path matching Vendor/** is left out
note: 1 folder named .build, DerivedData, Pods or .git is passed over

This check reads Package.swift, Package.resolved and the Xcode project files on disk as text and fetches nothing; it never says what the latest version of a package is. A finding is a lead with a file and a line, and a clean result is not a package resolution and not a build (docs/limits.md).

RESULT: FAIL - 6 findings at or above error (6 error, 4 warning, 2 info)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and the tool's own
choice:

```
  ERROR    branch-requirement            examples/messy/Packages/OrderCore/Package.swift:14
           the package "keychain-store" follows the branch develop: what it resolves to changes with every push to that branch, and a package that depends on a branch cannot be used by a package that depends on versions
           fix: depend on a released version, such as from: "1.2.0"; if the package publishes no versions, pin a revision for now and ask its owners for a tag
           rule: a requirement that follows a branch
           basis: a package with a branch-based or commit-based requirement cannot be used by a package that uses a version-based requirement, so such requirements are removed before a version is published (Package (Swift Package Manager, PackageDescription API on swift.org), https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html)
           basis: a branch rule is meant for packages developed together whose versions are not published (Adding package dependencies to your app (Apple Developer Documentation, Xcode), https://developer.apple.com/documentation/xcode/adding-package-dependencies-to-your-app)
           basis: Xcode advises the version rule, up to the next major or minor version, a range or an exact version, for a package that follows semantic versioning (Adding package dependencies to your app (Apple Developer Documentation, Xcode), https://developer.apple.com/documentation/xcode/adding-package-dependencies-to-your-app)
           the tool's own choice: a .package call with branch: or .branch(...) in a Package.swift, and a package reference of an Xcode project whose requirement kind is branch; what the branch points at changes with every push to it, so two resolutions of the same commit can get different code
```

The clean example passes:

```
spm-dependency-check: examples/clean
input: 1 manifest; 1 Xcode project; 2 Package.resolved; 1 other file passed over; 0 folders named .build, DerivedData, Pods or .git passed over; 0 paths excluded; 0 links not followed
config: built-in defaults: deprecated packages none; indirect pins none; exclude none; minimum severity info; fail on error
rules: branch-requirement (error); insecure-url (error); conflicting-requirement (error); unpinned-dependency (error); resolved-outside-requirement (error); revision-requirement (warning); missing-resolved (warning); stale-pin (warning); wide-range (warning); deprecated-package (warning); unreadable-requirement (warning); local-package (info); unreadable-file (error); scan-limit (error)
findings: 0

Files (4)

  file                                                                                              kind                 remote  local  pins  products  error  warning  info
  examples/clean/FernhillNotes.xcodeproj/project.pbxproj                                            Xcode project        3       0      0     3         0      0        0
  examples/clean/FernhillNotes.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved  Package.resolved v3  0       0      3     0         0      0        0
  examples/clean/Tools/Package.resolved                                                             Package.resolved v1  0       0      1     0         0      0        0
  examples/clean/Tools/Package.swift                                                                manifest             1       0      0     1         0      0        0

Packages (4)

  package       kind    declared  requirement                  resolved  products
  argument-kit  remote  1         up to next minor from 1.2.0  1.2.3     1
  markdownview  remote  1         up to next minor from 1.8.0  1.8.3     1
  netkit        remote  1         from 5.2.0                   5.4.1     1
  sync-engine   remote  1         3.1.0..<4.0.0                3.2.0     1

Summary

  packages: 4 (4 remote, 0 local), in 4 declarations
  requirement kinds: 1 up to next major, 2 up to next minor, 1 range
  resolved: 4 pins in 2 Package.resolved files
  products used by targets: 4

Rules (14)

  rule                          level    findings
  branch-requirement            error    0
  insecure-url                  error    0
  conflicting-requirement       error    0
  unpinned-dependency           error    0
  resolved-outside-requirement  error    0
  revision-requirement          warning  0
  missing-resolved              warning  0
  stale-pin                     warning  0
  wide-range                    warning  0
  deprecated-package            warning  0
  unreadable-requirement        warning  0
  local-package                 info     0
  unreadable-file               error    0
  scan-limit                    error    0

Findings (0)

  none

note: 2 Package.resolved files are read, and their pins are pooled: examples/clean/FernhillNotes.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved and examples/clean/Tools/Package.resolved

This check reads Package.swift, Package.resolved and the Xcode project files on disk as text and fetches nothing; it never says what the latest version of a package is. A finding is a lead with a file and a line, and a clean result is not a package resolution and not a build (docs/limits.md).

RESULT: PASS - no finding at or above error
```

## How the files are read

1. The project folder is listed with a list of folders of its own and no link followed; every Package.swift, every
   Package.resolved and every project.pbxproj inside a *.xcodeproj folder is read, and the folders .build,
   DerivedData, Pods and .git and the paths of `--exclude` are passed over.
2. Each Package.swift is cut into tokens with its comments left out and its strings kept, and its `.package(` and
   `.product(` calls are read by their shape.
3. Each project.pbxproj is walked as a property list, and only its package references and package products are read.
4. Each Package.resolved is read as strict JSON, in format 1, 2 or 3; the pins of all of them are pooled.
5. The checks put the declarations side by side by package identity, and each pin against each requirement of its
   identity.

[docs/method.md](docs/method.md) gives the details, and
[decision 2](docs/decisions/0002-read-manifests-as-text-and-the-xcode-project-with-a-targeted-reader.md) says why the
manifests are read as text and the Xcode project with a targeted reader.

## What it reports

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `branch-requirement` | `rules.branchRequirement` | error | a requirement that follows a branch, in a manifest or an Xcode project |
| `insecure-url` | `rules.insecureUrl` | error | a package URL that is http://, git://, SSH, file:// or has no scheme |
| `conflicting-requirement` | `rules.conflictingRequirement` | error | one package identity with requirements that allow different versions |
| `unpinned-dependency` | `rules.unpinnedDependency` | error | a declared remote package no Package.resolved pins |
| `resolved-outside-requirement` | `rules.resolvedOutsideRequirement` | error | a pin outside the bounds of its requirement, an exact mismatch, another branch or commit |
| `revision-requirement` | `rules.revisionRequirement` | warning | a requirement that names a bare revision and no version |
| `missing-resolved` | `rules.missingResolved` | warning | remote dependencies and no Package.resolved in the folder |
| `stale-pin` | `rules.stalePin` | warning | a pin that no manifest or Xcode project declares |
| `wide-range` | `rules.wideRange` | warning | a range that reaches past the next major version, such as "1.0.0"..<"99.0.0" |
| `deprecated-package` | `rules.deprecatedPackage` | warning | a package whose location matches `deprecatedPackages` |
| `unreadable-requirement` | `rules.unreadableRequirement` | warning | a declaration written with a variable, interpolation or a form the reader does not take |
| `local-package` | `rules.localPackage` | info | a local package, by path |
| `unreadable-file` | none | error | a manifest, Package.resolved or Xcode project file that cannot be read |
| `scan-limit` | none | error | input past the limits of a run |

The two rules of input problems are always errors. [docs/method.md](docs/method.md) says exactly what each rule looks
at and what it cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public
pages each rule rests on.

## Inputs and excluded paths

| Input | What is read |
| --- | --- |
| `Package.swift` | the `.package(...)` dependencies in every requirement form, local packages by `path:`, registry packages by `id:`, and the `.product(name:package:)` of the targets |
| `*.xcodeproj/project.pbxproj` | the XCRemoteSwiftPackageReference entries with their requirement kind (upToNextMajorVersion, upToNextMinorVersion, exactVersion, versionRange, branch, revision), the XCLocalSwiftPackageReference entries and the package products |
| `Package.resolved` | next to a manifest or under `xcshareddata/swiftpm` of a workspace, in format 1 (`object.pins`), 2 or 3 (`pins`) |
| `--exclude <pattern>` and `exclude` | paths left out, matched relative to the project folder: `*` and `?` stay in one folder, `**` crosses folders, so `Vendor/**` leaves the folder Vendor out |

The folders .build, DerivedData, Pods and .git are never read. [docs/inputs.md](docs/inputs.md) describes every input.

## What is not checked

The tool reads the files it is given and never guesses. It does not:

- resolve packages, so it does not see the versions a build gets in the end, which version a resolution would pick, or
  whether two requirements can be met together;
- fetch the manifests of the dependencies, so the packages a dependency brings in are reported as stale pins until
  they are listed in `indirectPins`;
- look a version up, so it does not say whether a version is old, whether a newer one exists, whether a tag still
  exists or whether a package has a known vulnerability;
- compile Swift, so a dependency built from a variable, a condition or a function is not read as written, and a
  version-specific manifest such as Package@swift-5.9.swift is not read;
- read CocoaPods or Carthage files, or the rest of the Xcode project;
- read a date or the clock;
- decide whether the dependencies are safe: it is not a package resolution and not a build.

So a clean run means the project holds none of the problems the rules look for, and every report says so.

## The configuration file

```json
{
  "name": "Copperleaf dependency review",
  "exclude": ["Vendor/**"],
  "deprecatedPackages": [
    { "match": "code.example.test/old-tools/*", "use": "the old-tools organization moved to code.example.test/ridge-tools; point the URL there" }
  ],
  "indirectPins": ["logkit"]
}
```

Every key is optional, and without `--config` the defaults apply. `rules` sets the level of each rule (`info`,
`warning`, `error` or `off`); `deprecatedPackages` lists patterns of package locations, such as
`code.example.test/old-org/*`, with what to use instead, and is empty by default, because which packages a team has
left behind, and where a repository moved, is the team's own list; `indirectPins` lists the identities of pins that a
dependency brings in, which `stale-pin` then leaves alone, also empty by default; `exclude` lists paths to leave out;
`minSeverity` sets the lowest level shown and `failOn` the lowest level that fails the run. A key the tool does not
know is an error with its line and a suggestion, and a key named twice is refused. [docs/inputs.md](docs/inputs.md)
describes every key, and `--print-defaults` writes the whole default configuration out.

## Formats

- `text`: for a terminal: what was read, the configuration, the rules, the files with their counts, the packages with
  their requirements and pins, the summary, the count of every rule, the findings with the file and line and what to
  change, the notes, the notice and the result. With `--explain` also the rule, the points of the public pages and the
  tool's own choice behind each finding.
- `json` (or `--json`): the whole report: the input, the configuration, the files, the packages, the summary, the
  counts per rule, every finding with its file, line and column, the totals, the result, the notes and the notice.
- `csv`: one record per finding, ready for a sheet: the level, the rule, the file, the line, the column, what was found
  and what to change, with CRLF line ends as RFC 4180 writes. A field that a spreadsheet could read as a formula gets a
  single quote in front. The start of the messy example:

```
level,rule,file,line,column,found,fix
error,resolved-outside-requirement,examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved,10,21,"Package.resolved pins ""analytics-kit"" at 3.1.2, which the requirement exact 3.1.0 in examples/messy/CopperleafOrders.xcodeproj/project.pbxproj:79 does not allow (above 3.1.0)","resolve the packages again so the pin follows the requirement, and commit the Package.resolved; if the pin is the version you want, change the requirement to allow it"
error,resolved-outside-requirement,examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved,63,21,"Package.resolved pins ""netkit"" at 4.9.0, which the requirement from 5.0.0 in examples/messy/CopperleafOrders.xcodeproj/project.pbxproj:63 does not allow (lower than 5.0.0)","resolve the packages again so the pin follows the requirement, and commit the Package.resolved; if the pin is the version you want, change the requirement to allow it"
error,insecure-url,examples/messy/Packages/OrderCore/Package.swift,13,23,"the package ""imagecache"" is named by http://code.example.test/kestrel-labs/imagecache.git: it is a plain http URL, so the code of the package and the answers of the server travel unencrypted and can be changed on the way","name the package by the https URL of its Git repository; for a private package, give the machines that build a credential for https, or set this rule to warning for the SSH URLs your team agreed on"
```

- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` (for info) with the file, line and
  column, which GitHub shows as an annotation in the pull request, then a summary line. The characters a command gives
  a meaning to are escaped. Two findings of the messy example:

```
::error file=examples/messy/Packages/OrderCore/Package.swift,line=13,col=23,title=spm-dependency-check insecure-url::the package "imagecache" is named by http://code.example.test/kestrel-labs/imagecache.git: it is a plain http URL, so the code of the package and the answers of the server travel unencrypted and can be changed on the way; fix: name the package by the https URL of its Git repository; for a private package, give the machines that build a credential for https, or set this rule to warning for the SSH URLs your team agreed on
::warning file=examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved,line=31,col=5,title=spm-dependency-check stale-pin::Package.resolved pins "legacy-promises" (https://code.example.test/kestrel-labs/legacy-promises.git) at 6.2.0, but no manifest or Xcode project of the folder declares it: a dependency that was removed, or one that a dependency brings in; fix: resolve the packages again so the pin of a removed dependency goes away; if a dependency brings the package in, add its identity to indirectPins
```

## Exit codes

`0`: no finding at or above the fail-on level (`error` by default). `1`: at least one finding at or above it; with the
default, a branch requirement, a URL that is not https, one package with two requirements, a declared package that is
not pinned, a pin outside its requirement, or a file the tool could not read; with `--fail-on warning`, bare
revisions, a missing Package.resolved, stale pins, wide ranges, deprecated packages and declarations the reader cannot
read too. `2`: a usage or input error: no project named, two projects named, an unknown option, an option given twice,
`--explain` with the csv or github format, a URL in place of a path, a project that is a file or is missing, a symbolic
link, an `--exclude` pattern that is not valid, or a configuration with an unknown key, a key named twice or a value of
the wrong kind. With exit code `2` the tool gives no result and prints the problems on standard error.

## Limits

The tool reads files; it fetches nothing and connects to nothing. A run reports the problems of docs/method.md that the
project holds. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size limits: 8 MB for a file,
50,000 files and folders listed, folders nested up to 32 deep, 2,500 manifests, Package.resolved and Xcode project
files, 2,500 declarations of a manifest, 5,000 pins of a Package.resolved, 500 findings listed per rule.
[docs/threat-model.md](docs/threat-model.md) lists the risks of reading these files from a pull request and their
controls, and [docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration, lists the project, reads every file by its kind, and builds the report of the run |
| `src/walk.js`, `src/files.js` | the listing of the project with no link followed, and the bounded reading of files by their byte order mark |
| `src/swift.js` | Package.swift read as text: tokens with comments left out and strings kept, the `.package(` and `.product(` calls |
| `src/pbxproj.js` | the targeted reader of project.pbxproj: the property list grammar and the package references and products |
| `src/resolved.js`, `src/json.js` | Package.resolved in formats 1, 2 and 3, read as strict JSON |
| `src/semver.js`, `src/urls.js` | semantic versions and the bounds of requirements, and the scheme, location and identity of a URL |
| `src/project.js` | the checks of the project, the table of packages and the summary |
| `src/glob.js` | the path and location patterns |
| `src/config.js`, `src/defaults.js` | the configuration file over the defaults |
| `src/rules.js` | the rules, their levels and the result |
| `src/report.js`, `src/csv.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON, CSV and GitHub output, the cleaning of text from the input, number formats and compared words |
| `src/data.js` | the public pages and the points the rules rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| The forms of a dependency, from: as the advised form, exact versions and conflicts, branch and revision requirements that cannot be published, local packages | Swift Package Manager, https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html |
| Every way to create a dependency, and that resolution is recorded in Package.resolved | Apple Developer Documentation, https://developer.apple.com/documentation/packagedescription/package/dependency |
| Adding a dependency by its https Git URL, version tags with three parts, local packages with no version | Swift Package Manager documentation, https://github.com/swiftlang/swift-package-manager/blob/main/Sources/PackageManagerDocs/Documentation.docc/Dependencies/AddingDependencies.md |
| What Package.resolved records, resolve and update, and what happens without the file | Swift Package Manager documentation, https://github.com/swiftlang/swift-package-manager/blob/main/Sources/PackageManagerDocs/Documentation.docc/ResolvingPackageVersions.md |
| The version, branch and commit rules of Xcode, and committing Package.resolved | Apple Developer Documentation, https://developer.apple.com/documentation/xcode/adding-package-dependencies-to-your-app |
| Package.resolved in CI, and SSH URLs for packages that need authentication | Apple Developer Documentation, https://developer.apple.com/documentation/xcode/building-swift-packages-or-apps-that-use-them-in-continuous-integration-workflows |
| Swift repositories moving to another GitHub organization | swift.org blog, https://www.swift.org/blog/swiftlang-github/ |
| The order of semantic versions, and the meaning of a major version | Semantic Versioning, https://semver.org/spec/v2.0.0.html |
| The CSV format | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object, and UTF-8 | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| Formulas hidden in CSV files | OWASP, https://community.owasp.org/attacks/CSV_Injection |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

An iOS codebase that changes hands carries its dependency setup with it: packages added in Xcode and in local
packages over the years, a branch someone followed during a release, a Package.resolved nobody resolved again after a
change. None of it stops the build, so it stays until someone reads the manifests, the Xcode project and the resolved
versions side by side, which is the first review a team does when it takes over an app or brings in new developers for
it. How teams for such work are put together is described on the page
[Hire iOS Developers](https://innerluxes.dev/application/mobile/development/ios/developers-for-hire).

## License

MIT
