import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SWIFT_LIMITS, callArguments, scanManifest, tokenize, valueOf } from '../src/index.js';
import { HOST, columnOf, lineOf, manifest } from './helpers.js';

// The reading of a Package.swift as text: the tokens with comments left out and strings kept, every form of a package
// dependency and of a product, and what the reader refuses rather than guesses.

const one = (dep) => {
  const s = scanManifest(manifest([dep]));
  assert.equal(s.packages.length, 1, dep);
  return s.packages[0];
};

test('swift: tokens with line and nested block comments left out, and strings of every form with their values', () => {
  const { tokens } = tokenize('a /* x /* y */ z */ b // c\n"s\\"q\\n" #"r"# ##"r2"## """\nm\n""" "\\u{41}" .. ..< ... 12 `default`');
  assert.deepEqual(tokens.map((t) => t.type === 'str' ? `str:${t.value}` : `${t.type}:${t.text}`), ['id:a', 'id:b', 'str:s"q\n', 'str:r', 'str:r2', 'str:\nm\n', 'str:A', 'punct:.', 'punct:.', 'punct:..<', 'punct:...', 'num:12', 'id:default']);
  const raw = tokenize('#"a\\nb"# #"x\\#(y)"# "i\\(f("q"))j"').tokens;
  assert.deepEqual(raw.map((t) => [t.value, t.interpolated]), [['a\\nb', false], ['x\\(...)', true], ['i\\(...)j', true]]);
  assert.equal(tokenize('"open\nnext').tokens.length, 2, 'a string that is not closed ends at its line');
  assert.equal(tokenize('### x').tokens[0].text, '#');
  assert.equal(tokenize('"\\u{zz}"').tokens[0].value, '?zz}');
  assert.ok(tokenize('a b c', { maxTokens: 2 }).limited);
});

test('swift: the arguments of a call and the value of each by its shape', () => {
  const { tokens } = tokenize('f(url: "u", "1.0.0"..<"2.0.0", .upToNextMajor(from: "1.0.0"), [a, b], x)');
  const call = callArguments(tokens, 1);
  assert.deepEqual(call.args.map((a) => a.label), ['url', null, null, null, null]);
  assert.equal(call.end, tokens.length);
  assert.equal(valueOf(call.args[0].tokens).value, 'u');
  assert.equal(valueOf(call.args[1].tokens).type, 'range');
  assert.equal(valueOf(call.args[2].tokens).name, 'upToNextMajor');
  assert.equal(valueOf(call.args[3].tokens), null);
  assert.equal(valueOf(call.args[4].tokens), null);
  assert.equal(callArguments(tokenize('f(a, b').tokens, 1), null, 'a call that is not closed');
  assert.equal(SWIFT_LIMITS.maxCallTokens, 400);
});

test('swift: every requirement form, with its kind, its text and its place', () => {
  const cases = [
    [`.package(url: "${HOST}/a/b.git", from: "1.2.3")`, 'upToNextMajor', 'from 1.2.3'],
    [`.package(url: "${HOST}/a/b.git", exact: "1.2.3")`, 'exact', 'exact 1.2.3'],
    [`.package(url: "${HOST}/a/b.git", branch: "main")`, 'branch', 'branch main'],
    [`.package(url: "${HOST}/a/b.git", revision: "abc123")`, 'revision', 'revision abc123'],
    [`.package(url: "${HOST}/a/b.git", "1.0.0"..<"1.5.0")`, 'range', '1.0.0..<1.5.0'],
    [`.package(url: "${HOST}/a/b.git", "1.0.0"..."1.5.0")`, 'range', '1.0.0...1.5.0'],
    [`.package(url: "${HOST}/a/b.git", .upToNextMajor(from: "1.2.3"))`, 'upToNextMajor', 'from 1.2.3'],
    [`.package(url: "${HOST}/a/b.git", .upToNextMinor(from: "1.2.3"))`, 'upToNextMinor', 'up to next minor from 1.2.3'],
    [`.package(url: "${HOST}/a/b.git", .exact("1.2.3"))`, 'exact', 'exact 1.2.3'],
    [`.package(url: "${HOST}/a/b.git", .branch("dev"))`, 'branch', 'branch dev'],
    [`.package(url: "${HOST}/a/b.git", .revision("f00d"))`, 'revision', 'revision f00d'],
    [`.package(name: "B", url: "${HOST}/a/b.git", from: "1.2.3")`, 'upToNextMajor', 'from 1.2.3'],
    [`.package(id: "acme.b", from: "1.2.3")`, 'upToNextMajor', 'from 1.2.3'],
    [`.package(url: "${HOST}/a/b.git", from: "1.2.3", traits: ["Fast"])`, 'upToNextMajor', 'from 1.2.3']
  ];
  for (const [dep, kind, text] of cases) {
    const p = one(dep);
    assert.equal(p.problem, null, dep);
    assert.deepEqual([p.requirement.kind, p.requirement.text], [kind, text], dep);
  }
  const m = manifest([`.package(\n            url: "${HOST}/a/b.git",\n            from: "1.2.3"\n        )`]);
  const p = scanManifest(m).packages[0];
  assert.equal(p.location, `${HOST}/a/b.git`);
  assert.equal(p.start, m.indexOf('.package'));
  assert.equal(p.requirementAt, m.indexOf('"1.2.3"'));
  assert.equal(lineOf(m, '"1.2.3"'), lineOf(m, '.package') + 2);
  assert.equal(columnOf(m, '"1.2.3"'), 19);
  assert.equal(one('.package(id: "acme.b", exact: "1.0.0")').kind, 'registry');
});

