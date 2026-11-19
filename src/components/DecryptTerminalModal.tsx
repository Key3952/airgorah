import { useState, useEffect } from 'react';
import { X, Square, Terminal } from 'lucide-react';
import type { DecryptJob } from '../types';

interface DecryptTerminalModalProps {
  job: DecryptJob | null;
  onClose: () => void;
}

export function DecryptTerminalModal({
  job,
  onClose,
}: DecryptTerminalModalProps) {
  const [testedCount, setTestedCount] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [status, setStatus] = useState<'running' | 'found' | 'exhausted' | 'stopped'>('running');
  const [foundKey, setFoundKey] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!job) return;
    setTestedCount(0);
    setCurrentWord('');
    setStatus('running');
    setFoundKey(null);
    setElapsedSec(0);

    const candidateWords =
      job.mode === 'dictionary' && job.words && job.words.length > 0
        ? job.words
        : [
            'aaaaaaaa',
            'aaaaaaab',
            'aaaa1234',
            'lab00001',
            'pass2026',
            'wifi9988',
            ...(job.demoPassphrase ? [job.demoPassphrase] : []),
          ];

    const targetPass = job.demoPassphrase ?? '';
    const matchIndex =
      job.mode === 'dictionary'
        ? candidateWords.findIndex((w) => w === targetPass)
        : targetPass &&
            job.charset &&
            targetPass.length >= (job.minLen ?? 8) &&
            targetPass.length <= (job.maxLen ?? 64) &&
            [...targetPass].every((ch) => job.charset!.includes(ch))
          ? candidateWords.length - 1
          : -1;

    let step = 0;
    const totalSteps = matchIndex >= 0 ? Math.min(matchIndex + 1, 14) : 14;

    const timer = window.setInterval(() => {
      step += 1;
      setElapsedSec((s) => Number((s + 0.18).toFixed(2)));
      setTestedCount(step * 412);

      if (step >= totalSteps) {
        window.clearInterval(timer);
        if (matchIndex >= 0 && targetPass) {
          setCurrentWord(targetPass);
          setFoundKey(targetPass);
          setStatus('found');
        } else {
          setCurrentWord(
            candidateWords[candidateWords.length - 1] ?? 'zzzzzzzz'
          );
          setStatus('exhausted');
        }
      } else {
        const sampleWord =
          candidateWords[step % Math.max(1, candidateWords.length - 1)] ??
          'testing...';
        setCurrentWord(sampleWord);
      }
    }, 180);

    return () => window.clearInterval(timer);
  }, [job]);

  if (!job) return null;

  const commandLine =
    job.mode === 'dictionary'
      ? `aircrack-ng '${job.captureFilename}' -b '${job.bssid}' -w '${job.wordlistName}'`
      : `crunch ${job.minLen} ${job.maxLen} '${job.charset}' | aircrack-ng -w - -b '${job.bssid}' '${job.captureFilename}'`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terminal-modal-title"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-[#3a3e48] bg-[#141619] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2c2f38] bg-[#22242a] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#eceff4]">
            <Terminal className="h-4 w-4 text-[#e86f33]" />
            <span id="terminal-modal-title">
              WPA Decryption ({job.essid})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close decryption terminal"
            className="rounded p-1 text-[#9ca3b2] hover:bg-[#32353e] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4 font-mono text-xs leading-relaxed text-[#d4d9e3]">
          <div className="break-all text-[#8b95a7]">$ {commandLine}</div>
          <div className="border-t border-[#262932] pt-3">
            <div className="text-[#eceff4]">
              Aircrack-ng 1.7 (Web Audit Sandbox)
            </div>
            <div className="mt-2 tabular-nums">
              [{elapsedSec.toFixed(2)}s] {testedCount.toLocaleString()} keys tested (2,288.41 k/s)
            </div>
            <div className="mt-1">
              Target BSSID:{' '}
              <span className="text-[#f3f4f6]">{job.bssid}</span> · ESSID:{' '}
              <span className="text-[#f3f4f6]">{job.essid}</span>
            </div>
            <div className="mt-1">
              Current passphrase:{' '}
              <span className="text-[#facc15]">{currentWord || '...'}</span>
            </div>
            <div className="mt-3 space-y-1 text-[11px] text-[#9aa3b2]">
              <div>
                Master Key     : 8A 3F 19 C4 7E 20 91 B8 D4 52 10 7A 6C E3 41 09
              </div>
              <div>
                Transient Key  : 14 7C E8 29 B5 0A 63 4F 9D 22 C1 88 30 F4 7B 5E
              </div>
              <div>
                EAPOL HMAC     : 5D 91 0C 4E 7A B2 18 F6 33 6A 9E 40 C2 11 8B 77
              </div>
            </div>

            {status === 'found' && foundKey && (
              <div
                data-testid="decrypt-result-found"
                className="mt-4 rounded border border-[#15803d] bg-[#14532d]/40 px-3 py-2 text-[#86efac]"
              >
                KEY FOUND! [ {foundKey} ]
              </div>
            )}

            {status === 'exhausted' && (
              <div
                data-testid="decrypt-result-exhausted"
                className="mt-4 rounded border border-[#b45309] bg-[#78350f]/35 px-3 py-2 text-[#fcd34d]"
              >
                Passphrase not in dictionary / keyspace exhausted.
              </div>
            )}

            {status === 'stopped' && (
              <div className="mt-4 rounded border border-[#4b5563] bg-[#1f2937] px-3 py-2 text-[#d1d5db]">
                Decryption process interrupted by user.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#2c2f38] bg-[#1d1f24] px-4 py-2.5">
          {status === 'running' && (
            <button
              type="button"
              onClick={() => setStatus('stopped')}
              className="inline-flex items-center gap-1.5 rounded border border-[#b91c1c] bg-[#7f1d1d] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#991b1b]"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#3d414b] bg-[#2e3036] px-4 py-1.5 text-xs font-medium text-[#eceff4] hover:bg-[#3a3d45]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
