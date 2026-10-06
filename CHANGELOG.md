# Changes

## 1.0.0

First release.

- Reviews the Swift Package Manager dependency setup of an iOS or macOS app or package from its files alone: every
  Package.swift, every Package.resolved and the package references of every *.xcodeproj/project.pbxproj below the
  project folder, with .build, DerivedData, Pods and .git passed over and `--exclude` patterns left out. Fetches
  nothing, runs no Swift and no Xcode, follows no symbolic link, reads no clock and never says what the latest version
  of a package is.
- Package.swift read as text, as a documented heuristic: comments and nested block comments left out, string literals
  of every form kept with their values, and the `.package(` calls read with every requirement form (from:, exact:,
  branch:, revision:, half-open and closed ranges, .upToNextMajor(from:), .upToNextMinor(from:), .exact, .branch and
  .revision), local packages (`path:`), registry packages (`id:`) and the `.product(name:package:)` of the targets.
- A targeted reader of project.pbxproj with no dependency: the old-style property list grammar walked once with no
  recursion and limits of depth, values and string length, and only the XCRemoteSwiftPackageReference,
  XCLocalSwiftPackageReference and XCSwiftPackageProductDependency entries read, with every requirement kind.
- Package.resolved read in its formats 1, 2 and 3 with the strict JSON reader, with the line of every pin.
- A small comparer of semantic versions and the bounds of every requirement, so from: "5.0.0",
  .upToNextMajor(from: "5.0.0") and "5.0.0"..<"6.0.0" are one requirement.
- Twelve rules in three levels: a branch requirement (`branch-requirement`), a URL that is not https
  (`insecure-url`), one package with two requirements (`conflicting-requirement`), a declared package Package.resolved
  does not pin (`unpinned-dependency`), a pin outside its requirement (`resolved-outside-requirement`), a bare revision
  (`revision-requirement`), remote dependencies with no Package.resolved (`missing-resolved`), a pin nothing declares
  (`stale-pin`), a range past the next major version (`wide-range`), a package of the list of deprecated or moved
  packages (`deprecated-package`), a declaration the reader cannot read (`unreadable-requirement`) and a local package
  (`local-package`); and two rules of input problems that cannot be lowered (`unreadable-file`, `scan-limit`).
- A table of the files with their declarations, pins, products and findings, a table of the packages with their
  requirements, what they are pinned at and the products used, and a summary of the requirement kinds.
- A configuration file in strict JSON over documented defaults: the level of every rule, the deprecated or moved
  packages, the pins a dependency brings in, the paths left out, the minimum severity and the level that fails the run;
  a key the tool does not know is an error with its line and a suggestion, and a key named twice is refused.
- Reports as text, JSON, CSV with one row per finding (`--format csv`) and GitHub workflow commands (`--format github`)
  that show each finding as an annotation; every finding has its file, line and column; `--min-severity`, `--fail-on`,
  `--explain` with the rule, the sources and the tool's own choice, and `--print-defaults`. Exit code `0` when no
  finding is at or above the fail-on level, `1` when one is, `2` for a usage or input error, with no result.
- A review of the files, not a package resolution and not a build: every report says so.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
