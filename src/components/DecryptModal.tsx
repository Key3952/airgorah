import React, { useState, useEffect, useRef } from 'react';
import { X, SlidersHorizontal, Upload, Wifi } from 'lucide-react';
import type {
  AccessPoint,
  CrackableTarget,
  DecryptJob,
  SavedCapture,
} from '../types';
import { BUILTIN_WORDLISTS } from '../lib/seedData';
import { buildCharsetString, dedupeCharset } from '../lib/channel';

interface DecryptModalProps {
  isOpen: boolean;
  preselectedTarget: { captureFilename: string; ap: AccessPoint } | null;
  savedCaptures: SavedCapture[];
  liveCrackableAps: AccessPoint[];
  onClose: () => void;
  onStartJob: (job: DecryptJob) => void;
}

export function DecryptModal({
  isOpen,
  preselectedTarget,
  savedCaptures,
  liveCrackableAps,
  onClose,
  onStartJob,
}: DecryptModalProps) {
  const [mode, setMode] = useState<'dictionary' | 'bruteforce'>('dictionary');
  const [selectedCaptureId, setSelectedCaptureId] = useState<string>('');
  const [uploadedCaptureName, setUploadedCaptureName] = useState<string | null>(null);
  const [selectedTargetBssid, setSelectedTargetBssid] = useState<string>('');

  // Dictionary state
  const [selectedWordlistId, setSelectedWordlistId] = useState<string>(
    BUILTIN_WORDLISTS[0].id
  );
  const [customWordlist, setCustomWordlist] = useState<{
    name: string;
    words: string[];
  } | null>(null);

  // Bruteforce state
  const [lowercase, setLowercase] = useState<boolean>(false);
  const [uppercase, setUppercase] = useState<boolean>(false);
  const [numbers, setNumbers] = useState<boolean>(false);
  const [symbols, setSymbols] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [customCharset, setCustomCharset] = useState<string>('');
  const [minLen, setMinLen] = useState<number>(8);
  const [maxLen, setMaxLen] = useState<number>(10);

  const wordlistInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  // Build available capture list (live session + saved captures)
  const availableCaptures: SavedCapture[] = [
    ...(liveCrackableAps.length > 0
      ? [
          {
            id: '__live_session__',
            filename: 'live_session_capture.cap',
            createdAt: 'Current session',
            targets: liveCrackableAps.map((ap) => ({
              bssid: ap.bssid,
              essid: ap.essid,
              hasHandshake: ap.handshake,
              hasPmkid: ap.pmkid,
              demoPassphrase: ap.demoPassphrase,
            })),
          },
        ]
      : []),
    ...savedCaptures,
  ];

  useEffect(() => {
    if (!isOpen) return;
    setMode('dictionary');
    setShowAdvanced(false);
    setLowercase(false);
    setUppercase(false);
    setNumbers(false);
    setSymbols(false);
    setCustomCharset('');
    setMinLen(8);
    setMaxLen(10);
    setCustomWordlist(null);
    setUploadedCaptureName(null);
    setSelectedWordlistId(BUILTIN_WORDLISTS[0].id);

    if (preselectedTarget) {
      setSelectedCaptureId('__preselected__');
      setSelectedTargetBssid(preselectedTarget.ap.bssid);
    } else if (availableCaptures.length > 0) {
      setSelectedCaptureId(availableCaptures[0].id);
      setSelectedTargetBssid(availableCaptures[0].targets[0]?.bssid ?? '');
    } else {
      setSelectedCaptureId('');
      setSelectedTargetBssid('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preselectedTarget?.ap.bssid]);

  if (!isOpen) return null;

  const isLockedToPreselected = Boolean(preselectedTarget);

  let currentTargets: CrackableTarget[] = [];
  let currentCaptureFilename = '';

  if (preselectedTarget) {
    currentCaptureFilename = preselectedTarget.captureFilename;
    currentTargets = [
      {
        bssid: preselectedTarget.ap.bssid,
        essid: preselectedTarget.ap.essid,
        hasHandshake: preselectedTarget.ap.handshake,
        hasPmkid: preselectedTarget.ap.pmkid,
        demoPassphrase: preselectedTarget.ap.demoPassphrase,
      },
    ];
  } else if (uploadedCaptureName) {
    currentCaptureFilename = uploadedCaptureName;
    currentTargets = liveCrackableAps.map((ap) => ({
      bssid: ap.bssid,
      essid: ap.essid,
      hasHandshake: ap.handshake,
      hasPmkid: ap.pmkid,
      demoPassphrase: ap.demoPassphrase,
    }));
  } else {
    const cap = availableCaptures.find((c) => c.id === selectedCaptureId);
    if (cap) {
      currentCaptureFilename = cap.filename;
      currentTargets = cap.targets;
    }
  }

  const chosenTarget =
    currentTargets.find((t) => t.bssid === selectedTargetBssid) ??
    currentTargets[0] ??
    null;

  const hasCustomCharset = customCharset.length > 0;
  const charsetString = buildCharsetString({
    custom: customCharset,
    lowercase,
    uppercase,
    numbers,
    symbols,
  });

  const activeWordlist = customWordlist
    ? { name: customWordlist.name, words: customWordlist.words }
    : BUILTIN_WORDLISTS.find((w) => w.id === selectedWordlistId) ??
      BUILTIN_WORDLISTS[0];

  const canStart =
    Boolean(currentCaptureFilename) &&
    Boolean(chosenTarget) &&
    (mode === 'dictionary'
      ? Boolean(activeWordlist && activeWordlist.words.length > 0)
      : charsetString.length > 0 && minLen <= maxLen);

  const handleWordlistUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const words = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 50000);
    setCustomWordlist({ name: file.name, words });
  };

  const handleCaptureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedCaptureName(file.name);
    setSelectedCaptureId('__uploaded__');
    if (liveCrackableAps.length > 0) {
      setSelectedTargetBssid(liveCrackableAps[0].bssid);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decrypt-modal-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-[#3a3e48] bg-[#24262b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#333640] px-4 py-3">
          <h2
            id="decrypt-modal-title"
            className="text-sm font-semibold text-[#f1f3f7]"
          >
            WPA Decryption
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close WPA decryption dialog"
            className="rounded p-1 text-[#9ca3b2] hover:bg-[#32353e] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canStart || !chosenTarget) return;
            onStartJob({
              mode,
              captureFilename: currentCaptureFilename,
              bssid: chosenTarget.bssid,
              essid: chosenTarget.essid,
              wordlistName:
                mode === 'dictionary' ? activeWordlist.name : undefined,
              words: mode === 'dictionary' ? activeWordlist.words : undefined,
              charset: mode === 'bruteforce' ? charsetString : undefined,
              minLen: mode === 'bruteforce' ? minLen : undefined,
              maxLen: mode === 'bruteforce' ? maxLen : undefined,
              demoPassphrase: chosenTarget.demoPassphrase,
            });
            onClose();
          }}
          className="space-y-3.5 p-4"
        >
          {/* Mode Stack Switcher */}
          <div
            role="tablist"
            aria-label="Decryption mode"
            className="grid grid-cols-2 gap-1 rounded border border-[#333640] bg-[#1a1b1f] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'dictionary'}
              onClick={() => setMode('dictionary')}
              className={`rounded py-1.5 text-xs font-medium transition-colors ${
                mode === 'dictionary'
                  ? 'bg-[#343842] text-white'
                  : 'text-[#9aa1ae] hover:text-[#e5e9f0]'
              }`}
            >
              Dictionary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'bruteforce'}
              onClick={() => setMode('bruteforce')}
              className={`rounded py-1.5 text-xs font-medium transition-colors ${
                mode === 'bruteforce'
                  ? 'bg-[#343842] text-white'
                  : 'text-[#9aa1ae] hover:text-[#e5e9f0]'
              }`}
            >
              Bruteforce
            </button>
          </div>

          {/* Mode Panel */}
          {mode === 'dictionary' ? (
            <fieldset className="space-y-2 rounded border border-[#333640] bg-[#1e2025] p-3">
              <legend className="px-1 text-[11px] font-medium text-[#9ca3b2]">
                Wordlist
              </legend>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Wordlist selection"
                  value={customWordlist ? '__custom__' : selectedWordlistId}
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') {
                      setCustomWordlist(null);
                      setSelectedWordlistId(e.target.value);
                    }
                  }}
                  className="flex-1 rounded border border-[#3d414b] bg-[#17181c] px-2.5 py-1.5 font-mono text-xs text-[#eceff4] focus:border-[#e86f33] focus:outline-none"
                >
                  {customWordlist && (
                    <option value="__custom__">
                      {customWordlist.name} ({customWordlist.words.length} entries)
                    </option>
                  )}
                  {BUILTIN_WORDLISTS.map((wl) => (
                    <option key={wl.id} value={wl.id}>
                      {wl.name} ({wl.sizeLabel})
                    </option>
                  ))}
                </select>

                <input
                  ref={wordlistInputRef}
                  type="file"
                  accept=".txt,.lst,.dic"
                  onChange={handleWordlistUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => wordlistInputRef.current?.click()}
                  title="Load local wordlist file"
                  aria-label="Load local wordlist file"
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-[#3d414b] bg-[#2e3036] px-2.5 text-xs text-[#e2e5ec] hover:bg-[#3a3d45]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Browse</span>
                </button>
              </div>
            </fieldset>
          ) : (
            <fieldset className="space-y-3 rounded border border-[#333640] bg-[#1e2025] p-3">
              <legend className="px-1 text-[11px] font-medium text-[#9ca3b2]">
                Charset
              </legend>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  {[
                    { label: 'Lowercase', checked: lowercase, set: setLowercase },
                    { label: 'Uppercase', checked: uppercase, set: setUppercase },
                    { label: 'Numbers', checked: numbers, set: setNumbers },
                    { label: 'Symbols', checked: symbols, set: setSymbols },
                  ].map((item) => (
                    <label
                      key={item.label}
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        hasCustomCharset
                          ? 'cursor-not-allowed text-[#6a7180]'
                          : 'cursor-pointer text-[#e2e5ec]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={hasCustomCharset}
                        checked={item.checked}
                        onChange={(e) => item.set(e.target.checked)}
                        className="h-3.5 w-3.5 rounded accent-[#e86f33]"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                  title="Bruteforce advanced settings"
                  aria-label="Bruteforce advanced settings"
                  className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-xs transition-colors ${
                    showAdvanced
                      ? 'border-[#e86f33] bg-[#e86f33]/15 text-[#f7b18c]'
                      : 'border-[#3d414b] bg-[#2b2e35] text-[#d1d5de] hover:bg-[#363a43]'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Advanced</span>
                </button>
              </div>

              {showAdvanced && (
                <div className="space-y-3 border-t border-[#2f323b] pt-3">
                  <div>
                    <label
                      htmlFor="custom-charset-input"
                      className="mb-1 block text-[11px] font-medium text-[#9ca3b2]"
                    >
                      Custom charset (duplicates removed automatically)
                    </label>
                    <input
                      id="custom-charset-input"
                      type="text"
                      placeholder="ex: 123456789AB#*"
                      value={customCharset}
                      onChange={(e) =>
                        setCustomCharset(dedupeCharset(e.target.value))
                      }
                      className="w-full rounded border border-[#3d414b] bg-[#17181c] px-2.5 py-1.5 font-mono text-xs text-[#eceff4] placeholder:font-sans placeholder:text-[#666d7c] focus:border-[#e86f33] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-[11px] font-medium text-[#9ca3b2]">
                      Password length
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-[#d6dbe5]">
                      <span>Min</span>
                      <input
                        type="number"
                        min={8}
                        max={64}
                        value={minLen}
                        onChange={(e) => {
                          const v = Math.min(
                            64,
                            Math.max(8, Number.parseInt(e.target.value, 10) || 8)
                          );
                          setMinLen(v);
                          if (v > maxLen) setMaxLen(v);
                        }}
                        className="w-16 rounded border border-[#3d414b] bg-[#17181c] px-2 py-1 text-right font-mono text-xs tabular-nums focus:border-[#e86f33] focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-[#d6dbe5]">
                      <span>Max</span>
                      <input
                        type="number"
                        min={8}
                        max={64}
                        value={maxLen}
                        onChange={(e) => {
                          const v = Math.min(
                            64,
                            Math.max(8, Number.parseInt(e.target.value, 10) || 8)
                          );
                          setMaxLen(v);
                          if (v < minLen) setMinLen(v);
                        }}
                        className="w-16 rounded border border-[#3d414b] bg-[#17181c] px-2 py-1 text-right font-mono text-xs tabular-nums focus:border-[#e86f33] focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              )}
            </fieldset>
          )}

          {/* Capture file frame */}
          <fieldset className="space-y-2 rounded border border-[#333640] bg-[#1e2025] p-3">
            <legend className="px-1 text-[11px] font-medium text-[#9ca3b2]">
              Capture
            </legend>
            {isLockedToPreselected ? (
              <input
                type="text"
                readOnly
                disabled
                aria-label="Selected capture file"
                value={currentCaptureFilename}
                className="w-full cursor-not-allowed rounded border border-[#2f323b] bg-[#17181c] px-2.5 py-1.5 font-mono text-xs text-[#9aa1ae]"
              />
            ) : (
              <div className="flex items-center gap-2">
                <select
                  aria-label="Capture file selection"
                  value={selectedCaptureId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setUploadedCaptureName(null);
                    setSelectedCaptureId(id);
                    const cap = availableCaptures.find((c) => c.id === id);
                    setSelectedTargetBssid(cap?.targets[0]?.bssid ?? '');
                  }}
                  className="flex-1 rounded border border-[#3d414b] bg-[#17181c] px-2.5 py-1.5 font-mono text-xs text-[#eceff4] focus:border-[#e86f33] focus:outline-none"
                >
                  {uploadedCaptureName && (
                    <option value="__uploaded__">{uploadedCaptureName}</option>
                  )}
                  {availableCaptures.length === 0 ? (
                    <option value="">No captures with handshakes/PMKIDs</option>
                  ) : (
                    availableCaptures.map((cap) => (
                      <option key={cap.id} value={cap.id}>
                        {cap.filename} ({cap.targets.length} crackable)
                      </option>
                    ))
                  )}
                </select>
                <input
                  ref={captureInputRef}
                  type="file"
                  accept=".cap,.pcap,.pcapng"
                  onChange={handleCaptureUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => captureInputRef.current?.click()}
                  title="Load .cap file"
                  aria-label="Load capture file"
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-[#3d414b] bg-[#2e3036] px-2.5 text-xs text-[#e2e5ec] hover:bg-[#3a3d45]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Open</span>
                </button>
              </div>
            )}
          </fieldset>

          {/* Target AP frame */}
          <fieldset className="space-y-2 rounded border border-[#333640] bg-[#1e2025] p-3">
            <legend className="px-1 text-[11px] font-medium text-[#9ca3b2]">
              Target
            </legend>
            <div className="relative">
              <Wifi className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3b2]" />
              <select
                aria-label="Target access point"
                disabled={isLockedToPreselected || currentTargets.length === 0}
                value={chosenTarget?.bssid ?? ''}
                onChange={(e) => setSelectedTargetBssid(e.target.value)}
                className="w-full rounded border border-[#3d414b] bg-[#17181c] py-1.5 pr-3 pl-8 text-xs text-[#eceff4] focus:border-[#e86f33] focus:outline-none disabled:cursor-not-allowed disabled:text-[#8a91a0]"
              >
                {currentTargets.length === 0 ? (
                  <option value="">No valid handshake or PMKID target</option>
                ) : (
                  currentTargets.map((t) => (
                    <option key={t.bssid} value={t.bssid}>
                      {t.essid} ({t.bssid}) —{' '}
                      {[t.hasHandshake ? 'Handshake' : '', t.hasPmkid ? 'PMKID' : '']
                        .filter(Boolean)
                        .join(' + ')}
                    </option>
                  ))
                )}
              </select>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={!canStart}
            className={`w-full rounded py-2 text-xs font-semibold transition-colors ${
              canStart
                ? 'bg-[#e86f33] text-white hover:bg-[#d96126]'
                : 'cursor-not-allowed bg-[#2e3036] text-[#6d7484]'
            }`}
          >
            Start Decryption
          </button>
        </form>
      </div>
    </div>
  );
}
