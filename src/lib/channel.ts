export const CHANNELS_2_4: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
];

export const CHANNELS_5: readonly number[] = [
  36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132,
  136, 140, 144, 149, 153, 157, 161, 165,
];

export const CRUNCH_LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
export const CRUNCH_UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const CRUNCH_NUMBERS = '0123456789';
export const CRUNCH_SYMBOLS = ' @!#$%^&*()-_+=~`[]{}|:;<>,.?/\\';

/**
 * Exact TypeScript port of crates/common/src/channel.rs::is_valid_channel_filter.
 * Every entry must be a known 2.4 GHz or 5 GHz channel whose band is enabled,
 * with no duplicates, no empty entries, and no trailing comma.
 */
export function isValidChannelFilter(
  channelFilter: string,
  ghz24: boolean,
  ghz5: boolean
): boolean {
  if (channelFilter === '') {
    return true;
  }
  if (channelFilter.endsWith(',') || channelFilter.startsWith(',')) {
    return false;
  }

  const seen = new Set<number>();
  const parts = channelFilter.split(',');

  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return false;
    }
    const channel = Number.parseInt(part, 10);
    const is24 = CHANNELS_2_4.includes(channel);
    const is5 = CHANNELS_5.includes(channel);

    if (!is24 && !is5) {
      return false;
    }
    if (is24 && !ghz24) {
      return false;
    }
    if (is5 && !ghz5) {
      return false;
    }
    if (seen.has(channel)) {
      return false;
    }
    seen.add(channel);
  }

  return true;
}

export function sanitizeChannelInput(raw: string): string {
  return raw.replace(/[^0-9,]/g, '');
}

export function parseChannelEntries(filter: string): number[] {
  if (!filter.trim()) return [];
  return filter
    .split(',')
    .filter((s) => /^\d+$/.test(s))
    .map((s) => Number.parseInt(s, 10));
}

export function formatChannelFilter(channels: number[]): string {
  const unique = Array.from(new Set(channels)).sort((a, b) => a - b);
  return unique.join(',');
}

export function getActiveHopChannels(
  ghz24: boolean,
  ghz5: boolean,
  channelFilter: string
): number[] {
  if (channelFilter.length > 0 && isValidChannelFilter(channelFilter, ghz24, ghz5)) {
    return parseChannelEntries(channelFilter);
  }
  const result: number[] = [];
  if (ghz24) result.push(...CHANNELS_2_4);
  if (ghz5) result.push(...CHANNELS_5);
  return result;
}

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

export function isValidMacAddress(mac: string): boolean {
  return MAC_REGEX.test(mac.trim());
}

export function dedupeCharset(input: string): string {
  const seen = new Set<string>();
  let out = '';
  for (const ch of input) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out += ch;
    }
  }
  return out;
}

export function buildCharsetString(params: {
  custom: string;
  lowercase: boolean;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
}): string {
  if (params.custom.length > 0) {
    return dedupeCharset(params.custom);
  }
  return [
    params.lowercase ? CRUNCH_LOWERCASE : '',
    params.uppercase ? CRUNCH_UPPERCASE : '',
    params.numbers ? CRUNCH_NUMBERS : '',
    params.symbols ? CRUNCH_SYMBOLS : '',
  ].join('');
}

export function generateRandomMac(): string {
  const bytes = [0x02]; // locally administered unicast
  for (let i = 1; i < 6; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  return bytes
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}
