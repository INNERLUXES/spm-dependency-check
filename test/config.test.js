import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULT_DEPRECATED_PACKAGES, DEFAULT_EXCLUDE, DEFAULT_INDIRECT_PINS, DEFAULT_RULES, KEYS, defaultConfig, defaultsAsConfig, distance, isIdentity, isObject, kindOf, locationPatternProblem, pathPatternProblem, readConfig, suggestion, validateConfig } from '../src/index.js';
import { PROJECT, R, configOf, projectWith, resolved, run } from './helpers.js';

// The configuration file: every key with a good value and a bad one, unknown keys with their line and a suggestion,
// and a key named twice refused.

const problems = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
  return [];
};

test('config: the defaults, and --print-defaults read back give the same configuration', () => {
  const d = defaultConfig();
  assert.deepEqual(d.rules, DEFAULT_RULES);
  assert.deepEqual(d.deprecatedPackages, DEFAULT_DEPRECATED_PACKAGES);
  assert.deepEqual(d.indirectPins, DEFAULT_INDIRECT_PINS);
  assert.deepEqual(d.exclude, DEFAULT_EXCLUDE);
  assert.equal(d.minSeverity, 'info');
  assert.equal(d.failOn, 'error');
  const back = readConfig(JSON.stringify(defaultsAsConfig()), 'd.json');
  assert.deepEqual({ ...back, file: null, name: null }, d);
  assert.deepEqual(Object.keys(KEYS), ['name', 'rules', 'deprecatedPackages', 'indirectPins', 'exclude', 'minSeverity', 'failOn']);
  assert.deepEqual(DEFAULT_DEPRECATED_PACKAGES, [], 'no package is listed by default');
  d.indirectPins.push('x');
  assert.equal(defaultConfig().indirectPins.length, 0, 'the defaults are copied, never shared');
  assert.deepEqual(Object.entries(DEFAULT_RULES).filter(([, v]) => v === 'error').map(([k]) => k), ['branchRequirement', 'insecureUrl', 'conflictingRequirement', 'unpinnedDependency', 'resolvedOutsideRequirement']);
});

test('config: every key with a good value is taken, and a list replaces its default', () => {
  const c = configOf({ name: 'Review', rules: { insecureUrl: 'warning', localPackage: 'off' }, deprecatedPackages: [{ match: 'code.example.test/old-org/*', use: 'the new organization' }], indirectPins: ['swift-log', 'swift-log'], exclude: ['Vendor/**'], minSeverity: 'warning', failOn: 'warning' });
  assert.equal(c.name, 'Review');
  assert.equal(c.rules.insecureUrl, 'warning');
  assert.equal(c.rules.localPackage, 'off');
  assert.deepEqual(c.deprecatedPackages, [{ match: 'code.example.test/old-org/*', use: 'the new organization' }]);
  assert.deepEqual(c.indirectPins, ['swift-log'], 'a name given twice is kept once');
  assert.deepEqual(c.exclude, ['Vendor/**']);
  assert.equal(c.minSeverity, 'warning');
  assert.equal(c.failOn, 'warning');
});

test('config: an unknown key is an error with its line and a suggestion, at the top, in rules and in a list entry', () => {
  assert.deepEqual(problems('{\n  "failOm": "error"\n}'), ['c.json: line 2: "failOm" is not a key of the configuration; did you mean "failOn"?']);
  assert.deepEqual(problems('{\n  "rules": {\n    "branchRequirements": "off"\n  }\n}'), ['c.json: line 3: "branchRequirements" is not a key of rules; did you mean "branchRequirement"?']);
  assert.deepEqual(problems('{"indirectPin": []}'), ['c.json: line 1: "indirectPin" is not a key of the configuration; did you mean "indirectPins"?']);
  assert.deepEqual(problems('{\n  "deprecatedPackages": [\n    {"match": "a.test/b", "uze": "x"}\n  ]\n}'), ['c.json: line 3: "uze" is not a key of deprecatedPackages; did you mean "use"?', 'c.json: line 3: deprecatedPackages[0].use must be a text of 1 to 300 characters']);
  assert.deepEqual(problems('{"colour": 1}'), ['c.json: line 1: "colour" is not a key of the configuration']);
});

