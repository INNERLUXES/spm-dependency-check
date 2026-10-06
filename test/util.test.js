import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { FILE_LIMITS, LIMITS, MAX_PATTERN_LENGTH, OPEN_FLAGS, RULES, SKIPPED_FOLDERS, WALK_LIMITS, asciiLower, atOrAbove, baseName, byCode, capped, checkProject, decide, defaultConfig, displayPath, excluded, fileError, flat, folderOf, globMatch, grouped, inspectPath, joinPath, kindOfFile, levelOf, listText, placer, plural, readBounded, readProjectFile, readText, readTextFile, ruleById, safeText, textOf, walkProject } from '../src/index.js';
import { PROJECT, withFiles } from './helpers.js';

test('glob: path and location patterns with *, ?, ** and **/', () => {
  for (const [p, t] of [['Vendor/**', 'Vendor/a/Package.swift'], ['Vendor/**', 'Vendor/'], ['**/Examples/**', 'x/Examples/Package.swift'], ['**/Examples/**', 'Examples/a'], ['*.swift', 'Package.swift'], ['a?c', 'abc'], ['**', 'a/b/c'], ['**/Package.swift', 'Package.swift'], ['a/**/b', 'a/b'], ['a/**/b', 'a/x/y/b'], ['code.example.test/old-org/*', 'code.example.test/old-org/repo']]) assert.ok(globMatch(p, t), `${p} ${t}`);
  for (const [p, t] of [['Vendor/**', 'Vendor'], ['*.swift', 'a/Package.swift'], ['a?c', 'a/c'], ['a', 'ab'], ['ab', 'a'], ['**/x', 'ax'], ['code.example.test/old-org/*', 'code.example.test/old-org/a/b']]) assert.ok(!globMatch(p, t), `${p} ${t}`);
  assert.ok(excluded(['Vendor/**'], 'Vendor', true) && !excluded(['Vendor/**'], 'Vendor', false) && !excluded([], 'x'));
  assert.equal(MAX_PATTERN_LENGTH, 200);
});

test('words, sizes and text: ASCII lowercase, paths, lists, plurals and cleaned text', () => {
  assert.equal(asciiLower('Package.SWIFT'), 'package.swift');
  assert.equal(baseName('App.xcodeproj/project.pbxproj'), 'project.pbxproj');
  assert.equal(folderOf('Core/Package.swift'), 'Core');
  assert.equal(folderOf('Package.swift'), '.');
  assert.equal(joinPath('.', 'a'), 'a');
  assert.equal(joinPath('a', ''), 'a');
  assert.equal(byCode('B', 'a'), -1);
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(listText(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(plural(1, 'package'), '1 package');
  assert.equal(plural(2, 'package'), '2 packages');
  assert.equal(safeText('a\u0007b\u202ec\u2028d', 100), 'a b c d');
  assert.equal(safeText('x'.repeat(20), 10), 'xxxxxxx...');
  assert.equal(flat(' a \n b '), 'a b');
});

test('rules: the levels, the result and the input problems', () => {
  assert.ok(atOrAbove('error', 'warning'));
  assert.ok(!atOrAbove('info', 'warning'));
  assert.equal(ruleById('wide-range').key, 'wideRange');
  assert.equal(levelOf(ruleById('unreadable-file'), defaultConfig()), 'error');
  assert.deepEqual(decide([{ level: 'warning' }], 'error'), { pass: true, failOn: 'error', failing: 0, byLevel: { error: 0, warning: 1, info: 0 }, text: 'PASS - no finding at or above error (1 warning)' });
  assert.equal(decide([{ level: 'error' }, { level: 'error' }], 'error').text, 'FAIL - 2 findings at or above error (2 error)');
  assert.equal(capped(Array.from({ length: 25 }, (_, i) => `p${i}`)).at(-1), 'and 5 more');
  assert.equal(RULES.filter((r) => r.key === null).length, 2);
  assert.equal(RULES.length, 14);
});

test('files: bounded reading, UTF-8 and UTF-16 by the byte order mark, and paths as shown', async () => {
  const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('a = 1', 'utf16le')]);
  const utf16be = Buffer.from(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('a = 1', 'utf16le')]).map((b, i, all) => (i < 2 ? b : all[i % 2 === 0 ? i + 1 : i - 1])));
  await withFiles({ 'a/x.swift': 'x\n', 'a/big.bin': Buffer.alloc(3000, 1), 'a/latin.resolved': Buffer.from([0x61, 0xe9]), 'a/le.txt': utf16le }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a/x.swift'), 100)).toString(), 'x\n');
    await assert.rejects(readBounded(resolve(dir, 'a/big.bin'), 100), /3,000 bytes is over the 100 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'a'), 100), /is a folder/);
    await assert.rejects(readBounded(resolve(dir, 'none'), 100), /no such file/);
    assert.deepEqual(await readText(resolve(dir, 'a/le.txt'), 'a/le.txt', 100), { size: 12, text: 'a = 1', encoding: 'utf-16le' });
    assert.equal(displayPath(resolve(dir, 'a/x.swift'), dir), 'a/x.swift');
    assert.equal(displayPath(dir, dir), '.');
    assert.ok(!displayPath(resolve(dir, '..', 'x'), dir).startsWith('..'));
    assert.equal((await inspectPath('a', dir)).folder, true);
    await assert.rejects(inspectPath('none', dir), /no such file or folder/);
    await assert.rejects(readTextFile('a', dir, 100), /is a folder; give the file itself/);
    const r = await readProjectFile(resolve(dir, 'a/latin.resolved'), 'a/latin.resolved', 'resolved');
    assert.match(r.problem.found, /the Package\.resolved cannot be read: .*not valid UTF-8/);
    const m = await readProjectFile(resolve(dir, 'a/x.swift'), 'a/x.swift', 'manifest');
    assert.deepEqual([m.manifest.file, m.manifest.scan.packages, m.problem], ['a/x.swift', [], null]);
  });
  assert.deepEqual(textOf(Buffer.from('\ufeffx'), 'f'), { text: 'x', encoding: 'utf-8' });
  assert.deepEqual(textOf(utf16be, 'f'), { text: 'a = 1', encoding: 'utf-16be' });
  assert.throws(() => textOf(Buffer.from([0xff]), 'f'), /not valid UTF-8/);
  assert.throws(() => textOf(Buffer.from('<a/>', 'utf16le'), 'f'), /a null byte\); a UTF-16 file needs its byte order mark/);
  assert.throws(() => textOf(Buffer.from([0xff, 0xfe, 0x41]), 'f'), /odd number of bytes/);
  assert.throws(() => textOf(Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0x41, 0x00]), 'f'), /not valid UTF-16/);
  assert.throws(() => textOf(Buffer.from([0xff, 0xfe, 0x00, 0x00]), 'f'), /a null character/);
  assert.equal(fileError('p', 'r').reason, 'r');
  assert.equal(typeof OPEN_FLAGS, 'number');
  assert.equal(FILE_LIMITS.maxFileBytes, 8 * 1024 * 1024);
});

