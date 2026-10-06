// Semantic versions and the requirements of Swift Package Manager, compared as the Semantic Versioning specification
// orders versions: major, minor and patch as numbers, a pre-release lower than its release, the identifiers of a
// pre-release one by one (numbers as numbers and lower than words, words in ASCII order, a shorter list lower when the
// rest is equal), and build metadata left out. Numbers are compared by their digits, so a number of any length is
// exact. Nothing here looks a version up: the tool never says what the latest version is.

export const MAX_VERSION_LENGTH = 128;

const NUMBER = /^(?:0|[1-9][0-9]*)$/;
const IDENTIFIER = /^[0-9A-Za-z-]+$/;

// A version major.minor.patch with an optional -pre-release and +build, as a semantic version is written, or null. A
// version with one or two parts, a leading v or a number with a leading zero is not a semantic version.
export function parseVersion(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_VERSION_LENGTH) return null;
  let rest = text;
  let build = null;
  const plus = rest.indexOf('+');
  if (plus >= 0) {
    build = rest.slice(plus + 1);
    rest = rest.slice(0, plus);
    if (build === '' || !build.split('.').every((p) => IDENTIFIER.test(p))) return null;
  }
  let pre = null;
  const dash = rest.indexOf('-');
  if (dash >= 0) {
    pre = rest.slice(dash + 1);
    rest = rest.slice(0, dash);
    if (pre === '') return null;
    const parts = pre.split('.');
    if (!parts.every((p) => IDENTIFIER.test(p) && (!/^[0-9]+$/.test(p) || NUMBER.test(p)))) return null;
  }
  const core = rest.split('.');
  if (core.length !== 3 || !core.every((p) => NUMBER.test(p))) return null;
  return { major: core[0], minor: core[1], patch: core[2], pre: pre === null ? [] : pre.split('.'), build, text };
}

// Two numbers written as digits with no leading zero: -1, 0 or 1.
export function compareDigits(a, b) {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareIdentifier(a, b) {
  const an = /^[0-9]+$/.test(a);
  const bn = /^[0-9]+$/.test(b);
  if (an && bn) return compareDigits(a, b);
  if (an !== bn) return an ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// The order of two parsed versions: -1, 0 or 1. Build metadata is left out.
export function compareVersions(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    const c = compareDigits(a[k], b[k]);
    if (c) return c;
  }
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i += 1) {
    const c = compareIdentifier(a.pre[i], b.pre[i]);
    if (c) return c;
  }
  return a.pre.length === b.pre.length ? 0 : a.pre.length < b.pre.length ? -1 : 1;
}

// One more than a number written as digits.
export function nextNumber(digits) {
  const out = digits.split('');
  let k = out.length - 1;
  while (k >= 0 && out[k] === '9') {
    out[k] = '0';
    k -= 1;
  }
  if (k < 0) return `1${out.join('')}`;
  out[k] = String.fromCharCode(out[k].charCodeAt(0) + 1);
  return out.join('');
}

const versionOf = (major, minor, patch) => parseVersion(`${major}.${minor}.${patch}`);

// The next major version of a version: 5.2.1 gives 6.0.0.
export const nextMajor = (v) => versionOf(nextNumber(v.major), '0', '0');

// The next minor version of a version: 5.2.1 gives 5.3.0.
export const nextMinor = (v) => versionOf(v.major, nextNumber(v.minor), '0');

// The kinds of a requirement, as the report names them.
export const KIND_NAMES = {
  upToNextMajor: 'up to next major',
  upToNextMinor: 'up to next minor',
  exact: 'exact',
  range: 'range',
  branch: 'branch',
  revision: 'revision',
  path: 'local path'
};

// A requirement from its parts: { kind, lower, upper, upperInclusive, branch, revision, text, key } or { problem }. kind
// is one of the keys of KIND_NAMES. A version requirement has the bounds it allows; text is how the report shows it,
// and key is the same for two requirements that allow the same versions, so from: "5.0.0", .upToNextMajor(from:
// "5.0.0") and "5.0.0"..<"6.0.0" have one key.
export function makeRequirement(kind, a = null, b = null) {
  if (kind === 'branch' || kind === 'revision') {
    if (typeof a !== 'string' || a.trim() === '') return { problem: `the ${kind} is empty` };
    return { kind, [kind]: a, text: `${kind} ${a}`, key: `${kind} ${a}` };
  }
  const lower = parseVersion(a);
  if (!lower) return { problem: `"${String(a).slice(0, 60)}" is not a semantic version major.minor.patch` };
  let upper;
  let upperInclusive = false;
  let text;
  let out = kind;
  if (kind === 'upToNextMajor') {
    upper = nextMajor(lower);
    text = `from ${lower.text}`;
  } else if (kind === 'upToNextMinor') {
    upper = nextMinor(lower);
    text = `up to next minor from ${lower.text}`;
  } else if (kind === 'exact') {
    upper = lower;
    upperInclusive = true;
    text = `exact ${lower.text}`;
  } else {
    upper = parseVersion(b);
    if (!upper) return { problem: `"${String(b).slice(0, 60)}" is not a semantic version major.minor.patch` };
    upperInclusive = kind === 'closedRange';
    const c = compareVersions(lower, upper);
    if (c > 0 || (c === 0 && !upperInclusive)) return { problem: `the range ${lower.text}${upperInclusive ? '...' : '..<'}${upper.text} holds no version` };
    text = `${lower.text}${upperInclusive ? '...' : '..<'}${upper.text}`;
    out = 'range';
  }
  const key = upperInclusive && compareVersions(lower, upper) === 0 ? `exact ${lower.text}` : `${lower.text}${upperInclusive ? '...' : '..<'}${upper.text}`;
  return { kind: out, lower, upper, upperInclusive, text, key };
}

// True when a parsed version is inside the bounds of a version requirement.
export function allows(requirement, version) {
  if (compareVersions(version, requirement.lower) < 0) return false;
  const c = compareVersions(version, requirement.upper);
  return requirement.upperInclusive ? c <= 0 : c < 0;
}

// True when a range allows versions past the next major version of its lower bound, such as "1.0.0"..<"99.0.0".
export function isWide(requirement) {
  if (requirement.kind !== 'range') return false;
  const c = compareVersions(requirement.upper, nextMajor(requirement.lower));
  return requirement.upperInclusive ? c >= 0 : c > 0;
}
