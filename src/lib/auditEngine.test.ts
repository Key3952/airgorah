import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJsonReport,
  buildPcapCaptureBuffer,
  computeAttackChannelLock,
  sortAccessPoints,
  stepScanTick,
} from './auditEngine';
import {
  createSeedAccessPoints,
  createSeedUnlinkedClients,
} from './seedData';
import type { AttackState } from '../types';

test('computeAttackChannelLock pins attacked channels and keeps them parked after stop', () => {
  const attacks: Record<string, AttackState> = {
    'B0:BE:76:5D:88:14': {
      bssid: 'B0:BE:76:5D:88:14',
      essid: 'Office-Guest',
      channel: 11,
      target: { kind: 'all' },
      rate: 10,
      disassoc: false,
      ticksElapsed: 0,
      packetsSent: 0,
    },
  };

  // Start first attack on ch 11 -> locks to "11"
  const r1 = computeAttackChannelLock('', attacks, false);
  assert.equal(r1.isLocked, true);
  assert.equal(r1.nextFilter, '11');

  // Add second attack on ch 6 -> filter grows to "6,11"
  attacks['78:8A:20:43:E1:6B'] = {
    bssid: '78:8A:20:43:E1:6B',
    essid: 'Studio-Mesh',
    channel: 6,
    target: { kind: 'pmkid' },
    rate: 1,
    disassoc: false,
    ticksElapsed: 0,
    packetsSent: 0,
  };
  const r2 = computeAttackChannelLock(r1.nextFilter, attacks, r1.isLocked);
  assert.equal(r2.isLocked, true);
  assert.equal(r2.nextFilter, '6,11');

  // Stop first attack -> ch 11 remains in filter while second runs
  delete attacks['B0:BE:76:5D:88:14'];
  const r3 = computeAttackChannelLock(r2.nextFilter, attacks, r2.isLocked);
  assert.equal(r3.isLocked, true);
  assert.equal(r3.nextFilter, '6,11');

  // Stop last attack -> unlocks controls while staying parked on "6,11"
  delete attacks['78:8A:20:43:E1:6B'];
  const r4 = computeAttackChannelLock(r3.nextFilter, attacks, r3.isLocked);
  assert.equal(r4.isLocked, false);
  assert.equal(r4.nextFilter, '6,11');
});

test('stepScanTick captures handshake during deauth attack after 3 ticks', () => {
  const aps = createSeedAccessPoints();
  const unlinked = createSeedUnlinkedClients();
  const targetBssid = 'B0:BE:76:5D:88:14'; // Office-Guest, ch 11, 5 clients, handshake=false

  assert.equal(aps[targetBssid].handshake, false);

  let state = {
    aps,
    unlinkedClients: unlinked,
    attacks: {
      [targetBssid]: {
        bssid: targetBssid,
        essid: 'Office-Guest',
        channel: 11,
        target: { kind: 'all' as const },
        rate: 10,
        disassoc: true,
        ticksElapsed: 0,
        packetsSent: 0,
      },
    } as Record<string, AttackState>,
    hopIndex: 0,
  };

  let capturedHandshake = false;
  for (let i = 0; i < 4; i++) {
    const res = stepScanTick({
      ...state,
      ghz24: true,
      ghz5: true,
      channelFilter: '11',
    });
    state = {
      aps: res.aps,
      unlinkedClients: res.unlinkedClients,
      attacks: res.attacks,
      hopIndex: res.nextHopIndex,
    };
    if (res.newlyCaptured.some((c) => c.bssid === targetBssid && c.kind === 'Handshake')) {
      capturedHandshake = true;
    }
  }

  assert.equal(capturedHandshake, true);
  assert.equal(state.aps[targetBssid].handshake, true);
  assert.ok(state.attacks[targetBssid].packetsSent > 0);
});

test('stepScanTick captures PMKID during clientless PMKID solicitation', () => {
  const aps = createSeedAccessPoints();
  const unlinked = createSeedUnlinkedClients();
  const targetBssid = '78:8A:20:43:E1:6B'; // Studio-Mesh, ch 6, pmkid=false

  let state = {
    aps,
    unlinkedClients: unlinked,
    attacks: {
      [targetBssid]: {
        bssid: targetBssid,
        essid: 'Studio-Mesh',
        channel: 6,
        target: { kind: 'pmkid' as const },
        rate: 1,
        disassoc: false,
        ticksElapsed: 0,
        packetsSent: 0,
      },
    } as Record<string, AttackState>,
    hopIndex: 0,
  };

  let capturedPmkid = false;
  for (let i = 0; i < 4; i++) {
    const res = stepScanTick({
      ...state,
      ghz24: true,
      ghz5: true,
      channelFilter: '6',
    });
    state = {
      aps: res.aps,
      unlinkedClients: res.unlinkedClients,
      attacks: res.attacks,
      hopIndex: res.nextHopIndex,
    };
    if (res.newlyCaptured.some((c) => c.bssid === targetBssid && c.kind === 'PMKID')) {
      capturedPmkid = true;
    }
  }

  assert.equal(capturedPmkid, true);
  assert.equal(state.aps[targetBssid].pmkid, true);
});

test('sortAccessPoints orders numeric power descending and clients descending', () => {
  const aps = Object.values(createSeedAccessPoints());
  const byPower = sortAccessPoints(aps, 'power', 'desc');
  assert.equal(byPower[0].essid, 'LabCorp-5G');
  assert.equal(byPower[0].power, -40);

  const byClients = sortAccessPoints(aps, 'clients', 'desc');
  assert.equal(Object.keys(byClients[0].clients).length, 6);
});

test('buildJsonReport emits valid Airgorah JSON schema', () => {
  const aps = createSeedAccessPoints();
  const unlinked = createSeedUnlinkedClients();
  const json = buildJsonReport(aps, unlinked);
  const parsed = JSON.parse(json);
  assert.ok(Array.isArray(parsed.access_points));
  assert.ok(Array.isArray(parsed.unlinked_clients));
  assert.equal(parsed.access_points.length, Object.keys(aps).length);
  assert.equal(parsed.unlinked_clients.length, Object.keys(unlinked).length);
});

test('buildPcapCaptureBuffer emits valid libpcap magic header and 802.11 link type', () => {
  const aps = Object.values(createSeedAccessPoints()).slice(0, 2);
  const bytes = buildPcapCaptureBuffer(aps);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0xa1b2c3d4);
  assert.equal(view.getUint16(4, true), 2);
  assert.equal(view.getUint16(6, true), 4);
  assert.equal(view.getUint32(20, true), 105); // IEEE 802.11
  assert.ok(bytes.byteLength > 24 + 32);
});
