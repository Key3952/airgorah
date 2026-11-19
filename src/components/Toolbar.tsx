import React from 'react';
import {
  Play,
  Pause,
  RotateCw,
  Save,
  FileJson,
  ChevronUp,
  ChevronDown,
  ArrowUpToLine,
  ArrowDownToLine,
  WifiOff,
  Radio,
  KeyRound,
  OctagonX,
  Terminal,
  Settings as SettingsIcon,
  Info,
  Plus,
  Minimize2,
  LayoutGrid,
} from 'lucide-react';
import { sanitizeChannelInput } from '../lib/channel';

interface ToolbarProps {
  isScanning: boolean;
  canStartScan: boolean;
  hasInterface: boolean;
  hasAps: boolean;
  hasSelection: boolean;
  canPrev: boolean;
  canNext: boolean;
  canTop: boolean;
  canBottom: boolean;
  selectedIsDeauth: boolean;
  selectedIsPmkid: boolean;
  selectedHasCrackable: boolean;
  isChannelLocked: boolean;
  canAddChannel: boolean;
  canFocusChannel: boolean;
  canHopAll: boolean;
  channelFilter: string;
  isChannelFilterValid: boolean;
  ghz24: boolean;
  ghz5: boolean;
  onToggleScan: () => void;
  onRestartScan: () => void;
  onExportCapture: () => void;
  onExportReport: () => void;
  onPrevAp: () => void;
  onNextAp: () => void;
  onTopAp: () => void;
  onBottomAp: () => void;
  onDeauthClick: () => void;
  onPmkidClick: () => void;
  onDecryptSelected: () => void;
  onOpenDecrypt: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onAddChannel: () => void;
  onFocusChannel: () => void;
  onHopAll: () => void;
  onChannelFilterChange: (value: string) => void;
  onToggleGhz24: () => void;
  onToggleGhz5: () => void;
}

interface IconBtnProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  accentBlue?: boolean;
  children: React.ReactNode;
}

