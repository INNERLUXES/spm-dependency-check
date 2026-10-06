import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, defaultConfig as config, locate, pinText } from '../src/index.js';
import { HOST, M, MANIFEST, P, PROJECT, R, configOf, edit, findingsOf, lineOf, manifest, pbx, projectWith, reportOf, resolved, rulesOf, withDeps } from './helpers.js';

// Every rule through a whole run, with the manifest, the Xcode project and the Package.resolved written inline, and a
// near miss on each side: the form that is reported and the form next to it that is not.

const IMAGECACHE = `.package(url: "${HOST}/acme/imagecache.git", from: "2.3.0")`;
const dep = (name, req) => `.package(url: "${HOST}/acme/${name}.git", ${req})`;
const pins = (...extra) => resolved([{ identity: 'imagecache', version: '2.3.4' }, { identity: 'netkit', version: '5.1.0' }, ...extra]);

test('project: the project in good order gives no finding, with the table of packages and the summary', async () => {
  const r = await reportOf(PROJECT);
  assert.deepEqual(r.findings, []);
  assert.equal(r.code, 0);
  assert.deepEqual(r.packages, [{ identity: 'imagecache', kind: 'remote', declared: 1, requirement: 'from 2.3.0', resolved: '2.3.4', products: 1 }, { identity: 'netkit', kind: 'remote', declared: 1, requirement: 'from 5.0.0', resolved: '5.1.0', products: 1 }]);
  assert.deepEqual(r.summary, { packages: 2, remote: 2, local: 0, declarations: 2, kinds: { upToNextMajor: 2, upToNextMinor: 0, exact: 0, range: 0, branch: 0, revision: 0, path: 0 }, resolvedFiles: 1, pins: 2, products: 2 });
  assert.deepEqual(r.files.map((f) => [f.file, f.kind, f.remote, f.pins, f.products]), [[P, 'Xcode project', 1, 0, 1], [R, 'Package.resolved v2', 0, 2, 0], [M, 'manifest', 1, 0, 1]]);
});

test('branch-requirement: a branch in a manifest or an Xcode project is an error; a version next to it is not', async () => {
  const files = { ...withDeps(IMAGECACHE, dep('flags', 'branch: "develop"')), [R]: pins({ identity: 'flags', branch: 'develop' }) };
  const r = await reportOf(files);
  const f = findingsOf(r, 'branch-requirement');
  assert.deepEqual(f.map((x) => [x.file, x.line, x.level]), [[M, lineOf(files[M], 'develop'), 'error']]);
  assert.match(f[0].found, /the package "flags" follows the branch develop: what it resolves to changes with every push/);
  assert.deepEqual(r.findings.map((x) => x.rule), ['branch-requirement']);
  const project = await rulesOf({ ...PROJECT, [P]: pbx([{ url: `${HOST}/acme/netkit.git`, kind: 'branch', branch: 'main' }]), [R]: pins().replace('"version": "5.1.0"', '"branch": "main"') });
  assert.deepEqual(project, ['branch-requirement']);
  assert.deepEqual(await rulesOf({ ...withDeps(IMAGECACHE, dep('flags', 'from: "1.0.0"')), [R]: pins({ identity: 'flags', version: '1.0.0' }) }), []);
});

test('revision-requirement: a bare revision is a warning; an exact version is not', async () => {
  const files = { ...withDeps(IMAGECACHE, dep('view', `revision: "${'a'.repeat(40)}"`)), [R]: pins({ identity: 'view', revision: 'a'.repeat(40) }) };
  const f = findingsOf(await reportOf(files), 'revision-requirement');
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'warning');
  assert.match(f[0].found, /pinned to the revision aaaaaaaaaaaa with no version/);
  assert.deepEqual(await rulesOf({ ...PROJECT, [P]: pbx([{ url: `${HOST}/acme/netkit.git`, kind: 'revision', revision: 'c'.repeat(40) }]) }), ['revision-requirement']);
  assert.deepEqual(await rulesOf({ ...withDeps(IMAGECACHE, dep('view', 'exact: "1.0.0"')), [R]: pins({ identity: 'view', version: '1.0.0' }) }), []);
});

