// A targeted reader of the Xcode project file, project.pbxproj. The file is an old-style property list: dictionaries
// in braces with key = value; pairs, lists in parentheses, and strings with or without double quotes, with comments in
// /* */ and //. The reader walks that grammar once, left to right, with a list of open dictionaries and lists of its
// own and no recursion, with limits of depth, values and string length, and keeps the offset of every string. It then
// looks only at the entries of the objects dictionary whose isa is one of three kinds and leaves every other entry
// unread:
//   - XCRemoteSwiftPackageReference: a remote package, with repositoryURL and a requirement dictionary whose kind is
//     upToNextMajorVersion or upToNextMinorVersion (with minimumVersion), exactVersion (with version), versionRange
//     (with minimumVersion and maximumVersion, the maximum left out), branch (with branch) or revision (with revision);
//   - XCLocalSwiftPackageReference: a local package, with relativePath;
//   - XCSwiftPackageProductDependency: a product of a package that a target uses, with productName and package.
// It is not a reader of the whole Xcode project: build settings, targets and files are not read.

import { makeRequirement } from './semver.js';

export const PBX_LIMITS = { maxDepth: 64, maxValues: 2000000, maxStringLength: 65536 };

export class PbxError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

const BARE = /[A-Za-z0-9_$/:.+\-]/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', "'": "'", b: '\b', f: '\f', a: '\u0007', v: '\u000b' };

// Reads the property list: the root value, where a dictionary is { t: 'dict', map, at }, a list { t: 'list', items, at }
// and a string { t: 'str', s, at }; map holds the key and { value, keyAt } for each pair. Throws PbxError with the offset
// of the problem.
export function parsePbx(text, limits = PBX_LIMITS) {
  const lim = { ...PBX_LIMITS, ...limits };
  const n = text.length;
  let i = 0;
  let values = 0;
  const fail = (reason, at = i) => {
    throw new PbxError(reason, at);
  };

  // The next token: { kind: 'punct' | 'str', text, at } or null at the end.
  const next = () => {
    for (;;) {
      while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i += 1;
      if (text[i] === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end < 0) fail('a comment /* that is not closed');
        i = end + 2;
        continue;
      }
      if (text[i] === '/' && text[i + 1] === '/') {
        while (i < n && text[i] !== '\n' && text[i] !== '\r') i += 1;
        continue;
      }
      break;
    }
    if (i >= n) return null;
    const at = i;
    const c = text[i];
    if ('{}()=;,'.includes(c)) {
      i += 1;
      return { kind: 'punct', text: c, at };
    }
    if (c === '"') {
      i += 1;
      let out = '';
      let from = i;
      for (;;) {
        if (i >= n) fail('a string that is not closed', at);
        const d = text[i];
        if (d === '"') break;
        if (d === '\\') {
          out += text.slice(from, i);
          const e = text[i + 1];
          if (e === 'U' && /^[0-9A-Fa-f]{4}$/.test(text.slice(i + 2, i + 6))) {
            out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
            i += 6;
          } else {
            out += Object.hasOwn(ESCAPES, e ?? '') ? ESCAPES[e] : (e ?? '');
            i += 2;
          }
          from = i;
        } else i += 1;
        if (i - from + out.length > lim.maxStringLength) fail(`a string longer than ${lim.maxStringLength} characters`, at);
      }
      out += text.slice(from, i);
      i += 1;
      return { kind: 'str', text: out, at };
    }
    if (c === '<') {
      const end = text.indexOf('>', i);
      if (end < 0) fail('data in < > that is not closed');
      i = end + 1;
      return { kind: 'str', text: text.slice(at + 1, end), at };
    }
    if (BARE.test(c)) {
      while (i < n && BARE.test(text[i])) i += 1;
      if (i - at > lim.maxStringLength) fail(`a string longer than ${lim.maxStringLength} characters`, at);
      return { kind: 'str', text: text.slice(at, i), at };
    }
    return fail(`the character ${JSON.stringify(c).slice(0, 12)} that a property list does not have`);
  };

  const count = (at) => {
    values += 1;
    if (values > lim.maxValues) fail(`more than ${lim.maxValues.toLocaleString('en-US')} values`, at);
  };

  // The open dictionaries and lists, innermost last; a dictionary waits for a key, an =, a value or a ;.
  const stack = [];
  let root = null;
  const place = (value) => {
    const top = stack.at(-1);
    if (!top) {
      root = value;
      return;
    }
    if (top.t === 'dict') {
      if (top.map.has(top.key)) fail(`the key "${top.key.slice(0, 60)}" appears twice in one dictionary`, top.keyAt);
      top.map.set(top.key, { value, keyAt: top.keyAt });
      top.state = 'semi';
    } else {
      top.items.push(value);
      top.state = 'comma';
    }
  };
  const open = (value) => {
    if (stack.length >= lim.maxDepth) fail(`values nested more than ${lim.maxDepth} deep`, value.at);
    place(value);
    stack.push(value);
  };

  for (;;) {
    const tok = next();
    const top = stack.at(-1);
    if (tok === null) {
      if (top) fail(top.t === 'dict' ? 'a dictionary { that is not closed' : 'a list ( that is not closed', top.at);
      if (root === null) fail('the file holds no property list', 0);
      return root;
    }
    if (root !== null && !top) fail('text after the end of the property list', tok.at);
    const wantsValue = !top || (top.t === 'dict' && top.state === 'value') || (top.t === 'list' && top.state === 'value');
    if (top && top.t === 'dict' && top.state === 'key') {
      if (tok.kind === 'punct' && tok.text === '}') {
        stack.pop();
        continue;
      }
      if (tok.kind !== 'str') fail('a key was expected', tok.at);
      top.key = tok.text;
      top.keyAt = tok.at;
      top.state = 'eq';
      continue;
    }
    if (top && top.t === 'dict' && top.state === 'eq') {
      if (tok.kind !== 'punct' || tok.text !== '=') fail('an = after the key was expected', tok.at);
      top.state = 'value';
      continue;
    }
    if (top && top.t === 'dict' && top.state === 'semi') {
      if (tok.kind !== 'punct' || tok.text !== ';') fail('a ; after the value was expected', tok.at);
      top.state = 'key';
      continue;
    }
    if (top && top.t === 'list' && top.state === 'comma') {
      if (tok.kind === 'punct' && tok.text === ')') {
        stack.pop();
        continue;
      }
      if (tok.kind !== 'punct' || tok.text !== ',') fail('a , or ) after the value was expected', tok.at);
      top.state = 'value';
      continue;
    }
    if (wantsValue) {
      if (top && top.t === 'list' && tok.kind === 'punct' && tok.text === ')') {
        stack.pop();
        continue;
      }
      count(tok.at);
      if (tok.kind === 'str') place({ t: 'str', s: tok.text, at: tok.at });
      else if (tok.text === '{') open({ t: 'dict', map: new Map(), at: tok.at, state: 'key', key: null, keyAt: tok.at });
      else if (tok.text === '(') open({ t: 'list', items: [], at: tok.at, state: 'value' });
      else fail(`a value was expected, not ${tok.text}`, tok.at);
    }
  }
}

