# 3. Check the files on disk, and fetch nothing

## Status

Accepted

## Context

Some facts about dependencies live elsewhere: the tags a repository holds, the latest version of a package, the
packages a dependency brings in, whether a repository moved, and whether a branch still exists. A check could clone
each package, list its tags or read its manifest. Each would need the network and credentials for private packages,
would make the result depend on the state of a server, and would let a file in a pull request make the pipeline reach
an address it names.

What matters in a review of the dependency setup is what the repository says: the manifests, the Xcode project and the
Package.resolved as they are written.

## Decision

1. The tool reads the files of the project folder and the configuration, and nothing else. It fetches nothing,
   resolves nothing, runs no program and calls no service.
2. A pin is compared with the requirements that are written; which version a resolution would pick is not worked out.
3. The packages a dependency brings in are not looked up: their pins are reported as stale until the team lists them in
   `indirectPins` of the configuration.
4. Packages that are deprecated or moved are known only by the list `deprecatedPackages` of the configuration, which is
   empty by default.
5. The tool never says what the latest version of a package is, and never says that a version is old.

## Consequences

- The result depends only on the files, and a run needs no network access, no secret and no toolchain.
- What a resolution picks, the dependencies of the dependencies, and whether a newer version exists are not checked
  (docs/limits.md).
- A team keeps its own lists of indirect pins and deprecated packages in the configuration, reviewed like code.
