import { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  ArrowUpCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  APP_BUILD_NUMBER,
  APP_COMMIT_SHA,
  APP_GITHUB_REPO,
  APP_VERSION,
  RELEASES_PAGE_URL,
  REPO_URL,
  checkForUpdates,
  formatBuildLabel,
  type UpdateCheckResult,
} from '../lib/version';

interface AboutModalProps {
  isOpen: boolean;
  initialUpdateResult?: UpdateCheckResult | null;
  onUpdateChecked?: (result: UpdateCheckResult) => void;
  onClose: () => void;
}

export function AboutModal({
  isOpen,
  initialUpdateResult = null,
  onUpdateChecked,
  onClose,
}: AboutModalProps) {
  const [checking, setChecking] = useState<boolean>(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(
    initialUpdateResult
  );

  useEffect(() => {
    if (initialUpdateResult) {
      setUpdateResult(initialUpdateResult);
    }
  }, [initialUpdateResult]);

  if (!isOpen) return null;

  const handleCheckUpdates = async () => {
    setChecking(true);
    const res = await checkForUpdates();
    setUpdateResult(res);
    onUpdateChecked?.(res);
    setChecking(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#3a3e48] bg-[#24262b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#333640] px-4 py-3">
          <h2
            id="about-modal-title"
            className="text-sm font-semibold text-[#f1f3f7]"
          >
            About Airgorah
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close about dialog"
            className="rounded p-1 text-[#9ca3b2] hover:bg-[#32353e] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border border-[#343740] bg-[#1b1c20] p-2">
            <img
              src="/app_icon.png"
              alt="Airgorah logo"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <h3 className="text-lg font-bold text-[#f1f3f7]">Airgorah</h3>
            <p
              data-testid="about-version-label"
              className="mt-0.5 font-mono text-xs text-[#c7ccd6] tabular-nums"
            >
              {formatBuildLabel(APP_VERSION, APP_BUILD_NUMBER)}
              {APP_COMMIT_SHA && APP_COMMIT_SHA !== 'dev'
                ? ` (${APP_COMMIT_SHA})`
                : ''}
            </p>
            <p className="mt-2 text-xs text-[#d1d5de]">
              A WiFi security auditing workbench for wireless spectrum inspection,
              station discovery, deauthentication testing, handshake and PMKID
              capture, and WPA decryption workflows.
            </p>
          </div>

          {/* Fork Update Checker (Key3952/airgorah) */}
          <div className="space-y-2 rounded border border-[#31343d] bg-[#1b1d22] p-3 text-left text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-[#e5e9f0]">
                  Release Updates
                </div>
                <div className="truncate font-mono text-[11px] text-[#8f97a6]">
                  {APP_GITHUB_REPO}
                </div>
              </div>
              <button
                type="button"
                disabled={checking}
                onClick={() => void handleCheckUpdates()}
                data-testid="check-updates-button"
                className="inline-flex shrink-0 items-center gap-1.5 rounded border border-[#3d414b] bg-[#2c2f37] px-2.5 py-1.5 text-[11px] font-medium text-[#eceff4] hover:bg-[#383c46] disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`}
                />
                <span>{checking ? 'Checking...' : 'Check updates'}</span>
              </button>
            </div>

            {updateResult && (
              <div
                data-testid="update-check-status"
                className="rounded border border-[#2d3039] bg-[#15171b] px-2.5 py-2 text-[11px]"
              >
                {updateResult.status === 'update-available' && (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 text-[#fbbf24]">
                      <ArrowUpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        New version{' '}
                        <strong className="font-mono">
                          v{updateResult.latestVersion}
                        </strong>{' '}
                        is available.
                      </span>
                    </div>
                    <a
                      href={updateResult.releaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 font-medium text-[#e86f33] hover:underline"
                    >
                      <span>Download</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {updateResult.status === 'up-to-date' && (
                  <div className="flex items-center gap-1.5 text-[#4ade80]">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Up to date (latest on fork: v{updateResult.latestVersion})
                    </span>
                  </div>
                )}

                {updateResult.status === 'no-releases' && (
                  <div className="flex items-center justify-between gap-2 text-[#a5adb9]">
                    <span>No published releases found on fork yet.</span>
                    <a
                      href={RELEASES_PAGE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#e86f33] hover:underline"
                    >
                      Releases
                    </a>
                  </div>
                )}

                {updateResult.status === 'error' && (
                  <div className="flex items-start gap-1.5 text-[#f87171]">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Unable to reach GitHub ({updateResult.errorMessage || 'offline'}).
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1 rounded border border-[#31343d] bg-[#1c1e23] p-3 text-left text-xs text-[#a5adb9]">
            <p>
              <strong className="text-[#e5e9f0]">Maintainer Fork:</strong>{' '}
              {APP_GITHUB_REPO} (MIT License)
            </p>
            <p>
              <strong className="text-[#e5e9f0]">Linux Wi-Fi Guard:</strong>{' '}
              Supports Polkit/sudo elevation with an independent crash-proof
              watchdog that restores your Wi-Fi adapter on any exit.
            </p>
            <p>
              <strong className="text-[#e5e9f0]">Legal:</strong> Designed
              exclusively for auditing networks you own or have explicit
              authorization to test.
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 pt-1">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[#e86f33] hover:underline"
            >
              github.com/{APP_GITHUB_REPO}
            </a>
            <span className="text-[#4a4f5c]">·</span>
            <a
              href={RELEASES_PAGE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[#c7ccd6] hover:text-white hover:underline"
            >
              Releases
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
