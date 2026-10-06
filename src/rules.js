// The rules and the result. Each rule names the points of the public pages it rests on (src/data.js), says where it is
// the tool's own choice, and what to change. docs/method.md says exactly what each rule looks at and what it cannot
// see. The checks themselves are in src/project.js, the reading of a manifest in src/swift.js, of an Xcode project in
// src/pbxproj.js and of a Package.resolved in src/resolved.js.

import { LEVELS } from './data.js';
import { grouped, listText, plural } from './size.js';

export const RULES = [
  {
    id: 'branch-requirement',
    key: 'branchRequirement',
    title: 'a dependency follows a branch',
    basis: ['branchNotPublishable', 'xcodeBranchRule', 'xcodeVersionRule'],
    own: 'a .package call with branch: or .branch(...) in a Package.swift, and a package reference of an Xcode project whose requirement kind is branch; what the branch points at changes with every push to it, so two resolutions of the same commit can get different code',
    rule: () => 'a requirement that follows a branch',
    fix: 'depend on a released version, such as from: "1.2.0"; if the package publishes no versions, pin a revision for now and ask its owners for a tag'
  },
  {
    id: 'insecure-url',
    key: 'insecureUrl',
    title: 'a remote package is not named by an https URL',
    basis: ['httpsExamples', 'dependencyForms', 'ciSsh'],
    own: 'the URL of a remote package in a manifest or an Xcode project whose scheme is not https: http://, git://, ssh://, the form user@host:path that git reads as SSH, file:// and a text with no scheme; http and git:// travel unencrypted, and an SSH URL needs a key on every machine and names the package differently from its https URL; a team whose private packages need SSH can set this rule to warning',
    rule: () => 'a remote package URL whose scheme is not https',
    fix: 'name the package by the https URL of its Git repository; for a private package, give the machines that build a credential for https, or set this rule to warning for the SSH URLs your team agreed on'
  },
  {
    id: 'conflicting-requirement',
    key: 'conflictingRequirement',
    title: 'the same package is declared twice with different requirements',
    basis: ['dependencyForms', 'exactConflicts', 'resolvedRecords'],
    own: 'two declarations of one package identity, in the manifests and the Xcode projects of the folder, whose requirements allow different versions; from: "5.0.0", .upToNextMajor(from: "5.0.0"), "5.0.0"..<"6.0.0" and upToNextMajorVersion 5.0.0 count as one requirement; each declaration after the first that differs is reported, with the place of the first; two locations with one identity are named in the message',
    rule: () => 'one package identity with two different requirements',
    fix: 'give the package one requirement in every manifest and Xcode project that declares it, or declare it in one place, such as a local package the app depends on'
  },
  {
    id: 'unpinned-dependency',
    key: 'unpinnedDependency',
    title: 'a dependency is missing from Package.resolved',
    basis: ['resolvedRecords', 'resolvedCommitted', 'ciResolved'],
    own: 'a remote dependency of a manifest or an Xcode project whose identity no Package.resolved of the folder pins, when the folder holds at least one Package.resolved; the files are pooled, so a pin in any of them counts',
    rule: () => 'a declared remote dependency that no Package.resolved pins',
    fix: 'resolve the packages again (swift package resolve, or File > Packages > Resolve Package Versions in Xcode) and commit the Package.resolved it writes'
  },
  {
    id: 'resolved-outside-requirement',
    key: 'resolvedOutsideRequirement',
    title: 'Package.resolved pins a version the requirement does not allow',
    basis: ['resolvedRecords', 'resolveKeeps', 'semverOrder'],
    own: 'a pin of a Package.resolved whose version is outside the bounds of a version requirement of the same identity, compared by the order of semantic versions with build metadata left out; a pin with no version under a version requirement, a pin on another branch under a branch requirement and a pin on another commit under a revision requirement count too; a version that is not a semantic version is reported as such',
    rule: () => 'a pinned version or commit outside the requirement of the package',
    fix: 'resolve the packages again so the pin follows the requirement, and commit the Package.resolved; if the pin is the version you want, change the requirement to allow it'
  },
  {
    id: 'revision-requirement',
    key: 'revisionRequirement',
    title: 'a dependency is pinned to a bare revision',
    basis: ['xcodeCommitRule', 'branchNotPublishable'],
    own: 'a .package call with revision: or .revision(...), and a package reference of an Xcode project whose requirement kind is revision; it is a warning, not an error, because a revision does not move, but it brings no updates and no version the team can read',
    rule: () => 'a requirement that names one commit and no version',
    fix: 'depend on the released version that holds the commit, such as exact: "1.2.0" or from: "1.2.0"'
  },
  {
    id: 'missing-resolved',
    key: 'missingResolved',
    title: 'remote dependencies are declared and no Package.resolved is there',
    basis: ['resolvedAbsent', 'resolvedCommitted', 'ciResolved'],
    own: 'the folder declares at least one remote dependency in a manifest or an Xcode project and holds no Package.resolved, next to a manifest or under xcshareddata/swiftpm of a workspace; reported once, at the first remote dependency; a package that is only a library for others may leave the file out on purpose, so it is a warning',
    rule: () => 'remote dependencies with no Package.resolved in the folder',
    fix: 'resolve the packages and commit the Package.resolved, next to Package.swift or in the xcshareddata/swiftpm folder of the workspace'
  },
  {
    id: 'stale-pin',
    key: 'stalePin',
    title: 'Package.resolved pins a package nothing declares',
    basis: ['resolvedRecords', 'resolveKeeps'],
    own: 'a pin whose identity no manifest and no Xcode project of the folder declares, remote or local, and that indirectPins does not list; the tool fetches nothing, so it cannot see the packages a dependency brings in, and lists them for you to put in indirectPins once checked',
    rule: (config) => `a pin no manifest or Xcode project declares${config.indirectPins.length ? `, other than ${listText(config.indirectPins, 4)}` : ''}`,
    fix: 'resolve the packages again so the pin of a removed dependency goes away; if a dependency brings the package in, add its identity to indirectPins'
  },
  {
    id: 'wide-range',
    key: 'wideRange',
    title: 'a version range reaches past the next major version',
    basis: ['semverMajor', 'fromAdvised', 'xcodeVersionRule'],
    own: 'a range "a"..<"b" whose upper bound is above the next major version of a, a closed range "a"..."b" that holds it, and a versionRange of an Xcode project of the same kind; such a range takes versions that may break the API, so "1.0.0"..<"99.0.0" says no more than "any version"',
    rule: () => 'a range that allows more than one major version',
    fix: 'use from: with the lowest version you need, which stops before the next major version, or end the range at the next major version'
  },
  {
    id: 'deprecated-package',
    key: 'deprecatedPackage',
    title: 'a package of the list of deprecated or moved packages is declared',
    basis: ['repositoriesMove'],
    own: 'a remote package of a manifest or an Xcode project whose normalized location matches a pattern of deprecatedPackages; the list is empty by default, because which packages a team has left behind, and where a repository moved, is not something the tool can look up',
    rule: (config) => (config.deprecatedPackages.length ? `a package location matching ${listText(config.deprecatedPackages.map((d) => d.match), 4)}` : 'a package location of an empty list'),
    fix: 'move to the package or location the message names, and resolve again'
  },
  {
    id: 'unreadable-requirement',
    key: 'unreadableRequirement',
    title: 'a dependency the reader cannot read',
    basis: ['semverTags', 'dependencyForms'],
    own: 'a .package call whose URL, path or requirement is written with a variable, with string interpolation or in a form the reader does not take; a version that is not a semantic version major.minor.patch; a range that holds no version; and a package reference of an Xcode project with no URL, no requirement or a kind the reader does not know; its URL is still checked, but its requirement is not compared with other declarations or with Package.resolved',
    rule: () => 'a package declaration the reader cannot read as written',
    fix: 'write the dependency with string literals in one of the documented forms, such as .package(url: "https://...", from: "1.2.0"), or check it by hand'
  },
  {
    id: 'local-package',
    key: 'localPackage',
    title: 'a dependency is a local package',
    basis: ['localDevelopment', 'localNoVersion'],
    own: 'a .package(path:) call and a local package reference of an Xcode project; a note, because a local package inside the repository is a normal way to split an app, but one outside it, or one that stands in for a remote package during development, is worth a look',
    rule: () => 'a local package dependency',
    fix: 'keep a local package inside the repository; if it stands in for a remote package during development, switch back to the URL before the change is merged'
  },
  {
    id: 'unreadable-file',
    key: null,
    title: 'a manifest, a Package.resolved or an Xcode project that cannot be read',
    basis: ['jsonRepeatedNames', 'resolvedRecords'],
    own: 'a file over its size limit, a binary file, a file that is not valid UTF-8 or UTF-16 with its byte order mark, a Package.resolved that is not strict JSON or not of format 1, 2 or 3, and an Xcode project file that is not a property list the reader takes; nothing in it is checked; this rule cannot be set lower or off',
    rule: () => 'a file that the tool could not read',
    fix: 'save the file as UTF-8; for a Package.resolved, resolve the packages again so the tool that owns it writes it anew'
  },
  {
    id: 'scan-limit',
    key: null,
    title: 'the input is larger than the limits of a run',
    basis: ['resolvedRecords'],
    own: 'a project with more files, folders, manifests, Package.resolved or Xcode project files, package declarations or pins than the limits of docs/limits.md, or folders nested deeper; the rest is not read, so the run fails; this rule cannot be set lower or off',
    rule: () => 'a project past a limit of the run',
    fix: 'exclude the folders that are not part of the app, or check the parts of the project in runs of their own'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at or above the level failOn. { pass, failOn, failing, byLevel, text }.
export function decide(findings, failOn) {
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const failing = findings.filter((f) => atOrAbove(f.level, failOn)).length;
  const counts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${grouped(byLevel[l])} ${l}`);
  const text = failing
    ? `FAIL - ${plural(failing, 'finding')} at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`
    : `PASS - no finding at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`;
  return { pass: failing === 0, failOn, failing, byLevel, text };
}
