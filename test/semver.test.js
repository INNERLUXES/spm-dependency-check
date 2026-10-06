import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIND_NAMES, MAX_URL_LENGTH, MAX_VERSION_LENGTH, allows, compareDigits, compareVersions, identityOf, insecureReason, isWide, makeRequirement, nextMajor, nextMinor, nextNumber, parseLocation, parseVersion } from '../src/index.js';

// Semantic versions as the specification orders them, the requirements of Swift Package Manager with their bounds, and
// the locations of packages with their identity.

const v = (t) => parseVersion(t);
const cmp = (a, b) => compareVersions(v(a), v(b));

test('semver: a version has three numbers, an optional pre-release and build metadata, and nothing else', () => {
  for (const t of ['1.2.3', '0.0.0', '10.20.30', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-0.3.7', '1.0.0-x.7.z.92', '1.0.0+build.1', '1.0.0-rc.1+sha.5114f85', '99999999999999999999.0.0']) assert.ok(v(t), t);
  for (const t of ['1', '1.2', '1.2.3.4', 'v1.2.3', '01.2.3', '1.02.3', '1.2.03', '1.2.3-', '1.2.3+', '1.2.3-01', '1.2.3-a..b', '1.2.3-a_b', '', ' 1.2.3', null, 5, 'x'.repeat(200)]) assert.equal(v(t), null, String(t));
  assert.deepEqual(v('1.0.0-rc.1+b'), { major: '1', minor: '0', patch: '0', pre: ['rc', '1'], build: 'b', text: '1.0.0-rc.1+b' });
  assert.equal(MAX_VERSION_LENGTH, 128);
});

test('semver: the order of versions, with pre-releases lower than their release and build metadata left out', () => {
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '1.10.0', '2.0.0', '10.0.0'];
  for (let i = 1; i < ordered.length; i += 1) {
    assert.equal(cmp(ordered[i - 1], ordered[i]), -1, `${ordered[i - 1]} < ${ordered[i]}`);
    assert.equal(cmp(ordered[i], ordered[i - 1]), 1, `${ordered[i]} > ${ordered[i - 1]}`);
  }
  assert.equal(cmp('1.0.0+a', '1.0.0+b'), 0);
  assert.equal(cmp('1.0.0-1', '1.0.0-a'), -1, 'a number is lower than a word');
  assert.equal(cmp('99999999999999999999.0.0', '99999999999999999998.0.0'), 1, 'long numbers are compared by their digits');
  assert.equal(compareDigits('9', '10'), -1);
  assert.equal(compareDigits('10', '10'), 0);
});

test('semver: the next major and minor versions, and one more than a number of any length', () => {
  assert.equal(nextMajor(v('5.2.1')).text, '6.0.0');
  assert.equal(nextMajor(v('0.3.0')).text, '1.0.0');
  assert.equal(nextMinor(v('5.2.1')).text, '5.3.0');
  assert.equal(nextMinor(v('1.9.9')).text, '1.10.0');
  assert.equal(nextNumber('9'), '10');
  assert.equal(nextNumber('199'), '200');
  assert.equal(nextNumber('0'), '1');
});

test('semver: requirements and the versions they allow, with a near miss on each side', () => {
  const from = makeRequirement('upToNextMajor', '5.0.0');
  assert.deepEqual([from.kind, from.text, from.key], ['upToNextMajor', 'from 5.0.0', '5.0.0..<6.0.0']);
  assert.ok(allows(from, v('5.0.0')) && allows(from, v('5.9.9')) && !allows(from, v('4.9.0')) && !allows(from, v('6.0.0')));
  assert.ok(allows(from, v('6.0.0-beta')), 'a pre-release of the next major is lower than the bound, by plain order');
  const minor = makeRequirement('upToNextMinor', '2.3.0');
  assert.equal(minor.key, '2.3.0..<2.4.0');
  assert.ok(allows(minor, v('2.3.9')) && !allows(minor, v('2.4.0')) && !allows(minor, v('2.2.9')));
  const exact = makeRequirement('exact', '3.1.0');
  assert.equal(exact.key, 'exact 3.1.0');
  assert.ok(allows(exact, v('3.1.0')) && allows(exact, v('3.1.0+build')) && !allows(exact, v('3.1.1')) && !allows(exact, v('3.0.9')));
  const range = makeRequirement('range', '1.0.0', '2.0.0');
  assert.deepEqual([range.kind, range.text, range.key], ['range', '1.0.0..<2.0.0', '1.0.0..<2.0.0']);
  assert.equal(range.key, makeRequirement('upToNextMajor', '1.0.0').key, 'a range to the next major is from:');
  assert.ok(!allows(range, v('2.0.0')));
  const closed = makeRequirement('closedRange', '1.0.0', '2.0.0');
  assert.equal(closed.text, '1.0.0...2.0.0');
  assert.ok(allows(closed, v('2.0.0')) && !allows(closed, v('2.0.1')));
  assert.equal(makeRequirement('closedRange', '1.0.0', '1.0.0').key, 'exact 1.0.0');
  assert.deepEqual(makeRequirement('branch', 'main'), { kind: 'branch', branch: 'main', text: 'branch main', key: 'branch main' });
  assert.equal(makeRequirement('revision', 'abc').key, 'revision abc');
  assert.match(makeRequirement('branch', '').problem, /the branch is empty/);
  assert.match(makeRequirement('upToNextMajor', '1.0').problem, /"1\.0" is not a semantic version/);
  assert.match(makeRequirement('range', '1.0.0', 'x').problem, /"x" is not a semantic version/);
  assert.match(makeRequirement('range', '2.0.0', '1.0.0').problem, /the range 2\.0\.0\.\.<1\.0\.0 holds no version/);
  assert.match(makeRequirement('range', '1.0.0', '1.0.0').problem, /holds no version/);
  assert.deepEqual(Object.keys(KIND_NAMES), ['upToNextMajor', 'upToNextMinor', 'exact', 'range', 'branch', 'revision', 'path']);
});

test('semver: a range is wide when it reaches past the next major version, and only a range', () => {
  assert.ok(isWide(makeRequirement('range', '1.0.0', '99.0.0')));
  assert.ok(isWide(makeRequirement('range', '1.2.0', '2.0.1')));
  assert.ok(isWide(makeRequirement('closedRange', '1.0.0', '2.0.0')), 'a closed range that holds the next major');
  assert.ok(!isWide(makeRequirement('range', '1.0.0', '2.0.0')));
  assert.ok(!isWide(makeRequirement('closedRange', '1.0.0', '1.9.9')));
  assert.ok(!isWide(makeRequirement('upToNextMajor', '1.0.0')));
  assert.ok(!isWide(makeRequirement('range', '0.1.0', '0.9.0')));
});

test('urls: the scheme, the normalized location and the identity of every form', () => {
  const cases = [
    ['https://Code.Example.test/Owner/Repo.git', 'https', 'code.example.test/owner/repo', 'repo'],
    ['https://user@code.example.test:443/owner/repo.git/', 'https', 'code.example.test/owner/repo', 'repo'],
    ['https://code.example.test:8443/owner/repo', 'https', 'code.example.test:8443/owner/repo', 'repo'],
    ['http://code.example.test/owner/repo', 'http', 'code.example.test/owner/repo', 'repo'],
    ['ssh://git@code.example.test:22/owner/repo.git', 'ssh', 'code.example.test/owner/repo', 'repo'],
    ['git@code.example.test:owner/repo.git', 'scp', 'code.example.test/owner/repo', 'repo'],
    ['code.example.test:owner/repo', 'scp', 'code.example.test/owner/repo', 'repo'],
    ['git://code.example.test/owner/repo', 'git', 'code.example.test/owner/repo', 'repo'],
    ['file:///Users/dev/Repo', 'file', 'users/dev/repo', 'repo'],
    ['code.example.test/owner/repo', 'none', 'code.example.test/owner/repo', 'repo'],
    ['C:/work/Repo', 'none', 'c:/work/repo', 'repo'],
    ['HTTPS://code.example.test/a/b?x=1#y', 'https', 'code.example.test/a/b', 'b']
  ];
  for (const [text, scheme, normalized, identity] of cases) {
    const l = parseLocation(text);
    assert.deepEqual([l.scheme, l.normalized, l.identity], [scheme, normalized, identity], text);
  }
  assert.equal(identityOf('../Packages/DesignTokens'), 'designtokens');
  assert.equal(identityOf('Packages\\Core'), 'core');
  assert.equal(MAX_URL_LENGTH, 4096);
});

test('urls: why a location is not https, for every scheme', () => {
  assert.equal(insecureReason(parseLocation('https://a.test/o/r')), null);
  assert.match(insecureReason(parseLocation('http://a.test/o/r')), /plain http URL/);
  assert.match(insecureReason(parseLocation('git://a.test/o/r')), /neither encryption nor authentication/);
  assert.match(insecureReason(parseLocation('ssh://a.test/o/r')), /SSH URL/);
  assert.match(insecureReason(parseLocation('git@a.test:o/r')), /SSH URL/);
  assert.match(insecureReason(parseLocation('file:///x/r')), /file URL/);
  assert.match(insecureReason(parseLocation('a.test/o/r')), /no scheme/);
  assert.match(insecureReason(parseLocation('ftp://a.test/o/r')), /scheme ftp, not https/);
});
