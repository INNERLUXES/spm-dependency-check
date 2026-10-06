// The public pages the checks rest on, and what each says, written in this project's own words. research/sources.md
// lists every page with a longer note on each, and test/data.test.js checks that every page here is listed there and
// that every rule names points that exist. The code in src/ uses these constants and never writes a reason of its own
// in a report.

const SWIFTPM_DOCS = 'https://github.com/swiftlang/swift-package-manager/blob/main/Sources/PackageManagerDocs/Documentation.docc';
const APPLE = 'https://developer.apple.com/documentation';

export const SOURCES = [
  { id: 'swiftPackage', title: 'Package (Swift Package Manager, PackageDescription API on swift.org)', url: 'https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html' },
  { id: 'appleDependency', title: 'Package.Dependency (Apple Developer Documentation, PackageDescription)', url: `${APPLE}/packagedescription/package/dependency` },
  { id: 'swiftpmAdding', title: 'Adding dependencies to a Swift package (Swift Package Manager documentation)', url: `${SWIFTPM_DOCS}/Dependencies/AddingDependencies.md` },
  { id: 'swiftpmResolving', title: 'Resolving and updating dependencies (Swift Package Manager documentation)', url: `${SWIFTPM_DOCS}/ResolvingPackageVersions.md` },
  { id: 'xcodeAdding', title: 'Adding package dependencies to your app (Apple Developer Documentation, Xcode)', url: `${APPLE}/xcode/adding-package-dependencies-to-your-app` },
  { id: 'xcodeCi', title: 'Building Swift packages or apps that use them in continuous integration workflows (Apple Developer Documentation, Xcode)', url: `${APPLE}/xcode/building-swift-packages-or-apps-that-use-them-in-continuous-integration-workflows` },
  { id: 'swiftlangMove', title: 'The Swift project moves to a new GitHub organization (swift.org blog)', url: 'https://www.swift.org/blog/swiftlang-github/' },
  { id: 'semver', title: 'Semantic Versioning 2.0.0 (semver.org)', url: 'https://semver.org/spec/v2.0.0.html' },
  { id: 'rfc4180', title: 'RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' },
  { id: 'owaspCsv', title: 'CSV Injection (OWASP)', url: 'https://community.owasp.org/attacks/CSV_Injection' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  dependencyForms: { source: 'appleDependency', text: 'a remote dependency is a Git URL with a requirement: a minimum version up to the next major, an exact version, a half-open or a closed range, a branch or a revision; a local dependency is a path' },
  fromAdvised: { source: 'swiftPackage', text: 'from: is the advised way to name a remote dependency, and takes the versions up to the next major version' },
  exactConflicts: { source: 'swiftPackage', text: 'upToNextMinor stops before the next minor version, and an exact version is not advised because it can cause conflicts in the dependency graph' },
  branchNotPublishable: { source: 'swiftPackage', text: 'a package with a branch-based or commit-based requirement cannot be used by a package that uses a version-based requirement, so such requirements are removed before a version is published' },
  localDevelopment: { source: 'swiftPackage', text: 'a local dependency is for a package under development or for packages tied closely together' },
  localNoVersion: { source: 'swiftpmAdding', text: 'a local dependency has no version constraint and uses whatever is at the path' },
  httpsExamples: { source: 'swiftpmAdding', text: 'a remote package is named by the URL of its Git repository, written with https in the examples, and its version is taken from its tags' },
  semverTags: { source: 'swiftpmAdding', text: 'a version tag has all three parts of a semantic version, major, minor and patch; a tag with one or two parts is not read as a version' },
  xcodeVersionRule: { source: 'xcodeAdding', text: 'Xcode advises the version rule, up to the next major or minor version, a range or an exact version, for a package that follows semantic versioning' },
  xcodeBranchRule: { source: 'xcodeAdding', text: 'a branch rule is meant for packages developed together whose versions are not published' },
  xcodeCommitRule: { source: 'xcodeAdding', text: 'a commit rule is not advised and is for exceptional cases: it holds one commit and brings no updates' },
  resolvedCommitted: { source: 'xcodeAdding', text: 'Xcode writes Package.resolved with the commit each dependency resolves to, and the file is committed so that everyone uses the same versions' },
  resolvedRecords: { source: 'swiftpmResolving', text: 'Package.resolved records the result of dependency resolution, and the versions in it are used for a top-level package; it is ignored when the package is a dependency of another' },
  resolvedAbsent: { source: 'swiftpmResolving', text: 'without a Package.resolved each person and each build resolves on its own, and a new user starts from the latest eligible versions' },
  resolveKeeps: { source: 'swiftpmResolving', text: 'swift package resolve keeps the versions of Package.resolved while they are still eligible, and swift package update moves to the latest eligible versions and writes the file again' },
  ciResolved: { source: 'xcodeCi', text: 'Package.resolved is committed so that CI does not build with unexpected versions, and xcodebuild gets -disableAutomaticPackageResolution so that it uses the file as it is' },
  ciSsh: { source: 'xcodeCi', text: 'a package that needs authentication can be named by an SSH URL, with keys set up on every machine that builds' },
  repositoriesMove: { source: 'swiftlangMove', text: 'the Swift project moves its repositories from the apple organization on GitHub to the swiftlang organization, so the address of a package can change while the package stays the same' },
  semverOrder: { source: 'semver', text: 'versions are compared by major, minor and patch as numbers, a pre-release is lower than its release, and build metadata does not count' },
  semverMajor: { source: 'semver', text: 'the major version is raised for every change that breaks the public API' },
  csvRecords: { source: 'rfc4180', text: 'each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice' },
  csvInjection: { source: 'owaspCsv', text: 'a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file' },
  jsonUtf8: { source: 'rfc8259', text: 'JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behavior of the software that reads it cannot be predicted, so the JSON reader of this tool refuses a repeated name' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The levels of a finding, from the lowest.
export const LEVELS = ['info', 'warning', 'error'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This check reads Package.swift, Package.resolved and the Xcode project files on disk as text and fetches nothing; it never says what the latest version of a package is. A finding is a lead with a file and a line, and a clean result is not a package resolution and not a build (docs/limits.md).';
