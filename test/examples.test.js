import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLEAN, EXPECTED, MESSY, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const P = 'examples/messy/CopperleafOrders.xcodeproj/project.pbxproj';
const R = 'examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';
const M = 'examples/messy/Packages/OrderCore/Package.swift';

test('examples: the messy project fails with the report that is saved in examples/output', async () => {
  const r = await run(MESSY);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('messy.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean project passes with the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /\nfindings: 0\n/);
  assert.equal((await run([...CLEAN, '--fail-on', 'info'])).code, 0);
  assert.equal((await run([...CLEAN, '--config', 'examples/config.json', '--fail-on', 'info'])).code, 0, 'the clean project also meets the configuration of the messy one');
});

test('examples: --explain, JSON, CSV, the GitHub commands and the defaults are the reports that are saved', async () => {
  const outputs = { 'messy-explain.txt': [...MESSY, '--explain'], 'messy.json': [...MESSY, '--json', '--explain'], 'messy-findings.csv': [...MESSY, '--format', 'csv'], 'messy-github.txt': [...MESSY, '--format', 'github'], 'defaults.json': ['--print-defaults'] };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the rules that fire on the messy project, each on the line built for it', async () => {
  const report = JSON.parse((await run([...MESSY, '--json'])).out);
  const lines = {};
  for (const f of [P, R, M]) lines[f] = (await readFile(resolve(root, f), 'utf8')).split('\n');
  const at = (file, needle, n = 1) => `${file}:${lines[file].map((l, i) => [l, i]).filter(([l]) => l.includes(needle))[n - 1][1] + 1}`;
  // A pin starts with the brace on the line above its identity.
  const above = (place) => place.replace(/:(\d+)$/, (_, n) => `:${Number(n) - 1}`);
  const byRule = {};
  for (const x of report.findings) (byRule[x.rule] ??= []).push(x.at);
  assert.deepEqual(byRule, {
    'resolved-outside-requirement': [at(R, '"3.1.2"'), at(R, '"4.9.0"')],
    'insecure-url': [at(M, 'http://')],
    'conflicting-requirement': [at(M, 'http://')],
    'branch-requirement': [at(M, 'branch: "develop"')],
    'unpinned-dependency': [at(M, 'featureflags.git')],
    'stale-pin': [above(at(R, '"identity" : "legacy-promises"'))],
    'revision-requirement': [at(M, 'revision:')],
    'wide-range': [at(M, '"99.0.0"')],
    'deprecated-package': [at(M, 'old-tools')],
    'local-package': [at(P, 'relativePath = Packages/OrderCore'), at(M, '../DesignTokens')]
  });
  assert.deepEqual(report.files.map((m) => [m.file.split('/').at(-1), m.kind, m.remote, m.local, m.pins, m.products]), [['project.pbxproj', 'Xcode project', 3, 1, 0, 4], ['Package.resolved', 'Package.resolved v3', 0, 0, 8, 0], ['Package.swift', 'manifest', 0, 0, 0, 0], ['Package.swift', 'manifest', 6, 1, 0, 7]]);
  assert.equal(report.summary.pins, 8);
});

test('examples: without the configuration, the vendor folder is read too; the .build folder never is', async () => {
  const report = JSON.parse((await run(['examples/messy', '--json'])).out);
  assert.ok(report.findings.some((f) => f.file === 'examples/messy/Vendor/OldSDK/Package.swift' && f.rule === 'insecure-url'));
  assert.ok(report.findings.some((f) => f.rule === 'stale-pin' && f.found.includes('"logkit"')));
  assert.ok(!report.findings.some((f) => f.file.includes('/.build/')));
  assert.equal(report.input.foldersPassedOver, 1);
});

test('examples: the same files written with CRLF line ends and as UTF-16 give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'spm-dependency-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    for (const f of [P, R, M]) {
      const text = (await readFile(resolve(root, f), 'utf8')).split('\r\n').join('\n');
      await writeFile(resolve(dir, f), text.split('\n').join('\r\n'));
    }
    const tools = (await readFile(resolve(root, 'examples/clean/Tools/Package.swift'), 'utf8')).split('\n').join('\r\n');
    await writeFile(resolve(dir, 'examples/clean/Tools/Package.swift'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tools, 'utf16le')]));
    assert.equal((await run([...MESSY, '--explain'], dir)).out, await saved('messy-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
    assert.ok((await readdir(resolve(dir, 'examples/messy'))).includes('Vendor'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
