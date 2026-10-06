# Inputs

## The project

```
spm-dependency-check <project folder> [--exclude <pattern>]... [--config <file>]
```

Name one folder: the folder of the app or the package, the one that holds the .xcodeproj, the .xcworkspace or
Package.swift. Every Package.swift, every Package.resolved and every project.pbxproj inside a *.xcodeproj folder below
it is read; the folders .build, DerivedData, Pods and .git are passed over, and so is every path that matches an
exclude pattern. A project that is a file, a symbolic link or missing stops the run with exit code `2`. Check two
projects in two runs.

The paths in the report are relative to the folder you run the command in, with forward slashes on every system,
followed by the line.

## The files

| File | Where | What is read |
| --- | --- | --- |
| `Package.swift` | anywhere below the folder | the `.package(...)` dependencies and the `.product(name:package:)` products of the targets, as text |
| `Package.resolved` | next to a manifest, or under `xcshareddata/swiftpm` of a workspace, such as `App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` | the pins of format 1, 2 or 3 |
| `project.pbxproj` | inside a folder named `*.xcodeproj` | the XCRemoteSwiftPackageReference, XCLocalSwiftPackageReference and XCSwiftPackageProductDependency entries |

Every Package.resolved read is pooled: a pin in any of them counts for a declaration anywhere in the folder.

## Exclude patterns

`--exclude <pattern>` and `exclude` of the configuration leave paths of the project out. A pattern is matched against
the path relative to the project folder, with forward slashes: `*` is any run of characters but a slash, `?` one
character but a slash, `**` any run of characters with slashes, and `**/` any run of folders, none included. A folder
is left out when the pattern matches its path or its path with a slash after it, so `Vendor/**` leaves out the folder
Vendor and all below it, and `**/Examples/**` every folder named Examples. A pattern may not be absolute, hold a
backslash or `..`, or be longer than 200 characters. The patterns of `--exclude` add to those of the configuration.

## The configuration file

The configuration is one JSON object, read by a strict reader of RFC 8259 (no comments, no trailing comma, no name
given twice). Every key is optional; without `--config` the defaults apply, and `--print-defaults` writes them out. A key
the tool does not know is an error with its line and a suggestion, and stops the run with exit code `2`.

```json
{
  "name": "Copperleaf dependency review",
  "exclude": ["Vendor/**"],
  "rules": { "insecureUrl": "warning", "localPackage": "off" },
  "deprecatedPackages": [
    { "match": "code.example.test/old-tools/*", "use": "the old-tools organization moved to code.example.test/ridge-tools" }
  ],
  "indirectPins": ["logkit"],
  "minSeverity": "info",
  "failOn": "error"
}
```

| Key | Value | Default |
| --- | --- | --- |
| `name` | a text of 1 to 120 characters, shown in the report | none |
| `rules` | an object of rule keys to `info`, `warning`, `error` or `off` | below |
| `deprecatedPackages` | up to 100 entries: `match`, a pattern of a package location; `use`, what to use instead, 1 to 300 characters | none |
| `deprecatedPackages[].match` | a location pattern: a host and a path in lowercase with no scheme, where `*` is any run of characters but a slash and `?` one character, such as `code.example.test/old-org/*` | |
| `deprecatedPackages[].use` | a text | |
| `indirectPins` | up to 100 package identities in lowercase, such as `swift-log`: pins that a dependency brings in, which `stale-pin` does not report | none |
| `exclude` | up to 100 path patterns | none |
| `minSeverity` | the lowest level shown: `info`, `warning` or `error` | `info` |
| `failOn` | the lowest level that fails the run | `error` |

A location is matched in its normalized form: https://Code.Example.test/Old-Org/Repo.git is
`code.example.test/old-org/repo`. No key takes a regular expression.

A list replaces its default as a whole. A name given twice in a list of texts is kept once. `--min-severity` and
`--fail-on` on the command line win over the configuration.

### Why the lists are empty by default

`deprecatedPackages` is empty: which packages a team has left behind, and where a repository moved, is the team's own
list, and the tool fetches nothing that could tell it. An entry such as the one above is how a move like that of the
Swift repositories from the apple organization to the swiftlang organization on GitHub is written down.
`indirectPins` is empty: the packages a dependency brings in are only known by reading the manifests of the
dependencies, which the tool does not fetch; list them once you have checked them.

## The keys of rules

| Key | Rule | Default |
| --- | --- | --- |
| `rules.branchRequirement` | `branch-requirement` | error |
| `rules.insecureUrl` | `insecure-url` | error |
| `rules.conflictingRequirement` | `conflicting-requirement` | error |
| `rules.unpinnedDependency` | `unpinned-dependency` | error |
| `rules.resolvedOutsideRequirement` | `resolved-outside-requirement` | error |
| `rules.revisionRequirement` | `revision-requirement` | warning |
| `rules.missingResolved` | `missing-resolved` | warning |
| `rules.stalePin` | `stale-pin` | warning |
| `rules.wideRange` | `wide-range` | warning |
| `rules.deprecatedPackage` | `deprecated-package` | warning |
| `rules.unreadableRequirement` | `unreadable-requirement` | warning |
| `rules.localPackage` | `local-package` | info |

`unreadable-file` and `scan-limit` have no key: they are always errors. Setting a rule to `off` leaves it out of the
findings and the counts, and a note names it.
