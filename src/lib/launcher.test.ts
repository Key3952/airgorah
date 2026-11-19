import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
// @ts-expect-error ESM launcher module without .d.ts declaration
import { parseArgs, resolveSafeAssetPath, createAirgorahServer, buildElevationCommand } from '../../packaging/bin/airgorah-launcher.mjs';
// @ts-expect-error ESM wifi-guard module without .d.ts declaration
import { validateInterfaceName, parseIwDevOutput, captureInterface, restoreInterface, restoreFromStateAndSweep, readStateFile, writeStateAtomic, readProcStartTime, isProcessAlive } from '../../packaging/bin/wifi-guard.mjs';

test('parseArgs parses host, port, --sudo, --iface, --restore, and --no-open flags cleanly', () => {
  const opts = parseArgs(['--port', '4123', '--host=0.0.0.0', '--no-open', '--iface', 'wlan0']);
  assert.equal(opts.port, 4123);
  assert.equal(opts.host, '0.0.0.0');
  assert.equal(opts.open, false);
  assert.equal(opts.iface, 'wlan0');
  assert.equal(opts.elevate, true);
  assert.equal(opts.restore, false);

  const restoreOpts = parseArgs(['--restore', '--quiet']);
  assert.equal(restoreOpts.restore, true);
  assert.equal(restoreOpts.quiet, true);
});

test('parseArgs rejects invalid port numbers', () => {
  assert.throws(() => parseArgs(['--port', '99999']));
});

test('buildElevationCommand chooses sudo in TTY and pkexec in graphical sessions', () => {
  const ttyPlan = buildElevationCommand(
    ['--sudo', '--iface', 'wlan0'],
    { USER: 'alice', DISPLAY: ':0' },
    { isTTY: true, hasPkexec: true, hasSudo: true, hasDoas: false, execPath: '/usr/bin/airgorah' }
  );
  assert.equal(ttyPlan.cmd, 'sudo');
  assert.ok(ttyPlan.args.includes('AIRGORAH_REAL_USER=alice'));
  assert.ok(ttyPlan.args.includes('/usr/bin/airgorah'));
  assert.ok(ttyPlan.args.includes('--iface'));
  assert.ok(!ttyPlan.args.includes('--sudo'));

  const guiPlan = buildElevationCommand(
    ['--elevate', '--allow-fallback'],
    { USER: 'alice', WAYLAND_DISPLAY: 'wayland-0' },
    { isTTY: false, hasPkexec: true, hasSudo: true, hasDoas: false, execPath: '/usr/bin/airgorah' }
  );
  assert.equal(guiPlan.cmd, 'pkexec');
  assert.deepEqual(guiPlan.args, ['/usr/bin/airgorah']);
});

test('validateInterfaceName blocks shell injection and path traversal', () => {
  assert.equal(validateInterfaceName('wlan0'), 'wlan0');
  assert.equal(validateInterfaceName('wlp3s0f0'), 'wlp3s0f0');
  assert.throws(() => validateInterfaceName('wlan0; rm -rf /'));
  assert.throws(() => validateInterfaceName('../eth0'));
  assert.throws(() => validateInterfaceName(''));
});

test('parseIwDevOutput parses wireless interfaces, modes, MACs, and channels', () => {
  const sample = `phy#0
\tInterface wlan0
\t\tifindex 3
\t\taddr aa:bb:cc:dd:ee:01
\t\ttype managed
\t\tchannel 36 (5180 MHz)
phy#1
\tInterface wlan1
\t\taddr aa:bb:cc:dd:ee:02
\t\ttype monitor`;
  const parsed = parseIwDevOutput(sample);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'wlan0');
  assert.equal(parsed[0].mode, 'managed');
  assert.equal(parsed[0].mac, 'aa:bb:cc:dd:ee:01');
  assert.equal(parsed[0].channel, 36);
  assert.equal(parsed[1].name, 'wlan1');
  assert.equal(parsed[1].mode, 'monitor');
});

