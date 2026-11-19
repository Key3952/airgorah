import { useState, useEffect } from 'react';
import { Wifi, ArrowUp, ArrowDown, Check, Copy } from 'lucide-react';
import type {
  AccessPoint,
  ApSortField,
  AttackState,
  SortDirection,
} from '../types';

interface AccessPointsTableProps {
  aps: AccessPoint[];
  selectedBssid: string | null;
  attacks: Record<string, AttackState>;
  sortField: ApSortField;
  sortDirection: SortDirection;
  onSort: (field: ApSortField) => void;
  onSelect: (bssid: string) => void;
  onCopy: (label: string, value: string) => void;
}

interface ColumnDef {
  field: ApSortField;
  label: string;
  align?: 'left' | 'right' | 'center';
  minWidth: string;
}

const COLUMNS: ColumnDef[] = [
  { field: 'essid', label: 'ESSID', align: 'left', minWidth: '170px' },
  { field: 'bssid', label: 'BSSID', align: 'left', minWidth: '148px' },
  { field: 'band', label: 'Band', align: 'left', minWidth: '72px' },
  { field: 'channel', label: 'Channel', align: 'right', minWidth: '76px' },
  { field: 'power', label: 'Power', align: 'right', minWidth: '72px' },
  { field: 'encryption', label: 'Encryption', align: 'left', minWidth: '96px' },
  { field: 'clients', label: 'Clients', align: 'right', minWidth: '72px' },
  { field: 'firstTimeSeen', label: 'First time seen', align: 'left', minWidth: '158px' },
  { field: 'lastTimeSeen', label: 'Last time seen', align: 'left', minWidth: '158px' },
  { field: 'handshake', label: 'Handshake', align: 'center', minWidth: '90px' },
  { field: 'pmkid', label: 'PMKID', align: 'center', minWidth: '74px' },
];

