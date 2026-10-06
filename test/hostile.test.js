import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, MAX_PROBLEMS, globMatch, parseLocation, parsePbx, parseVersion, readResolved, scanManifest, tokenize } from '../src/index.js';
import { HOST, M, MANIFEST, P, PROJECT, R, cli, edit, manifest, pbx, projectWith, resolved, run, withFiles } from './helpers.js';

// Hostile input: manifests, Xcode projects, Package.resolved files and folders built to exhaust the memory, the stack
// or the time, to make the tool follow a link out of the project, to rewrite the terminal, to start a second workflow
// command, to slip a formula into a spreadsheet or to change how objects behave. Each heavy test also checks the time,
// because work that grows faster than the input is a failure even when the answer is right. Tests that need a symbolic
// link, a device or file permissions are guarded with process.platform, and none of them asserts a line: lines are
// asserted in the tests that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};
const refused = (fn) => {
  try {
    fn();
  } catch {
    // refused input is fine; the time is what is checked
  }
};

test('hostile: thousands of declarations, references and pins are read in one pass', LIMIT, async () => {
  const deps = Array.from({ length: 1500 }, (_, i) => `.package(url: "${HOST}/acme/p${i}.git", from: "1.0.${i}")`);
  const pins = resolved(Array.from({ length: 1500 }, (_, i) => ({ identity: `p${i}`, version: `1.0.${i}` })));
  const refs = pbx(Array.from({ length: 1500 }, (_, i) => ({ url: `${HOST}/acme/p${i}.git`, kind: 'upToNextMajorVersion', min: `1.0.${i}` })));
  const r = await fast(() => run({ [M]: manifest(deps), [P]: refs, [R]: pins }, ['p', '--json']), 30000);
  const out = JSON.parse(r.out);
  assert.equal(out.summary.declarations, 3000);
  assert.equal(out.summary.pins, 1500);
  assert.deepEqual(out.findings, []);
  const capped = JSON.parse((await run({ [M]: manifest(deps), [R]: pins }, ['p', '--json'], { maxPackages: 100 })).out);
  assert.ok(capped.findings.some((f) => f.rule === 'scan-limit' && /package declarations than the reader reads/.test(f.found)));
  const many = JSON.parse((await fast(() => run({ [M]: manifest(deps.map((d) => d.replace('from:', 'branch:'))), [R]: pins }, ['p', '--json']), 30000)).out);
  assert.equal(many.findings.filter((f) => f.rule === 'branch-requirement').length, LIMITS.maxFindingsPerRule);
  assert.ok(many.totals.notListed >= 1500 - LIMITS.maxFindingsPerRule);
  const tooManyPins = JSON.parse((await run({ [R]: pins }, ['p', '--json'], { maxPins: 10 })).out);
  assert.match(tooManyPins.findings.find((f) => f.rule === 'scan-limit').found, /more than 10 pins/);
});

