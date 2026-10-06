# Threat model

## What the tool touches

- It reads the files named Package.swift, Package.resolved and project.pbxproj (inside a *.xcodeproj folder) below the
  project folder named on the command line, and the configuration named with `--config`. It lists the folders of the
  project to find them. Nothing else is opened.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL it reads, follows no symbolic link, evaluates nothing it reads, runs
  no Swift, no Xcode and no other program, and reads no clock.

## What the input may hold

The manifests, the Xcode projects and the Package.resolved files come from a repository, and in a pipeline that checks
every pull request they may be written by whoever opened the pull request. Through them, a person can try to:

- make the tool read outside the folder or fetch something: a symbolic link or a junction in the project, a link named
  on the command line, a file swapped for a link between the listing and the read, a package URL or a local path that
  points elsewhere, a project path written as a web address;
- exhaust the memory, the stack or the time: files of megabytes, projects with tens of thousands of files, folders
  nested very deep, property lists nested very deep, Swift text with runs of hundreds of thousands of quotes, pounds,
  escapes, comments or calls, JSON with thousands of pins, patterns with many wildcards, URLs built to make a pattern
  look back over them;
- move the result: a rule set to off, `failOn` raised, an exclude pattern that leaves out the manifest with the
  problem, a pin listed in `indirectPins`, a dependency written in a form the heuristic does not read;
- slip in something that is not text: a binary file named Package.swift, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators in
  a file name, a URL, a branch or a version;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the GitHub
  format writes into a command;
- hide a formula in the CSV report: a URL, a branch or a path that starts with `=`, `+`, `-` or `@`, which a
  spreadsheet may run when the report is opened;
- change how objects behave: a package identity, a key of the Xcode project or a name of the JSON named `__proto__`,
  `constructor` or `toString`;
- weaken the supply chain of the app itself: a package named by http://, git:// or an SSH URL, which `insecure-url`
  reports, or a requirement on a branch, which `branch-requirement` reports.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read outside the folder or walk a loop | Every link met in the listing is counted and none is followed, and a link named on the command line is refused; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle. Tests put links to a file and to a folder in the project |
| A URL or a local path makes the tool read or fetch outside the project | A URL and a path are only read as text and compared; a local package is named, never opened; nothing is fetched |
| The tool fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, no Swift or Xcode is run, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | Files have a size limit checked on the open handle before they are read; the listing has limits of entries, depth and files; the manifest reader reads each file once, caps tokens, declarations and the tokens of one call, and moves past each call it has read; the property list reader keeps a list of its own with no recursion and has limits of depth, values and string length; the JSON reader has limits of depth, values and string length; a URL is read by its first colon, with no pattern that looks back; patterns are matched in time bounded by their length; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the input or the configuration; exclude and location patterns are matched by a small matcher of the tool's own. A test looks for `new RegExp` in src |
| The result is moved through the input or the configuration | A file that cannot be read and input past the limits are error findings that cannot be set off; a declaration the reader cannot read is a finding of its own; a rule set to off, every exclude pattern and every indirect pin are named in the report. Review a change to the configuration like a change to code (docs/secure-defaults.md) |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes or a broken pair in UTF-16, and bytes that are not valid make the file an error finding |
| Text from the input rewrites the terminal | Every text, file names included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts escapes, direction controls and line separators in a URL, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `%0A::error file=` and a line break with `::warning::` into a branch |
| A formula runs when the CSV report is opened | A field that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a single quote in front. The OWASP page on CSV injection says no one escape is safe in every program, so treat a report built from files you do not trust as untrusted data, and open it with formulas off |
| `__proto__` changes how objects behave | Dictionaries of the Xcode project are kept in Map objects, identities in maps and sets, names are looked up with `Object.hasOwn`, and the JSON reader defines own properties. A test uses `__proto__`, `constructor`, `toString` and `hasOwnProperty` as identities and keys |
| A device or a pipe hangs the tool | A path that is not a regular file or folder is refused before it is read, and the listing passes over every entry that is not a file or a folder |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folders as they were |

## Out of scope

The versions SwiftPM and Xcode resolve, whether a package is safe or up to date, the forms of a manifest
docs/limits.md leaves out, who may change the configuration in your repository, and where your pipeline keeps the
output.

A clean result is not a package resolution and not a build.
