# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "spm-dependency-check security", or use private vulnerability
reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up project, manifest, Xcode project file, Package.resolved or configuration that shows the
problem, the command you ran, what you expected and what happened. Use made-up companies, apps, packages and people,
never the files of a real app, and never a real credential, signing key or token, even an old one.

## Scope

In scope:

- an input that makes the tool read a file outside the project folder and the configuration it was given, or follow a
  symbolic link or a junction
- an input that makes the tool open a network connection, fetch a URL it reads, run Swift, Xcode or any other program,
  or evaluate any part of a file
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as very large
  files, projects with very many files or folders, property lists nested deep, or long runs of quotes, pounds,
  escapes, comments, braces or calls
- binary or invalid input that the tool reads as if it were a manifest, an Xcode project file or a Package.resolved
- a file the tool fails to read and passes over without an error finding
- a problem that docs/method.md says is reported but that a form of a file it says it reads hides from the tool
- a run that passes at a `failOn` level although the input holds a finding at that level that docs/method.md says is
  reported
- text from a file or a file name that rewrites the terminal through control or direction characters, starts or ends a
  GitHub workflow command, is shown unescaped in the output, or starts a formula in the CSV report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, what SwiftPM or Xcode resolve and whether a package
is safe or up to date (a clean result is not a package resolution and not a build), who may change the configuration
in your repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