test('swift: a local package, and products with and without a package', () => {
  const p = one('.package(path: "../Shared")');
  assert.deepEqual([p.kind, p.location, p.requirement, p.problem], ['local', '../Shared', null, null]);
  assert.equal(one('.package(name: "Shared", path: "../Shared")').kind, 'local');
  const s = scanManifest(manifest([], [['NetKit', 'netkit'], ['Other', 'other-pkg']]).replace('dependencies: [.product', 'dependencies: ["Plain", .product(name: "Solo"), .product'));
  assert.deepEqual(s.products.map((x) => [x.name, x.package]), [['Solo', 'Solo'], ['NetKit', 'netkit'], ['Other', 'other-pkg']]);
});

test('swift: what is commented out, in a string or a label is not a dependency', () => {
  const text = `// .package(url: "${HOST}/a/one.git", branch: "main")
/* .package(url: "${HOST}/a/two.git", from: "1.0.0") /* nested */ .package(url: "x", from: "1.0.0") */
let note = ".package(url: \\"${HOST}/a/three.git\\", from: \\"1.0.0\\")"
let deps = [.product(name: "X", package: "x")]
let s = """
.package(url: "${HOST}/a/four.git", from: "1.0.0")
"""
`;
  assert.deepEqual(scanManifest(text).packages, []);
  assert.equal(scanManifest(text).products.length, 1);
});

test('swift: values written with a variable, interpolation or a form the reader does not take are problems, not guesses', () => {
  const cases = [
    ['.package(url: base + "/b.git", from: "1.0.0")', /the url is not a string the reader can read/],
    [`.package(url: "\\(base)/b.git", from: "1.0.0")`, /the url is not a string the reader can read/],
    [`.package(url: "${HOST}/a/b.git", from: version)`, /from: is not a string the reader can read/],
    [`.package(url: "${HOST}/a/b.git", from: "1.0")`, /"1\.0" is not a semantic version/],
    [`.package(url: "${HOST}/a/b.git", "1.0.0"..<version)`, /no requirement the reader can read/],
    [`.package(url: "${HOST}/a/b.git", "\\(v)"..<"2.0.0")`, /the range is written with string interpolation/],
    [`.package(url: "${HOST}/a/b.git", "2.0.0"..<"1.0.0")`, /holds no version/],
    [`.package(url: "${HOST}/a/b.git", .upToNextMajor("1.0.0"))`, /\.upToNextMajor\(\.\.\.\) does not hold a string/],
    [`.package(url: "${HOST}/a/b.git", .exact(v))`, /\.exact\(\.\.\.\) does not hold a string/],
    [`.package(url: "${HOST}/a/b.git", .exact("1.0"))`, /"1\.0" is not a semantic version/],
    [`.package(url: "${HOST}/a/b.git")`, /no requirement the reader can read/],
    ['.package(from: "1.0.0")', /no url:, path: or id: the reader can read/],
    ['.package(path: dir)', /the path is not a string/]
  ];
  for (const [dep, problem] of cases) assert.match(one(dep).problem, problem, dep);
  assert.match(scanManifest('.package(url: "x", from: "1.0.0"').packages[0].problem, /is not closed/);
  assert.ok(scanManifest(`${'.package(path: "a")\n'.repeat(5)}`, { maxPackages: 3 }).limited);
});
