// A run: read the configuration, list the files of the project folder, read each Package.swift, Package.resolved and
// Xcode project file, run the checks of src/project.js and build the report of the run. A path on the command line
// that cannot be used (missing, a link, a project that is not a folder), an --exclude pattern that is not valid or a
// configuration with a problem stops the run with an InputError and no result. A file that cannot be read, and input
// past the limits of a run, are error findings of their own, so the run fails at the default level and never passes
// because a part of the input was passed over.

import { ConfigError, defaultConfig, pathPatternProblem, readConfig } from './config.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { FILE_LIMITS, inspectPath, readText, readTextFile } from './files.js';
import { lineStarts, positionOf } from './json.js';
import { PBX_LIMITS, PbxError, scanProject } from './pbxproj.js';
import { analyze } from './project.js';
import { RESOLVED_LIMITS, ResolvedError, readResolved } from './resolved.js';
import { RULES, atOrAbove, decide } from './rules.js';
import { grouped, listText, plural } from './size.js';
import { SWIFT_LIMITS, scanManifest } from './swift.js';
import { safeText } from './text.js';
import { WALK_LIMITS, walkProject } from './walk.js';
import { byCode, joinPath } from './words.js';

export const LIMITS = { ...FILE_LIMITS, ...WALK_LIMITS, ...SWIFT_LIMITS, ...PBX_LIMITS, ...RESOLVED_LIMITS, maxFindingsPerRule: 500, maxExcludes: 100 };
export const MAX_PROBLEMS = 20;

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// A list of problems for an error message: the first twenty, then a count.
export function capped(problems) {
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${grouped(problems.length - MAX_PROBLEMS)} more`] : problems;
}

// The level of a rule under a configuration: the rules of input problems are always errors.
export function levelOf(rule, config) {
  return rule.key === null ? 'error' : config.rules[rule.key];
}

// The line and column of every offset of a text.
export function placer(text) {
  const starts = lineStarts(text);
  return (offset) => positionOf(starts, Math.max(0, Math.min(offset, text.length)));
}

const KIND_WORDS = { manifest: 'manifest', resolved: 'Package.resolved', project: 'Xcode project file' };

// Reads one file of the project by its kind: { manifest | project | resolved, problem }, where problem is an
// unreadable-file or scan-limit finding { rule, line, column, found } when the file cannot be read as its kind.
export async function readProjectFile(full, shown, kind, lim = LIMITS) {
  let text;
  try {
    ({ text } = await readText(full, shown, lim.maxFileBytes));
  } catch (error) {
    return { problem: { rule: 'unreadable-file', line: 1, column: 1, found: `the ${KIND_WORDS[kind]} cannot be read: ${error.reason ?? error.message}; nothing in it is checked` } };
  }
  const place = placer(text);
  if (kind === 'manifest') {
    const scan = scanManifest(text, lim);
    return { manifest: { file: shown, scan, place }, problem: scan.limited ? { rule: 'scan-limit', line: 1, column: 1, found: `the manifest holds more tokens or package declarations than the reader reads (${grouped(lim.maxTokens)} tokens, ${grouped(lim.maxPackages)} declarations); the rest is not read` } : null };
  }
  if (kind === 'project') {
    try {
      return { project: { file: shown, scan: scanProject(text, lim), place }, problem: null };
    } catch (error) {
      if (error instanceof PbxError) return { problem: { rule: 'unreadable-file', ...place(error.offset), found: `the Xcode project file cannot be read as a property list: ${error.reason}; nothing in it is checked` } };
      throw error;
    }
  }
  try {
    const model = readResolved(text, lim);
    return { resolved: { file: shown, model }, problem: model.limited ? { rule: 'scan-limit', line: 1, column: 1, found: `the Package.resolved holds more than ${grouped(lim.maxPins)} pins; the rest are not read` } : null };
  } catch (error) {
    if (error instanceof ResolvedError) return { problem: { rule: 'unreadable-file', line: error.line, column: error.column, found: `the Package.resolved cannot be read: ${error.reason}; nothing in it is checked` } };
    throw error;
  }
}

// The run as a report object.
export function buildReport({ input, files, packages, summary, raw, config, minSeverity, failOn, version, notes: extraNotes = [], limits = LIMITS }) {
  const ruleOrder = new Map(RULES.map((r, i) => [r.id, i]));
  const level = (id) => levelOf(RULES.find((r) => r.id === id), config);
  const all = raw
    .filter((f) => level(f.rule) !== 'off')
    .map((f) => ({ ...f, level: level(f.rule) }))
    .sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || byCode(a.file, b.file) || a.line - b.line || a.column - b.column || ruleOrder.get(a.rule) - ruleOrder.get(b.rule));
  const shown = all.filter((f) => atOrAbove(f.level, minSeverity));
  const hidden = all.length - shown.length;
  const perRule = new Map();
  const findings = [];
  let cut = 0;
  for (const f of shown) {
    const n = (perRule.get(f.rule) ?? 0) + 1;
    perRule.set(f.rule, n);
    if (n > limits.maxFindingsPerRule) {
      cut += 1;
      continue;
    }
    const rule = RULES.find((r) => r.id === f.rule);
    findings.push({
      rule: f.rule,
      level: f.level,
      file: safeText(f.file),
      line: f.line,
      column: f.column,
      at: `${safeText(f.file)}:${f.line}`,
      found: safeText(f.found, 800),
      fix: rule.fix,
      basis: rule.basis.map((k) => ({ text: POINTS[k].text, source: pointPage(k).title, url: pointPage(k).url })),
      own: rule.own
    });
  }
  const result = decide(shown, failOn);
  const shownFiles = files.map((m) => {
    const byLevel = { error: 0, warning: 0, info: 0 };
    for (const x of all) if (x.file === m.file) byLevel[x.level] += 1;
    return { file: safeText(m.file), kind: m.kind, read: m.read, remote: m.remote, local: m.local, pins: m.pins, products: m.products, byLevel };
  });
  const rules = RULES.map((r) => ({ id: r.id, level: level(r.id), findings: all.filter((f) => f.rule === r.id).length }));
  const notes = [];
  if (!files.length) notes.push('the project holds no Package.swift, Package.resolved or Xcode project file');
  if (input.links) notes.push(`${plural(input.links, 'symbolic link')} ${input.links === 1 ? 'is' : 'are'} not followed`);
  notes.push(...extraNotes);
  if (cut) notes.push(`${plural(cut, 'finding')} past the limit of ${grouped(limits.maxFindingsPerRule)} per rule ${cut === 1 ? 'is' : 'are'} counted but not listed`);
  if (hidden) notes.push(`${plural(hidden, 'finding')} below ${minSeverity} ${hidden === 1 ? 'is' : 'are'} not shown`);
  const off = RULES.filter((r) => r.key !== null && levelOf(r, config) === 'off');
  if (off.length) notes.push(`${plural(off.length, 'rule')} ${off.length === 1 ? 'is' : 'are'} off: ${off.map((r) => r.id).join(', ')}`);
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of shown) byLevel[f.level] += 1;
  return {
    tool: 'spm-dependency-check',
    version,
    input: { ...input, project: safeText(input.project), exclude: input.exclude.map((p) => safeText(p, 200)) },
    config: {
      file: config.file === null ? null : safeText(config.file),
      name: config.name === null ? null : safeText(config.name, 120),
      deprecatedPackages: config.deprecatedPackages,
      indirectPins: config.indirectPins,
      exclude: config.exclude,
      minSeverity,
      failOn,
      rules: RULES.map((r) => ({ id: r.id, key: r.key, level: levelOf(r, config), rule: safeText(r.rule(config), 600) }))
    },
    files: shownFiles,
    packages: packages.map((p) => ({ ...p, identity: safeText(p.identity, 200), requirement: safeText(p.requirement, 300), resolved: safeText(p.resolved, 300) })),
    summary,
    rules,
    findings,
    totals: { findings: shown.length, byLevel, hidden, notListed: cut, files: files.length, packages: packages.length },
    result,
    notes: notes.map((n) => safeText(n, 600)),
    notice: NOTICE
  };
}

// Reads the inputs, runs every check and builds the report object of the run.
export async function checkProject({ project, config: configPath = null, exclude = [], minSeverity = null, failOn = null, version = '0.0.0', limits = LIMITS, base = process.cwd() }) {
  const lim = { ...LIMITS, ...limits };
  let config;
  try {
    if (configPath) {
      const c = await readTextFile(configPath, base, lim.maxConfigBytes);
      config = readConfig(c.text, c.file);
    } else config = defaultConfig();
  } catch (error) {
    if (error instanceof ConfigError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  const problems = [];
  let root = null;
  try {
    root = await inspectPath(project, base);
    if (!root.folder) problems.push(`${root.shown}: is a file; give the folder of the app or package, the one that holds Package.swift or the .xcodeproj`);
  } catch (error) {
    problems.push(error.message);
  }
  for (const p of exclude) {
    const problem = pathPatternProblem(p);
    if (problem) problems.push(`--exclude "${p.slice(0, 80)}" ${problem}`);
  }
  if (problems.length) throw new InputError(capped(problems));

  const patterns = [...new Set([...config.exclude, ...exclude])];
  const shownOf = (rel) => joinPath(root.shown, rel);
  const walked = await walkProject(root.full, { exclude: patterns, limits: lim });
  const raw = [];
  const notes = [];
  if (walked.limit) raw.push({ rule: 'scan-limit', file: root.shown, line: 1, column: 1, found: `the project holds ${walked.limit}; the listing stopped there, and the rest of the project is not read` });

  const manifests = [];
  const projects = [];
  const resolved = [];
  const files = [];
  let unreadableResolved = 0;
  for (const f of walked.files) {
    const shown = shownOf(f.rel);
    const r = await readProjectFile(f.full, shown, f.kind, lim);
    if (r.problem) raw.push({ ...r.problem, file: shown });
    if (r.manifest) manifests.push(r.manifest);
    else if (r.project) projects.push(r.project);
    else if (r.resolved) resolved.push(r.resolved);
    else {
      if (f.kind === 'resolved') unreadableResolved += 1;
      files.push({ file: shown, kind: f.kind === 'manifest' ? 'manifest' : f.kind === 'project' ? 'Xcode project' : 'Package.resolved', read: false, remote: 0, local: 0, pins: 0, products: 0 });
    }
  }

  const analysis = analyze({ manifests, projects, resolved, unreadableResolved, config });
  raw.push(...analysis.findings);
  const all = [...analysis.files.map((x) => ({ ...x, read: true })), ...files].sort((a, b) => byCode(a.file, b.file));

  if (walked.excluded) notes.push(`${plural(walked.excluded, 'path')} matching ${listText(patterns, 5)} ${walked.excluded === 1 ? 'is' : 'are'} left out`);
  if (walked.skipped) notes.push(`${plural(walked.skipped, 'folder')} named .build, DerivedData, Pods or .git ${walked.skipped === 1 ? 'is' : 'are'} passed over`);
  if (resolved.length > 1) notes.push(`${grouped(resolved.length)} Package.resolved files are read, and their pins are pooled: ${listText(resolved.map((r) => r.file), 5)}`);
  const count = (kind) => walked.files.filter((f) => f.kind === kind).length;
  return buildReport({
    input: { project: root.shown, manifests: count('manifest'), resolvedFiles: count('resolved'), projectFiles: count('project'), otherFiles: walked.others, foldersPassedOver: walked.skipped, excluded: walked.excluded, links: walked.links, exclude: patterns },
    files: all,
    packages: analysis.packages,
    summary: analysis.totals,
    raw,
    config,
    minSeverity: minSeverity ?? config.minSeverity,
    failOn: failOn ?? config.failOn,
    version,
    notes,
    limits: lim
  });
}
