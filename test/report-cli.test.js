import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CSV_COLUMNS, NOTICE, USAGE, VERSION, csvField, escapeData, escapeProperty, parseArgs } from '../src/index.js';
import { HOST, M, MANIFEST, P, PROJECT, R, cli, columnOf, edit, lineOf, manifest, projectWith, resolved, run, withFiles } from './helpers.js';

const WARN = projectWith({ [R]: resolved([{ identity: 'imagecache', version: '2.3.4' }, { identity: 'netkit', version: '5.1.0' }, { identity: 'gone', version: '1.0.0' }]) });
const ERROR_TEXT = edit(MANIFEST, [`"${HOST}/acme/imagecache.git"`, '"http://code.example.test/acme/imagecache.git"']);
const ERROR = projectWith({ [M]: ERROR_TEXT });
const INFO = projectWith({ [M]: manifest([`.package(url: "${HOST}/acme/imagecache.git", from: "2.3.0")`, '.package(path: "Shared")']) });

test('cli: exit 0 below the fail-on level, 1 at or above it, from the flag or the configuration', async () => {
  const clean = await run(PROJECT);
  assert.equal(clean.code, 0, clean.err);
  assert.match(clean.out, /^spm-dependency-check: p\ninput: 1 manifest; 1 Xcode project; 1 Package\.resolved; 0 other files passed over; 0 folders named \.build, DerivedData, Pods or \.git passed over; 0 paths excluded; 0 links not followed\nconfig: built-in defaults: deprecated packages none; indirect pins none; exclude none; minimum severity info; fail on error\n/);
  assert.match(clean.out, /\nfindings: 0\n/);
  assert.match(clean.out, /RESULT: PASS - no finding at or above error\n$/);
  assert.equal(clean.err, '');
  assert.equal((await run(WARN)).code, 0, 'a warning does not fail the run by default');
  assert.equal((await run(WARN, ['p', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(INFO, ['p', '--fail-on', 'warning'])).code, 0);
  assert.equal((await run(INFO, ['p', '--fail-on', 'info'])).code, 1);
  const configured = await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['p', '--config', 'c.json']);
  assert.equal(configured.code, 1);
  assert.match(configured.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)\n$/);
  assert.equal((await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['p', '--config', 'c.json', '--fail-on', 'error'])).code, 0, 'the flag wins over the configuration');
  const error = await run(ERROR);
  assert.equal(error.code, 1);
  assert.match(error.out, /RESULT: FAIL - 1 finding at or above error \(1 error\)\n$/);
});

test('cli: a file that cannot be read is an unreadable-file error at its place, and the run goes on', async () => {
  const badPbx = '{ objects = { A = 1 }; }';
  const r = await run(projectWith({ [P]: badPbx, [R]: '{\n  "pins": [],\n  "version": 7\n}', 'p/Other/Package.swift': Buffer.from([0x3c, 0, 0x3e]) }), ['p', '--json']);
  assert.equal(r.code, 1);
  const out = JSON.parse(r.out);
  const f = out.findings.filter((x) => x.rule === 'unreadable-file');
  assert.deepEqual(f.map((x) => [x.file, x.line, x.column]), [[P, 1, columnOf(badPbx, '}')], [R, 3, 14], ['p/Other/Package.swift', 1, 1]]);
  assert.match(f[0].found, /the Xcode project file cannot be read as a property list: a ; after the value was expected/);
  assert.match(f[1].found, /the Package\.resolved cannot be read: its format version 7 is not one the reader knows/);
  assert.match(f[2].found, /the manifest cannot be read: .*holds binary data/);
  assert.deepEqual(out.files.map((m) => [m.file, m.read]), [[P, false], [R, false], [M, true], ['p/Other/Package.swift', false]]);
  assert.match((await run(projectWith({ [R]: Buffer.from([0x61, 0xe9]) }))).out, /Package\.resolved, not read/);
  const big = await run(projectWith({ [M]: `// ${'x'.repeat(200)}\n${MANIFEST}` }), ['p', '--json'], { maxFileBytes: 100 });
  assert.match(JSON.parse(big.out).findings.find((x) => x.file === M).found, /the manifest cannot be read: .*bytes is over the 100 byte limit/);
});

test('cli: files saved as UTF-16 with their byte order mark, or with CRLF line ends, give the same findings', async () => {
  const base = JSON.parse((await run(ERROR, ['p', '--json'])).out);
  for (const change of [(t) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(t, 'utf16le')]), (t) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(t)]), (t) => t.split('\n').join('\r\n')]) {
    const r = JSON.parse((await run({ [P]: change(PROJECT[P]), [R]: change(PROJECT[R]), [M]: change(ERROR_TEXT) }, ['p', '--json'])).out);
    assert.deepEqual(r.findings, base.findings);
  }
});

