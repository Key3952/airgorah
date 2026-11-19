import type {
  AccessPoint,
  ApSortField,
  AttackState,
  Client,
  ClientSortField,
  SortDirection,
} from '../types';
import {
  formatChannelFilter,
  getActiveHopChannels,
  parseChannelEntries,
} from './channel';

export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatExportStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}h${pad(date.getMinutes())}`;
}

/**
 * Exact port of Airgorah's drive_channel_filter_from_attacks:
 * - While attacks are running, lock channel controls and pin the filter to
 *   the union of attacked channels (and previously locked channels so stopping
 *   one of several attacks keeps its channel parked for reconnection handshakes).
 * - When the last attack stops, unlock controls while keeping the filter parked.
 */
export function computeAttackChannelLock(
  currentFilter: string,
  attacks: Record<string, AttackState>,
  wasLocked: boolean
): { nextFilter: string; isLocked: boolean } {
  const attackList = Object.values(attacks);
  if (attackList.length > 0) {
    const channels = attackList.map((a) => a.channel);
    if (wasLocked) {
      channels.push(...parseChannelEntries(currentFilter));
    }
    return {
      nextFilter: formatChannelFilter(channels),
      isLocked: true,
    };
  }
  return {
    nextFilter: currentFilter,
    isLocked: false,
  };
}

export interface ScanTickInput {
  aps: Record<string, AccessPoint>;
  unlinkedClients: Record<string, Client>;
  attacks: Record<string, AttackState>;
  ghz24: boolean;
  ghz5: boolean;
  channelFilter: string;
  hopIndex: number;
  now?: Date;
  seedPool?: AccessPoint[];
}

export interface ScanTickResult {
  aps: Record<string, AccessPoint>;
  unlinkedClients: Record<string, Client>;
  attacks: Record<string, AttackState>;
  currentChannel: number | null;
  nextHopIndex: number;
  newlyCaptured: Array<{
    bssid: string;
    essid: string;
    kind: 'Handshake' | 'PMKID';
  }>;
}

function deterministicDelta(seedStr: string, tick: number): number {
  let hash = tick * 31;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 33 + seedStr.charCodeAt(i)) % 997;
  }
  return (hash % 3) - 1; // -1, 0, or +1 dBm
}

export function stepScanTick(input: ScanTickInput): ScanTickResult {
  const nowStr = formatTimestamp(input.now ?? new Date());
  const hopChannels = getActiveHopChannels(
    input.ghz24,
    input.ghz5,
    input.channelFilter
  );

  if (hopChannels.length === 0) {
    return {
      aps: input.aps,
      unlinkedClients: input.unlinkedClients,
      attacks: input.attacks,
      currentChannel: null,
      nextHopIndex: 0,
      newlyCaptured: [],
    };
  }

  const nextHopIndex = (input.hopIndex + 1) % hopChannels.length;
  const currentChannel = hopChannels[input.hopIndex % hopChannels.length];

  const nextAps: Record<string, AccessPoint> = { ...input.aps };
  const nextUnlinked: Record<string, Client> = { ...input.unlinkedClients };
  const nextAttacks: Record<string, AttackState> = { ...input.attacks };
  const newlyCaptured: ScanTickResult['newlyCaptured'] = [];

  // Re-discover seed APs on the active channel (e.g. after Restart Scan)
  if (input.seedPool && input.seedPool.length > 0) {
    for (const candidate of input.seedPool) {
      if (candidate.channel === currentChannel && !nextAps[candidate.bssid]) {
        const clonedClients: Record<string, Client> = {};
        for (const [mac, c] of Object.entries(candidate.clients)) {
          clonedClients[mac] = {
            ...c,
            firstTimeSeen: nowStr,
            lastTimeSeen: nowStr,
          };
        }
        nextAps[candidate.bssid] = {
          ...candidate,
          handshake: false,
          pmkid: false,
          savedHandshake: null,
          firstTimeSeen: nowStr,
          lastTimeSeen: nowStr,
          clients: clonedClients,
        };
      }
    }
  }

  // Update APs seen on the active channel (or under attack)
  for (const [bssid, ap] of Object.entries(nextAps)) {
    const attack = nextAttacks[bssid];
    if (ap.channel !== currentChannel && !attack) {
      continue;
    }

    const delta = deterministicDelta(bssid, input.hopIndex);
    const nextPower = Math.max(-95, Math.min(-28, ap.power + delta));

    const updatedClients: Record<string, Client> = { ...ap.clients };
    for (const [mac, cli] of Object.entries(updatedClients)) {
      const inc = (input.hopIndex + mac.charCodeAt(0)) % 3 === 0 ? 1 : 0;
      if (inc > 0 || attack) {
        updatedClients[mac] = {
          ...cli,
          packets: cli.packets + Math.max(1, inc),
          power: Math.max(
            -95,
            Math.min(-30, cli.power + deterministicDelta(mac, input.hopIndex))
          ),
          lastTimeSeen: nowStr,
        };
      }
    }

    let handshake = ap.handshake;
    let pmkid = ap.pmkid;

    if (attack) {
      const nextTicks = attack.ticksElapsed + 1;
      const targetCount =
        attack.target.kind === 'selection'
          ? Math.max(1, attack.target.clients.length)
          : 1;
      const multiplier = attack.disassoc ? 2 : 1;
      const packetsDelta =
        attack.target.kind === 'pmkid'
          ? 2
          : attack.rate * targetCount * multiplier;

      nextAttacks[bssid] = {
        ...attack,
        ticksElapsed: nextTicks,
        packetsSent: attack.packetsSent + packetsDelta,
      };

      // Capture 4-way handshake during deauth when AP has clients & uses WPA/WPA2/WPA3
      if (
        (attack.target.kind === 'all' || attack.target.kind === 'selection') &&
        !handshake &&
        ap.encryption !== 'OPN' &&
        Object.keys(updatedClients).length > 0 &&
        nextTicks >= 3
      ) {
        handshake = true;
        newlyCaptured.push({ bssid, essid: ap.essid, kind: 'Handshake' });
      }

      // Capture PMKID via clientless solicitation on WPA2/WPA3 networks
      if (
        attack.target.kind === 'pmkid' &&
        !pmkid &&
        ap.encryption !== 'OPN' &&
        nextTicks >= 3
      ) {
        pmkid = true;
        newlyCaptured.push({ bssid, essid: ap.essid, kind: 'PMKID' });
      }
    }

    nextAps[bssid] = {
      ...ap,
      power: nextPower,
      lastTimeSeen: nowStr,
      clients: updatedClients,
      handshake,
      pmkid,
    };
  }

  // Periodically update one unlinked probing client
  const unlinkedKeys = Object.keys(nextUnlinked);
  if (unlinkedKeys.length > 0) {
    const idx = input.hopIndex % unlinkedKeys.length;
    const mac = unlinkedKeys[idx];
    const cli = nextUnlinked[mac];
    nextUnlinked[mac] = {
      ...cli,
      packets: cli.packets + 1,
      power: Math.max(
        -95,
        Math.min(-35, cli.power + deterministicDelta(mac, input.hopIndex))
      ),
      lastTimeSeen: nowStr,
    };
  }

  return {
    aps: nextAps,
    unlinkedClients: nextUnlinked,
    attacks: nextAttacks,
    currentChannel,
    nextHopIndex,
    newlyCaptured,
  };
}

export function sortAccessPoints(
  aps: AccessPoint[],
  field: ApSortField,
  direction: SortDirection
): AccessPoint[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...aps].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'essid':
        cmp = a.essid.localeCompare(b.essid);
        break;
      case 'bssid':
        cmp = a.bssid.localeCompare(b.bssid);
        break;
      case 'band':
        cmp = a.band.localeCompare(b.band);
        break;
      case 'channel':
        cmp = a.channel - b.channel;
        break;
      case 'power':
        cmp = a.power - b.power;
        break;
      case 'encryption':
        cmp = a.encryption.localeCompare(b.encryption);
        break;
      case 'clients':
        cmp = Object.keys(a.clients).length - Object.keys(b.clients).length;
        break;
      case 'firstTimeSeen':
        cmp = a.firstTimeSeen.localeCompare(b.firstTimeSeen);
        break;
      case 'lastTimeSeen':
        cmp = a.lastTimeSeen.localeCompare(b.lastTimeSeen);
        break;
      case 'handshake':
        cmp = Number(a.handshake) - Number(b.handshake);
        break;
      case 'pmkid':
        cmp = Number(a.pmkid) - Number(b.pmkid);
        break;
    }
    return cmp !== 0 ? cmp * dir : a.bssid.localeCompare(b.bssid);
  });
}

export function sortClients(
  clients: Client[],
  field: ClientSortField,
  direction: SortDirection
): Client[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...clients].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'mac':
        cmp = a.mac.localeCompare(b.mac);
        break;
      case 'packets':
        cmp = a.packets - b.packets;
        break;
      case 'power':
        cmp = a.power - b.power;
        break;
      case 'firstTimeSeen':
        cmp = a.firstTimeSeen.localeCompare(b.firstTimeSeen);
        break;
      case 'lastTimeSeen':
        cmp = a.lastTimeSeen.localeCompare(b.lastTimeSeen);
        break;
      case 'vendor':
        cmp = a.vendor.localeCompare(b.vendor);
        break;
      case 'probes':
        cmp = a.probes.localeCompare(b.probes);
        break;
    }
    return cmp !== 0 ? cmp * dir : a.mac.localeCompare(b.mac);
  });
}

/**
 * Matches crates/gui/src/backend/report.rs JSON report schema.
 */
export function buildJsonReport(
  aps: Record<string, AccessPoint>,
  unlinkedClients: Record<string, Client>
): string {
  const report = {
    access_points: Object.values(aps).map((ap) => ({
      essid: ap.essid,
      bssid: ap.bssid,
      band: ap.band,
      channel: String(ap.channel),
      power: String(ap.power),
      privacy: ap.encryption,
      hidden: ap.hidden,
      handshake: ap.handshake,
      pmkid: ap.pmkid,
      saved_handshake: ap.savedHandshake,
      first_time_seen: ap.firstTimeSeen,
      last_time_seen: ap.lastTimeSeen,
      clients: Object.fromEntries(
        Object.entries(ap.clients).map(([mac, c]) => [
          mac,
          {
            mac: c.mac,
            packets: String(c.packets),
            power: String(c.power),
            first_time_seen: c.firstTimeSeen,
            last_time_seen: c.lastTimeSeen,
            vendor: c.vendor,
            probes: c.probes,
          },
        ])
      ),
    })),
    unlinked_clients: Object.values(unlinkedClients).map((c) => ({
      mac: c.mac,
      packets: String(c.packets),
      power: String(c.power),
      first_time_seen: c.firstTimeSeen,
      last_time_seen: c.lastTimeSeen,
      vendor: c.vendor,
      probes: c.probes,
    })),
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Builds a valid little-endian libpcap v2.4 binary capture (.cap) with
 * IEEE 802.11 link-layer type (105) containing beacon records for captured APs.
 */
export function buildPcapCaptureBuffer(aps: AccessPoint[]): Uint8Array {
  const encoder = new TextEncoder();
  const packets: Uint8Array[] = aps.map((ap) => {
    const essidBytes = encoder.encode(ap.essid);
    // Minimal IEEE 802.11 Beacon frame header (24 bytes) + fixed params (12 bytes) + SSID IE
    const frameLen = 36 + 2 + essidBytes.length;
    const frame = new Uint8Array(frameLen);
    frame[0] = 0x80; // Beacon frame control
    // Destination broadcast FF:FF:FF:FF:FF:FF
    for (let i = 4; i < 10; i++) frame[i] = 0xff;
    // Source & BSSID bytes
    const macBytes = ap.bssid
      .split(':')
      .map((hex) => Number.parseInt(hex, 16) || 0);
    for (let i = 0; i < 6; i++) {
      frame[10 + i] = macBytes[i] ?? 0;
      frame[16 + i] = macBytes[i] ?? 0;
    }
    // SSID Information Element (ID 0, length, bytes)
    frame[36] = 0x00;
    frame[37] = essidBytes.length;
    frame.set(essidBytes, 38);
    return frame;
  });

  const totalSize =
    24 + packets.reduce((sum, pkt) => sum + 16 + pkt.length, 0);
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Global libpcap header (24 bytes)
  view.setUint32(0, 0xa1b2c3d4, true); // magic number
  view.setUint16(4, 2, true); // major version
  view.setUint16(6, 4, true); // minor version
  view.setInt32(8, 0, true); // thiszone
  view.setUint32(12, 0, true); // sigfigs
  view.setUint32(16, 65535, true); // snaplen
  view.setUint32(20, 105, true); // DLT_IEEE802_11

  let offset = 24;
  const nowSec = Math.floor(Date.now() / 1000);
  packets.forEach((pkt, idx) => {
    view.setUint32(offset, nowSec, true);
    view.setUint32(offset + 4, idx * 1000, true);
    view.setUint32(offset + 8, pkt.length, true);
    view.setUint32(offset + 12, pkt.length, true);
    offset += 16;
    bytes.set(pkt, offset);
    offset += pkt.length;
  });

  return bytes;
}