test('hostile: Swift text with long runs of quotes, comments, pounds, escapes, interpolations and calls is read in one pass', LIMIT, async () => {
  for (const text of ['"'.repeat(300000), '#'.repeat(300000), `#${'"'.repeat(300000)}`, '/*'.repeat(200000), '//'.repeat(200000), '*/'.repeat(200000), `"${'\\('.repeat(100000)}`, `"${'\\u{'.repeat(100000)}`, '"""'.repeat(100000), '.package('.repeat(50000), '.product('.repeat(50000), `.package(url: "x", ${'('.repeat(100000)}`, '..<'.repeat(100000), `${'`a'.repeat(100000)}`]) {
    await fast(() => scanManifest(text));
  }
  assert.ok(tokenize('a '.repeat(600000)).limited);
});

test('hostile: property lists and JSON with long runs of braces, parentheses, quotes and comments are read or refused in one pass', LIMIT, async () => {
  for (const text of ['{'.repeat(300000), '('.repeat(300000), `{ a = ${'"'.repeat(300000)}`, `{ a = "${'\\'.repeat(300000)}`, '/*'.repeat(200000), `{ a = (${'x, '.repeat(200000)}); }`, `{ ${'a = 1; '.repeat(100000)}}`, `{ objects = { ${Array.from({ length: 50000 }, (_, i) => `K${i} = { isa = PBXFileReference; path = f${i}; };`).join(' ')} }; }`, '<'.repeat(300000)]) {
    await fast(() => refused(() => parsePbx(text)));
  }
  assert.throws(() => parsePbx(`{ a = ${'('.repeat(5000)}`), /nested more than 64 deep/);
  for (const text of ['['.repeat(200000), '{"pins": ['.repeat(50000), `{"pins": [${'{"identity": "a", "location": "x", "state": {}},'.repeat(20000)}{}], "version": 2}`]) {
    await fast(() => refused(() => readResolved(text)));
  }
});

test('hostile: patterns, versions and locations are matched in time bounded by their length', LIMIT, async () => {
  const path = `${'a/'.repeat(500)}b`;
  await fast(() => {
    for (let i = 0; i < 200; i += 1) globMatch(`${'*'.repeat(100)}**${'?*'.repeat(50)}c`, path);
  });
  assert.equal(globMatch('**/b', path), true);
  assert.equal(globMatch('*/b', path), false);
  await fast(() => {
    for (let i = 0; i < 1500; i += 1) {
      parseLocation(`${'a'.repeat(4000)}:`);
      parseLocation(`${'a@'.repeat(1500)}x:y`);
      parseLocation(`https://${'@'.repeat(4000)}`);
      parseVersion(`1.0.0-${'a.'.repeat(60)}a`);
    }
  });
});

test('hostile: thousands of folders and files are listed in seconds, and the limits of a project hold', LIMIT, async () => {
  const files = { ...PROJECT };
  for (let i = 0; i < 300; i += 1) files[`p/M${i}/Package.swift`] = manifest([`.package(url: "${HOST}/acme/imagecache.git", from: "2.3.0")`]);
  const r = await fast(() => run(files, ['p', '--json']), 60000);
  assert.equal(JSON.parse(r.out).input.manifests, 301);
  const capped = JSON.parse((await run(files, ['p', '--json'], { maxInputFiles: 10 })).out);
  assert.match(capped.findings.find((f) => f.rule === 'scan-limit').found, /the project holds more than 10 manifests, Package\.resolved and Xcode project files/);
  assert.equal(capped.result.pass, false);
  const entries = JSON.parse((await run(files, ['p', '--json'], { maxProjectEntries: 5 })).out);
  assert.match(entries.findings.find((f) => f.rule === 'scan-limit').found, /more than 5 files and folders/);
  const deep = { ...PROJECT, [`p/${'d/'.repeat(40)}Package.swift`]: 'x' };
  const depth = JSON.parse((await run(deep, ['p', '--json'])).out);
  assert.match(depth.findings.find((f) => f.rule === 'scan-limit').found, /folders nested more than 32 deep/);
  const tokens = JSON.parse((await run(PROJECT, ['p', '--json'], { maxTokens: 10 })).out);
  assert.match(tokens.findings.find((f) => f.rule === 'scan-limit').found, /more tokens or package declarations than the reader reads/);
});

test('hostile: a file over its size limit is an unreadable-file error, and a configuration over its limit stops the run', LIMIT, async () => {
  const big = await run(projectWith({ [M]: `// ${'x'.repeat(LIMITS.maxFileBytes)}\n` }), ['p', '--json']);
  assert.match(JSON.parse(big.out).findings.find((f) => f.rule === 'unreadable-file').found, /bytes is over the 8 MB limit/);
  const config = await run({ ...PROJECT, 'c.json': ' '.repeat(LIMITS.maxConfigBytes + 1) }, ['p', '--config', 'c.json']);
  assert.equal(config.code, 2);
  assert.match(config.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
  const many = await run({ ...PROJECT, 'c.json': JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 1]))) }, ['p', '--config', 'c.json']);
  assert.match(many.err, /\n {2}and 10 more\n$/);
  assert.equal(many.err.split('\n').filter((l) => l.startsWith('  c.json')).length, MAX_PROBLEMS);
});

test('hostile: long values and long paths are capped in the messages', LIMIT, async () => {
  const long = 'x'.repeat(3000);
  const r = await fast(() => run(projectWith({ [M]: manifest([`.package(url: "http://code.example.test/${long}/imagecache.git", branch: "${long}")`]) }), ['p', '--json']));
  const out = JSON.parse(r.out);
  assert.ok(out.findings.length >= 2);
  assert.ok(out.findings.every((f) => f.found.length <= 800));
  assert.ok(out.packages.every((p) => p.requirement.length <= 300));
});

test('hostile: control, escape, direction and line separator characters in values are removed from every format', async () => {
  const evil = 'http://code.example.test/acme/image\\u{1b}[31m\\u{202e}\\u{02028}cache.git';
  const files = projectWith({ [M]: edit(MANIFEST, [`${HOST}/acme/imagecache.git`, evil]) });
  for (const format of ['text', 'json', 'csv', 'github']) {
    const r = await run(files, ['p', '--format', format]);
    assert.equal(r.code, 1, format);
    for (const c of ['\u001b', '\u202e', '\u2028']) assert.ok(!r.out.includes(c) && !JSON.stringify(JSON.parse(format === 'json' ? r.out : '{}')).includes(c), `${format}: ${JSON.stringify(c)}`);
  }
});

