// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// projects to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const MESSY = ['examples/messy', '--config', 'examples/config.json'];
export const CLEAN = ['examples/clean'];
const R = 'examples/messy/CopperleafOrders.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the messy project: the counts, the summary, one finding of every rule that fires, and the
// result.
export const EXPECTED = [
  'input: 2 manifests; 1 Xcode project; 1 Package.resolved',
  '1 folder named .build, DerivedData, Pods or .git passed over; 1 path excluded',
  'config: examples/config.json (Copperleaf dependency review): deprecated packages code.example.test/old-tools/*; indirect pins logkit',
  'findings: 12 (6 error, 4 warning, 2 info)',
  'packages: 11 (7 remote, 2 local), in 11 declarations',
  'requirement kinds: 4 up to next major, 1 up to next minor, 1 exact, 1 range, 1 branch, 1 revision, 2 local path',
  'resolved: 8 pins in 1 Package.resolved file',
  'Package.resolved pins "netkit" at 4.9.0, which the requirement from 5.0.0',
  'Package.resolved pins "analytics-kit" at 3.1.2, which the requirement exact 3.1.0',
  'the package "imagecache" is named by http://code.example.test/kestrel-labs/imagecache.git',
  'the package "imagecache" has the requirement from 2.1.0 here and up to next minor from 2.3.0',
  'the package "keychain-store" follows the branch develop',
  'the package "featureflags" (code.example.test/orbit-ui/featureflags) is declared, but no Package.resolved',
  'Package.resolved pins "legacy-promises"',
  'the package "markdownview" is pinned to the revision 4f1c2a9e7b3d',
  'the package "featureflags" takes the range 1.0.0..<99.0.0, which reaches past 2.0.0',
  'the package "swift-retry" (code.example.test/old-tools/swift-retry) matches code.example.test/old-tools/*',
  'the package at the path "Packages/OrderCore" is a local package',
  'the package at the path "../DesignTokens" is a local package',
  'note: 1 path matching Vendor/** is left out',
  'not a package resolution and not a build',
  'RESULT: FAIL - 6 findings at or above error (6 error, 4 warning, 2 info)'
];
// What must not be reported: the dependencies in comments, the checkout under .build, the excluded vendor folder, the
// pin listed in indirectPins, and the findings of input problems.
export const UNWANTED = ['fastjson', 'tracing', 'socketkit', 'old-sdk-core', 'Vendor/OldSDK', 'pins "logkit"', 'WARNING  missing-resolved', 'ERROR    unreadable-file', 'ERROR    scan-limit', 'WARNING  unreadable-requirement', 'RESULT: PASS'];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messy = await run(MESSY);
  process.stdout.write(messy.out);
  expect('messy project', messy, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean project', clean, 0, ['input: 1 manifest; 1 Xcode project; 2 Package.resolved', 'findings: 0', 'requirement kinds: 1 up to next major, 2 up to next minor, 1 range', 'resolved: 4 pins in 2 Package.resolved files', 'RESULT: PASS - no finding at or above error'], ['  WARNING  ', '  ERROR  ', '  INFO  ', 'RESULT: FAIL']);

  // Without the configuration, the vendor folder is read too, with its SSH URL and its branch, and logkit is a stale pin.
  expect('messy, no configuration', await run(['examples/messy']), 1, ['examples/messy/Vendor/OldSDK/Package.swift', 'ssh://code.example.test/payments/old-sdk-core.git', 'Package.resolved pins "logkit"', 'findings: 15 (9 error, 4 warning, 2 info)'], ['socketkit']);
  // Only the errors are shown with --min-severity error.
  expect('messy, errors only', await run([...MESSY, '--min-severity', 'error']), 1, ['findings: 6 (6 error); 6 below error not shown', 'RESULT: FAIL - 6 findings at or above error'], ['WARNING  ', 'INFO  ']);
  // The clean project passes when every level fails the run.
  expect('clean, fail on info', await run([...CLEAN, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // A path that is a file stops the run.
  expect('a project that is a file', await run([R]), 2, [`${R}: is a file; give the folder of the app or package`], [], 'err');

  // The README shows the whole report of the messy project, the --explain lines of one finding, the GitHub annotations
  // of two findings, the start of the CSV report and the report of the clean project.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(messy.out)) problems.push('README: the sample output of the messy project differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean project differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/messy.txt'), messy.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...MESSY, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('branch-requirement') && l.includes('Package.swift:'));
  const sample = lines.slice(at, at + 8).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of the branch requirement differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-explain.txt'), explain.out);
  const github = await run([...MESSY, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  const picked = github.out.split('\n').filter((x) => x.includes('title=spm-dependency-check insecure-url::') || x.includes('title=spm-dependency-check stale-pin::'));
  if (picked.length !== 2) problems.push('github: the sample lines are not in the output');
  for (const l of picked) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-github.txt'), github.out);
  const csv = await run([...MESSY, '--format', 'csv']);
  if (csv.code !== 1) problems.push(`csv: exit code ${csv.code}, expected 1`);
  const head = csv.out.split('\r\n').slice(0, 4).join('\n');
  if (!readme.includes(head)) problems.push('README: the CSV sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-findings.csv'), csv.out);
  const json = await run([...MESSY, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/messy.json'), json.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