const str = (dict, key) => {
  const e = dict && dict.t === 'dict' ? dict.map.get(key) : undefined;
  return e && e.value.t === 'str' ? { s: e.value.s, at: e.value.at } : null;
};

const KINDS = { upToNextMajorVersion: 'upToNextMajor', upToNextMinorVersion: 'upToNextMinor', exactVersion: 'exact', versionRange: 'range', branch: 'branch', revision: 'revision' };

// The requirement of a requirement dictionary: { requirement, at } or { problem, at }.
function requirementOf(dict, fallbackAt) {
  if (!dict || dict.t !== 'dict') return { problem: 'the reference has no requirement dictionary', at: fallbackAt };
  const kind = str(dict, 'kind');
  if (!kind) return { problem: 'the requirement has no kind', at: dict.at };
  if (!Object.hasOwn(KINDS, kind.s)) return { problem: `the requirement kind ${kind.s.slice(0, 60)} is not one the reader knows`, at: kind.at };
  const field = { upToNextMajorVersion: 'minimumVersion', upToNextMinorVersion: 'minimumVersion', exactVersion: 'version', versionRange: 'minimumVersion', branch: 'branch', revision: 'revision' }[kind.s];
  const a = str(dict, field);
  if (!a) return { problem: `the requirement ${kind.s} has no ${field}`, at: kind.at };
  let b = null;
  if (kind.s === 'versionRange') {
    b = str(dict, 'maximumVersion');
    if (!b) return { problem: 'the requirement versionRange has no maximumVersion', at: kind.at };
  }
  const r = makeRequirement(KINDS[kind.s], a.s, b ? b.s : null);
  return r.problem ? { problem: r.problem, at: a.at } : { requirement: r, at: a.at };
}

// The package references and products of an Xcode project file: { packages, products }, with the same shapes as
// scanManifest of src/swift.js. Throws PbxError when the file is not a property list the reader takes.
export function scanProject(text, limits = PBX_LIMITS) {
  const root = parsePbx(text, limits);
  const packages = [];
  const products = [];
  const objects = root.t === 'dict' ? root.map.get('objects') : undefined;
  if (!objects || objects.value.t !== 'dict') return { packages, products, references: 0 };
  const names = new Map();
  for (const [id, entry] of objects.value.map) {
    const o = entry.value;
    const isa = str(o, 'isa');
    if (!isa) continue;
    if (isa.s === 'XCRemoteSwiftPackageReference') {
      const url = str(o, 'repositoryURL');
      const req = o.map.get('requirement');
      if (!url) {
        packages.push({ kind: 'remote', start: entry.keyAt, location: null, locationAt: entry.keyAt, requirement: null, requirementAt: entry.keyAt, problem: 'the reference has no repositoryURL' });
        continue;
      }
      const r = requirementOf(req ? req.value : null, entry.keyAt);
      names.set(id, url.s);
      packages.push({ kind: 'remote', start: entry.keyAt, location: url.s, locationAt: url.at, requirement: r.requirement ?? null, requirementAt: r.at, problem: r.problem ?? null });
    } else if (isa.s === 'XCLocalSwiftPackageReference') {
      const path = str(o, 'relativePath') ?? str(o, 'path');
      if (path) names.set(id, path.s);
      packages.push({ kind: 'local', start: entry.keyAt, location: path ? path.s : null, locationAt: path ? path.at : entry.keyAt, requirement: null, requirementAt: entry.keyAt, problem: path ? null : 'the local reference has no relativePath' });
    }
  }
  for (const [, entry] of objects.value.map) {
    const o = entry.value;
    const isa = str(o, 'isa');
    if (!isa || isa.s !== 'XCSwiftPackageProductDependency') continue;
    const name = str(o, 'productName');
    const pkg = str(o, 'package');
    if (name) products.push({ name: name.s, package: pkg && names.has(pkg.s) ? names.get(pkg.s) : null, start: entry.keyAt });
  }
  return { packages, products };
}
