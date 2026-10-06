// The built-in configuration: the level of every rule, the packages that are deprecated or have moved, the pins a
// dependency brings in, the paths left out, the lowest level shown and the level that fails the run. docs/inputs.md
// describes every key, and --print-defaults writes the configuration out.

// The level of every rule that the configuration can set. The two rules of input problems are always errors.
export const DEFAULT_RULES = {
  branchRequirement: 'error',
  insecureUrl: 'error',
  conflictingRequirement: 'error',
  unpinnedDependency: 'error',
  resolvedOutsideRequirement: 'error',
  revisionRequirement: 'warning',
  missingResolved: 'warning',
  stalePin: 'warning',
  wideRange: 'warning',
  deprecatedPackage: 'warning',
  unreadableRequirement: 'warning',
  localPackage: 'info'
};

// Packages that are deprecated or have moved, with what to use instead. match is a pattern of the normalized location
// of a package (host and path in lowercase, with no scheme and no .git), where * is any run of characters but a slash.
// None by default: which packages a team has left behind is its own list, and the tool fetches nothing that could tell
// it. docs/inputs.md shows an entry for a repository that moved to another organization.
export const DEFAULT_DEPRECATED_PACKAGES = [];

// The identities of pins that a dependency of a dependency brings in, which no manifest or Xcode project of the folder
// names. None by default; the tool cannot see them without fetching the manifests of the dependencies.
export const DEFAULT_INDIRECT_PINS = [];

// Paths of the project that are not read, as patterns relative to the project folder. None by default; the folders
// .build, DerivedData, Pods and .git are never read.
export const DEFAULT_EXCLUDE = [];

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'info';

// The lowest level of a finding that fails the run.
export const DEFAULT_FAIL_ON = 'error';
