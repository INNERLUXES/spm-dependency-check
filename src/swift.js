// A Package.swift manifest read as text. The tool does not run Swift and does not compile the manifest; it reads the
// file once, left to right, into tokens with its comments (// and nested /* */) left out and its string literals (in
// double quotes, in three double quotes, and raw strings with # around them) kept with their values, and then looks for
// two forms by their shape. This is a heuristic, and docs/method.md and docs/limits.md say what it sees and what it
// misses:
//   - a package dependency: .package(url: "...", from: "1.2.3") and the other requirements, exact:, branch:, revision:,
//     "1.0.0"..<"2.0.0", "1.0.0"..."2.0.0", .upToNextMajor(from:), .upToNextMinor(from:), .exact(...), .branch(...)
//     and .revision(...), a local package .package(path: "...") and a registry package .package(id: "...", ...);
//   - a product of a package a target uses: .product(name: "...", package: "...").
// Nothing in a comment counts, so a dependency that is commented out is not reported, and a value written with a
// variable or with string interpolation is reported as one the reader cannot read rather than guessed.

import { makeRequirement } from './semver.js';
import { MAX_URL_LENGTH } from './urls.js';

export const SWIFT_LIMITS = { maxTokens: 500000, maxPackages: 2500, maxCallTokens: 400 };

const IDENT_START = /[A-Za-z_]/;
const IDENT = /[A-Za-z0-9_]/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', 0: '\0', '\\': '\\', '"': '"', "'": "'" };

// The tokens of a manifest: [{ type: 'id' | 'str' | 'num' | 'punct', text, value, interpolated, start, end }], and
// limited when the text holds more tokens than the limit. A string that is not closed runs to the end of its line, or
// to the end of the text for a string in three double quotes.
export function tokenize(text, limits = SWIFT_LIMITS) {
  const lim = { ...SWIFT_LIMITS, ...limits };
  const n = text.length;
  const tokens = [];
  let limited = false;
  let i = 0;
  const push = (t) => {
    if (tokens.length >= lim.maxTokens) {
      limited = true;
      return false;
    }
    tokens.push(t);
    return true;
  };
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let depth = 0;
      while (i < n) {
        if (text[i] === '/' && text[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (text[i] === '*' && text[i + 1] === '/') {
          depth -= 1;
          i += 2;
          if (depth === 0) break;
        } else i += 1;
      }
      continue;
    }
    let pounds = 0;
    while (text[i + pounds] === '#') pounds += 1;
    if (pounds > 0 && text[i + pounds] !== '"') {
      const start = i;
      i += pounds;
      if (!push({ type: 'punct', text: '#', start, end: i })) break;
      continue;
    }
    if (text[i + pounds] === '"') {
      const start = i;
      const hashes = '#'.repeat(pounds);
      i += pounds;
      const triple = text.startsWith('"""', i);
      i += triple ? 3 : 1;
      const close = `${triple ? '"""' : '"'}${hashes}`;
      const escape = `\\${hashes}`;
      let value = '';
      let interpolated = false;
      while (i < n) {
        if (text.startsWith(close, i)) {
          i += close.length;
          break;
        }
        if (!triple && (text[i] === '\n' || text[i] === '\r')) break;
        if (text.startsWith(escape, i)) {
          const e = text[i + escape.length];
          if (e === '(') {
            interpolated = true;
            value += '\\(...)';
            let depth = 0;
            i += escape.length;
            while (i < n) {
              const d = text[i];
              if (d === '(') depth += 1;
              else if (d === ')') {
                depth -= 1;
                if (depth === 0) {
                  i += 1;
                  break;
                }
              } else if (d === '"') {
                const end = text.indexOf('"', i + 1);
                i = end < 0 ? n : end;
              } else if (d === '\n' && !triple) break;
              i += 1;
            }
            continue;
          }
          if (e === 'u' && text[i + escape.length + 1] === '{') {
            const from = i + escape.length + 2;
            const end = text.slice(from, from + 9).indexOf('}');
            const hex = end < 0 ? '' : text.slice(from, from + end);
            if (/^[0-9A-Fa-f]{1,6}$/.test(hex) && parseInt(hex, 16) <= 0x10ffff) {
              value += String.fromCodePoint(parseInt(hex, 16));
              i = from + end + 1;
            } else {
              value += '?';
              i = from;
            }
            continue;
          }
          value += Object.hasOwn(ESCAPES, e ?? '') ? ESCAPES[e] : (e ?? '');
          i += escape.length + 1;
          continue;
        }
        value += text[i];
        i += 1;
      }
      if (!push({ type: 'str', value, interpolated, start, end: i })) break;
      continue;
    }
    if (IDENT_START.test(c) || (c === '`' && IDENT_START.test(text[i + 1] ?? ''))) {
      const start = i;
      if (c === '`') i += 1;
      while (i < n && IDENT.test(text[i])) i += 1;
      const name = text.slice(c === '`' ? start + 1 : start, i);
      if (c === '`' && text[i] === '`') i += 1;
      if (!push({ type: 'id', text: name, start, end: i })) break;
      continue;
    }
    if (c >= '0' && c <= '9') {
      const start = i;
      while (i < n && IDENT.test(text[i])) i += 1;
      if (!push({ type: 'num', text: text.slice(start, i), start, end: i })) break;
      continue;
    }
    const start = i;
    const op = text.startsWith('..<', i) ? '..<' : text.startsWith('...', i) ? '...' : c;
    i += op.length;
    if (!push({ type: 'punct', text: op, start, end: i })) break;
  }
  return { tokens, limited };
}

