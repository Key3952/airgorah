import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  AccessPoint,
  ApSortField,
  AttackState,
  Client,
  ClientSortField,
  DecryptJob,
  NotificationToast,
  SavedCapture,
  Settings,
  SortDirection,
  WirelessInterface,
} from './types';
import {
  DEFAULT_SETTINGS,
  SIMULATED_INTERFACES,
  createExtraDiscoverableAps,
  createSeedAccessPoints,
  createSeedUnlinkedClients,
} from './lib/seedData';
import {
  generateRandomMac,
  isValidChannelFilter,
  parseChannelEntries,
} from './lib/channel';
import {
  buildJsonReport,
  buildPcapCaptureBuffer,
  computeAttackChannelLock,
  formatExportStamp,
  sortAccessPoints,
  sortClients,
  stepScanTick,
} from './lib/auditEngine';
import { Toolbar } from './components/Toolbar';
import { AccessPointsTable } from './components/AccessPointsTable';
import { ClientsTable } from './components/ClientsTable';
import { InterfaceModal } from './components/InterfaceModal';
import { DeauthModal } from './components/DeauthModal';
import { DecryptModal } from './components/DecryptModal';
import { DecryptTerminalModal } from './components/DecryptTerminalModal';
import { SettingsModal } from './components/SettingsModal';
import { AboutModal } from './components/AboutModal';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const SETTINGS_STORAGE_KEY = 'airgorah_web_settings_v1';

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      macAddress:
        typeof parsed.macAddress === 'string' && parsed.macAddress.length > 0
          ? parsed.macAddress
          : DEFAULT_SETTINGS.macAddress,
      displayHiddenAp:
        typeof parsed.displayHiddenAp === 'boolean'
          ? parsed.displayHiddenAp
          : DEFAULT_SETTINGS.displayHiddenAp,
      killNetworkManager:
        typeof parsed.killNetworkManager === 'boolean'
          ? parsed.killNetworkManager
          : DEFAULT_SETTINGS.killNetworkManager,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function App() {
  const [interfaces, setInterfaces] = useState<WirelessInterface[]>(
    SIMULATED_INTERFACES
  );
  const [selectedIfaceName, setSelectedIfaceName] = useState<string | null>(
    SIMULATED_INTERFACES[0].name
  );
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Scan & capture state
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [ghz24, setGhz24] = useState<boolean>(true);
  const [ghz5, setGhz5] = useState<boolean>(true);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [currentChannel, setCurrentChannel] = useState<number | null>(44);
  const [hopIndex, setHopIndex] = useState<number>(0);

  const [aps, setAps] = useState<Record<string, AccessPoint>>(
    createSeedAccessPoints
  );
  const [unlinkedClients, setUnlinkedClients] = useState<Record<string, Client>>(
    createSeedUnlinkedClients
  );
  const [attacks, setAttacks] = useState<Record<string, AttackState>>({});
  const [wasChannelLocked, setWasChannelLocked] = useState<boolean>(false);

  // Selection & Sorting
  const [selectedBssid, setSelectedBssid] = useState<string | null>(null);
  const [apSort, setApSort] = useState<{
    field: ApSortField;
    direction: SortDirection;
  }>({ field: 'power', direction: 'desc' });
  const [clientSort, setClientSort] = useState<{
    field: ClientSortField;
    direction: SortDirection;
  }>({ field: 'packets', direction: 'desc' });

  // Resizable vertical split pane ratio (percentage for AP pane)
  const [splitRatio, setSplitRatio] = useState<number>(62);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef<boolean>(false);

  // Saved captures & Modals
  const [savedCaptures, setSavedCaptures] = useState<SavedCapture[]>([]);
  const [showInterfaceModal, setShowInterfaceModal] = useState<boolean>(false);
  const [deauthTargetAp, setDeauthTargetAp] = useState<AccessPoint | null>(null);
  const [showDecryptModal, setShowDecryptModal] = useState<boolean>(false);
  const [decryptPreselect, setDecryptPreselect] = useState<{
    captureFilename: string;
    ap: AccessPoint;
  } | null>(null);
  const [activeDecryptJob, setActiveDecryptJob] = useState<DecryptJob | null>(
    null
  );
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);

  // Seed pool for re-discovery after Restart Scan
  const seedPoolRef = useRef<AccessPoint[]>([
    ...Object.values(createSeedAccessPoints()),
    ...createExtraDiscoverableAps(),
  ]);

  const pushToast = useCallback(
    (title: string, message: string, tone: NotificationToast['tone'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, title, message, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const selectedInterface = useMemo(
    () => interfaces.find((i) => i.name === selectedIfaceName) ?? null,
    [interfaces, selectedIfaceName]
  );

  const isChannelLocked = Object.keys(attacks).length > 0;
  const isFilterValid = isValidChannelFilter(channelFilter, ghz24, ghz5);

  // Sync channel lock from active attacks (exact Airgorah Rust behavior)
  useEffect(() => {
    const { nextFilter, isLocked } = computeAttackChannelLock(
      channelFilter,
      attacks,
      wasChannelLocked
    );
    if (nextFilter !== channelFilter) {
      setChannelFilter(nextFilter);
    }
    if (isLocked !== wasChannelLocked) {
      setWasChannelLocked(isLocked);
    }
  }, [attacks, channelFilter, wasChannelLocked]);

  // Live scanning tick loop
  useEffect(() => {
    if (!isScanning || !selectedIfaceName || (!ghz24 && !ghz5)) {
      if (!isScanning) setCurrentChannel(null);
      return;
    }

    const interval = window.setInterval(() => {
      setHopIndex((prevHop) => prevHop + 1);
    }, 1100);

    return () => window.clearInterval(interval);
  }, [isScanning, selectedIfaceName, ghz24, ghz5]);

  // Apply scan tick on hopIndex changes
  useEffect(() => {
    if (hopIndex === 0 || !isScanning || !selectedIfaceName) return;

    const result = stepScanTick({
      aps,
      unlinkedClients,
      attacks,
      ghz24,
      ghz5,
      channelFilter,
      hopIndex,
      seedPool: seedPoolRef.current,
    });

    setAps(result.aps);
    setUnlinkedClients(result.unlinkedClients);
    setAttacks(result.attacks);
    setCurrentChannel(result.currentChannel);

    for (const captured of result.newlyCaptured) {
      pushToast(
        `${captured.kind} captured`,
        `${captured.essid} (${captured.bssid})`,
        'success'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hopIndex]);

  // Escape key clears selection (exact Airgorah behavior)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (
        showInterfaceModal ||
        deauthTargetAp ||
        showDecryptModal ||
        activeDecryptJob ||
        showSettingsModal ||
        showAboutModal
      ) {
        setShowInterfaceModal(false);
        setDeauthTargetAp(null);
        setShowDecryptModal(false);
        setActiveDecryptJob(null);
        setShowSettingsModal(false);
        setShowAboutModal(false);
        return;
      }
      setSelectedBssid(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showInterfaceModal,
    deauthTargetAp,
    showDecryptModal,
    activeDecryptJob,
    showSettingsModal,
    showAboutModal,
  ]);

  // Split pane pointer drag handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitRatio(Math.min(82, Math.max(25, pct)));
    };
    const onMouseUp = () => {
      isDraggingSplit.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Visible sorted Access Points
  const visibleAps = useMemo(() => {
    const filtered = Object.values(aps).filter(
      (ap) => settings.displayHiddenAp || !ap.hidden
    );
    return sortAccessPoints(filtered, apSort.field, apSort.direction);
  }, [aps, settings.displayHiddenAp, apSort]);

  // Clear selection if selected AP is no longer visible
  useEffect(() => {
    if (selectedBssid && !visibleAps.some((a) => a.bssid === selectedBssid)) {
      setSelectedBssid(null);
    }
  }, [visibleAps, selectedBssid]);

  const selectedAp = selectedBssid ? aps[selectedBssid] ?? null : null;
  const selectedIndex = selectedBssid
    ? visibleAps.findIndex((a) => a.bssid === selectedBssid)
    : -1;

  // Visible sorted Clients (associated with selected AP or unassociated)
  const visibleClients = useMemo(() => {
    const raw = selectedAp
      ? Object.values(selectedAp.clients)
      : Object.values(unlinkedClients);
    return sortClients(raw, clientSort.field, clientSort.direction);
  }, [selectedAp, unlinkedClients, clientSort]);

  const liveCrackableAps = useMemo(
    () => Object.values(aps).filter((ap) => ap.handshake || ap.pmkid),
    [aps]
  );

  // Toolbar sensitivity calculations matching Airgorah
  const selectedAttack = selectedAp ? attacks[selectedAp.bssid] ?? null : null;
  const selectedIsDeauth = Boolean(
    selectedAttack &&
      (selectedAttack.target.kind === 'all' ||
        selectedAttack.target.kind === 'selection')
  );
  const selectedIsPmkid = Boolean(
    selectedAttack && selectedAttack.target.kind === 'pmkid'
  );

  const canFocusChannel = Boolean(
    selectedAp &&
      !isChannelLocked &&
      selectedAp.channel !== Number.parseInt(channelFilter, 10) &&
      isValidChannelFilter(String(selectedAp.channel), ghz24, ghz5)
  );

  const canAddChannel = useMemo(() => {
    if (!selectedAp || isChannelLocked) return false;
    if (!isValidChannelFilter(channelFilter, ghz24, ghz5)) return false;
    const entries = parseChannelEntries(channelFilter);
    if (entries.includes(selectedAp.channel)) return false;
    const next =
      entries.length > 0
        ? `${channelFilter},${selectedAp.channel}`
        : String(selectedAp.channel);
    return isValidChannelFilter(next, ghz24, ghz5);
  }, [selectedAp, isChannelLocked, channelFilter, ghz24, ghz5]);

  const triggerDownload = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCapture = () => {
    const allAps = Object.values(aps);
    if (allAps.length === 0) return;

    const filename = `capture_${formatExportStamp()}.cap`;
    const bytes = buildPcapCaptureBuffer(allAps);
    triggerDownload(
      filename,
      new Blob([bytes.buffer as ArrayBuffer], {
        type: 'application/vnd.tcpdump.pcap',
      })
    );

    const crackables = allAps
      .filter((a) => a.handshake || a.pmkid)
      .map((a) => ({
        bssid: a.bssid,
        essid: a.essid,
        hasHandshake: a.handshake,
        hasPmkid: a.pmkid,
        demoPassphrase: a.demoPassphrase,
      }));

    if (crackables.length > 0) {
      setSavedCaptures((prev) => [
        {
          id: `${Date.now()}`,
          filename,
          createdAt: formatExportStamp(),
          targets: crackables,
        },
        ...prev,
      ]);
      setAps((prev) => {
        const next = { ...prev };
        for (const t of crackables) {
          if (next[t.bssid]) {
            next[t.bssid] = { ...next[t.bssid], savedHandshake: filename };
          }
        }
        return next;
      });
    }

    pushToast('Capture saved', `Exported ${filename}`, 'success');
  };

  const handleExportReport = () => {
    if (Object.keys(aps).length === 0) return;
    const filename = `report_${formatExportStamp()}.json`;
    const json = buildJsonReport(aps, unlinkedClients);
    triggerDownload(
      filename,
      new Blob([json], { type: 'application/json' })
    );
    pushToast('Report saved', `Exported ${filename}`, 'success');
  };

  const handleToggleScan = () => {
    if (!selectedIfaceName) {
      setShowInterfaceModal(true);
      return;
    }
    setIsScanning((prev) => !prev);
  };

  const handleRestartScan = () => {
    if (!selectedIfaceName || isChannelLocked) return;
    setSelectedBssid(null);
    setAps({});
    setUnlinkedClients(createSeedUnlinkedClients());
    setIsScanning(true);
    pushToast('Scan restarted', 'Cleared table and resumed channel hopping');
  };

  const handleToggleGhz24 = () => {
    const next24 = !ghz24;
    setGhz24(next24);
    if (!next24 && !ghz5) {
      setIsScanning(false);
    }
  };

  const handleToggleGhz5 = () => {
    if (!selectedInterface) return;
    const next5 = !ghz5;
    if (next5 && !selectedInterface.supports5Ghz) {
      pushToast(
        '5 GHz unsupported',
        `Interface "${selectedInterface.name}" does not support 5 GHz`,
        'error'
      );
      return;
    }
    setGhz5(next5);
    if (!ghz24 && !next5) {
      setIsScanning(false);
    }
  };

  const handleSelectInterface = (ifaceName: string) => {
    const iface = interfaces.find((i) => i.name === ifaceName);
    if (!iface) return;
    setSelectedIfaceName(iface.name);
    if (!iface.supports5Ghz && ghz5) {
      setGhz5(false);
      if (!ghz24) setGhz24(true);
    }
    pushToast(
      'Monitor mode enabled',
      `${iface.name} active (${settings.macAddress} MAC)`,
      'info'
    );
  };

  const handleDeauthButton = () => {
    if (!selectedAp) return;
    if (selectedIsDeauth) {
      setAttacks((prev) => {
        const next = { ...prev };
        delete next[selectedAp.bssid];
        return next;
      });
      pushToast('Deauth stopped', `Stopped deauth on ${selectedAp.essid}`);
      return;
    }
    if (selectedIsPmkid) return;
    setDeauthTargetAp(selectedAp);
  };

  const handleStartDeauth = (params: {
    bssid: string;
    clients: string[] | null;
    rate: number;
    disassoc: boolean;
  }) => {
    const ap = aps[params.bssid];
    if (!ap) return;
    if (!isScanning) setIsScanning(true);
    setAttacks((prev) => ({
      ...prev,
      [ap.bssid]: {
        bssid: ap.bssid,
        essid: ap.essid,
        channel: ap.channel,
        target: params.clients
          ? { kind: 'selection', clients: params.clients }
          : { kind: 'all' },
        rate: params.rate,
        disassoc: params.disassoc,
        ticksElapsed: 0,
        packetsSent: 0,
      },
    }));
    pushToast(
      'Deauth started',
      `Channel locked to ${ap.channel} for ${ap.essid}`,
      'info'
    );
  };

  const handlePmkidButton = () => {
    if (!selectedAp) return;
    if (selectedIsPmkid) {
      setAttacks((prev) => {
        const next = { ...prev };
        delete next[selectedAp.bssid];
        return next;
      });
      pushToast(
        'PMKID solicitation stopped',
        `Stopped PMKID solicitation on ${selectedAp.essid}`
      );
      return;
    }
    if (selectedIsDeauth) return;
    if (!isScanning) setIsScanning(true);
    setAttacks((prev) => ({
      ...prev,
      [selectedAp.bssid]: {
        bssid: selectedAp.bssid,
        essid: selectedAp.essid,
        channel: selectedAp.channel,
        target: { kind: 'pmkid' },
        rate: 1,
        disassoc: false,
        ticksElapsed: 0,
        packetsSent: 0,
      },
    }));
    pushToast(
      'PMKID solicitation started',
      `Associating with ${selectedAp.essid} on channel ${selectedAp.channel}`,
      'info'
    );
  };

  const handleDecryptSelected = () => {
    if (!selectedAp || (!selectedAp.handshake && !selectedAp.pmkid)) return;
    const filename =
      selectedAp.savedHandshake ??
      `${selectedAp.essid.replace(/[^a-zA-Z0-9_-]/g, '_')}.cap`;
    if (!selectedAp.savedHandshake) {
      setAps((prev) => ({
        ...prev,
        [selectedAp.bssid]: {
          ...prev[selectedAp.bssid],
          savedHandshake: filename,
        },
      }));
    }
    setDecryptPreselect({ captureFilename: filename, ap: selectedAp });
    setShowDecryptModal(true);
  };

  const handleCopy = (label: string, value: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
    pushToast('Copied', `${label}: ${value}`, 'info');
  };

  const handleSaveSettings = (next: Settings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }

    // Update simulated interface MAC according to setting
    setInterfaces((prev) =>
      prev.map((iface) => {
        if (iface.name !== selectedIfaceName) return iface;
        const currentMac =
          next.macAddress === 'default'
            ? iface.permanentMac
            : next.macAddress === 'random'
              ? generateRandomMac()
              : next.macAddress;
        return { ...iface, currentMac };
      })
    );
    pushToast('Settings saved', 'Preferences updated', 'success');
  };

  const handleSortAp = (field: ApSortField) => {
    setApSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: field === 'power' || field === 'clients' ? 'desc' : 'asc' }
    );
  };

  const handleSortClient = (field: ClientSortField) => {
    setClientSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: field === 'packets' || field === 'power' ? 'desc' : 'asc' }
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#1b1c20] text-[#eceff4]">
      <Toolbar
        isScanning={isScanning}
        canStartScan={Boolean(selectedIfaceName) && (ghz24 || ghz5)}
        hasInterface={Boolean(selectedIfaceName)}
        hasAps={Object.keys(aps).length > 0}
        hasSelection={Boolean(selectedAp)}
        canPrev={selectedIndex > 0}
        canNext={selectedIndex >= 0 && selectedIndex < visibleAps.length - 1}
        canTop={visibleAps.length > 0 && selectedIndex !== 0}
        canBottom={
          visibleAps.length > 0 && selectedIndex !== visibleAps.length - 1
        }
        selectedIsDeauth={selectedIsDeauth}
        selectedIsPmkid={selectedIsPmkid}
        selectedHasCrackable={Boolean(
          selectedAp && (selectedAp.handshake || selectedAp.pmkid)
        )}
        isChannelLocked={isChannelLocked}
        canAddChannel={canAddChannel}
        canFocusChannel={canFocusChannel}
        canHopAll={!isChannelLocked && channelFilter.length > 0}
        channelFilter={channelFilter}
        isChannelFilterValid={isFilterValid}
        ghz24={ghz24}
        ghz5={ghz5}
        onToggleScan={handleToggleScan}
        onRestartScan={handleRestartScan}
        onExportCapture={handleExportCapture}
        onExportReport={handleExportReport}
        onPrevAp={() => {
          if (selectedIndex > 0) {
            setSelectedBssid(visibleAps[selectedIndex - 1].bssid);
          }
        }}
        onNextAp={() => {
          if (selectedIndex >= 0 && selectedIndex < visibleAps.length - 1) {
            setSelectedBssid(visibleAps[selectedIndex + 1].bssid);
          }
        }}
        onTopAp={() => {
          if (visibleAps.length > 0) setSelectedBssid(visibleAps[0].bssid);
        }}
        onBottomAp={() => {
          if (visibleAps.length > 0) {
            setSelectedBssid(visibleAps[visibleAps.length - 1].bssid);
          }
        }}
        onDeauthClick={handleDeauthButton}
        onPmkidClick={handlePmkidButton}
        onDecryptSelected={handleDecryptSelected}
        onOpenDecrypt={() => {
          setDecryptPreselect(null);
          setShowDecryptModal(true);
        }}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenAbout={() => setShowAboutModal(true)}
        onAddChannel={() => {
          if (!selectedAp || !canAddChannel) return;
          const next = channelFilter
            ? `${channelFilter},${selectedAp.channel}`
            : String(selectedAp.channel);
          setChannelFilter(next);
        }}
        onFocusChannel={() => {
          if (!selectedAp || !canFocusChannel) return;
          setChannelFilter(String(selectedAp.channel));
        }}
        onHopAll={() => setChannelFilter('')}
        onChannelFilterChange={setChannelFilter}
        onToggleGhz24={handleToggleGhz24}
        onToggleGhz5={handleToggleGhz5}
      />

      {/* Main Split Paned Area: Access Points (top) / Clients (bottom) */}
      <main
        ref={splitContainerRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <section
          aria-label="Access points"
          style={{ height: `${splitRatio}%` }}
          className="flex min-h-[140px] flex-col overflow-hidden"
        >
          <AccessPointsTable
            aps={visibleAps}
            selectedBssid={selectedBssid}
            attacks={attacks}
            sortField={apSort.field}
            sortDirection={apSort.direction}
            onSort={handleSortAp}
            onSelect={(bssid) => setSelectedBssid(bssid)}
            onCopy={handleCopy}
          />
        </section>

        {/* Draggable Horizontal Pane Divider */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize access points and clients panels"
          onMouseDown={() => {
            isDraggingSplit.current = true;
          }}
          className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center border-y border-[#32353e] bg-[#23252b] hover:bg-[#2e313a]"
        >
          <span className="h-0.5 w-10 rounded-full bg-[#4a4f5c] group-hover:bg-[#777f91]" />
        </div>

        <section
          aria-label="Clients"
          style={{ height: `${100 - splitRatio}%` }}
          className="flex min-h-[120px] flex-1 flex-col overflow-hidden"
        >
          <ClientsTable
            clients={visibleClients}
            selectedApEssid={selectedAp?.essid ?? null}
            activeAttack={selectedAttack}
            sortField={clientSort.field}
            sortDirection={clientSort.direction}
            onSort={handleSortClient}
            onCopy={handleCopy}
          />
        </section>
      </main>

      {/* Bottom 3-zone Status Bar matching Airgorah */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#32353d] bg-[#24262b] px-3 py-1.5 text-xs text-[#c7ccd6] select-none">
        <div className="flex items-center gap-3">
          <span data-testid="client-status-text">
            {selectedAp
              ? `Showing '${selectedAp.essid}' clients`
              : 'Showing unassociated clients'}
          </span>
          {selectedAp && (
            <button
              type="button"
              onClick={() => setSelectedBssid(null)}
              className="text-[11px] text-[#9aa1ae] underline decoration-[#525866] underline-offset-2 hover:text-white"
            >
              Show unassociated (Esc)
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
          <span
            title="Channel the interface is currently listening on"
            data-testid="channel-status-text"
          >
            Channel: {currentChannel !== null ? currentChannel : 'none'}
          </span>
          <button
            type="button"
            onClick={() => setShowInterfaceModal(true)}
            title="Wireless interface used for scans and attacks (click to switch)"
            data-testid="interface-status-button"
            className="text-[#d6dbe5] underline decoration-[#4d5361] underline-offset-2 hover:text-white"
          >
            Interface: {selectedInterface ? selectedInterface.name : 'none'}
          </button>
        </div>
      </footer>

      {/* Notifications (desktop capture & action alerts) */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed right-3 bottom-10 z-50 flex w-80 flex-col gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs shadow-lg ${
                toast.tone === 'error'
                  ? 'border-[#b91c1c] bg-[#2b181a] text-[#fecaca]'
                  : toast.tone === 'success'
                    ? 'border-[#15803d] bg-[#16271d] text-[#bbf7d0]'
                    : 'border-[#3d414b] bg-[#25272e] text-[#e5e9f0]'
              }`}
            >
              {toast.tone === 'error' ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f87171]" />
              ) : toast.tone === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4ade80]" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#e86f33]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{toast.title}</div>
                <div className="truncate opacity-85">{toast.message}</div>
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() =>
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id))
                }
                className="rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <InterfaceModal
        isOpen={showInterfaceModal}
        interfaces={interfaces}
        currentInterface={selectedIfaceName}
        onSelect={handleSelectInterface}
        onRefresh={() => {
          setInterfaces([...SIMULATED_INTERFACES]);
          pushToast('Interfaces refreshed', `${SIMULATED_INTERFACES.length} monitor-capable devices found`);
        }}
        onClose={() => setShowInterfaceModal(false)}
      />

      <DeauthModal
        ap={deauthTargetAp}
        onClose={() => setDeauthTargetAp(null)}
        onStartDeauth={handleStartDeauth}
      />

      <DecryptModal
        isOpen={showDecryptModal}
        preselectedTarget={decryptPreselect}
        savedCaptures={savedCaptures}
        liveCrackableAps={liveCrackableAps}
        onClose={() => setShowDecryptModal(false)}
        onStartJob={(job) => setActiveDecryptJob(job)}
      />

      <DecryptTerminalModal
        job={activeDecryptJob}
        onClose={() => setActiveDecryptJob(null)}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        settings={settings}
        isChannelLocked={isChannelLocked}
        onSave={handleSaveSettings}
        onClose={() => setShowSettingsModal(false)}
      />

      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />
    </div>
  );
}

export default App;
