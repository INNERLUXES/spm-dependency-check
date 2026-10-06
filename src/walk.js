// The listing of the project folder: every file the tool reads, in the order of their paths. Those are Package.swift
// manifests, Package.resolved files (next to a manifest, or under xcshareddata/swiftpm of an Xcode workspace or of the
// workspace inside an Xcode project), and project.pbxproj files inside a folder whose name ends with .xcodeproj. The
// folders .build, DerivedData, Pods and .git hold build output, caches, CocoaPods and history, not the dependency setup
// as written, so they are counted and passed over; so is every path that matches an exclude pattern. A symbolic link
// (a junction on Windows too) is counted and never followed, so the listing cannot leave the folder or walk a loop. The
// listing keeps a list of folders of its own, with no recursion, and stops at its limits of entries, depth and files
// and says so, so a run never passes because a part of the project was not read.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { excluded } from './glob.js';
import { asciiLower, byCode, joinPath } from './words.js';

export const WALK_LIMITS = { maxProjectEntries: 50000, maxFolderDepth: 32, maxInputFiles: 2500 };

// The folders that are never read: SwiftPM build output, Xcode build output, CocoaPods and the history of git.
export const SKIPPED_FOLDERS = ['.build', 'DerivedData', 'Pods', '.git'];

// The kind of a file the tool reads, from its name and the name of its folder, or null: 'manifest' for Package.swift,
// 'resolved' for Package.resolved and 'project' for project.pbxproj inside a folder named *.xcodeproj. Version-specific
// manifests such as Package@swift-5.9.swift are not read.
export function kindOfFile(name, folderName = '') {
  if (name === 'Package.swift') return 'manifest';
  if (name === 'Package.resolved') return 'resolved';
  if (name === 'project.pbxproj' && asciiLower(folderName).endsWith('.xcodeproj') && folderName.length > '.xcodeproj'.length) return 'project';
  return null;
}

// The files below a folder: { files: [{ rel, full, name, kind }], skipped, excluded, links, others, limit }, where rel is
// the path from the folder with forward slashes, skipped counts the folders of SKIPPED_FOLDERS passed over, and limit
// says which limit stopped the listing, or is null.
export async function walkProject(root, { exclude = [], limits = WALK_LIMITS } = {}) {
  const lim = { ...WALK_LIMITS, ...limits };
  const files = [];
  let entries = 0;
  let skipped = 0;
  let excludedCount = 0;
  let links = 0;
  let others = 0;
  let limit = null;
  const folders = [{ rel: '', full: root, depth: 0, name: '' }];
  while (folders.length && limit === null) {
    const folder = folders.pop();
    const list = await readdir(folder.full, { withFileTypes: true });
    list.sort((a, b) => byCode(a.name, b.name));
    const inner = [];
    for (const entry of list) {
      entries += 1;
      if (entries > lim.maxProjectEntries) {
        limit = `more than ${lim.maxProjectEntries.toLocaleString('en-US')} files and folders`;
        break;
      }
      const rel = joinPath(folder.rel, entry.name);
      if (entry.isSymbolicLink()) {
        links += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIPPED_FOLDERS.includes(entry.name)) skipped += 1;
        else if (excluded(exclude, rel, true)) excludedCount += 1;
        else if (folder.depth + 1 > lim.maxFolderDepth) limit = `folders nested more than ${lim.maxFolderDepth} deep, at ${rel}`;
        else inner.push({ rel, full: join(folder.full, entry.name), depth: folder.depth + 1, name: entry.name });
        continue;
      }
      const kind = entry.isFile() ? kindOfFile(entry.name, folder.name) : null;
      if (kind === null) {
        others += 1;
        continue;
      }
      if (excluded(exclude, rel)) {
        excludedCount += 1;
        continue;
      }
      if (files.length >= lim.maxInputFiles) {
        limit = `more than ${lim.maxInputFiles.toLocaleString('en-US')} manifests, Package.resolved and Xcode project files`;
        break;
      }
      files.push({ rel, full: join(folder.full, entry.name), name: entry.name, kind });
    }
    for (let k = inner.length - 1; k >= 0; k -= 1) folders.push(inner[k]);
  }
  files.sort((a, b) => byCode(a.rel, b.rel));
  return { files, skipped, excluded: excludedCount, links, others, limit };
}
