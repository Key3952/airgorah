import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_GITHUB_REPO,
  LATEST_RELEASE_API_URL,
  RELEASES_PAGE_URL,
  checkForUpdates,
  compareVersions,
  evaluateLatestRelease,
  formatBuildLabel,
  parseSemver,
} from './version.ts';
// @ts-expect-error ESM release script without .d.ts declaration
import { resolveNextReleaseVersion } from '../../scripts/resolve-release-version.mjs';

test('default update source points to Key3952/airgorah fork', () => {
  assert.equal(APP_GITHUB_REPO, 'Key3952/airgorah');
  assert.equal(
    LATEST_RELEASE_API_URL,
    'https://api.github.com/repos/Key3952/airgorah/releases?per_page=5'
  );
  assert.equal(RELEASES_PAGE_URL, 'https://github.com/Key3952/airgorah/releases');
});

test('formatBuildLabel formats numeric CI build numbers and local builds cleanly', () => {
  assert.equal(formatBuildLabel('0.9.14', '14'), 'v0.9.14 · build #14');
  assert.equal(formatBuildLabel('v0.9.0', 'local'), 'v0.9.0 · build local');
});

test('parseSemver and compareVersions handle version ordering accurately', () => {
  assert.deepEqual(parseSemver('v0.9.12'), [0, 9, 12]);
  assert.equal(compareVersions('0.9.12', '0.9.2'), 1);
  assert.equal(compareVersions('0.9.2', '0.9.12'), -1);
  assert.equal(compareVersions('v0.9.5', '0.9.5'), 0);
  assert.equal(compareVersions('1.0.0', '0.9.99'), 1);
});

test('evaluateLatestRelease detects newer fork release vs up-to-date release', () => {
  const newer = evaluateLatestRelease('0.9.3', {
    tag_name: 'v0.9.4',
    name: 'Airgorah v0.9.4 (build #4)',
    html_url: 'https://github.com/Key3952/airgorah/releases/tag/v0.9.4',
    published_at: '2026-11-19T20:00:00Z',
  });
  assert.equal(newer.status, 'update-available');
  assert.equal(newer.latestVersion, '0.9.4');
  assert.equal(
    newer.releaseUrl,
    'https://github.com/Key3952/airgorah/releases/tag/v0.9.4'
  );

  const same = evaluateLatestRelease('0.9.4', {
    tag_name: 'v0.9.4',
    html_url: 'https://github.com/Key3952/airgorah/releases/tag/v0.9.4',
  });
  assert.equal(same.status, 'up-to-date');
});

test('checkForUpdates handles empty 200 list (no releases yet) and valid release array from fork API', async () => {
  const noRelease = await checkForUpdates({
    currentVersion: '0.9.0',
    fetchImpl: async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  assert.equal(noRelease.status, 'no-releases');
  assert.equal(noRelease.releaseUrl, 'https://github.com/Key3952/airgorah/releases');

  const available = await checkForUpdates({
    currentVersion: '0.9.1',
    fetchImpl: async (url) => {
      assert.equal(
        String(url),
        'https://api.github.com/repos/Key3952/airgorah/releases?per_page=5'
      );
      return new Response(
        JSON.stringify([
          { tag_name: 'v0.9.99', draft: true },
          {
            tag_name: 'v0.9.7',
            name: 'Airgorah v0.9.7 (build #7)',
            html_url: 'https://github.com/Key3952/airgorah/releases/tag/v0.9.7',
            draft: false,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
  });
  assert.equal(available.status, 'update-available');
  assert.equal(available.latestVersion, '0.9.7');
});

test('resolveNextReleaseVersion auto-increments on every push and avoids existing tag collisions', () => {
  const push1 = resolveNextReleaseVersion({
    baseVersion: '0.9.0',
    githubRef: 'refs/heads/main',
    githubRefName: 'main',
    runNumber: 1,
    existingTags: [],
  });
  assert.deepEqual(push1, { version: '0.9.1', tag: 'v0.9.1', buildNumber: '1' });

  const push2 = resolveNextReleaseVersion({
    baseVersion: '0.9.0',
    githubRef: 'refs/heads/main',
    githubRefName: 'main',
    runNumber: 2,
    existingTags: ['v0.9.1', 'v0.9.5'],
  });
  // Must jump past highest existing tag v0.9.5 -> v0.9.6
  assert.deepEqual(push2, { version: '0.9.6', tag: 'v0.9.6', buildNumber: '2' });

  const manualTag = resolveNextReleaseVersion({
    baseVersion: '0.9.0',
    githubRef: 'refs/tags/v1.2.0',
    githubRefName: 'v1.2.0',
    runNumber: 8,
    existingTags: ['v0.9.6'],
  });
  assert.deepEqual(manualTag, { version: '1.2.0', tag: 'v1.2.0', buildNumber: '8' });
});
