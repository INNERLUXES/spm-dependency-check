import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESOLVED_VERSIONS, ResolvedError, readResolved } from '../src/index.js';
import { HOST, lineOf, resolved, resolvedV1 } from './helpers.js';

// The reading of Package.resolved in its three formats, the line of every pin, and what is refused with its place.

const refused = (text) => {
  try {
    readResolved(text);
  } catch (error) {
    assert.ok(error instanceof ResolvedError, error.message);
    return error;
  }
  return assert.fail('not refused');
};

test('resolved: format 2 and 3, with identity, location, version, branch and revision of every pin and its line', () => {
  for (const format of [2, 3]) {
    const text = resolved([{ identity: 'netkit', version: '5.1.0' }, { identity: 'flags', branch: 'main', revision: 'e'.repeat(40) }, { identity: 'Mixed-Case', revision: 'f'.repeat(40) }], format);
    const r = readResolved(text);
    assert.equal(r.format, format);
    assert.deepEqual(r.pins.map((p) => [p.identity, p.location, p.version, p.branch, p.revision]), [['netkit', `${HOST}/acme/netkit.git`, '5.1.0', null, 'c'.repeat(40)], ['flags', `${HOST}/acme/flags.git`, null, 'main', 'e'.repeat(40)], ['mixed-case', `${HOST}/acme/Mixed-Case.git`, null, null, 'f'.repeat(40)]]);
    assert.equal(r.pins[0].line, lineOf(text, '"identity": "netkit"') - 1);
    assert.equal(r.pins[0].versionLine, lineOf(text, '"version": "5.1.0"'));
    assert.equal(r.pins[1].versionLine, r.pins[1].line, 'a pin with no version points at the pin');
  }
  assert.deepEqual(RESOLVED_VERSIONS, [1, 2, 3]);
});

test('resolved: format 1, with the identity taken from the URL', () => {
  const text = resolvedV1([{ name: 'NetKit', url: `${HOST}/acme/NetKit.git`, version: '5.1.0' }, { name: 'Flags', url: 'git@code.example.test:acme/flags', branch: 'dev' }]);
  const r = readResolved(text);
  assert.equal(r.format, 1);
  assert.deepEqual(r.pins.map((p) => [p.identity, p.version, p.branch, p.kind]), [['netkit', '5.1.0', null, 'remoteSourceControl'], ['flags', null, 'dev', 'remoteSourceControl']]);
  assert.equal(r.pins[0].versionLine, lineOf(text, '"version": "5.1.0"'));
});

test('resolved: what is not a Package.resolved the reader knows is refused, with its line', () => {
  assert.match(refused('{"pins": [], "version": 2,}').reason, /^it is not JSON: a comma before the closing brace/);
  assert.equal(refused('{\n  "pins": [],\n  "version": 2,\n}').line, 4);
  assert.match(refused('[]').reason, /it is not a JSON object/);
  assert.match(refused('{"pins": []}').reason, /it has no format version/);
  const four = refused('{\n"pins": [],\n"version": 4\n}');
  assert.match(four.reason, /its format version 4 is not one the reader knows \(1, 2 or 3\)/);
  assert.equal(four.line, 3);
  assert.match(refused('{"version": 2}').reason, /it has no list pins/);
  assert.match(refused('{"object": {}, "version": 1}').reason, /it has no list object\.pins/);
  assert.match(refused('{"pins": [1], "version": 2}').reason, /pins\[0\] is not an object/);
  assert.match(refused('{"pins": [{"state": {}}], "version": 2}').reason, /pins\[0\] has no location or identity/);
  assert.match(refused('{"object": {"pins": [{"package": "x"}]}, "version": 1}').reason, /object\.pins\[0\] has no repositoryURL/);
  assert.match(refused('{"pins": [], "pins": [], "version": 2}').reason, /appears twice in one object/);
});

test('resolved: the limit of pins, and a pin with an identity but no location', () => {
  const r = readResolved(resolved([{ identity: 'a', version: '1.0.0' }, { identity: 'b', version: '1.0.0' }, { identity: 'c', version: '1.0.0' }]), { maxPins: 2 });
  assert.equal(r.pins.length, 2);
  assert.equal(r.limited, true);
  const p = readResolved('{"pins": [{"identity": "Reg.Pkg", "kind": "registry", "state": {"version": "1.0.0"}}], "version": 2}').pins[0];
  assert.deepEqual([p.identity, p.location, p.kind], ['reg.pkg', null, 'registry']);
});
