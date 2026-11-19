import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { AccessPoint } from '../types';

interface DeauthModalProps {
  ap: AccessPoint | null;
  onClose: () => void;
  onStartDeauth: (params: {
    bssid: string;
    clients: string[] | null;
    rate: number;
    disassoc: boolean;
  }) => void;
}

export function DeauthModal({ ap, onClose, onStartDeauth }: DeauthModalProps) {
  const [rate, setRate] = useState<number>(10);
  const [disassoc, setDisassoc] = useState<boolean>(false);
  const [mode, setMode] = useState<'all' | 'selection'>('all');
  const [selectedClients, setSelectedClients] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (ap) {
      setRate(10);
      setDisassoc(false);
      setMode('all');
      setSelectedClients({});
    }
  }, [ap?.bssid]);

  if (!ap) return null;

  const clientList = Object.values(ap.clients);
  const checkedMacs = Object.entries(selectedClients)
    .filter(([, checked]) => checked)
    .map(([mac]) => mac);

  const canSubmit =
    rate >= 1 &&
    rate <= 1000 &&
    (mode === 'all' || checkedMacs.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deauth-modal-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-[#3a3e48] bg-[#24262b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#333640] px-4 py-3">
          <h2
            id="deauth-modal-title"
            className="truncate text-sm font-semibold text-[#f1f3f7]"
          >
            Deauth &quot;{ap.essid}&quot;
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close deauth dialog"
            className="rounded p-1 text-[#9ca3b2] hover:bg-[#32353e] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onStartDeauth({
              bssid: ap.bssid,
              clients: mode === 'selection' ? checkedMacs : null,
              rate,
              disassoc,
            });
            onClose();
          }}
          className="space-y-3 p-4"
        >
          {/* Rate & Disassoc Frame */}
          <div className="space-y-3 rounded border border-[#333640] bg-[#1e2025] p-3">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="deauth-rate-input"
                className="text-xs font-medium text-[#d6dbe5]"
              >
                Rate (pkt/s)
              </label>
              <input
                id="deauth-rate-input"
                type="number"
                min={1}
                max={1000}
                step={1}
                value={rate}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10);
                  setRate(Number.isNaN(val) ? 1 : Math.min(1000, Math.max(1, val)));
                }}
                className="w-24 rounded border border-[#3d414b] bg-[#17181c] px-2.5 py-1 text-right font-mono text-xs text-[#eceff4] tabular-nums focus:border-[#e86f33] focus:outline-none"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#d6dbe5]">
              <input
                type="checkbox"
                checked={disassoc}
                onChange={(e) => setDisassoc(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[#e86f33]"
              />
              <span>Send disassociation frames</span>
            </label>
          </div>

          {/* Client target selection frame */}
          <div className="space-y-2 rounded border border-[#333640] bg-[#1e2025] p-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#e5e9f0]">
              <input
                type="radio"
                name="deauth-target-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
                className="accent-[#e86f33]"
              />
              <span>Deauth all clients</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#e5e9f0]">
              <input
                type="radio"
                name="deauth-target-mode"
                checked={mode === 'selection'}
                onChange={() => setMode('selection')}
                className="accent-[#e86f33]"
              />
              <span>Deauth selected clients</span>
            </label>

            <div className="mt-2 max-h-48 overflow-auto rounded border border-[#2f323b] bg-[#17181c]">
              <div className="border-b border-[#2b2e36] bg-[#212329] px-2.5 py-1 text-[11px] font-medium text-[#9ca3b2]">
                Clients ({clientList.length})
              </div>
              {clientList.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[#7c8494]">
                  No associated clients discovered on this AP.
                </div>
              ) : (
                <ul className="divide-y divide-[#23252c]">
                  {clientList.map((cli) => {
                    const checked = Boolean(selectedClients[cli.mac]);
                    return (
                      <li key={cli.mac}>
                        <label
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs ${
                            mode === 'all'
                              ? 'cursor-not-allowed opacity-45'
                              : 'cursor-pointer hover:bg-[#23262e]'
                          }`}
                        >
                          <span className="flex items-center gap-2 font-mono text-[#e2e6ef] tabular-nums">
                            <input
                              type="checkbox"
                              disabled={mode === 'all'}
                              checked={checked}
                              onChange={(e) =>
                                setSelectedClients((prev) => ({
                                  ...prev,
                                  [cli.mac]: e.target.checked,
                                }))
                              }
                              className="h-3.5 w-3.5 rounded accent-[#e86f33]"
                            />
                            {cli.mac}
                          </span>
                          <span className="truncate text-[11px] text-[#8a91a0]">
                            {cli.vendor}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full rounded py-2 text-xs font-semibold transition-colors ${
              canSubmit
                ? 'bg-[#dc2626] text-white hover:bg-[#b91c1c]'
                : 'cursor-not-allowed bg-[#2e3036] text-[#6d7484]'
            }`}
          >
            Deauth
          </button>
        </form>
      </div>
    </div>
  );
}