test('config: a value of the wrong kind is an error, and all problems are listed in the order of their lines', () => {
  const p = problems('{\n  "name": "",\n  "rules": {"stalePin": "loud", "wideRange": 3},\n  "deprecatedPackages": [{"match": "https://a.test/b", "use": ""}, 5, {"match": 1, "use": "x"}],\n  "indirectPins": ["Swift-Log", 2],\n  "exclude": ["/abs", "a\\\\b", "../up", ""],\n  "minSeverity": "fatal",\n  "failOn": null\n}');
  assert.deepEqual(p, [
    'c.json: line 2: name must be a text of 1 to 120 characters',
    'c.json: line 3: rules.stalePin must be one of info, warning, error, off, not "loud"',
    'c.json: line 3: rules.wideRange must be one of info, warning, error, off, not 3',
    'c.json: line 4: deprecatedPackages[0].match: "https://a.test/b" starts with a scheme; write the host and path only, such as code.example.test/owner/repo',
    'c.json: line 4: deprecatedPackages[0].use must be a text of 1 to 300 characters',
    'c.json: line 4: deprecatedPackages[1] must be an object, not a number',
    'c.json: line 4: deprecatedPackages[2].match must be a pattern of a package location, such as code.example.test/old-org/*',
    'c.json: line 5: indirectPins[0]: "Swift-Log" is not a package identity in lowercase, such as swift-log',
    'c.json: line 5: indirectPins[1] must be a text, not a number',
    'c.json: line 6: exclude[0]: "/abs" is absolute; write it relative to the project folder',
    'c.json: line 6: exclude[1]: "a\\b" uses a backslash; write paths with forward slashes',
    'c.json: line 6: exclude[2]: "../up" leaves the project folder with ..',
    'c.json: line 6: exclude[3]: "" must be 1 to 200 characters',
    'c.json: line 7: minSeverity must be one of info, warning, error',
    'c.json: line 8: failOn must be one of info, warning, error'
  ]);
  assert.deepEqual(problems('{"rules": []}'), ['c.json: line 1: rules must be an object, not a list']);
  assert.deepEqual(problems('{"deprecatedPackages": {}}'), ['c.json: line 1: deprecatedPackages must be a list, not an object']);
  assert.deepEqual(problems('{"exclude": "x"}'), ['c.json: line 1: exclude must be a list, not a string']);
  assert.deepEqual(problems(`{"indirectPins": ${JSON.stringify(Array(CONFIG_LIMITS.maxListEntries + 1).fill('a'))}}`), [`c.json: line 1: indirectPins holds more than ${CONFIG_LIMITS.maxListEntries} entries`]);
  assert.deepEqual(problems(`{"deprecatedPackages": ${JSON.stringify(Array(CONFIG_LIMITS.maxListEntries + 1).fill({ match: 'a', use: 'b' }))}}`), [`c.json: line 1: deprecatedPackages holds more than ${CONFIG_LIMITS.maxListEntries} entries`]);
});

test('config: JSON that is not strict, a name given twice and a value that is not an object are refused', () => {
  assert.match(problems('{"failOn": "error",}')[0], /c\.json: line 1, column 20: a comma before the closing brace/);
  assert.match(problems('{"failOn": "error", "failOn": "info"}')[0], /appears twice in one object/);
  assert.match(problems('// comment\n{}')[0], /a comment; JSON has no comments/);
  assert.deepEqual(problems('[]'), ['c.json: line 1: the configuration must be a JSON object, not a list']);
  assert.throws(() => validateConfig('x'), ConfigError);
});

test('config: the suggestion and the checks of names and patterns', () => {
  assert.equal(distance('nmae', 'name'), 1);
  assert.equal(suggestion('x'.repeat(70), ['name']), '');
  assert.equal(suggestion('zzzzzz', ['name']), '');
  assert.equal(kindOf(null), 'null');
  assert.equal(kindOf({}), 'an object');
  assert.ok(isObject({}) && !isObject([]));
  assert.ok(isIdentity('swift-log') && isIdentity('acme.flags') && !isIdentity('Swift') && !isIdentity('a b') && !isIdentity('-a'));
  assert.equal(locationPatternProblem('code.example.test/old-org/*'), null);
  assert.match(locationPatternProblem('Code.example.test/x'), /capital letter/);
  assert.match(locationPatternProblem('a b'), /holds a character other than/);
  assert.match(locationPatternProblem(''), /must be 1 to 200 characters/);
  assert.equal(pathPatternProblem('**/Examples/**'), null);
  assert.match(pathPatternProblem('C:/x'), /absolute/);
  assert.match(pathPatternProblem('a\u0001'), /control character/);
});

test('config: through a run, a rule set to off gives no finding and a note, and a bad configuration stops the run with exit code 2', async () => {
  const files = projectWith({ [R]: resolved([{ identity: 'imagecache', version: '2.3.4' }, { identity: 'netkit', version: '5.1.0' }, { identity: 'gone', version: '1.0.0' }]), 'c.json': '{"rules": {"stalePin": "off"}}' });
  const r = await run(files, ['p', '--config', 'c.json']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0\n/);
  assert.match(r.out, /note: 1 rule is off: stale-pin\n/);
  const bad = await run({ ...PROJECT, 'c.json': '{"failon": "info"}' }, ['p', '--config', 'c.json']);
  assert.equal(bad.code, 2);
  assert.equal(bad.out, '');
  assert.match(bad.err, /^spm-dependency-check: no result, the input has a problem:\n {2}c\.json: line 1: "failon" is not a key of the configuration; did you mean "failOn"\?\n$/);
  const missing = await run(PROJECT, ['p', '--config', 'none.json']);
  assert.match(missing.err, /none\.json: no such file or folder/);
  const off = await run({ ...PROJECT, 'c.json': '{"rules": {"unreadableFile": "off"}}' }, ['p', '--config', 'c.json']);
  assert.equal(off.code, 2, 'the rules of input problems have no key');
});