function ToolbarButton({
  label,
  onClick,
  disabled = false,
  active = false,
  danger = false,
  accentBlue = false,
  children,
}: IconBtnProps) {
  let stateClass =
    'bg-[#2e3036] text-[#e2e5ec] border-[#3d4048] hover:bg-[#3a3d45] hover:text-white active:bg-[#26282d]';

  if (disabled) {
    stateClass =
      'bg-[#25272c] text-[#5c6270] border-[#2e3138] cursor-not-allowed';
  } else if (danger) {
    stateClass =
      'bg-[#7f1d1d] text-white border-[#b91c1c] hover:bg-[#991b1b]';
  } else if (accentBlue) {
    stateClass =
      'bg-[#1e3a8a] text-white border-[#2563eb] hover:bg-[#1d4ed8]';
  } else if (active) {
    stateClass =
      'bg-[#3d414b] text-white border-[#525866] hover:bg-[#474c57]';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e86f33] ${stateClass}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-[#363942]" aria-hidden="true" />;
}

export function Toolbar(props: ToolbarProps) {
  const {
    isScanning,
    canStartScan,
    hasInterface,
    hasAps,
    hasSelection,
    canPrev,
    canNext,
    canTop,
    canBottom,
    selectedIsDeauth,
    selectedIsPmkid,
    selectedHasCrackable,
    isChannelLocked,
    canAddChannel,
    canFocusChannel,
    canHopAll,
    channelFilter,
    isChannelFilterValid,
    ghz24,
    ghz5,
  } = props;

  return (
    <header className="flex flex-col gap-1.5 border-b border-[#32353d] bg-[#24262b] px-2.5 py-1.5 select-none lg:flex-row lg:items-center lg:justify-between lg:gap-2 lg:px-3 lg:py-2">
      {/* Left action groups */}
      <div className="flex flex-nowrap items-center gap-1 overflow-x-auto pb-0.5 lg:pb-0">
        {/* Scan & Export Group */}
        <ToolbarButton
          label={isScanning ? 'Pause the scan' : 'Start the scan'}
          onClick={props.onToggleScan}
          disabled={!canStartScan && !isScanning}
          active={isScanning}
        >
          {isScanning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </ToolbarButton>

        <ToolbarButton
          label="Clear results and restart the scan"
          onClick={props.onRestartScan}
          disabled={!hasInterface || isChannelLocked || !canStartScan}
        >
          <RotateCw className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Save captured packets as .cap file"
          onClick={props.onExportCapture}
          disabled={!hasAps}
        >
          <Save className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Save captured data as .json file"
          onClick={props.onExportReport}
          disabled={!hasAps}
        >
          <FileJson className="h-4 w-4" />
        </ToolbarButton>

        <Divider />

        {/* Navigation Group */}
        <ToolbarButton
          label="Previous access point"
          onClick={props.onPrevAp}
          disabled={!canPrev}
        >
          <ChevronUp className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Next access point"
          onClick={props.onNextAp}
          disabled={!canNext}
        >
          <ChevronDown className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          label="First access point"
          onClick={props.onTopAp}
          disabled={!canTop}
        >
          <ArrowUpToLine className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Last access point"
          onClick={props.onBottomAp}
          disabled={!canBottom}
        >
          <ArrowDownToLine className="h-4 w-4" />
        </ToolbarButton>

        <Divider />

        {/* Attack & Capture Group */}
        <ToolbarButton
          label={
            selectedIsDeauth
              ? 'Stop deauth attack on selected access point'
              : 'Perform a deauth attack on the selected access point'
          }
          onClick={props.onDeauthClick}
          disabled={!hasSelection || selectedIsPmkid}
          danger={selectedIsDeauth}
        >
          {selectedIsDeauth ? (
            <OctagonX className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
        </ToolbarButton>

        <ToolbarButton
          label={
            selectedIsPmkid
              ? 'Stop PMKID solicitation on selected access point'
              : 'Solicit a PMKID from the selected access point (clientless)'
          }
          onClick={props.onPmkidClick}
          disabled={!hasSelection || selectedIsDeauth}
          accentBlue={selectedIsPmkid}
        >
          {selectedIsPmkid ? (
            <OctagonX className="h-4 w-4" />
          ) : (
            <Radio className="h-4 w-4" />
          )}
        </ToolbarButton>

        <ToolbarButton
          label="Decrypt a handshake or PMKID captured on the selected access point"
          onClick={props.onDecryptSelected}
          disabled={!hasSelection || !selectedHasCrackable}
        >
          <KeyRound className="h-4 w-4" />
        </ToolbarButton>

        <Divider />

        {/* Utility Modals Group */}
        <ToolbarButton label="WPA decryption" onClick={props.onOpenDecrypt}>
          <Terminal className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton label="Settings" onClick={props.onOpenSettings}>
          <SettingsIcon className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton label="About" onClick={props.onOpenAbout}>
          <Info className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Right Channel & Band Controls */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolbarButton
          label="Add the channel of the selected access point to the channel hop list"
          onClick={props.onAddChannel}
          disabled={!canAddChannel}
        >
          <Plus className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Focus the channel of the selected access point"
          onClick={props.onFocusChannel}
          disabled={!canFocusChannel}
        >
          <Minimize2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          label="Hop on all channels of the selected bands"
          onClick={props.onHopAll}
          disabled={!canHopAll}
        >
          <LayoutGrid className="h-4 w-4" />
        </ToolbarButton>

        <input
          type="text"
          aria-label="Channel filter"
          placeholder="Channel (ex: 1,6,11)"
          value={channelFilter}
          disabled={!hasInterface || isChannelLocked}
          onChange={(e) =>
            props.onChannelFilterChange(sanitizeChannelInput(e.target.value))
          }
          className={`h-8 w-44 rounded border bg-[#1b1c20] px-2.5 font-mono text-xs tabular-nums transition-colors placeholder:font-sans placeholder:text-[#6e7585] focus:outline-none ${
            !hasInterface || isChannelLocked
              ? 'cursor-not-allowed border-[#2e3138] text-[#6d7484]'
              : !isChannelFilterValid && channelFilter.length > 0
                ? 'border-[#ef4444] text-[#f87171] focus:border-[#ef4444]'
                : 'border-[#3a3e47] text-[#eceff4] focus:border-[#e86f33]'
          }`}
        />

        <div className="ml-1 flex items-center gap-3">
          <label
            className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
              !hasInterface || isChannelLocked
                ? 'cursor-not-allowed text-[#6d7484]'
                : 'cursor-pointer text-[#e2e5ec]'
            }`}
          >
            <input
              type="checkbox"
              checked={ghz24}
              disabled={!hasInterface || isChannelLocked}
              onChange={props.onToggleGhz24}
              className="h-3.5 w-3.5 rounded accent-[#e86f33]"
            />
            <span>2.4 GHz</span>
          </label>

          <label
            className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
              !hasInterface || isChannelLocked
                ? 'cursor-not-allowed text-[#6d7484]'
                : 'cursor-pointer text-[#e2e5ec]'
            }`}
          >
            <input
              type="checkbox"
              checked={ghz5}
              disabled={!hasInterface || isChannelLocked}
              onChange={props.onToggleGhz5}
              className="h-3.5 w-3.5 rounded accent-[#e86f33]"
            />
            <span>5 GHz</span>
          </label>
        </div>
      </div>
    </header>
  );
}
