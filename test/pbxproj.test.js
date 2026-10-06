import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PBX_LIMITS, PbxError, parsePbx, scanProject } from '../src/index.js';
import { HOST, lineOf, pbx } from './helpers.js';

// The targeted reader of project.pbxproj: the old-style property list grammar, the three kinds of entries it reads,
// every requirement kind, and what it refuses with its place.

const refused = (text, limits) => {
  try {
    parsePbx(text, limits);
  } catch (error) {
    assert.ok(error instanceof PbxError, error.message);
    return error;
  }
  return assert.fail('not refused');
};

test('pbxproj: dictionaries, lists, quoted and bare strings, data and comments, with the offset of every string', () => {
  const root = parsePbx('// !$*UTF8*$!\n{ a = 1; b = "x \\"y\\" \\n \\U0041"; c = ( d, "e", ); f = { g = <0a0b>; }; /* note */ h = (); i = {}; }');
  assert.equal(root.t, 'dict');
  assert.equal(root.map.get('a').value.s, '1');
  assert.equal(root.map.get('b').value.s, 'x "y" \n A');
  assert.deepEqual(root.map.get('c').value.items.map((x) => x.s), ['d', 'e']);
  assert.equal(root.map.get('f').value.map.get('g').value.s, '0a0b');
  assert.deepEqual(root.map.get('h').value.items, []);
  assert.equal(root.map.get('i').value.map.size, 0);
  assert.equal(root.map.get('a').keyAt, 16);
});

test('pbxproj: what is not a property list is refused with its place', () => {
  assert.match(refused('{ a = 1 }').reason, /a ; after the value was expected/);
  assert.match(refused('{ a 1; }').reason, /an = after the key was expected/);
  assert.match(refused('{ a = 1; a = 2; }').reason, /the key "a" appears twice in one dictionary/);
  assert.match(refused('{ a = "x; }').reason, /a string that is not closed/);
  assert.match(refused('{ a = (1 2); }').reason, /a , or \) after the value was expected/);
  assert.match(refused('{ a = 1;').reason, /a dictionary \{ that is not closed/);
  assert.match(refused('{ a = (1,').reason, /a list \( that is not closed/);
  assert.match(refused('{ } }').reason, /text after the end of the property list/);
  assert.match(refused('').reason, /holds no property list/);
  assert.match(refused('{ a = ; }').reason, /a value was expected, not ;/);
  assert.match(refused('{ = 1; }').reason, /a key was expected/);
  assert.match(refused('{ a = 1; } /* open').reason, /a comment \/\* that is not closed/);
  assert.match(refused('{ a = <0a; }').reason, /data in < > that is not closed/);
  assert.match(refused('{ a = ^; }').reason, /the character "\^" that a property list does not have/);
  assert.match(refused(`{ a = ${'('.repeat(80)} }`).reason, /nested more than 64 deep/);
  assert.match(refused('{ a = (1, 2, 3); }', { maxValues: 3 }).reason, /more than 3 values/);
  assert.match(refused(`{ a = "${'x'.repeat(30)}"; }`, { maxStringLength: 10 }).reason, /a string longer than 10 characters/);
  assert.match(refused(`{ a = ${'x'.repeat(30)}; }`, { maxStringLength: 10 }).reason, /a string longer than 10 characters/);
  assert.equal(refused('{ a = 1 }').offset, 8);
  assert.equal(PBX_LIMITS.maxDepth, 64);
});

test('pbxproj: every requirement kind of a remote reference, and its place', () => {
  const text = pbx([
    { url: `${HOST}/a/one.git`, kind: 'upToNextMajorVersion', min: '1.2.0' },
    { url: `${HOST}/a/two.git`, kind: 'upToNextMinorVersion', min: '1.2.0' },
    { url: `${HOST}/a/three.git`, kind: 'exactVersion', version: '1.2.0' },
    { url: `${HOST}/a/four.git`, kind: 'versionRange', min: '1.2.0', max: '3.0.0' },
    { url: `${HOST}/a/five.git`, kind: 'branch', branch: 'main' },
    { url: `${HOST}/a/six.git`, kind: 'revision', revision: 'f00dfeed' }
  ]);
  const s = scanProject(text);
  assert.deepEqual(s.packages.map((p) => [p.location.split('/').at(-1), p.requirement.text, p.problem]), [['one.git', 'from 1.2.0', null], ['two.git', 'up to next minor from 1.2.0', null], ['three.git', 'exact 1.2.0', null], ['four.git', '1.2.0..<3.0.0', null], ['five.git', 'branch main', null], ['six.git', 'revision f00dfeed', null]]);
  assert.equal(s.packages[0].requirementAt, text.indexOf('1.2.0'));
  assert.equal(lineOf(text, `${HOST}/a/one.git`), lineOf(text, '1.2.0') - 3);
  assert.deepEqual(s.products.map((p) => [p.name, p.package]), [['P0', `${HOST}/a/one.git`], ['P1', `${HOST}/a/two.git`], ['P2', `${HOST}/a/three.git`], ['P3', `${HOST}/a/four.git`], ['P4', `${HOST}/a/five.git`], ['P5', `${HOST}/a/six.git`]]);
});

test('pbxproj: a local reference, references the reader cannot read, and a file with no objects', () => {
  const s = scanProject(pbx([{ path: '../Shared' }, { url: `${HOST}/a/b.git`, kind: 'upToNextMajorVersion' }, { url: `${HOST}/a/c.git`, kind: 'someNewKind', min: '1.0.0' }, { url: `${HOST}/a/d.git`, kind: 'versionRange', min: '1.0.0' }, { url: `${HOST}/a/e.git`, kind: 'exactVersion', version: '1.0' }]));
  assert.deepEqual(s.packages.map((p) => [p.kind, p.problem]), [['local', null], ['remote', 'the requirement upToNextMajorVersion has no minimumVersion'], ['remote', 'the requirement kind someNewKind is not one the reader knows'], ['remote', 'the requirement versionRange has no maximumVersion'], ['remote', '"1.0" is not a semantic version major.minor.patch']]);
  const missing = scanProject('{ objects = { X = { isa = XCRemoteSwiftPackageReference; }; Y = { isa = XCRemoteSwiftPackageReference; repositoryURL = "u"; }; Z = { isa = XCRemoteSwiftPackageReference; repositoryURL = "u"; requirement = { minimumVersion = 1.0.0; }; }; L = { isa = XCLocalSwiftPackageReference; }; Q = { isa = XCSwiftPackageProductDependency; productName = Q; package = NOPE; }; }; }');
  assert.deepEqual(missing.packages.map((p) => p.problem), ['the reference has no repositoryURL', 'the reference has no requirement dictionary', 'the requirement has no kind', 'the local reference has no relativePath']);
  assert.deepEqual(missing.products, [{ name: 'Q', package: null, start: missing.products[0].start }]);
  assert.deepEqual(scanProject('{ archiveVersion = 1; }').packages, []);
  assert.deepEqual(scanProject('( a )').packages, []);
  assert.deepEqual(scanProject('{ objects = { A = { name = x; }; B = x; }; }').packages, [], 'entries with no isa or that are not dictionaries are passed over');
});
