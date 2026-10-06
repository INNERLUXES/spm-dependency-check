// A Package.resolved file, read with the strict JSON reader of src/json.js. Swift Package Manager and Xcode write it in
// three versions of one format, and the reader takes all three:
//   - version 1: { "object": { "pins": [ { "package", "repositoryURL", "state": { "branch", "revision", "version" } } ] },
//     "version": 1 };
//   - version 2: { "pins": [ { "identity", "kind", "location", "state": { "branch", "revision", "version" } } ],
//     "version": 2 };
//   - version 3: as version 2, with an "originHash" next to the pins.
// Any other version, or a file of another shape, is refused with its place. The reader keeps the line and column of
// every pin, so a finding points at the pin itself.

import { JsonError, jsonProblem, parseJson } from './json.js';
import { asciiLower } from './words.js';
import { identityOf, MAX_URL_LENGTH } from './urls.js';

export const RESOLVED_LIMITS = { maxPins: 5000 };
export const RESOLVED_VERSIONS = [1, 2, 3];

export class ResolvedError extends Error {
  constructor(reason, line = 1, column = 1) {
    super(reason);
    this.reason = reason;
    this.line = line;
    this.column = column;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' && v.length <= MAX_URL_LENGTH ? v : null);

// The pins of a Package.resolved text: { format, pins: [{ identity, location, kind, version, branch, revision, line,
// column }], limited }. Throws ResolvedError with the line and column of the problem.
export function readResolved(source, limits = RESOLVED_LIMITS) {
  const lim = { ...RESOLVED_LIMITS, ...limits };
  let parsed;
  try {
    parsed = parseJson(source, { linesUpTo: 5, maxValues: 400000 });
  } catch (error) {
    if (error instanceof JsonError) {
      const m = /^line (\d+), column (\d+): (.*)$/s.exec(jsonProblem(error, source));
      throw new ResolvedError(`it is not JSON: ${m[3]}`, Number(m[1]), Number(m[2]));
    }
    throw error;
  }
  const { value, lines, columns } = parsed;
  const at = (path) => ({ line: lines.get(path) ?? 1, column: columns.get(path) ?? 1 });
  if (!isObject(value)) throw new ResolvedError('it is not a JSON object');
  const format = value.version;
  if (!RESOLVED_VERSIONS.includes(format)) {
    const where = at('version');
    throw new ResolvedError(Object.hasOwn(value, 'version') ? `its format version ${JSON.stringify(format).slice(0, 20)} is not one the reader knows (1, 2 or 3)` : 'it has no format version', where.line, where.column);
  }
  const base = format === 1 ? 'object.pins' : 'pins';
  const list = format === 1 ? (isObject(value.object) ? value.object.pins : undefined) : value.pins;
  if (!Array.isArray(list)) {
    const where = at(format === 1 ? 'object' : '');
    throw new ResolvedError(`it has no list ${base}`, where.line, where.column);
  }
  const pins = [];
  let limited = false;
  list.forEach((p, k) => {
    if (pins.length >= lim.maxPins) {
      limited = true;
      return;
    }
    const path = `${base}[${k}]`;
    const where = at(path);
    if (!isObject(p)) throw new ResolvedError(`${path} is not an object`, where.line, where.column);
    const location = text(format === 1 ? p.repositoryURL : p.location);
    const named = text(format === 1 ? null : p.identity);
    if (location === null && named === null) throw new ResolvedError(`${path} has no ${format === 1 ? 'repositoryURL' : 'location or identity'}`, where.line, where.column);
    const state = isObject(p.state) ? p.state : {};
    const v = text(state.version);
    const versionAt = v === null ? where : at(`${path}.state.version`);
    pins.push({
      identity: named !== null ? asciiLower(named) : identityOf(location),
      location,
      kind: format === 1 ? 'remoteSourceControl' : (text(p.kind) ?? 'remoteSourceControl'),
      version: v,
      branch: text(state.branch),
      revision: text(state.revision),
      line: where.line,
      column: where.column,
      versionLine: versionAt.line,
      versionColumn: versionAt.column
    });
  });
  return { format, pins, limited };
}
