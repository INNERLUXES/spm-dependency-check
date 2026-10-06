// The checks of a project: the package declarations of every manifest and Xcode project, put side by side with each
// other and with the pins of every Package.resolved of the folder. The folder is one review: the Package.resolved files
// are pooled, so a pin in any of them counts for a declaration in any manifest or project. Each finding carries its
// rule, its file, its line and column and what was found; src/check.js gives it its level and builds the report.

import { KIND_NAMES, allows, compareVersions, isWide, nextMajor, parseVersion } from './semver.js';
import { globMatch } from './glob.js';
import { identityOf, insecureReason, parseLocation } from './urls.js';
import { asciiLower, byCode } from './words.js';

// The identity and normalized location of a declaration: { identity, normalized, location } or null when the reader
// could not read its location.
export function locate(declaration) {
  if (declaration.location === null) return null;
  if (declaration.kind === 'local') return { identity: identityOf(declaration.location), normalized: `path:${declaration.location}`, location: null };
  if (declaration.kind === 'registry') return { identity: asciiLower(declaration.location), normalized: `registry:${asciiLower(declaration.location)}`, location: null };
  const location = parseLocation(declaration.location);
  return { identity: location.identity, normalized: location.normalized, location };
}

const short = (revision) => (typeof revision === 'string' && /^[0-9a-f]{40}$/i.test(revision) ? revision.slice(0, 12) : revision);

// What a pin holds, for a message and the table of packages: the version, else the branch with its commit, else the
// commit.
export function pinText(pin) {
  if (pin.version !== null) return pin.version;
  if (pin.branch !== null) return `branch ${pin.branch}${pin.revision ? ` (${short(pin.revision)})` : ''}`;
  if (pin.revision !== null) return `revision ${short(pin.revision)}`;
  return 'nothing';
}