test('cli: --min-severity hides the findings below it and says so', async () => {
  const r = await run(INFO, ['p', '--min-severity', 'warning']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0; 1 below warning not shown/);
  assert.match(r.out, /note: 1 finding below warning is not shown/);
});

test('cli: the project and --exclude must be usable, or the run stops with no result', async () => {
  const file = await run(PROJECT, [M]);
  assert.equal(file.code, 2);
  assert.match(file.err, /p\/Core\/Package\.swift: is a file; give the folder of the app or package/);
  assert.match((await run(PROJECT, ['nowhere'])).err, /nowhere: no such file or folder/);
  assert.match((await run(PROJECT, ['p', '--exclude', '../x'])).err, /--exclude "\.\.\/x" leaves the project folder with \.\./);
  const excluded = JSON.parse((await run(ERROR, ['p', '--exclude', 'Core/**', '--json'])).out);
  assert.deepEqual(excluded.findings.map((f) => f.rule), ['stale-pin'], 'the excluded manifest is not read, so its pin is stale');
  assert.equal(excluded.input.excluded, 1);
});

test('cli: usage errors give exit code 2 and the usage', async () => {
  for (const argv of [[], ['--format', 'xml', 'p'], ['--min-severity', 'fatal', 'p'], ['--fail-on'], ['p', '--bogus'], ['p', '--config', 'a', '--config', 'b'], ['p', '--explain', '--format', 'csv'], ['p', '--json', '--format', 'csv'], ['-'], ['p', '--config', '-'], ['https://example.test/project'], ['p', '--config', 'https://a.test/c.json'], ['p', 'q'], ['p', '--exclude', '--json']]) {
    const r = await cli(argv, process.cwd());
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.out, '');
    assert.match(r.err, /^spm-dependency-check: .+\n\nUsage: spm-dependency-check/, argv.join(' '));
  }
  assert.match((await cli(['https://example.test/project'], process.cwd())).err, /never fetches a URL/);
  assert.match((await cli(['p', 'q'], process.cwd())).err, /give one project folder/);
  assert.throws(() => parseArgs(['p', ...Array.from({ length: 101 }, () => ['--exclude', 'x']).flat()]), /more than 100 exclude patterns/);
  assert.deepEqual(parseArgs(['p', '--exclude', 'a', '--exclude', 'b']).exclude, ['a', 'b']);
});

test('cli: --help, --version and --print-defaults', async () => {
  const help = await cli(['--help'], process.cwd());
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const s of ['--exclude', '--config', '--format', '--json', '--min-severity', '--fail-on', '--explain', '--print-defaults', 'Exit codes: 0', 'branch-requirement (rules.branchRequirement)', 'unreadable-file (always error)', 'never says\nwhat the latest version is']) assert.ok(USAGE.includes(s), s);
  assert.equal((await cli(['-v'], process.cwd())).out, `${VERSION}\n`);
  const d = await cli(['--print-defaults'], process.cwd());
  assert.equal(JSON.parse(d.out).name, 'built-in defaults');
  assert.deepEqual(JSON.parse(d.out).deprecatedPackages, []);
});

