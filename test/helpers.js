// Shared test helpers: manifests, Xcode project files and Package.resolved files built inline, read in memory or
// written into a temporary folder that is removed after the test. Paths are built with resolve() from forward-slash
// names, so the same test runs on Linux, macOS and Windows. The line a test expects is found with lineOf(), which counts
// lines the way the tool does, so a test never holds a line number worked out by hand for one system only. No test
// reads the clock, the time zone or the locale.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { defaultConfig, lineStarts, main, positionOf, readConfig } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'spm-dependency-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function offsetOf(text, needle, n) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return at;
}

// The line (from 1) of the n-th place where needle starts in text.
export const lineOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).line;

// The column (from 1) of the n-th place where needle starts in text.
export const columnOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).column;

// The configuration of a configuration object, through the real reader, or the defaults.
export const configOf = (object = null) => (object === null ? defaultConfig() : readConfig(JSON.stringify(object), 'config.json'));

export const HOST = 'https://code.example.test';

// A Package.swift with these lines in its dependencies array and a target that uses the products.
export function manifest(dependencies, products = []) {
  return `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Core",
    dependencies: [
${dependencies.map((d) => `        ${d}`).join(',\n')}
    ],
    targets: [
        .target(
            name: "Core",
            dependencies: [${products.map(([name, pkg]) => `.product(name: "${name}", package: "${pkg}")`).join(', ')}]
        )
    ]
)
`;
}

// A project.pbxproj with these package references: [{ url, kind, min, max, version, branch, revision }] or
// [{ path }] for a local package, and a product of each.
export function pbx(references) {
  const id = (k, n) => `AB${String(k).padStart(2, '0')}${'0'.repeat(18)}${String(n).padStart(2, '0')}`;
  const blocks = references.map((r, n) => {
    if (r.path) return `\t\t${id(1, n)} /* XCLocalSwiftPackageReference "${r.path}" */ = {\n\t\t\tisa = XCLocalSwiftPackageReference;\n\t\t\trelativePath = ${r.path};\n\t\t};`;
    const fields = Object.entries({ kind: r.kind, minimumVersion: r.min, maximumVersion: r.max, version: r.version, branch: r.branch, revision: r.revision }).filter(([, v]) => v !== undefined).map(([k, v]) => `\t\t\t\t${k} = ${v};`).join('\n');
    return `\t\t${id(1, n)} /* XCRemoteSwiftPackageReference */ = {\n\t\t\tisa = XCRemoteSwiftPackageReference;\n\t\t\trepositoryURL = "${r.url}";\n\t\t\trequirement = {\n${fields}\n\t\t\t};\n\t\t};`;
  });
  const products = references.map((r, n) => `\t\t${id(2, n)} /* P${n} */ = {\n\t\t\tisa = XCSwiftPackageProductDependency;\n\t\t\tpackage = ${id(1, n)} /* reference */;\n\t\t\tproductName = P${n};\n\t\t};`);
  return `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tclasses = {
\t};
\tobjectVersion = 60;
\tobjects = {

/* Begin PBXProject section */
\t\t${id(0, 0)} /* Project object */ = {
\t\t\tisa = PBXProject;
\t\t\tpackageReferences = (
${references.map((_, n) => `\t\t\t\t${id(1, n)},`).join('\n')}
\t\t\t);
\t\t};
/* End PBXProject section */

${blocks.join('\n')}
${products.join('\n')}
\t};
\trootObject = ${id(0, 0)} /* Project object */;
}
`;
}

// A Package.resolved of format 2 or 3 with these pins: [{ identity, location, version, branch, revision }].
export function resolved(pins, format = 2) {
  const value = {
    ...(format === 3 ? { originHash: 'ab'.repeat(32) } : {}),
    pins: pins.map((p) => ({
      identity: p.identity,
      kind: 'remoteSourceControl',
      location: p.location ?? `${HOST}/acme/${p.identity}.git`,
      state: { ...(p.branch ? { branch: p.branch } : {}), revision: p.revision ?? 'c'.repeat(40), ...(p.version ? { version: p.version } : {}) }
    })),
    version: format
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}

// A Package.resolved of format 1 with these pins: [{ name, url, version, branch, revision }].
export function resolvedV1(pins) {
  const value = { object: { pins: pins.map((p) => ({ package: p.name, repositoryURL: p.url, state: { branch: p.branch ?? null, revision: p.revision ?? 'd'.repeat(40), version: p.version ?? null } })) }, version: 1 };
  return `${JSON.stringify(value, null, 2)}\n`;
}

export const P = 'p/App.xcodeproj/project.pbxproj';
export const R = 'p/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';
export const M = 'p/Core/Package.swift';

export const PBX = pbx([{ url: `${HOST}/acme/netkit.git`, kind: 'upToNextMajorVersion', min: '5.0.0' }]);
export const MANIFEST = manifest([`.package(url: "${HOST}/acme/imagecache.git", from: "2.3.0")`], [['ImageCache', 'imagecache']]);
export const RESOLVED = resolved([{ identity: 'imagecache', version: '2.3.4' }, { identity: 'netkit', version: '5.1.0' }]);

// The project in good order: the folder every test of a whole run changes.
export const PROJECT = { [P]: PBX, [R]: RESOLVED, [M]: MANIFEST };

// A text with pieces replaced: pairs of [from, to], each replaced once.
export function edit(text, ...pairs) {
  let out = text;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`${from} is not in the text`);
    out = out.replace(from, to);
  }
  return out;
}

// The project with some files changed or added; null takes a file out.
export function projectWith(changes = {}) {
  const out = { ...PROJECT };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

// The project with the manifest holding these dependencies (and the products of the base manifest).
export const withDeps = (...deps) => projectWith({ [M]: manifest(deps, [['ImageCache', 'imagecache']]) });

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = ['p'], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// The JSON report of a folder of files, with more arguments.
export async function reportOf(files, args = ['p'], limits) {
  const r = await run(files, [...args, '--json'], limits);
  if (r.code === 2) throw new Error(r.err);
  return { ...JSON.parse(r.out), code: r.code };
}

// The findings of a report, of one rule or of all.
export const findingsOf = (r, rule) => r.findings.filter((f) => !rule || f.rule === rule);

// The rule ids of the findings of a project.
export const rulesOf = async (files, args) => (await reportOf(files, args)).findings.map((f) => f.rule);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, dir) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
  return { code, out, err };
}