// The findings, the table of packages and the summary of a project. inputs is { manifests, projects, resolved } where a
// manifest or a project is { file, scan, place } (place gives the line and column of an offset), and a resolved file
// is { file, model }; unreadableResolved counts the Package.resolved files that could not be read.
export function analyze({ manifests = [], projects = [], resolved = [], unreadableResolved = 0, config }) {
  const findings = [];
  const add = (rule, file, pos, found) => findings.push({ rule, file, line: pos.line, column: pos.column, found });
  const where = (d) => `${d.file}:${d.place(d.requirementAt ?? d.start).line}`;

  // Every declaration, in the order of the files and of their offsets.
  const declarations = [];
  for (const [source, list] of [['manifest', manifests], ['project', projects]]) {
    for (const f of list) for (const p of f.scan.packages) declarations.push({ ...p, file: f.file, source, place: f.place, at: locate(p) });
  }
  declarations.sort((a, b) => byCode(a.file, b.file) || a.start - b.start);

  for (const d of declarations) {
    const name = d.at ? `"${d.at.identity}"` : 'a package';
    if (d.problem) add('unreadable-requirement', d.file, d.place(d.requirementAt ?? d.start), `the declaration of ${name} cannot be read: ${d.problem}; its requirement is not compared with other declarations or with Package.resolved`);
    if (!d.at) continue;
    if (d.kind === 'local') {
      add('local-package', d.file, d.place(d.locationAt), `the package at the path "${d.location}" is a local package: it has no version and uses whatever is at the path${d.location.startsWith('..') || d.location.startsWith('/') ? '; the path reaches outside the folder of this file' : ''}`);
      continue;
    }
    if (d.kind === 'remote') {
      const reason = insecureReason(d.at.location);
      if (reason) add('insecure-url', d.file, d.place(d.locationAt), `the package ${name} is named by ${d.location}: ${reason}`);
      const hit = config.deprecatedPackages.find((x) => globMatch(x.match, d.at.normalized));
      if (hit) add('deprecated-package', d.file, d.place(d.locationAt), `the package ${name} (${d.at.normalized}) matches ${hit.match} of deprecatedPackages: ${hit.use}`);
    }
    const r = d.requirement;
    if (!r) continue;
    if (r.kind === 'branch') add('branch-requirement', d.file, d.place(d.requirementAt), `the package ${name} follows the branch ${r.branch}: what it resolves to changes with every push to that branch, and a package that depends on a branch cannot be used by a package that depends on versions`);
    if (r.kind === 'revision') add('revision-requirement', d.file, d.place(d.requirementAt), `the package ${name} is pinned to the revision ${short(r.revision)} with no version: it takes no fix, and the commit does not say which version it holds`);
    if (isWide(r)) add('wide-range', d.file, d.place(d.requirementAt), `the package ${name} takes the range ${r.text}, which reaches past ${nextMajor(r.lower).text}, the next major version of ${r.lower.text}; versions in it may break the API`);
  }

  // The same identity with two requirements that allow different versions.
  const remote = declarations.filter((d) => d.at && d.kind !== 'local');
  const byIdentity = new Map();
  for (const d of remote) {
    if (!byIdentity.has(d.at.identity)) byIdentity.set(d.at.identity, []);
    byIdentity.get(d.at.identity).push(d);
  }
  for (const [identity, list] of byIdentity) {
    const withReq = list.filter((d) => d.requirement);
    const first = withReq[0];
    for (const d of withReq.slice(1)) {
      if (d.requirement.key === first.requirement.key) continue;
      const moved = d.at.normalized !== first.at.normalized ? `, and the two name different locations, ${d.at.normalized} and ${first.at.normalized}` : '';
      add('conflicting-requirement', d.file, d.place(d.requirementAt), `the package "${identity}" has the requirement ${d.requirement.text} here and ${first.requirement.text} in ${where(first)}${moved}; the two allow different versions`);
    }
  }

  // The pins of every Package.resolved, pooled.
  const pins = [];
  for (const f of resolved) for (const p of f.model.pins) pins.push({ ...p, file: f.file });
  const pinsOf = new Map();
  for (const p of pins) {
    if (!pinsOf.has(p.identity)) pinsOf.set(p.identity, []);
    pinsOf.get(p.identity).push(p);
  }

  if (remote.length && resolved.length === 0 && unreadableResolved === 0) {
    const first = remote[0];
    const n = byIdentity.size;
    add('missing-resolved', first.file, first.place(first.start), `${n === 1 ? '1 remote package is' : `${n} remote packages are`} declared, and the folder holds no Package.resolved, so each machine and each build resolves the versions on its own`);
  }
  if (resolved.length) {
    for (const [identity, list] of byIdentity) {
      if (pinsOf.has(identity)) continue;
      const first = list[0];
      add('unpinned-dependency', first.file, first.place(first.start), `the package "${identity}" (${first.at.normalized}) is declared${list.length > 1 ? ` in ${list.length} places` : ''}, but no Package.resolved of the folder pins it, so its version is chosen anew by each resolution`);
    }
  }

  // Each pin against each requirement of its identity, once per pin and requirement.
  for (const [identity, list] of byIdentity) {
    const seen = new Set();
    for (const d of list.filter((x) => x.requirement)) {
      const r = d.requirement;
      for (const p of pinsOf.get(identity) ?? []) {
        const key = `${p.file}\n${p.line}\n${r.key}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pos = { line: p.versionLine, column: p.versionColumn };
        const head = `Package.resolved pins "${identity}" at ${pinText(p)}`;
        if (r.kind === 'branch') {
          if (p.branch !== r.branch) add('resolved-outside-requirement', p.file, pos, `${head}, while the requirement in ${where(d)} follows the branch ${r.branch}`);
        } else if (r.kind === 'revision') {
          const rev = asciiLower(r.revision);
          const pinned = asciiLower(p.revision ?? '');
          if (!pinned || !(pinned.startsWith(rev) || rev.startsWith(pinned))) add('resolved-outside-requirement', p.file, pos, `${head}, while the requirement in ${where(d)} names the revision ${short(r.revision)}`);
        } else if (p.version === null) {
          add('resolved-outside-requirement', p.file, pos, `${head}, with no version, while the requirement ${r.text} in ${where(d)} asks for a version`);
        } else {
          const v = parseVersion(p.version);
          if (!v) add('resolved-outside-requirement', p.file, pos, `${head}, which is not a semantic version, so it cannot meet the requirement ${r.text} in ${where(d)}`);
          else if (!allows(r, v)) add('resolved-outside-requirement', p.file, pos, `${head}, which the requirement ${r.text} in ${where(d)} does not allow (${compareVersions(v, r.lower) < 0 ? `lower than ${r.lower.text}` : `${r.upperInclusive ? 'above' : 'at or above'} ${r.upper.text}`})`);
        }
      }
    }
  }

  // Pins that nothing declares.
  const declared = new Set(declarations.filter((d) => d.at).map((d) => d.at.identity));
  for (const p of pins) {
    if (declared.has(p.identity) || config.indirectPins.includes(p.identity)) continue;
    add('stale-pin', p.file, { line: p.line, column: p.column }, `Package.resolved pins "${p.identity}"${p.location ? ` (${p.location})` : ''} at ${pinText(p)}, but no manifest or Xcode project of the folder declares it: a dependency that was removed, or one that a dependency brings in`);
  }

  // The products used, by identity.
  const productsOf = new Map();
  let productCount = 0;
  for (const f of [...manifests, ...projects]) {
    for (const p of f.scan.products) {
      productCount += 1;
      const id = p.package === null ? '?' : identityOf(p.package);
      productsOf.set(id, (productsOf.get(id) ?? 0) + 1);
    }
  }

  // The table of packages: every identity declared or pinned.
  const identities = [...new Set([...declarations.filter((d) => d.at).map((d) => d.at.identity), ...pins.map((p) => p.identity)])].sort(byCode);
  const packages = identities.map((identity) => {
    const ds = declarations.filter((d) => d.at && d.at.identity === identity);
    const reqs = [...new Set(ds.map((d) => (d.kind === 'local' ? 'local path' : d.requirement ? d.requirement.text : 'not read')))];
    const ps = [...new Set((pinsOf.get(identity) ?? []).map(pinText))];
    return { identity, kind: ds.some((d) => d.kind === 'local') ? 'local' : ds.length ? 'remote' : 'pin only', declared: ds.length, requirement: reqs.join(' / ') || '-', resolved: ps.join(' / ') || '-', products: productsOf.get(identity) ?? 0 };
  });

  const kinds = Object.fromEntries(Object.keys(KIND_NAMES).map((k) => [k, 0]));
  for (const d of declarations) {
    if (d.kind === 'local') kinds.path += 1;
    else if (d.requirement) kinds[d.requirement.kind] += 1;
  }
  const files = [
    ...manifests.map((f) => ({ file: f.file, kind: 'manifest', remote: f.scan.packages.filter((p) => p.kind !== 'local').length, local: f.scan.packages.filter((p) => p.kind === 'local').length, pins: 0, products: f.scan.products.length })),
    ...projects.map((f) => ({ file: f.file, kind: 'Xcode project', remote: f.scan.packages.filter((p) => p.kind !== 'local').length, local: f.scan.packages.filter((p) => p.kind === 'local').length, pins: 0, products: f.scan.products.length })),
    ...resolved.map((f) => ({ file: f.file, kind: `Package.resolved v${f.model.format}`, remote: 0, local: 0, pins: f.model.pins.length, products: 0 }))
  ];
  const totals = {
    packages: identities.length,
    remote: byIdentity.size,
    local: new Set(declarations.filter((d) => d.at && d.kind === 'local').map((d) => d.at.identity)).size,
    declarations: declarations.length,
    kinds,
    resolvedFiles: resolved.length,
    pins: pins.length,
    products: productCount
  };
  return { findings, packages, files, totals };
}
