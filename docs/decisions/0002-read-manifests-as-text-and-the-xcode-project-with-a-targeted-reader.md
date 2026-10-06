# 2. Read manifests as text, and the Xcode project with a targeted reader

## Status

Accepted

## Context

The facts the checks need sit in three kinds of files. Package.resolved is JSON with a small, stable shape. The Xcode
project file, project.pbxproj, is an old-style property list, a format of its own with no specification of Apple's
that the tool could follow word for word, but a simple grammar of dictionaries, lists and strings. Package.swift is a
Swift program: a dependency can be built from a variable, a condition or a function, and only Swift compiling and
running the manifest knows the result. Running it would need a Swift toolchain, would fetch the packages, and would
execute code from the repository under review, which in a pipeline that checks pull requests may be written by anyone.

Most manifests and projects use a few fixed forms: `.package(url: "...", from: "1.2.3")` and its siblings, and the
package references Xcode writes. A Swift parser or a property list library would bring code the project does not
review, for the few forms the checks read.

## Decision

1. Package.swift is read as text by src/swift.js: the file is cut into tokens once, with its comments left out and its
   string literals kept with their values, and the `.package(` and `.product(` calls are read by their shape. A value
   written in a form the reader does not take is reported as such, never guessed. The forms read are listed in
   docs/method.md, and those that are not in docs/limits.md.
2. project.pbxproj is read by src/pbxproj.js, a targeted reader: it walks the property list grammar once with a list of
   its own and no recursion, with limits of depth, values and string length, and then reads only the package
   references and package products of the objects dictionary. Everything else in the file is passed over. A file that
   is not a property list the reader takes is refused with its place.
3. Package.resolved is read with the strict JSON reader the configuration uses, in its formats 1, 2 and 3, and any
   other format is refused.
4. The tool never runs Swift or Xcode and never evaluates anything it reads.

## Consequences

- The tool needs no Swift toolchain, no Xcode, no macOS and no network, runs in a second on a large project, and the
  same files give the same report on Linux, Windows and macOS.
- It is a heuristic: a dependency built in code is not read as written, and both sides of an `#if` are read. The
  report says so, docs/limits.md lists the forms, and every rule can be set to info or off.
- A new kind of Xcode requirement, or a new format of Package.resolved, is refused until the reader learns it; adding
  it is a change to the reader, with its tests.