test('insecure-url: http, git, SSH, file and a text with no scheme are errors; https is not', async () => {
  for (const url of ['http://code.example.test/acme/imagecache.git', 'git://code.example.test/acme/imagecache.git', 'ssh://git@code.example.test/acme/imagecache.git', 'git@code.example.test:acme/imagecache.git', 'file:///repos/imagecache', 'code.example.test/acme/imagecache']) {
    const files = projectWith({ [M]: edit(MANIFEST, [`${HOST}/acme/imagecache.git`, url]) });
    const f = findingsOf(await reportOf(files), 'insecure-url');
    assert.equal(f.length, 1, url);
    assert.equal(f[0].column, files[M].split('\n')[f[0].line - 1].indexOf('"') + 1, url);
    assert.ok(f[0].found.startsWith(`the package "imagecache" is named by ${url}: it`), url);
  }
  assert.deepEqual(await rulesOf({ ...PROJECT, [P]: pbx([{ url: 'http://code.example.test/acme/netkit.git', kind: 'upToNextMajorVersion', min: '5.0.0' }]) }), ['insecure-url']);
  assert.deepEqual(await rulesOf(projectWith({ [M]: edit(MANIFEST, [`${HOST}/acme/imagecache.git`, 'HTTPS://Code.Example.test/acme/imagecache']) })), []);
});

test('local-package: a local package is a note, and one outside the folder of its file says so', async () => {
  const r = await reportOf(withDeps(IMAGECACHE, '.package(path: "../Shared")', '.package(path: "Vendor/Inner")'));
  const f = findingsOf(r, 'local-package');
  assert.deepEqual(f.map((x) => x.level), ['info', 'info']);
  assert.match(f[0].found, /the package at the path "\.\.\/Shared" is a local package: it has no version and uses whatever is at the path; the path reaches outside the folder of this file/);
  assert.ok(!f[1].found.includes('outside'));
  assert.equal(r.code, 0, 'a note does not fail the run');
  assert.deepEqual(r.summary.kinds.path, 2);
  assert.deepEqual(await rulesOf({ ...PROJECT, [P]: pbx([{ url: `${HOST}/acme/netkit.git`, kind: 'upToNextMajorVersion', min: '5.0.0' }, { path: 'Packages/Core' }]) }), ['local-package']);
});

test('conflicting-requirement: one identity with requirements that allow different versions; the same versions written two ways are one', async () => {
  const files = { ...withDeps(IMAGECACHE, dep('netkit', 'from: "5.2.0"')) };
  const r = await reportOf(files);
  const f = findingsOf(r, 'conflicting-requirement');
  assert.deepEqual(f.map((x) => [x.file, x.line]), [[M, lineOf(files[M], '"5.2.0"')]]);
  assert.equal(f[0].found, `the package "netkit" has the requirement from 5.2.0 here and from 5.0.0 in ${P}:${lineOf(PROJECT[P], '5.0.0')}; the two allow different versions`);
  for (const same of ['from: "5.0.0"', '.upToNextMajor(from: "5.0.0")', '"5.0.0"..<"6.0.0"']) assert.deepEqual(await rulesOf(withDeps(IMAGECACHE, dep('netkit', same))), [], same);
  const moved = findingsOf(await reportOf(withDeps(IMAGECACHE, `.package(url: "${HOST}/other-org/NetKit", exact: "5.1.0")`)), 'conflicting-requirement');
  assert.match(moved[0].found, /and the two name different locations, code\.example\.test\/other-org\/netkit and code\.example\.test\/acme\/netkit/);
  assert.deepEqual(await rulesOf(withDeps(IMAGECACHE, dep('netkit', 'from: "5.0.0"'), dep('netkit', 'from: "5.0.0"'))), [], 'the same requirement twice is not a conflict');
});

test('missing-resolved: remote dependencies with no Package.resolved, once; local packages alone need none', async () => {
  const r = await reportOf(projectWith({ [R]: null }));
  const f = findingsOf(r, 'missing-resolved');
  assert.deepEqual(f.map((x) => [x.file, x.level]), [[P, 'warning']]);
  assert.equal(f[0].found, '2 remote packages are declared, and the folder holds no Package.resolved, so each machine and each build resolves the versions on its own');
  assert.deepEqual(r.findings.map((x) => x.rule), ['missing-resolved'], 'no unpinned-dependency besides it');
  assert.deepEqual(await rulesOf({ [M]: manifest(['.package(path: "../Shared")']) }), ['local-package']);
  assert.deepEqual(await rulesOf({ [M]: manifest([]) }), []);
  assert.deepEqual(await rulesOf(projectWith({ [R]: '{"pins": [], "version": 9}' })), ['unreadable-file'], 'a Package.resolved that cannot be read is not missing');
});

test('unpinned-dependency: a declared remote package no Package.resolved pins; the pins of every file count', async () => {
  const files = withDeps(IMAGECACHE, dep('flags', 'from: "1.0.0"'), dep('flags', 'from: "1.0.0"'));
  const f = findingsOf(await reportOf(files), 'unpinned-dependency');
  assert.deepEqual(f.map((x) => [x.file, x.line, x.level]), [[M, lineOf(files[M], 'flags'), 'error']]);
  assert.match(f[0].found, /the package "flags" \(code\.example\.test\/acme\/flags\) is declared in 2 places, but no Package\.resolved of the folder pins it/);
  assert.deepEqual(await rulesOf({ ...files, 'p/Core/Package.resolved': resolved([{ identity: 'flags', version: '1.2.0' }]) }), []);
});

