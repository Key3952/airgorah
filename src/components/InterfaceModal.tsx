import { useEffect, useState } from 'react';
import { RefreshCw, X, Network, ShieldCheck, ShieldAlert, RotateCcw, Copy, Check } from 'lucide-react';
import type { WirelessInterface } from '../types';

interface LinuxLease {
  iface: string;
  originalMode: string;
  originalMac: string | null;
  networkManagerManaged: boolean;
  capturedAt: string;
}

interface LinuxSystemStatus {
  managedByLauncher: boolean;
  platform: string;
  isRoot: boolean;
  elevatedUser: string | null;
  activeLease: LinuxLease | null;
  watchdogPid: number | null;
  interfaces: Array<{
    name: string;
    mode: string;
    mac: string;
    operstate: string;
    driver: string;
  }>;
}

interface InterfaceModalProps {
  isOpen: boolean;
  interfaces: WirelessInterface[];
  currentInterface: string | null;
  onSelect: (ifaceName: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export function InterfaceModal({
  isOpen,
  interfaces,
  currentInterface,
  onSelect,
  onRefresh,
  onClose,
}: InterfaceModalProps) {
  const [chosen, setChosen] = useState<string>(
    currentInterface ?? interfaces[0]?.name ?? ''
  );
  const [linuxStatus, setLinuxStatus] = useState<LinuxSystemStatus | null>(null);
  const [guardBusy, setGuardBusy] = useState<boolean>(false);
  const [guardMessage, setGuardMessage] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  const fetchSystemStatus = async () => {
    try {
      const res = await fetch('/api/system/status', { cache: 'no-store' });
      if (!res.ok) return;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;
      const data = (await res.json()) as LinuxSystemStatus;
      if (data && data.managedByLauncher) {
        setLinuxStatus(data);
      }
    } catch {
      // Running in static/Vite preview mode without Linux launcher backend
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setChosen(currentInterface ?? interfaces[0]?.name ?? '');
    setGuardMessage(null);
    void fetchSystemStatus();
  }, [isOpen, currentInterface, interfaces]);

  if (!isOpen) return null;

  const selectedObj = interfaces.find((i) => i.name === chosen) ?? interfaces[0];
  const elevateCommand = selectedObj
    ? `airgorah --iface ${selectedObj.name}`
    : 'airgorah --sudo';

  const handleRestoreWifi = async () => {
    setGuardBusy(true);
    setGuardMessage(null);
    try {
      const res = await fetch('/api/system/restore', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setGuardMessage(data.error || 'Failed to restore Wi-Fi interface.');
      } else {
        setGuardMessage('Wi-Fi adapter restored to managed mode and handed back to NetworkManager.');
        await fetchSystemStatus();
      }
    } catch {
      setGuardMessage('Unable to reach local Wi-Fi guard service.');
    } finally {
      setGuardBusy(false);
    }
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(elevateCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="iface-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#3a3e48] bg-[#24262b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#333640] px-4 py-3">
          <h2
            id="iface-modal-title"
            className="text-sm font-semibold text-[#f1f3f7]"
          >
            Select a wireless interface
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close interface dialog"
            className="rounded p-1 text-[#9ca3b2] hover:bg-[#32353e] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="wireless-iface-select" className="sr-only">
              Wireless interface
            </label>
            <div className="relative flex-1">
              <Network className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[#9ca3b2]" />
              <select
                id="wireless-iface-select"
                value={selectedObj?.name ?? ''}
                onChange={(e) => setChosen(e.target.value)}
                className="w-full rounded border border-[#3d414b] bg-[#1b1c20] py-2 pr-3 pl-9 font-mono text-xs text-[#eceff4] focus:border-[#e86f33] focus:outline-none"
              >
                {interfaces.map((iface) => (
                  <option key={iface.name} value={iface.name}>
                    {iface.name} — {iface.supports5Ghz ? '2.4 / 5 GHz' : '2.4 GHz only'}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                onRefresh();
                void fetchSystemStatus();
              }}
              title="Refresh wireless interfaces"
              aria-label="Refresh wireless interfaces"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#3d414b] bg-[#2e3036] text-[#e2e5ec] hover:bg-[#3a3d45]"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {selectedObj && (
            <div className="space-y-1 rounded border border-[#31343e] bg-[#1d1f24] px-3 py-2.5 text-xs text-[#b5bcc9]">
              <div className="flex justify-between gap-2">
                <span className="text-[#8a91a0]">Chipset</span>
                <span className="text-right text-[#e5e9f0]">{selectedObj.chipset}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a91a0]">Driver</span>
                <span className="font-mono text-[#d6dbe5]">{selectedObj.driver}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a91a0]">Hardware MAC</span>
                <span className="font-mono text-[#d6dbe5] tabular-nums">
                  {selectedObj.permanentMac}
                </span>
              </div>
            </div>
          )}

          {/* Linux Wi-Fi Guard & Sudo Status (shown when running under the native Linux launcher) */}
          {linuxStatus && (
            <div className="space-y-2 rounded border border-[#31343e] bg-[#1b1d22] px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium text-[#e5e9f0]">
                  {linuxStatus.isRoot ? (
                    <ShieldCheck className="h-4 w-4 text-[#22c55e]" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-[#f59e0b]" />
                  )}
                  <span>
                    {linuxStatus.isRoot
                      ? 'Root Wi-Fi Guard Active'
                      : 'Unprivileged Mode'}
                  </span>
                </div>
                {linuxStatus.activeLease && (
                  <span className="font-mono text-[11px] text-[#22c55e]">
                    Watchdog armed
                  </span>
                )}
              </div>

              {linuxStatus.isRoot ? (
                <p className="text-[11px] leading-relaxed text-[#9ca3b2]">
                  {linuxStatus.activeLease
                    ? `Captured ${linuxStatus.activeLease.iface}. An independent root watchdog guarantees automatic restoration to managed mode and NetworkManager reconnection on any exit or crash.`
                    : 'Elevated privileges ready. Captured Wi-Fi adapters are automatically snapshotted and restored on exit, crash, or kill -9.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] leading-relaxed text-[#9ca3b2]">
                    Grant root privileges via Polkit/sudo to capture a real Linux Wi-Fi module with crash-proof auto-restore:
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded border border-[#2f333d] bg-[#15171b] px-2.5 py-1.5 font-mono text-[11px] text-[#e5e9f0]">
                    <span className="truncate">{elevateCommand}</span>
                    <button
                      type="button"
                      onClick={() => void handleCopyCommand()}
                      aria-label="Copy elevation command"
                      className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#9ca3b2] hover:bg-[#2a2d36] hover:text-white"
                    >
                      {copiedCmd ? (
                        <Check className="h-3.5 w-3.5 text-[#22c55e]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {linuxStatus.isRoot && linuxStatus.activeLease && (
                <button
                  type="button"
                  disabled={guardBusy}
                  onClick={() => void handleRestoreWifi()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-[#3d414b] bg-[#2a2d36] px-3 py-1.5 text-xs font-medium text-[#e5e9f0] hover:bg-[#353945] disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{guardBusy ? 'Restoring Wi-Fi...' : 'Restore Wi-Fi & Internet Now'}</span>
                </button>
              )}

              {guardMessage && (
                <p className="text-[11px] text-[#cbd5e1]">{guardMessage}</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#3d414b] bg-[#2e3036] px-4 py-1.5 text-xs font-medium text-[#d6dbe5] hover:bg-[#3a3d45]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedObj) {
                  onSelect(selectedObj.name);
                  onClose();
                }
              }}
              className="rounded bg-[#e86f33] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#d96126]"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
