// The location of a package: its scheme, its normalized form and its identity. A remote package is named by the URL of
// its Git repository. The tool compares two locations by their normalized form, the host and path in lowercase with no
// scheme, no user, no default port, no trailing slash and no .git, so https://Code.Example.test/Owner/Repo.git and
// git@code.example.test:owner/repo are the same package. The identity is the last part of the path in lowercase with
// no .git, as Swift Package Manager names a package in Package.resolved. Nothing here opens a connection.

import { asciiLower } from './words.js';

export const MAX_URL_LENGTH = 4096;

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//;
const USER = /^[A-Za-z0-9._~-]+$/;
const HOST = /^[A-Za-z0-9.-]+$/;
const DEFAULT_PORTS = { https: '443', http: '80', ssh: '22', git: '9418' };

function trimPath(path) {
  let p = path.split('?')[0].split('#')[0];
  while (p.startsWith('/')) p = p.slice(1);
  while (p.endsWith('/')) p = p.slice(0, -1);
  if (asciiLower(p).endsWith('.git')) p = p.slice(0, -4);
  while (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

// The identity of a location or a path: the last part, in lowercase, with no .git.
export function identityOf(text) {
  const p = trimPath(String(text).split('\\').join('/'));
  return asciiLower(p.slice(p.lastIndexOf('/') + 1));
}

// A location read: { scheme, host, path, normalized, identity }. scheme is https, http, ssh, git, file or another
// scheme in lowercase; 'scp' for the form user@host:path that git reads as SSH; and 'none' for a text with no scheme.
export function parseLocation(text) {
  const raw = String(text).trim();
  const m = SCHEME.exec(raw);
  if (m) {
    const scheme = asciiLower(m[1]);
    const rest = raw.slice(m[0].length);
    const slash = rest.indexOf('/');
    let authority = slash < 0 ? rest : rest.slice(0, slash);
    const path = slash < 0 ? '' : rest.slice(slash);
    authority = authority.slice(authority.lastIndexOf('@') + 1);
    let host = asciiLower(authority);
    const colon = host.lastIndexOf(':');
    if (colon >= 0 && DEFAULT_PORTS[scheme] === host.slice(colon + 1)) host = host.slice(0, colon);
    const p = trimPath(path);
    const normalized = scheme === 'file' ? asciiLower(p) : asciiLower(p ? `${host}/${p}` : host);
    return { scheme, host, path: p, normalized, identity: identityOf(p || host) };
  }
  // The form user@host:path, read by its first colon, with no pattern that could look back over the text. A host of
  // one letter is a drive of Windows, not a host.
  const colon = raw.indexOf(':');
  if (colon > 0 && colon < raw.length - 1 && !raw.includes('\\')) {
    const head = raw.slice(0, colon);
    const at = head.lastIndexOf('@');
    const user = at < 0 ? null : head.slice(0, at);
    const hostPart = head.slice(at + 1);
    if ((user === null || USER.test(user)) && HOST.test(hostPart) && hostPart.length > 1) {
      const host = asciiLower(hostPart);
      const p = trimPath(raw.slice(colon + 1));
      return { scheme: 'scp', host, path: p, normalized: asciiLower(`${host}/${p}`), identity: identityOf(p) };
    }
  }
  const p = trimPath(raw);
  return { scheme: 'none', host: '', path: p, normalized: asciiLower(p), identity: identityOf(p) };
}

// Why a location is not an https URL, or null when it is one.
export function insecureReason(location) {
  switch (location.scheme) {
    case 'https':
      return null;
    case 'http':
      return 'it is a plain http URL, so the code of the package and the answers of the server travel unencrypted and can be changed on the way';
    case 'git':
      return 'it is a git:// URL, which has neither encryption nor authentication';
    case 'ssh':
    case 'scp':
      return 'it is an SSH URL, so every machine that resolves the package needs an SSH key for the host, and the package is named differently from its https URL';
    case 'file':
      return 'it is a file URL, a repository on one machine that no other machine has';
    case 'none':
      return 'it has no scheme, so it is not a URL with https';
    default:
      return `it uses the scheme ${location.scheme}, not https`;
  }
}