test('resolved-outside-requirement: a pin below, at or above the bounds, an exact mismatch, and the pins that meet their requirement', async () => {
  const cases = [
    ['5.0.0', true], ['4.9.0', false], ['5.9.9', true], ['6.0.0', false], ['5.0.0+build.7', true], ['5.0.0-beta', false]
  ];
  for (const [version, ok] of cases) {
    const files = projectWith({ [R]: resolved([{ identity: 'imagecache', version: '2.3.4' }, { identity: 'netkit', version }]) });
    const f = findingsOf(await reportOf(files), 'resolved-outside-requirement');
    assert.equal(f.length, ok ? 0 : 1, version);
    if (!ok) {
      assert.equal(f[0].file, R);
      assert.equal(f[0].line, lineOf(files[R], `"version": "${version}"`));
      assert.ok(f[0].found.startsWith(`Package.resolved pins "netkit" at ${version}, which the requirement from 5.0.0 in ${P}:`), f[0].found);
    }
  }
  const low = findingsOf(await reportOf(projectWith({ [R]: pins().replace('5.1.0', '4.9.0') })), 'resolved-outside-requirement');
  assert.match(low[0].found, /does not allow \(lower than 5\.0\.0\)$/);
  const high = findingsOf(await reportOf(projectWith({ [R]: pins().replace('5.1.0', '6.0.0') })), 'resolved-outside-requirement');
  assert.match(high[0].found, /does not allow \(at or above 6\.0\.0\)$/);
  const exact = { ...PROJECT, [P]: pbx([{ url: `${HOST}/acme/netkit.git`, kind: 'exactVersion', version: '5.1.0' }]) };
  assert.deepEqual(await rulesOf(exact), []);
  const mismatch = findingsOf(await reportOf({ ...exact, [R]: pins().replace('5.1.0', '5.1.1') }), 'resolved-outside-requirement');
  assert.match(mismatch[0].found, /at 5\.1\.1, which the requirement exact 5\.1\.0 in .* does not allow \(above 5\.1\.0\)$/);
});

test('resolved-outside-requirement: a pin with no version, a version that is not semantic, another branch and another commit', async () => {
  const noVersion = findingsOf(await reportOf(projectWith({ [R]: pins().replace('"version": "5.1.0"', '"branch": "main"') })), 'resolved-outside-requirement');
  assert.match(noVersion[0].found, /pins "netkit" at branch main \(cccccccccccc\), with no version, while the requirement from 5\.0\.0 in .* asks for a version/);
  const loose = findingsOf(await reportOf(projectWith({ [R]: pins().replace('5.1.0', '5.1') })), 'resolved-outside-requirement');
  assert.match(loose[0].found, /at 5\.1, which is not a semantic version, so it cannot meet the requirement from 5\.0\.0/);
  const branch = { ...withDeps(IMAGECACHE, dep('flags', 'branch: "develop"')), [R]: pins({ identity: 'flags', branch: 'main' }) };
  const b = findingsOf(await reportOf(branch), 'resolved-outside-requirement');
  assert.match(b[0].found, /pins "flags" at branch main \(cccccccccccc\), while the requirement in .* follows the branch develop/);
  const rev = { ...withDeps(IMAGECACHE, dep('view', 'revision: "abc123"')), [R]: pins({ identity: 'view', revision: 'abc999'.padEnd(40, '0') }) };
  assert.match(findingsOf(await reportOf(rev), 'resolved-outside-requirement')[0].found, /names the revision abc123/);
  const short = { ...withDeps(IMAGECACHE, dep('view', 'revision: "ABC123"')), [R]: pins({ identity: 'view', revision: 'abc123'.padEnd(40, '0') }) };
  assert.deepEqual(findingsOf(await reportOf(short), 'resolved-outside-requirement'), [], 'a short revision is the start of the commit, in any case');
  const once = findingsOf(await reportOf({ ...withDeps(IMAGECACHE, dep('netkit', 'from: "5.0.0"')), [R]: pins().replace('5.1.0', '4.0.0') }), 'resolved-outside-requirement');
  assert.equal(once.length, 1, 'one finding for a pin and a requirement declared twice');
});

