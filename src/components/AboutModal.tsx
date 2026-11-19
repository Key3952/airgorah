import { X } from 'lucide-react';
import { AIRGORAH_VERSION } from '../lib/seedData';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

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
            <p className="mt-0.5 font-mono text-xs text-[#9aa1ae]">
              Version {AIRGORAH_VERSION} · Web Workbench
            </p>
            <p className="mt-2 text-xs text-[#d1d5de]">
              A WiFi security auditing software for wireless traffic inspection,
              station discovery, deauthentication testing, handshake and PMKID
              capture, and WPA decryption workflows.
            </p>
          </div>

          <div className="space-y-1 rounded border border-[#31343d] bg-[#1c1e23] p-3 text-left text-xs text-[#a5adb9]">
            <p>
              <strong className="text-[#e5e9f0]">Original Author:</strong>{' '}
              Martin OLIVIER (MIT License)
            </p>
            <p>
              <strong className="text-[#e5e9f0]">Runtime Notice:</strong> Linux
              monitor-mode packet injection and raw sockets are simulated in
              this browser sandbox with deterministic wireless lab datasets.
            </p>
            <p>
              <strong className="text-[#e5e9f0]">Legal:</strong> Designed
              exclusively for auditing networks you own or have explicit
              authorization to test.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            <a
              href="https://github.com/martin-olivier/airgorah"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[#e86f33] hover:underline"
            >
              github.com/martin-olivier/airgorah
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