test('hostile: a value cannot end a workflow command or start another one, and a formula is neutralized in CSV', async () => {
  const files = projectWith({ [M]: manifest([`.package(url: "${HOST}/acme/imagecache.git", branch: "%0A::error file=x::y\\n::warning::z")`]) });
  const github = await run(files, ['p', '--format', 'github']);
  const lines = github.out.trimEnd().split('\n');
  assert.ok(lines.slice(0, -1).every((l) => /^::(?:error|warning|notice) file=/.test(l)), github.out);
  assert.ok(github.out.includes('%250A::error file=x::y ::warning::z'));
  const csv = await run(projectWith({ [M]: manifest(['.package(url: "=cmd|calc", from: "2.3.0")']) }), ['p', '--format', 'csv']);
  assert.ok(csv.out.split('\r\n').slice(1, -1).every((l) => !/,[=+@-]/.test(l.replace(/,"[^"]*"/g, ','))), csv.out);
});

test('hostile: __proto__, constructor and toString as identities, keys and names change nothing', async () => {
  const deps = ['__proto__', 'constructor', 'toString'].map((n) => `.package(url: "${HOST}/acme/${n}.git", from: "1.0.0")`);
  const pins = resolved([{ identity: '__proto__', version: '1.0.0' }, { identity: 'constructor', version: '1.0.0' }, { identity: 'tostring', version: '1.0.0' }, { identity: 'hasownproperty', version: '1.0.0' }]);
  const out = JSON.parse((await run({ [M]: manifest(deps), [R]: pins, [P]: '{ objects = { __proto__ = { isa = XCLocalSwiftPackageReference; relativePath = constructor; }; }; }' }, ['p', '--json'])).out);
  assert.deepEqual(out.findings.map((f) => [f.rule, f.found.slice(0, 40)]), [['stale-pin', 'Package.resolved pins "hasownproperty" ('], ['local-package', 'the package at the path "constructor" is']]);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.toString.call([]), '[object Array]');
});

test('hostile: CRLF, CR and a byte order mark give the same report as LF', async () => {
  const text = edit(MANIFEST, ['from: "2.3.0"', 'branch: "main"']);
  const files = projectWith({ [M]: text, [R]: resolved([{ identity: 'imagecache', branch: 'main' }, { identity: 'netkit', version: '5.1.0' }]) });
  const lf = JSON.parse((await run(files, ['p', '--json'])).out);
  for (const [name, change] of [['CRLF', (t) => t.split('\n').join('\r\n')], ['CR', (t) => t.split('\n').join('\r')], ['BOM', (t) => `\ufeff${t}`]]) {
    const other = JSON.parse((await run(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, change(v)])), ['p', '--json'])).out);
    assert.deepEqual(other.findings.map((f) => [f.rule, f.line, f.column]), lf.findings.map((f) => [f.rule, f.line, f.column]), name);
  }
});

test('hostile: a symbolic link in the project is counted and not followed, and a link named is refused', async (t) => {
  if (process.platform === 'win32') {
    t.skip('symbolic links need extra rights on Windows');
    return;
  }
  await withFiles(PROJECT, async (dir) => {
    await mkdir(resolve(dir, 'outside'));
    await writeFile(resolve(dir, 'outside/Package.swift'), manifest(['.package(url: "http://code.example.test/x/y.git", branch: "main")']));
    await symlink(resolve(dir, 'outside'), resolve(dir, 'p/loop'));
    await symlink(resolve(dir, 'outside/Package.swift'), resolve(dir, 'p/Package.swift'));
    await symlink(resolve(dir, 'p'), resolve(dir, 'p-link'));
    const out = JSON.parse((await cli(['p', '--json'], dir)).out);
    assert.equal(out.input.links, 2);
    assert.deepEqual(out.findings, []);
    assert.match(out.notes.join('\n'), /2 symbolic links are not followed/);
    const named = await cli(['p-link'], dir);
    assert.equal(named.code, 2);
    assert.match(named.err, /is a symbolic link, which is not followed/);
    await symlink(resolve(dir, 'outside/Package.swift'), resolve(dir, 'c.json'));
    assert.equal((await cli(['p', '--config', 'c.json'], dir)).code, 2);
  });
});

test('hostile: a device named as a project is refused, and a manifest with no read access is an unreadable-file error', async (t) => {
  if (process.platform === 'win32') {
    t.skip('devices and file modes work differently on Windows');
    return;
  }
  const device = await cli(['/dev/null'], process.cwd());
  assert.equal(device.code, 2);
  assert.match(device.err, /is not a regular file or folder/);
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user reads every file whatever its mode');
    return;
  }
  await withFiles(PROJECT, async (dir) => {
    await chmod(resolve(dir, M), 0o000);
    const r = await cli(['p', '--json'], dir);
    assert.match(JSON.parse(r.out).findings.find((f) => f.rule === 'unreadable-file').found, /cannot be read \(EACCES\)/);
    await chmod(resolve(dir, M), 0o644);
  });
});
