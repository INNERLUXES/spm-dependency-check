# Fernhill Notes: a setup in good order

A made-up company has an iOS notes app, `FernhillNotes.xcodeproj`, with three packages from https URLs: one up to the
next major version, one up to the next minor version and one in a range that stops at the next major version. The
Package.resolved of the project (format 3) pins each of them inside its requirement. A small command-line tool of the
repository, `Tools/Package.swift`, writes its requirement as `.upToNextMinor(from: "1.2.0")` and keeps its own
Package.resolved in the older format 1.

```
node bin/spm-dependency-check.js examples/clean
```

The hosts are on the reserved `.test` domain and every package is made up. The manifest and the Xcode project are
made-up input for the tool, not code of this repository.