test('stale-pin: a pin nothing declares is a warning; a pin in indirectPins or of a local package is not', async () => {
  const files = projectWith({ [R]: pins({ identity: 'old-promises', version: '6.2.0' }) });
  const r = await reportOf(files);
  const f = findingsOf(r, 'stale-pin');
  assert.deepEqual(f.map((x) => [x.file, x.line, x.level]), [[R, lineOf(files[R], '"identity": "old-promises"') - 1, 'warning']]);
  assert.equal(f[0].found, `Package.resolved pins "old-promises" (${HOST}/acme/old-promises.git) at 6.2.0, but no manifest or Xcode project of the folder declares it: a dependency that was removed, or one that a dependency brings in`);
  assert.deepEqual(r.packages.find((p) => p.identity === 'old-promises').kind, 'pin only');
  assert.deepEqual(await rulesOf({ ...files, 'c.json': '{"indirectPins": ["old-promises"]}' }, ['p', '--config', 'c.json']), []);
  assert.deepEqual(await rulesOf({ ...withDeps(IMAGECACHE, '.package(path: "Vendor/Shared")'), [R]: pins({ identity: 'shared', version: '1.0.0' }) }), ['local-package']);
});

test('wide-range: a range past the next major version, in a manifest or an Xcode project; a range up to it is not', async () => {
  const files = { ...withDeps(IMAGECACHE, dep('flags', '"1.0.0"..<"99.0.0"')), [R]: pins({ identity: 'flags', version: '1.4.0' }) };
  const f = findingsOf(await reportOf(files), 'wide-range');
  assert.equal(f[0].found, 'the package "flags" takes the range 1.0.0..<99.0.0, which reaches past 2.0.0, the next major version of 1.0.0; versions in it may break the API');
  assert.equal(f[0].level, 'warning');
  assert.deepEqual(await rulesOf({ ...files, [M]: manifest([IMAGECACHE, dep('flags', '"1.0.0"..."2.0.0"')]) }), ['wide-range']);
  assert.deepEqual(await rulesOf({ ...files, [M]: manifest([IMAGECACHE, dep('flags', '"1.0.0"..<"2.0.0"')]) }), []);
  assert.deepEqual(await rulesOf({ ...PROJECT, [P]: pbx([{ url: `${HOST}/acme/netkit.git`, kind: 'versionRange', min: '5.0.0', max: '7.0.0' }]) }), ['wide-range']);
});

test('deprecated-package: a package that matches deprecatedPackages; none by default, and another location is not', async () => {
  const c = { 'c.json': JSON.stringify({ deprecatedPackages: [{ match: 'code.example.test/acme/image*', use: 'move to code.example.test/pixels/imagecache' }] }) };
  const f = findingsOf(await reportOf({ ...PROJECT, ...c }, ['p', '--config', 'c.json']), 'deprecated-package');
  assert.deepEqual(f.map((x) => [x.file, x.level]), [[M, 'warning']]);
  assert.equal(f[0].found, 'the package "imagecache" (code.example.test/acme/imagecache) matches code.example.test/acme/image* of deprecatedPackages: move to code.example.test/pixels/imagecache');
  assert.deepEqual(await rulesOf(PROJECT), []);
  assert.deepEqual(await rulesOf({ ...PROJECT, 'c.json': JSON.stringify({ deprecatedPackages: [{ match: 'code.example.test/other/*', use: 'x' }] }) }, ['p', '--config', 'c.json']), []);
});

test('unreadable-requirement: a declaration the reader cannot read is a warning, and its requirement is not compared', async () => {
  const files = withDeps(IMAGECACHE, '.package(url: "http://code.example.test/acme/flags.git", from: flagsVersion)', '.package(url: base, from: "1.0.0")');
  const r = await reportOf(files);
  assert.deepEqual(r.findings.map((x) => x.rule).sort(), ['insecure-url', 'unpinned-dependency', 'unreadable-requirement', 'unreadable-requirement']);
  const f = findingsOf(r, 'unreadable-requirement');
  assert.match(f[0].found, /the declaration of "flags" cannot be read: from: is not a string the reader can read, such as "1\.2\.3"; its requirement is not compared with other declarations or with Package\.resolved/);
  assert.match(f[1].found, /the declaration of a package cannot be read: the url is not a string the reader can read/);
});

test('project: analyze and its pieces without the command line', () => {
  assert.deepEqual(locate({ kind: 'local', location: '../Shared' }), { identity: 'shared', normalized: 'path:../Shared', location: null });
  assert.deepEqual(locate({ kind: 'registry', location: 'Acme.Flags' }), { identity: 'acme.flags', normalized: 'registry:acme.flags', location: null });
  assert.equal(locate({ kind: 'remote', location: null }), null);
  assert.equal(pinText({ version: '1.0.0', branch: null, revision: 'x' }), '1.0.0');
  assert.equal(pinText({ version: null, branch: null, revision: 'a'.repeat(40) }), 'revision aaaaaaaaaaaa');
  assert.equal(pinText({ version: null, branch: null, revision: null }), 'nothing');
  const empty = analyze({ config: config() });
  assert.deepEqual([empty.findings, empty.packages, empty.files, empty.totals.packages], [[], [], [], 0]);
  assert.equal(configOf().failOn, 'error');
});