const isPunct = (t, text) => t !== undefined && t.type === 'punct' && t.text === text;
const OPEN = ['(', '[', '{'];
const CLOSE = [')', ']', '}'];

// The arguments of a call whose ( is at tokens[at]: { args: [{ label, tokens, start }], end } where end is the index
// after the closing ), or null when the call is not closed within the limit of tokens.
export function callArguments(tokens, at, max = SWIFT_LIMITS.maxCallTokens) {
  const args = [];
  let current = [];
  let depth = 0;
  for (let k = at; k < tokens.length && k - at <= max; k += 1) {
    const t = tokens[k];
    if (t.type === 'punct' && OPEN.includes(t.text)) {
      depth += 1;
      if (depth === 1) continue;
    } else if (t.type === 'punct' && CLOSE.includes(t.text)) {
      depth -= 1;
      if (depth === 0) {
        if (current.length) args.push(current);
        const out = args.map((a) => (a.length >= 2 && a[0].type === 'id' && isPunct(a[1], ':') ? { label: a[0].text, tokens: a.slice(2), start: a[0].start } : { label: null, tokens: a, start: a[0].start }));
        return { args: out, end: k + 1 };
      }
    } else if (depth === 1 && isPunct(t, ',')) {
      args.push(current);
      current = [];
      continue;
    }
    current.push(t);
  }
  return null;
}

// The value of an argument by its shape: a string, a range of two strings, or a member call such as
// .upToNextMajor(from: "1.0.0") with its arguments; null for any other shape.
export function valueOf(tokens) {
  if (tokens.length === 1 && tokens[0].type === 'str') return { type: 'string', value: tokens[0].value, interpolated: tokens[0].interpolated, start: tokens[0].start };
  if (tokens.length === 3 && tokens[0].type === 'str' && tokens[2].type === 'str' && (isPunct(tokens[1], '..<') || isPunct(tokens[1], '...'))) {
    return { type: 'range', a: tokens[0], b: tokens[2], closed: tokens[1].text === '...', start: tokens[0].start, interpolated: tokens[0].interpolated || tokens[2].interpolated };
  }
  if (tokens.length >= 4 && isPunct(tokens[0], '.') && tokens[1].type === 'id' && isPunct(tokens[2], '(') && isPunct(tokens.at(-1), ')')) {
    const inner = callArguments(tokens, 2);
    if (inner && inner.end === tokens.length) return { type: 'call', name: tokens[1].text, args: inner.args, start: tokens[0].start };
  }
  return null;
}

const MEMBER_KINDS = { upToNextMajor: 'upToNextMajor', upToNextMinor: 'upToNextMinor', exact: 'exact', branch: 'branch', revision: 'revision' };
const LABEL_KINDS = { from: 'upToNextMajor', exact: 'exact', branch: 'branch', revision: 'revision' };

