import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { MacMode, Settings } from '../types';
import { isValidMacAddress } from '../lib/channel';

interface SettingsModalProps {
  isOpen: boolean;
  settings: Settings;
  isChannelLocked: boolean;
  onSave: (next: Settings) => void;
  onClose: () => void;
}

export function SettingsModal({
  isOpen,
  settings,
  isChannelLocked,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [macMode, setMacMode] = useState<MacMode>('random');
  const [specificMac, setSpecificMac] = useState<string>('');
  const [displayHiddenAp, setDisplayHiddenAp] = useState<boolean>(true);
  const [killNetworkManager, setKillNetworkManager] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;
    if (settings.macAddress === 'random') {
      setMacMode('random');
      setSpecificMac('');
    } else if (settings.macAddress === 'default') {
      setMacMode('default');
      setSpecificMac('');
    } else {
      setMacMode('specific');
      setSpecificMac(settings.macAddress);
    }
    setDisplayHiddenAp(settings.displayHiddenAp);
    setKillNetworkManager(settings.killNetworkManager);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const isMacValid = macMode !== 'specific' || isValidMacAddress(specificMac);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-[#3a3e48] bg-[#24262b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#333640] px-4 py-3">
          <h2
            id="settings-modal-title"
            className="text-sm font-semibold text-[#f1f3f7]"
          >
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings dialog"
            className="rounded p-1 text-[#9ca3b2] hover:bg-[#32353e] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isMacValid) return;
            const macAddress =
              macMode === 'specific' ? specificMac.trim().toUpperCase() : macMode;
            onSave({
              macAddress,
              displayHiddenAp,
              killNetworkManager,
            });
            onClose();
          }}
          className="space-y-3.5 p-4"
        >
          {/* MAC Frame */}
          <fieldset className="space-y-2 rounded border border-[#333640] bg-[#1e2025] p-3">
            <legend className="px-1 text-[11px] font-medium text-[#9ca3b2]">
              MAC
            </legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#e5e9f0]">
              <input
                type="radio"
                name="mac-mode"
                checked={macMode === 'random'}
                onChange={() => setMacMode('random')}
                className="accent-[#e86f33]"
              />
              <span>Random MAC address</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#e5e9f0]">
              <input
                type="radio"
                name="mac-mode"
                checked={macMode === 'default'}
                onChange={() => setMacMode('default')}
                className="accent-[#e86f33]"
              />
              <span>Default MAC address</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#e5e9f0]">
              <input
                type="radio"
                name="mac-mode"
                checked={macMode === 'specific'}
                onChange={() => setMacMode('specific')}
                className="accent-[#e86f33]"
              />
              <span>Specific MAC address</span>
            </label>

            <input
              type="text"
              aria-label="Specific MAC address value"
              placeholder="ex: 00:00:01:02:03:04"
              disabled={macMode !== 'specific'}
              value={specificMac}
              onChange={(e) => setSpecificMac(e.target.value)}
              className={`mt-1 w-full rounded border bg-[#17181c] px-2.5 py-1.5 font-mono text-xs transition-colors placeholder:font-sans placeholder:text-[#666d7c] focus:outline-none ${
                macMode !== 'specific'
                  ? 'cursor-not-allowed border-[#2c2f38] text-[#6a7180]'
                  : !isMacValid
                    ? 'border-[#ef4444] text-[#f87171]'
                    : 'border-[#3d414b] text-[#eceff4] focus:border-[#e86f33]'
              }`}
            />
            {macMode === 'specific' && !isMacValid && (
              <p className="text-[11px] text-[#f87171]">
                Enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF).
              </p>
            )}
          </fieldset>

          {/* Display Frame */}
          <fieldset className="rounded border border-[#333640] bg-[#1e2025] p-3">
            <legend className="px-1 text-[11px] font-medium text-[#9ca3b2]">
              Display
            </legend>
            <label
              title={
                isChannelLocked
                  ? 'Locked while an active attack is running'
                  : undefined
              }
              className={`flex items-center gap-2 text-xs ${
                isChannelLocked
                  ? 'cursor-not-allowed text-[#6d7484]'
                  : 'cursor-pointer text-[#e5e9f0]'
              }`}
            >
              <input
                type="checkbox"
                disabled={isChannelLocked}
                checked={displayHiddenAp}
                onChange={(e) => setDisplayHiddenAp(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[#e86f33]"
              />
              <span>Display hidden APs</span>
            </label>
          </fieldset>

          {/* Process Frame */}
          <fieldset className="rounded border border-[#333640] bg-[#1e2025] p-3">
            <legend className="px-1 text-[11px] font-medium text-[#9ca3b2]">
              Process
            </legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#e5e9f0]">
              <input
                type="checkbox"
                checked={killNetworkManager}
                onChange={(e) => setKillNetworkManager(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[#e86f33]"
              />
              <span>Kill network managers</span>
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={!isMacValid}
            className={`w-full rounded py-2 text-xs font-semibold transition-colors ${
              isMacValid
                ? 'bg-[#e86f33] text-white hover:bg-[#d96126]'
                : 'cursor-not-allowed bg-[#2e3036] text-[#6d7484]'
            }`}
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