export function AccessPointsTable({
  aps,
  selectedBssid,
  attacks,
  sortField,
  sortDirection,
  onSort,
  onSelect,
  onCopy,
}: AccessPointsTableProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    ap: AccessPoint;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('keydown', dismiss);
    };
  }, [contextMenu]);

  return (
    <div
      className="relative flex-1 overflow-auto bg-[#1b1c20]"
      data-testid="aps-table-container"
    >
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[#25272d] text-[#c7ccd6] shadow-[inset_0_-1px_0_#343740]">
          <tr>
            {COLUMNS.map((col) => {
              const active = sortField === col.field;
              return (
                <th
                  key={col.field}
                  style={{ minWidth: col.minWidth }}
                  className="border-r border-[#31343d] px-2.5 py-1.5 font-medium last:border-r-0"
                >
                  <button
                    type="button"
                    onClick={() => onSort(col.field)}
                    className={`flex w-full items-center gap-1 whitespace-nowrap text-xs font-medium text-[#d1d5de] hover:text-white ${
                      col.align === 'right'
                        ? 'justify-end'
                        : col.align === 'center'
                          ? 'justify-center'
                          : 'justify-start'
                    }`}
                  >
                    <span>{col.label}</span>
                    {active &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="h-3 w-3 shrink-0 text-[#e86f33]" />
                      ) : (
                        <ArrowDown className="h-3 w-3 shrink-0 text-[#e86f33]" />
                      ))}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-[#23252b]">
          {aps.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-4 py-10 text-center text-sm text-[#8a91a0]"
              >
                No access points captured yet. Start the scan or widen your band and channel filter.
              </td>
            </tr>
          ) : (
            aps.map((ap) => {
              const isSelected = ap.bssid === selectedBssid;
              const attack = attacks[ap.bssid];
              const isDeauth =
                attack &&
                (attack.target.kind === 'all' ||
                  attack.target.kind === 'selection');
              const isPmkid = attack && attack.target.kind === 'pmkid';

              let rowBg =
                'bg-[#1b1c20] hover:bg-[#23262d]';
              if (isDeauth) {
                rowBg = isSelected
                  ? 'bg-[#7f1d1d]/80 hover:bg-[#7f1d1d]/90'
                  : 'bg-[#7f1d1d]/55 hover:bg-[#7f1d1d]/70';
              } else if (isPmkid) {
                rowBg = isSelected
                  ? 'bg-[#1e3a8a]/80 hover:bg-[#1e3a8a]/90'
                  : 'bg-[#1e3a8a]/55 hover:bg-[#1e3a8a]/70';
              } else if (isSelected) {
                rowBg = 'bg-[#2f3542] hover:bg-[#343b49]';
              }

              const clientCount = Object.keys(ap.clients).length;

              return (
                <tr
                  key={ap.bssid}
                  onClick={() => onSelect(ap.bssid)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelect(ap.bssid);
                    setContextMenu({
                      x: Math.min(e.clientX, window.innerWidth - 180),
                      y: Math.min(e.clientY, window.innerHeight - 130),
                      ap,
                    });
                  }}
                  aria-selected={isSelected}
                  data-bssid={ap.bssid}
                  data-attack={isDeauth ? 'deauth' : isPmkid ? 'pmkid' : 'none'}
                  className={`cursor-pointer transition-colors ${rowBg}`}
                >
                  <td className="px-2.5 py-1.5 font-medium text-[#f1f3f7] whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Wifi
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isDeauth
                            ? 'text-[#fca5a5]'
                            : isPmkid
                              ? 'text-[#93c5fd]'
                              : 'text-[#d8dde6]'
                        }`}
                      />
                      <span
                        className={
                          ap.hidden ? 'italic text-[#9ca3b2]' : undefined
                        }
                      >
                        {ap.essid}
                      </span>
                      {isDeauth && (
                        <span className="ml-1 text-[11px] font-mono text-[#fecaca]">
                          [DEAUTH]
                        </span>
                      )}
                      {isPmkid && (
                        <span className="ml-1 text-[11px] font-mono text-[#bfdbfe]">
                          [PMKID]
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-2.5 py-1.5 font-mono text-xs text-[#d6dbe5] tabular-nums whitespace-nowrap">
                    {ap.bssid}
                  </td>

                  <td className="px-2.5 py-1.5 text-[#c7cdd9] whitespace-nowrap">
                    {ap.band}
                  </td>

                  <td className="px-2.5 py-1.5 text-right font-mono text-xs text-[#d6dbe5] tabular-nums">
                    {ap.channel}
                  </td>

                  <td className="px-2.5 py-1.5 text-right font-mono text-xs text-[#d6dbe5] tabular-nums">
                    {ap.power}
                  </td>

                  <td className="px-2.5 py-1.5 font-mono text-xs text-[#c7cdd9] whitespace-nowrap">
                    {ap.encryption}
                  </td>

                  <td className="px-2.5 py-1.5 text-right font-mono text-xs text-[#d6dbe5] tabular-nums">
                    {clientCount}
                  </td>

                  <td className="px-2.5 py-1.5 font-mono text-xs text-[#b5bcc9] tabular-nums whitespace-nowrap">
                    {ap.firstTimeSeen}
                  </td>

                  <td className="px-2.5 py-1.5 font-mono text-xs text-[#b5bcc9] tabular-nums whitespace-nowrap">
                    {ap.lastTimeSeen}
                  </td>

                  <td className="px-2.5 py-1.5 text-center">
                    <span
                      role="img"
                      aria-label={
                        ap.handshake
                          ? `Handshake captured for ${ap.essid}`
                          : `No handshake for ${ap.essid}`
                      }
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-[3px] border ${
                        ap.handshake
                          ? 'border-[#22c55e] bg-[#16a34a]/30 text-[#4ade80]'
                          : 'border-white/20 bg-black/20 text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  </td>

                  <td className="px-2.5 py-1.5 text-center">
                    <span
                      role="img"
                      aria-label={
                        ap.pmkid
                          ? `PMKID captured for ${ap.essid}`
                          : `No PMKID for ${ap.essid}`
                      }
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-[3px] border ${
                        ap.pmkid
                          ? 'border-[#3b82f6] bg-[#2563eb]/30 text-[#93c5fd]'
                          : 'border-white/20 bg-black/20 text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Right-click context menu matching Airgorah PopoverMenu */}
      {contextMenu && (
        <div
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 w-44 rounded-md border border-[#3c404a] bg-[#25272d] py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopy('BSSID', contextMenu.ap.bssid);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e5e9f0] hover:bg-[#353944]"
          >
            <Copy className="h-3.5 w-3.5 text-[#9ca3b2]" />
            Copy BSSID
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopy('ESSID', contextMenu.ap.essid);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e5e9f0] hover:bg-[#353944]"
          >
            <Copy className="h-3.5 w-3.5 text-[#9ca3b2]" />
            Copy ESSID
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopy('Channel', String(contextMenu.ap.channel));
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e5e9f0] hover:bg-[#353944]"
          >
            <Copy className="h-3.5 w-3.5 text-[#9ca3b2]" />
            Copy Channel
          </button>
        </div>
      )}
    </div>
  );
}
