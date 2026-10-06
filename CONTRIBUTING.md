# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux,
Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure
development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`,
with `!` for a breaking change.

This tool reads Package.swift, Package.resolved and the Xcode project files on disk as text; a clean result is not a
package resolution and not a build. A change must keep it that way: a rule reports what a file holds, and the tool
never fetches, runs or evaluates what it reads, never runs Swift or Xcode, and never says what the latest version of a
package is.

## Changing a rule

1. Describe the change in docs/method.md first: what the rule looks at and what it can and cannot see, and add what it
   cannot see to docs/limits.md. Where the tool makes its own choice, say so in `own` in src/rules.js and say why.
2. Keep the rules to what is written. A finding must point at something a reader can check in a file: a line and a
   column. Never add a rule that needs the network, a toolchain or the clock.
3. A rule says what to change, in `fix` in src/rules.js, and names the points of the public pages it rests on in
   `basis`; a new page goes into src/data.js and research/sources.md, and docs/rules-and-sources.md lists it.
4. A run must never pass because something could not be read: a file that cannot be read and input past the limits
   are error findings, and those two rules keep no key in the configuration.
5. Add a test with the manifest, the Xcode project or the Package.resolved written inline (`manifest()`, `pbx()`,
   `resolved()`, `resolvedV1()`, `PROJECT`, `projectWith()`, `withDeps()`, `reportOf()` and `run()` in
   test/helpers.js), small enough to work out by hand, with a near miss on each side: the form that is reported and the
   form next to it that is not.
6. A rule id, once released, keeps its meaning: pipelines and other tools read it from the JSON output, the CSV report
   and the GitHub annotations.

## Changing the readers

1. The manifest reader (src/swift.js), the property list reader (src/pbxproj.js), the JSON reader (src/json.js), the
   pattern matcher (src/glob.js) and the listing of the project (src/walk.js) keep lists of their own, never recursion,
   and read each character a bounded number of times. A test in test/repo.test.js fails when a function of these files
   calls itself.
2. A reader refuses what it does not read, with its place, rather than guess. A form of a manifest or of an Xcode
   project that is read is listed in docs/method.md, and a form that is not in docs/limits.md.
3. No pattern is built from a file or the configuration, and no key of the configuration takes a regular expression. A
   test fails when `new RegExp` appears in src outside src/text.js. A pattern that runs over text from a file must not
   look back over it; src/urls.js reads a URL by its first colon for that reason.
4. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only
   when coverage is on, and allow four times the time. Never read the flags of the process for this, because they hold
   the coverage flags of the runner in every run. Run `npm run test:coverage` before you open the pull request.
5. A file written with LF, CRLF or CR line ends, as UTF-8 with or without a byte order mark or as UTF-16 with one, must
   give the same output. The example files are stored as written (`.gitattributes`), and a test reads them with CRLF
   line ends and as UTF-16.

## Changing the configuration file

1. A new key is added to `KEYS` in src/config.js, documented in docs/inputs.md and tested with a good value and a bad
   one. Every key the tool does not know stays an error, and a key named twice stays refused.
2. A default entry of `DEFAULT_DEPRECATED_PACKAGES` or `DEFAULT_INDIRECT_PINS` in src/defaults.js names the public page
   it follows, says why in docs/inputs.md, and updates the README. Both lists are empty today, and the bar for an entry
   is a page that says the package is deprecated or has moved.

## Changing a source

1. Every point the reports show is in src/data.js, written in this project's own words, with the page it comes from. A
   short phrase of a page may be named; a long quotation may not.
2. research/sources.md lists every page with a note on what it says, and docs/rules-and-sources.md lists every rule
   with its points and what to change. A test checks all three against each other. Fetch and read a page before it is
   listed, and leave out a web address that holds a number that reads like a year.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device, file permissions) is guarded with
`process.platform`, says why in its `t.skip`, and asserts no line of its own: a line is asserted only in a test that
runs on every system, and is worked out there with `lineOf()` of test/helpers.js or from the text itself, never written
by hand. `test/repo.test.js` fails when a guarded test asserts a line. Every other test builds its paths with
`resolve()` from names with forward slashes.

A test never reads the clock, the time zone of the machine or the locale.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files it is given and writes only to standard output and standard error. It opens no network
  connection, runs no program and evaluates nothing it reads.
- Text from the input, file names included, goes through `safeText` before it reaches the output or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, RFC 4180, 5.0.0)
  are fine, and so are the long object ids of an Xcode project and the commits of a Package.resolved.
- Examples and tests use made-up companies, apps, packages and people, with hosts on the reserved `.test` domain.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