test('walk: the files below a folder in the order of their paths, with .build, DerivedData, Pods and .git passed over', async () => {
  await withFiles({
    'r/Package.swift': 'x',
    'r/Package.resolved': 'x',
    'r/Package@swift-5.9.swift': 'x',
    'r/App.xcodeproj/project.pbxproj': 'x',
    'r/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved': 'x',
    'r/App.xcworkspace/xcshareddata/swiftpm/Package.resolved': 'x',
    'r/Other/project.pbxproj': 'x',
    'r/.build/checkouts/a/Package.swift': 'x',
    'r/DerivedData/x/Package.resolved': 'x',
    'r/Pods/Package.swift': 'x',
    'r/.git/Package.swift': 'x',
    'r/Vendor/Package.swift': 'x'
  }, async (dir) => {
    const w = await walkProject(resolve(dir, 'r'), { exclude: ['Vendor/**'] });
    assert.deepEqual(w.files.map((f) => [f.rel, f.kind]), [['App.xcodeproj/project.pbxproj', 'project'], ['App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', 'resolved'], ['App.xcworkspace/xcshareddata/swiftpm/Package.resolved', 'resolved'], ['Package.resolved', 'resolved'], ['Package.swift', 'manifest']]);
    assert.deepEqual([w.skipped, w.excluded, w.links, w.others, w.limit], [4, 1, 0, 2, null]);
    assert.match((await walkProject(resolve(dir, 'r'), { limits: { maxInputFiles: 2 } })).limit, /more than 2 manifests/);
  });
  for (const [name, folder, kind] of [['Package.swift', '', 'manifest'], ['package.swift', '', null], ['Package.resolved', 'x', 'resolved'], ['project.pbxproj', 'A.xcodeproj', 'project'], ['project.pbxproj', 'A.XCODEPROJ', 'project'], ['project.pbxproj', '.xcodeproj', null], ['project.pbxproj', 'A', null], ['Package@swift-5.9.swift', '', null]]) assert.equal(kindOfFile(name, folder), kind, `${folder}/${name}`);
  assert.deepEqual(SKIPPED_FOLDERS, ['.build', 'DerivedData', 'Pods', '.git']);
  assert.equal(WALK_LIMITS.maxProjectEntries, 50000);
});

test('check: checkProject builds the report of a run without the command line, and the pieces it uses', async () => {
  await withFiles(PROJECT, async (dir) => {
    const r = await checkProject({ project: 'p', base: dir, version: '9.9.9' });
    assert.equal(r.version, '9.9.9');
    assert.equal(r.result.pass, true);
    assert.equal(r.input.manifests, 1);
    assert.equal(r.files.length, 3);
  });
  const place = placer('a\nbc\r\nd');
  assert.deepEqual(place(3), { line: 2, column: 2 });
  assert.deepEqual(place(99), { line: 3, column: 2 });
  assert.equal(LIMITS.maxFindingsPerRule, 500);
});