// The requirement of the arguments of a .package call: { requirement, at } or { problem, at }.
function requirementOf(args) {
  for (const a of args) {
    if (a.label !== null && Object.hasOwn(LABEL_KINDS, a.label)) {
      const v = valueOf(a.tokens);
      if (!v || v.type !== 'string' || v.interpolated) return { problem: `${a.label}: is not a string the reader can read, such as "1.2.3"`, at: a.start };
      const r = makeRequirement(LABEL_KINDS[a.label], v.value);
      return r.problem ? { problem: r.problem, at: v.start } : { requirement: r, at: v.start };
    }
    if (a.label === null) {
      const v = valueOf(a.tokens);
      if (!v) continue;
      if (v.type === 'range') {
        if (v.interpolated) return { problem: 'the range is written with string interpolation', at: v.start };
        const r = makeRequirement(v.closed ? 'closedRange' : 'range', v.a.value, v.b.value);
        return r.problem ? { problem: r.problem, at: v.start } : { requirement: r, at: v.start };
      }
      if (v.type === 'call' && Object.hasOwn(MEMBER_KINDS, v.name)) {
        const inner = v.args.length === 1 ? valueOf(v.args[0].tokens) : null;
        const label = v.args.length === 1 ? v.args[0].label : null;
        const wanted = v.name === 'upToNextMajor' || v.name === 'upToNextMinor' ? 'from' : null;
        if (!inner || inner.type !== 'string' || inner.interpolated || label !== wanted) return { problem: `.${v.name}(...) does not hold a string the reader can read`, at: v.start };
        const r = makeRequirement(MEMBER_KINDS[v.name], inner.value);
        return r.problem ? { problem: r.problem, at: inner.start } : { requirement: r, at: inner.start };
      }
    }
  }
  return { problem: 'no requirement the reader can read (from:, exact:, branch:, revision:, a range or .upToNextMajor(from:))', at: null };
}

const stringArg = (args, label) => {
  const a = args.find((x) => x.label === label);
  if (!a) return null;
  const v = valueOf(a.tokens);
  return v && v.type === 'string' && !v.interpolated && v.value.length <= MAX_URL_LENGTH ? { value: v.value, start: v.start } : { value: null, start: a.start };
};

// The package dependencies and the products of a manifest: { packages, products, limited }. A package is
// { kind: 'remote' | 'local' | 'registry', start, location, locationAt, requirement, requirementAt, problem }, where
// start is the offset of .package, location is the URL, the path or the registry id, and problem says why the reader
// cannot read the call; a product is { name, package, start }.
export function scanManifest(text, limits = SWIFT_LIMITS) {
  const lim = { ...SWIFT_LIMITS, ...limits };
  const { tokens, limited: tooMany } = tokenize(text, lim);
  const packages = [];
  const products = [];
  let limited = tooMany;
  for (let k = 0; k + 2 < tokens.length; k += 1) {
    if (!isPunct(tokens[k], '.') || tokens[k + 1].type !== 'id' || !isPunct(tokens[k + 2], '(')) continue;
    const name = tokens[k + 1].text;
    if (name !== 'package' && name !== 'product') continue;
    const start = tokens[k].start;
    const call = callArguments(tokens, k + 2, lim.maxCallTokens);
    if (name === 'product') {
      if (!call) continue;
      const pn = stringArg(call.args, 'name');
      const pp = stringArg(call.args, 'package');
      if (pn && pn.value !== null) products.push({ name: pn.value, package: pp && pp.value !== null ? pp.value : pn.value, start });
      k = call.end - 1;
      continue;
    }
    if (packages.length >= lim.maxPackages) {
      limited = true;
      break;
    }
    if (!call) {
      packages.push({ kind: 'remote', start, location: null, locationAt: start, requirement: null, requirementAt: start, problem: 'the call .package( is not closed, or is longer than the reader reads' });
      continue;
    }
    const url = stringArg(call.args, 'url');
    const path = stringArg(call.args, 'path');
    const id = stringArg(call.args, 'id');
    const where = url ?? path ?? id;
    const kind = url ? 'remote' : path ? 'local' : id ? 'registry' : 'remote';
    if (!where || where.value === null) {
      packages.push({ kind, start, location: null, locationAt: where ? where.start : start, requirement: null, requirementAt: start, problem: where ? `the ${url ? 'url' : path ? 'path' : 'id'} is not a string the reader can read` : 'no url:, path: or id: the reader can read' });
      continue;
    }
    if (kind === 'local') {
      packages.push({ kind, start, location: where.value, locationAt: where.start, requirement: null, requirementAt: where.start, problem: null });
      k = call.end - 1;
      continue;
    }
    const r = requirementOf(call.args);
    packages.push({ kind, start, location: where.value, locationAt: where.start, requirement: r.requirement ?? null, requirementAt: r.at ?? start, problem: r.problem ?? null });
    k = call.end - 1;
  }
  return { packages, products, limited };
}