test('captureInterface snapshots state, detaches only target iface from NM, and rolls back on failure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airgorah-guard-'));
  const statePath = path.join(tmpDir, 'pending-restore.json');
  const calls: string[] = [];

  const mockRunner = (cmd: string, args: string[]) => {
    calls.push(`${cmd} ${args.join(' ')}`);
    if (cmd === 'iw' && args[0] === 'dev' && args.length === 1) {
      return { ok: true, status: 0, stdout: 'Interface wlan0\n\ttype managed\n\taddr 11:22:33:44:55:66\n', stderr: '' };
    }
    if (cmd === 'ethtool') {
      return { ok: true, status: 0, stdout: 'Permanent address: 11:22:33:44:55:66\n', stderr: '' };
    }
    if (cmd === 'nmcli' && args[0] === '-t') {
      return { ok: true, status: 0, stdout: 'wlan0:connected\neth0:connected\n', stderr: '' };
    }
    if (cmd === 'ip' && args[1] === 'show') {
      return { ok: true, status: 0, stdout: '3: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP>', stderr: '' };
    }
    // Simulate driver refusing monitor mode
    if (cmd === 'iw' && args.includes('monitor')) {
      return { ok: false, status: 1, stdout: '', stderr: 'Operation not supported (-95)' };
    }
    return { ok: true, status: 0, stdout: '', stderr: '' };
  };

  try {
    assert.throws(() =>
      captureInterface('wlan0', {
        runner: mockRunner,
        statePath,
        skipRootCheck: true,
      })
    );

    // Must never globally kill NetworkManager; only per-device managed no/yes
    assert.ok(calls.includes('nmcli device set wlan0 managed no'));
    assert.ok(calls.includes('nmcli device set wlan0 managed yes'));
    assert.ok(calls.includes('iw dev wlan0 set type managed'));
    assert.ok(calls.includes('ip link set dev wlan0 address 11:22:33:44:55:66'));
    assert.ok(calls.includes('ip link set dev wlan0 up'));
    // State file must be cleaned up after rollback
    assert.equal(fs.existsSync(statePath), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('restoreFromStateAndSweep restores both snapshotted adapter and orphaned monitor adapter', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airgorah-sweep-'));
  const statePath = path.join(tmpDir, 'pending-restore.json');
  const calls: string[] = [];

  writeStateAtomic(statePath, {
    iface: 'wlan0',
    originalMode: 'managed',
    originalMac: 'aa:bb:cc:dd:ee:01',
    wasUp: true,
    networkManagerManaged: true,
    stoppedServices: [],
  });

  const mockRunner = (cmd: string, args: string[]) => {
    calls.push(`${cmd} ${args.join(' ')}`);
    if (cmd === 'iw' && args[0] === 'dev' && args.length === 1) {
      return {
        ok: true,
        status: 0,
        stdout: 'Interface wlan0\n\ttype managed\nInterface wlan1\n\ttype monitor\n',
        stderr: '',
      };
    }
    if (cmd === 'ethtool' && args[1] === 'wlan1') {
      return { ok: true, status: 0, stdout: 'Permanent address: aa:bb:cc:dd:ee:02\n', stderr: '' };
    }
    return { ok: true, status: 0, stdout: '', stderr: '' };
  };

  try {
    const results = restoreFromStateAndSweep({ runner: mockRunner, statePath });
    assert.equal(results.length, 2);
    assert.ok(calls.includes('iw dev wlan0 set type managed'));
    assert.ok(calls.includes('iw dev wlan1 set type managed'));
    assert.ok(calls.includes('ip link set dev wlan1 address aa:bb:cc:dd:ee:02'));
    assert.equal(fs.existsSync(statePath), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('independent watchdog restores Wi-Fi state automatically even after owner receives SIGKILL (kill -9)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airgorah-sigkill-'));
  const statePath = path.join(tmpDir, 'pending-restore.json');
  const launcherPath = path.resolve('packaging/bin/airgorah-launcher.mjs');

  // Spawn a dummy owner process that we will brutally terminate with SIGKILL (kill -9)
  const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
    stdio: 'ignore',
  });
  assert.ok(owner.pid);
  const startTime = readProcStartTime(owner.pid);
  assert.ok(isProcessAlive(owner.pid, startTime));

  writeStateAtomic(statePath, {
    iface: 'wlan0',
    originalMode: 'managed',
    originalMac: '11:22:33:44:55:66',
    wasUp: true,
    networkManagerManaged: false,
    stoppedServices: [],
    ownerPid: owner.pid,
    ownerStartTime: startTime,
  });

  // Spawn the real watchdog process pointing at our temp state file
  const watchdog = spawn(
    process.execPath,
    [
      launcherPath,
      '--watchdog',
      '--pid',
      String(owner.pid),
      ...(startTime ? ['--start-time', startTime] : []),
      '--state',
      statePath,
    ],
    { stdio: 'ignore' }
  );

  try {
    // Wait briefly to confirm watchdog does NOT clear state while owner is alive
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(fs.existsSync(statePath), true);

    // Brutally kill owner with SIGKILL (cannot be caught by owner process)
    owner.kill('SIGKILL');

    // Wait for watchdog to detect death, execute restore sequence, and clear pending state file
    const deadline = Date.now() + 4000;
    while (fs.existsSync(statePath) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    assert.equal(
      fs.existsSync(statePath),
      false,
      'Watchdog should restore and clear state file automatically after SIGKILL'
    );
  } finally {
    try {
      owner.kill('SIGKILL');
    } catch {
      // already dead
    }
    try {
      watchdog.kill('SIGTERM');
    } catch {
      // already exited
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolveSafeAssetPath prevents directory traversal, malformed URIs, and falls back for SPA routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airgorah-launcher-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html>Airgorah</html>');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("ok");');

    assert.equal(
      resolveSafeAssetPath(tmpDir, '/'),
      path.join(tmpDir, 'index.html')
    );
    assert.equal(
      resolveSafeAssetPath(tmpDir, '/app.js'),
      path.join(tmpDir, 'app.js')
    );
    assert.equal(
      resolveSafeAssetPath(tmpDir, '/settings'),
      path.join(tmpDir, 'index.html')
    );
    assert.equal(resolveSafeAssetPath(tmpDir, '/missing.js'), null);
    assert.equal(resolveSafeAssetPath(tmpDir, '/../../etc/passwd'), null);
    assert.equal(resolveSafeAssetPath(tmpDir, '/%E0%A4%A'), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createAirgorahServer serves index.html, system status API, blocks traversal, and rejects POST on static routes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airgorah-http-'));
  const indexHtml = '<!doctype html><title>Airgorah</title>';
  fs.writeFileSync(path.join(tmpDir, 'index.html'), indexHtml);

  let restoredCount = 0;
  const server = createAirgorahServer(tmpDir, {
    getStatus: () => ({
      managedByLauncher: true,
      platform: 'linux',
      isRoot: false,
      elevatedUser: null,
      activeLease: null,
      watchdogPid: null,
      interfaces: [],
    }),
    capture: () => {
      const err = new Error('Root required') as Error & { code?: string };
      err.code = 'EACCES';
      throw err;
    },
    restore: () => {
      restoredCount += 1;
      return { restored: true, results: [] };
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${addr.port}`;

    const rootRes = await fetch(`${base}/`);
    assert.equal(rootRes.status, 200);
    assert.equal(await rootRes.text(), indexHtml);

    const statusRes = await fetch(`${base}/api/system/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.managedByLauncher, true);

    const captureRes = await fetch(`${base}/api/system/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iface: 'wlan0' }),
    });
    assert.equal(captureRes.status, 403);

    const restoreRes = await fetch(`${base}/api/system/restore`, { method: 'POST' });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoredCount, 1);

    const notFoundRes = await fetch(`${base}/does-not-exist.png`);
    assert.equal(notFoundRes.status, 404);

    const postRes = await fetch(`${base}/`, { method: 'POST' });
    assert.equal(postRes.status, 405);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Keep restoreInterface referenced cleanly for lint
assert.equal(typeof restoreInterface, 'function');
assert.equal(typeof readStateFile, 'function');
