declare const __APP_VERSION__: string | undefined;
declare const __BUILD_NUMBER__: string | undefined;
declare const __COMMIT_SHA__: string | undefined;
declare const __GITHUB_REPO__: string | undefined;

export const DEFAULT_GITHUB_REPO = 'Key3952/airgorah';

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__
    ? __APP_VERSION__
    : '0.9.0';

export const APP_BUILD_NUMBER: string =
  typeof __BUILD_NUMBER__ !== 'undefined' && __BUILD_NUMBER__
    ? __BUILD_NUMBER__
    : 'local';

export const APP_COMMIT_SHA: string =
  typeof __COMMIT_SHA__ !== 'undefined' && __COMMIT_SHA__
    ? __COMMIT_SHA__
    : 'dev';

export const APP_GITHUB_REPO: string =
  typeof __GITHUB_REPO__ !== 'undefined' && __GITHUB_REPO__
    ? __GITHUB_REPO__
    : DEFAULT_GITHUB_REPO;

export const REPO_URL = `https://github.com/${APP_GITHUB_REPO}`;
export const RELEASES_PAGE_URL = `${REPO_URL}/releases`;
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${APP_GITHUB_REPO}/releases?per_page=5`;

export function formatBuildLabel(
  version: string = APP_VERSION,
  buildNumber: string = APP_BUILD_NUMBER
): string {
  const cleanVersion = version.replace(/^v/, '');
  const cleanBuild = String(buildNumber || 'local').trim();
  const buildTag = /^\d+$/.test(cleanBuild) ? `#${cleanBuild}` : cleanBuild;
  return `v${cleanVersion} · build ${buildTag}`;
}

export function parseSemver(raw: string): [number, number, number] | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0];
  const parts = cleaned.split('.');
  if (parts.length < 2 || parts.length > 3) return null;
  const major = Number.parseInt(parts[0], 10);
  const minor = Number.parseInt(parts[1], 10);
  const patch = parts[2] !== undefined ? Number.parseInt(parts[2], 10) : 0;
  if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) {
    return null;
  }
  return [major, minor, patch];
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

export interface GitHubReleasePayload {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface UpdateCheckResult {
  status: 'update-available' | 'up-to-date' | 'no-releases' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseUrl: string;
  publishedAt: string | null;
  errorMessage?: string;
}

export function evaluateLatestRelease(
  currentVersion: string,
  payload: GitHubReleasePayload,
  fallbackReleasesUrl: string = RELEASES_PAGE_URL
): UpdateCheckResult {
  const rawTag = String(payload.tag_name || '').trim();
  if (!rawTag) {
    return {
      status: 'no-releases',
      currentVersion,
      latestVersion: null,
      releaseName: null,
      releaseUrl: fallbackReleasesUrl,
      publishedAt: null,
    };
  }

  const latestVersion = rawTag.replace(/^v/i, '');
  const cmp = compareVersions(latestVersion, currentVersion);
  const releaseUrl =
    typeof payload.html_url === 'string' && payload.html_url.startsWith('https://')
      ? payload.html_url
      : `${fallbackReleasesUrl}/tag/${encodeURIComponent(rawTag)}`;

  return {
    status: cmp > 0 ? 'update-available' : 'up-to-date',
    currentVersion: currentVersion.replace(/^v/i, ''),
    latestVersion,
    releaseName: payload.name ? String(payload.name) : `Airgorah v${latestVersion}`,
    releaseUrl,
    publishedAt: payload.published_at ? String(payload.published_at) : null,
  };
}

export async function checkForUpdates(
  options: {
    currentVersion?: string;
    apiUrl?: string;
    releasesUrl?: string;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<UpdateCheckResult> {
  const currentVersion = options.currentVersion ?? APP_VERSION;
  const apiUrl = options.apiUrl ?? LATEST_RELEASE_API_URL;
  const releasesUrl = options.releasesUrl ?? RELEASES_PAGE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const res = await fetchImpl(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    });

    if (res.status === 404) {
      return {
        status: 'no-releases',
        currentVersion: currentVersion.replace(/^v/i, ''),
        latestVersion: null,
        releaseName: null,
        releaseUrl: releasesUrl,
        publishedAt: null,
      };
    }

    if (!res.ok) {
      return {
        status: 'error',
        currentVersion: currentVersion.replace(/^v/i, ''),
        latestVersion: null,
        releaseName: null,
        releaseUrl: releasesUrl,
        publishedAt: null,
        errorMessage: `GitHub API returned HTTP ${res.status}`,
      };
    }

    const raw = (await res.json()) as GitHubReleasePayload | GitHubReleasePayload[];
    const release = Array.isArray(raw)
      ? raw.find((item) => item && !item.draft && Boolean(item.tag_name))
      : raw;

    if (!release) {
      return {
        status: 'no-releases',
        currentVersion: currentVersion.replace(/^v/i, ''),
        latestVersion: null,
        releaseName: null,
        releaseUrl: releasesUrl,
        publishedAt: null,
      };
    }

    return evaluateLatestRelease(currentVersion, release, releasesUrl);
  } catch (err) {
    return {
      status: 'error',
      currentVersion: currentVersion.replace(/^v/i, ''),
      latestVersion: null,
      releaseName: null,
      releaseUrl: releasesUrl,
      publishedAt: null,
      errorMessage: err instanceof Error ? err.message : 'Network error',
    };
  }
}
