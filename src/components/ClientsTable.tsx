import { useState, useEffect } from 'react';
import { Monitor, ArrowUp, ArrowDown, Copy } from 'lucide-react';
import type {
  AttackState,
  Client,
  ClientSortField,
  SortDirection,
} from '../types';

interface ClientsTableProps {
  clients: Client[];
  selectedApEssid: string | null;
  activeAttack: AttackState | null;
  sortField: ClientSortField;
  sortDirection: SortDirection;
  onSort: (field: ClientSortField) => void;
  onCopy: (label: string, value: string) => void;
}

interface ColumnDef {
  field: ClientSortField;
  label: string;
  align?: 'left' | 'right';
  minWidth: string;
}

const COLUMNS: ColumnDef[] = [
  { field: 'mac', label: 'Station MAC', align: 'left', minWidth: '175px' },
  { field: 'packets', label: 'Packets', align: 'right', minWidth: '90px' },
  { field: 'power', label: 'Power', align: 'right', minWidth: '82px' },
  { field: 'firstTimeSeen', label: 'First time seen', align: 'left', minWidth: '160px' },
  { field: 'lastTimeSeen', label: 'Last time seen', align: 'left', minWidth: '160px' },
  { field: 'vendor', label: 'Vendor', align: 'left', minWidth: '210px' },
  { field: 'probes', label: 'Probes', align: 'left', minWidth: '220px' },
];

export function ClientsTable({
  clients,
  selectedApEssid,
  activeAttack,
  sortField,
  sortDirection,
  onSort,
  onCopy,
}: ClientsTableProps) {
  const [selectedMac, setSelectedMac] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    client: Client;
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
      data-testid="clients-table-container"
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
                      col.align === 'right' ? 'justify-end' : 'justify-start'
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
          {clients.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-4 py-8 text-center text-xs text-[#8a91a0]"
              >
                {selectedApEssid
                  ? `No associated clients observed on "${selectedApEssid}". Press Esc to return to unassociated stations.`
                  : 'No unassociated stations observed yet.'}
              </td>
            </tr>
          ) : (
            clients.map((cli) => {
              const isTargeted =
                activeAttack &&
                (activeAttack.target.kind === 'all' ||
                  (activeAttack.target.kind === 'selection' &&
                    activeAttack.target.clients.includes(cli.mac)));
              const isSelected = cli.mac === selectedMac;

              let rowBg = 'bg-[#1b1c20] hover:bg-[#23262d]';
              if (isTargeted) {
                rowBg = isSelected
                  ? 'bg-[#7f1d1d]/80 hover:bg-[#7f1d1d]/90'
                  : 'bg-[#7f1d1d]/55 hover:bg-[#7f1d1d]/70';
              } else if (isSelected) {
                rowBg = 'bg-[#2f3542] hover:bg-[#343b49]';
              }

              return (
                <tr
                  key={cli.mac}
                  onClick={() => setSelectedMac(cli.mac)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedMac(cli.mac);
                    setContextMenu({
                      x: Math.min(e.clientX, window.innerWidth - 180),
                      y: Math.min(e.clientY, window.innerHeight - 130),
                      client: cli,
                    });
                  }}
                  data-targeted={isTargeted ? 'true' : 'false'}
                  className={`cursor-pointer transition-colors ${rowBg}`}
                >
                  <td className="px-2.5 py-1.5 font-mono text-xs text-[#e5e9f0] tabular-nums whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-3.5 w-3.5 shrink-0 text-[#60a5fa]" />
                      <span>{cli.mac}</span>
                    </div>
                  </td>

                  <td className="px-2.5 py-1.5 text-right font-mono text-xs text-[#d6dbe5] tabular-nums">
                    {cli.packets}
                  </td>

                  <td className="px-2.5 py-1.5 text-right font-mono text-xs text-[#d6dbe5] tabular-nums">
                    {cli.power}
                  </td>

                  <td className="px-2.5 py-1.5 font-mono text-xs text-[#b5bcc9] tabular-nums whitespace-nowrap">
                    {cli.firstTimeSeen}
                  </td>

                  <td className="px-2.5 py-1.5 font-mono text-xs text-[#b5bcc9] tabular-nums whitespace-nowrap">
                    {cli.lastTimeSeen}
                  </td>

                  <td className="px-2.5 py-1.5 text-[#c7cdd9] whitespace-nowrap">
                    {cli.vendor}
                  </td>

                  <td className="px-2.5 py-1.5 text-[#9ca3b2] whitespace-nowrap">
                    {cli.probes}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

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
              onCopy('MAC', contextMenu.client.mac);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e5e9f0] hover:bg-[#353944]"
          >
            <Copy className="h-3.5 w-3.5 text-[#9ca3b2]" />
            Copy MAC
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopy('Vendor', contextMenu.client.vendor);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e5e9f0] hover:bg-[#353944]"
          >
            <Copy className="h-3.5 w-3.5 text-[#9ca3b2]" />
            Copy Vendor
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopy('Probes', contextMenu.client.probes || '(none)');
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e5e9f0] hover:bg-[#353944]"
          >
            <Copy className="h-3.5 w-3.5 text-[#9ca3b2]" />
            Copy Probes
          </button>
        </div>
      )}
    </div>
  );
}