test('report: the JSON report holds the input, the configuration, the files, the packages, the summary, the rules, the findings and the result', async () => {
  const out = JSON.parse((await run(ERROR, ['p', '--json'])).out);
  assert.deepEqual(Object.keys(out), ['tool', 'version', 'input', 'config', 'files', 'packages', 'summary', 'rules', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.equal(out.tool, 'spm-dependency-check');
  assert.equal(out.notice, NOTICE);
  const f = out.findings[0];
  assert.deepEqual(Object.keys(f), ['rule', 'level', 'file', 'line', 'column', 'at', 'found', 'fix']);
  assert.equal(f.at, `${M}:${f.line}`);
  assert.equal(out.rules.length, 14);
  assert.deepEqual(Object.keys(out.files[0]), ['file', 'kind', 'read', 'remote', 'local', 'pins', 'products', 'byLevel']);
  assert.deepEqual(Object.keys(out.packages[0]), ['identity', 'kind', 'declared', 'requirement', 'resolved', 'products']);
  assert.deepEqual(Object.keys(out.summary), ['packages', 'remote', 'local', 'declarations', 'kinds', 'resolvedFiles', 'pins', 'products']);
  const explained = JSON.parse((await run(ERROR, ['p', '--json', '--explain'])).out);
  assert.ok(explained.findings[0].basis.length > 0);
  assert.ok(explained.findings[0].own.length > 0);
});

test('report: --explain adds the rule, the points of the public pages and the own choice to the text', async () => {
  const r = await run(ERROR, ['p', '--explain']);
  assert.match(r.out, /\n {11}rule: a remote package URL whose scheme is not https\n {11}basis: a remote package is named by the URL of its Git repository.+\(Adding dependencies to a Swift package \(Swift Package Manager documentation\), https:\/\/github\.com\/swiftlang\/swift-package-manager\/blob\/main\/Sources\/PackageManagerDocs\/Documentation\.docc\/Dependencies\/AddingDependencies\.md\)\n/);
  assert.match(r.out, /\n {11}the tool's own choice: /);
});

test('report: CSV with one record per finding, CRLF line ends, quotes and a neutralized formula', async () => {
  const r = await run(ERROR, ['p', '--format', 'csv']);
  assert.equal(r.code, 1);
  const lines = r.out.split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines.at(-1), '');
  assert.equal(lines.length, 3);
  assert.match(lines[1], new RegExp(`^error,insecure-url,p/Core/Package\\.swift,${lineOf(ERROR_TEXT, 'http://')},${columnOf(ERROR_TEXT, '"http://')},"the package ""imagecache"" is named by http://`));
  assert.equal(csvField('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvField('-1'), "'-1");
  assert.equal(csvField('@x'), "'@x");
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('a"b'), '"a""b"');
  assert.equal(csvField(null), '');
});

test('report: GitHub commands with file, line, column and title, escaped, and a summary line', async () => {
  const r = await run(ERROR, ['p', '--format', 'github']);
  const lines = r.out.trimEnd().split('\n');
  assert.match(lines[0], new RegExp(`^::error file=p/Core/Package\\.swift,line=${lineOf(ERROR_TEXT, 'http://')},col=${columnOf(ERROR_TEXT, '"http://')},title=spm-dependency-check insecure-url::the package "imagecache"`));
  assert.equal(lines.at(-1), 'spm-dependency-check: 3 files, 2 packages, 1 finding; RESULT: FAIL - 1 finding at or above error (1 error)');
  assert.equal(escapeData('50%\r\nx'), '50%25%0D%0Ax');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
  const info = await run(INFO, ['p', '--format', 'github']);
  assert.match(info.out, /^::notice file=p\/Core\/Package\.swift,line=\d+,col=\d+,title=spm-dependency-check local-package::/);
});

test('report: the text names each file and package with its counts, a summary, and ends with the notice and the result', async () => {
  const r = await run(WARN);
  assert.ok(r.out.includes('\n  p/App.xcodeproj/project.pbxproj                                            Xcode project        1       0      0     1         0      0        0\n'), r.out);
  assert.ok(r.out.includes('\n  gone        pin only  0         -            1.0.0     0\n'), r.out);
  assert.ok(r.out.includes('\n  packages: 3 (2 remote, 0 local), in 2 declarations\n'));
  assert.ok(r.out.includes('\n  requirement kinds: 2 up to next major\n'));
  assert.ok(r.out.includes('\n  resolved: 3 pins in 1 Package.resolved file\n'));
  assert.ok(r.out.includes(`\n${NOTICE}\n\nRESULT: PASS - no finding at or above error (1 warning)\n`));
  const empty = await withFiles({ 'e/readme.txt': 'x' }, (dir) => cli(['e'], dir));
  assert.equal(empty.code, 0);
  assert.match(empty.out, /0 manifests; 0 Xcode projects; 0 Package\.resolved; 1 other file passed over/);
  assert.match(empty.out, /\nFiles \(0\)\n\n {2}none\n/);
  assert.match(empty.out, /\nPackages \(0\)\n\n {2}none\n/);
  assert.match(empty.out, /requirement kinds: none/);
  assert.match(empty.out, /note: the project holds no Package\.swift, Package\.resolved or Xcode project file/);
});

test('cli: a run writes nothing to the folders it reads', async () => {
  await withFiles(WARN, async (dir) => {
    const before = (await readdir(dir, { recursive: true })).sort();
    const r = await cli(['p', '--format', 'csv', '--fail-on', 'warning'], dir);
    assert.equal(r.code, 1);
    assert.deepEqual((await readdir(dir, { recursive: true })).sort(), before);
    assert.ok(resolve(dir).length > 0);
  });
});
