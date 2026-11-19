#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves the next monotonically increasing SemVer release version on every push.
 * - Explicit tag push (refs/tags/vX.Y.Z): uses X.Y.Z directly.
 * - Branch push / workflow_dispatch: computes <major>.<minor>.<nextPatch>, where
 *   nextPatch is guaranteed > highest existing remote tag patch for that major.minor
 *   AND >= basePatch + runNumber so every push produces a unique new release version.
 */
export function resolveNextReleaseVersion({
  baseVersion,
  githubRef = '',
  githubRefName = '',
  runNumber = 1,
  existingTags = [],
}) {
  const runNum = Math.max(1, Number.parseInt(String(runNumber || 1), 10) || 1);

  if (githubRef.startsWith('refs/tags/v')) {
    const version = githubRefName.replace(/^v/i, '');
    return {
      version,
      tag: `v${version}`,
      buildNumber: String(runNum),
    };
  }

  const parts = String(baseVersion || '0.9.0')
    .trim()
    .replace(/^v/i, '')
    .split('.');
  const major = Number.parseInt(parts[0], 10) || 0;
  const minor = Number.parseInt(parts[1], 10) || 0;
  const basePatch = Number.parseInt(parts[2], 10) || 0;

  let highestExistingPatch = -1;
  const tagPattern = new RegExp(`^v?${major}\\.${minor}\\.(\\d+)$`);
  for (const tag of existingTags) {
    const match = String(tag || '').trim().match(tagPattern);
    if (match) {
      const patch = Number.parseInt(match[1], 10);
      if (Number.isInteger(patch) && patch > highestExistingPatch) {
        highestExistingPatch = patch;
      }
    }
  }

  const candidatePatch = Math.max(basePatch + runNum, highestExistingPatch + 1);
  const version = `${major}.${minor}.${candidatePatch}`;

  return {
    version,
    tag: `v${version}`,
    buildNumber: String(runNum),
  };
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const existingTags = (process.env.EXISTING_TAGS || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const resolved = resolveNextReleaseVersion({
    baseVersion: pkg.version,
    githubRef: process.env.GITHUB_REF || '',
    githubRefName: process.env.GITHUB_REF_NAME || '',
    runNumber: process.env.GITHUB_RUN_NUMBER || '1',
    existingTags,
  });

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${resolved.version}\nrelease_tag=${resolved.tag}\nbuild_number=${resolved.buildNumber}\n`,
      'utf8'
    );
  }

  console.log(JSON.stringify(resolved));
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirect) {
  main();
}
