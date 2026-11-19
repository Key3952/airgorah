export type WirelessBand = '2.4 GHz' | '5 GHz';

export type MacMode = 'random' | 'default' | 'specific';

export interface Settings {
  macAddress: string; // 'random' | 'default' | specific MAC string
  displayHiddenAp: boolean;
  killNetworkManager: boolean;
}

export interface Client {
  mac: string;
  packets: number;
  power: number;
  firstTimeSeen: string;
  lastTimeSeen: string;
  vendor: string;
  probes: string;
}

export interface AccessPoint {
  essid: string;
  bssid: string;
  band: WirelessBand;
  channel: number;
  power: number;
  encryption: 'WPA2' | 'WPA3' | 'WPA2/WPA3' | 'WPA' | 'OPN';
  hidden: boolean;
  handshake: boolean;
  pmkid: boolean;
  savedHandshake: string | null;
  firstTimeSeen: string;
  lastTimeSeen: string;
  clients: Record<string, Client>;
  demoPassphrase?: string;
}

export type AttackTarget =
  | { kind: 'all' }
  | { kind: 'selection'; clients: string[] }
  | { kind: 'pmkid' };

export interface AttackState {
  bssid: string;
  essid: string;
  channel: number;
  target: AttackTarget;
  rate: number;
  disassoc: boolean;
  ticksElapsed: number;
  packetsSent: number;
}

export interface WirelessInterface {
  name: string;
  driver: string;
  chipset: string;
  supports5Ghz: boolean;
  permanentMac: string;
  currentMac: string;
}

export interface CrackableTarget {
  bssid: string;
  essid: string;
  hasHandshake: boolean;
  hasPmkid: boolean;
  demoPassphrase?: string;
}

export interface SavedCapture {
  id: string;
  filename: string;
  createdAt: string;
  targets: CrackableTarget[];
}

export interface WordlistPreset {
  id: string;
  name: string;
  sizeLabel: string;
  words: string[];
}

export interface DecryptJob {
  mode: 'dictionary' | 'bruteforce';
  captureFilename: string;
  bssid: string;
  essid: string;
  wordlistName?: string;
  words?: string[];
  charset?: string;
  minLen?: number;
  maxLen?: number;
  demoPassphrase?: string;
}

export type ApSortField =
  | 'essid'
  | 'bssid'
  | 'band'
  | 'channel'
  | 'power'
  | 'encryption'
  | 'clients'
  | 'firstTimeSeen'
  | 'lastTimeSeen'
  | 'handshake'
  | 'pmkid';

export type ClientSortField =
  | 'mac'
  | 'packets'
  | 'power'
  | 'firstTimeSeen'
  | 'lastTimeSeen'
  | 'vendor'
  | 'probes';

export type SortDirection = 'asc' | 'desc';

export interface NotificationToast {
  id: string;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'error';
}
