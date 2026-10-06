# Limits

The tool reads Package.swift, Package.resolved and the Xcode project files of a folder from disk, as text. It is a
review of the dependency setup, not a package resolution and not a build. It fetches nothing, runs nothing, connects to
no system and asks nobody anything, and it never says what the latest version of a package is. A finding points at a
line where a problem was found, and a run without findings says only that the project holds none of the problems of
docs/method.md. Every report ends with a sentence that says so.

## What it cannot see

- **What SwiftPM and Xcode resolve.** The tool runs no resolution, so it does not see the versions a build gets in the
  end, which version a resolution would pick inside a range, or whether two requirements can be met at once. It
  compares the pins that are written with the requirements that are written.
- **Transitive dependencies.** The manifests of the dependencies are not fetched, so the tool does not know the
  transitive packages a dependency brings in. Their pins are reported by `stale-pin` until they are listed in `indirectPins`, and
  a requirement a dependency puts on them is not seen.
- **The network.** No version is looked up, so the tool does not say whether a version is old, whether a newer one
  exists, whether a tag or a branch still exists, whether a package has a known vulnerability, or whether a repository
  moved. It reads no clock and no dates
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
- **Swift as a language.** A manifest is read as text by its shape
  ([decision 2](decisions/0002-read-manifests-as-text-and-the-xcode-project-with-a-targeted-reader.md)). A URL or a
  version held in a variable (`let version = "1.2.0"` then `from: version`), built with string interpolation, chosen
  with `#if`, added in a loop or a function, or appended to `package.dependencies` after the Package(...) call is not
  read as written; a declaration of that kind is an `unreadable-requirement` finding when its call is seen, and is not
  seen at all when no `.package(` call holds it. Both branches of an `#if` are read.
- **Version-specific manifests.** Package@swift-5.9.swift and the like are not read; only Package.swift is.
- **The rest of the Xcode project.** Of a project.pbxproj, only the package references and the package products are
  read: which target uses a product, build settings, and packages added through an .xcworkspace that is not part of a
  project are not.
- **Other dependency managers.** CocoaPods (Podfile, Podfile.lock) and Carthage are not read, and the folder Pods is
  passed over.
- **Registry packages, in part.** A registry package (`.package(id:)`) is read with its requirement, but its id is not
  a URL, so `insecure-url` does not apply to it.
- **Pre-releases inside a range.** Versions are compared by the plain order of semantic versions, so a pin at
  6.0.0-beta.1 meets from: "5.0.0"; SwiftPM itself takes a pre-release only when a requirement names one.
- **What is outside the folder.** Files outside the project folder are not read, and a local package outside it is
  only named.
- **Whether a finding matters to you.** A private package may need an SSH URL, a library may leave Package.resolved
  out on purpose, and a branch may be followed while two packages are developed together. Set the level of a rule, or
  turn it off, in the configuration.

## The readers

- The manifest reader takes the forms of docs/method.md and refuses the rest as `unreadable-requirement`.
- The Xcode project reader refuses a property list with a missing semicolon, a key given twice in one dictionary, a
  string, a list or a dictionary that is not closed, or a character the grammar does not have, each with its line and
  column.
- The Package.resolved reader is strict JSON and takes formats 1, 2 and 3 only.
- A file is read as UTF-8, with or without a byte order mark, or as UTF-16 with its byte order mark; UTF-16 with no
  mark, and any other encoding, is an `unreadable-file` finding.

## Size limits

Past a limit, the input is refused with exit code `2` and no result, a file is an error finding, or the listing stops
with a `scan-limit` finding.

| What | Limit |
| --- | --- |
| a manifest, a Package.resolved or an Xcode project file | 8 MB; a larger one is an `unreadable-file` finding |
| the configuration | 1 MB |
| files and folders of the project listed | 50,000 |
| folders nested | 32 deep |
| manifests, Package.resolved and Xcode project files | 2,500 |
| tokens of a manifest | 500,000 |
| package declarations of a manifest | 2,500 |
| tokens of one `.package(` or `.product(` call | 400 |
| values of an Xcode project file | 2,000,000, nested up to 64 deep, strings of up to 65,536 characters |
| pins of a Package.resolved | 5,000 |
| values of a Package.resolved | 400,000, strings of up to 4,096 characters |
| a URL or a version read | 4,096 and 128 characters |
| exclude patterns | 100, of up to 200 characters |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result |
| problems of the input | 20 listed; the rest are counted |

The tests check thousands of declarations, references and pins, Swift text, property lists and JSON with runs of
hundreds of thousands of quotes, comments, pounds, escapes, braces and calls, patterns of hundreds of wildcards, long
locations, hundreds of packages and folders nested past the limit, each with a time check.
