#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

export const DEFAULT_STATE_FILE = '/var/lib/airgorah/pending-restore.json';
const IFACE_REGEX = /^[a-zA-Z0-9_.-]{1,15}$/;
const MAC_REGEX = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;

export function validateInterfaceName(iface) {
  if (typeof iface !== 'string' || !IFACE_REGEX.test(iface)) {
    throw new Error(`Invalid wireless interface name: "${String(iface)}"`);
  }
  if (iface === '.' || iface === '..' || iface.includes('..')) {
    throw new Error(`Unsafe wireless interface name: "${iface}"`);
  }
  return iface;
}

export function isValidMac(mac) {
  return typeof mac === 'string' && MAC_REGEX.test(mac.trim());
}

/**
 * Default command runner using execFileSync (never invokes a shell).
 */
export function defaultRunner(cmd, args = [], opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout ?? 10000,
    });
    return { ok: true, status: 0, stdout: stdout || '', stderr: '' };
  } catch (err) {
    return {
      ok: false,
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: typeof err.stdout === 'string' ? err.stdout : '',
      stderr: typeof err.stderr === 'string' ? err.stderr : String(err.message || err),
      notFound: err.code === 'ENOENT',
    };
  }
}

/**
 * Reads field 22 (starttime in clock ticks since boot) from /proc/<pid>/stat
 * so PID reuse cannot trick the watchdog.
 */
export function readProcStartTime(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    // Process comm can contain spaces/parentheses; anchor at the last ')'.
    const closeIdx = raw.lastIndexOf(')');
    if (closeIdx === -1) return null;
    const fieldsAfterComm = raw.slice(closeIdx + 2).trim().split(/\s+/);
    // Field 3 is index 0 here (state), so field 22 (starttime) is index 19.
    return fieldsAfterComm[19] || null;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid, expectedStartTime = null) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (err) {
    if (err && err.code === 'ESRCH') return false;
    // EPERM means process exists under another UID
  }
  if (expectedStartTime) {
    const currentStart = readProcStartTime(pid);
    if (!currentStart) return false;
    return currentStart === String(expectedStartTime);
  }
  return true;
}

export function parseIwDevOutput(output) {
  const interfaces = [];
  let current = null;

  for (const rawLine of String(output || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const ifaceMatch = line.match(/^Interface\s+([^\s]+)$/);
    if (ifaceMatch) {
      if (current) interfaces.push(current);
      current = {
        name: ifaceMatch[1],
        mode: 'managed',
        mac: null,
        channel: null,
      };
      continue;
    }

    if (!current) continue;

    const typeMatch = line.match(/^type\s+([^\s]+)$/);
    if (typeMatch) {
      current.mode = typeMatch[1].toLowerCase();
      continue;
    }

    const addrMatch = line.match(/^addr\s+([0-9a-fA-F:]{17})$/);
    if (addrMatch) {
      current.mac = addrMatch[1].toLowerCase();
      continue;
    }

    const chMatch = line.match(/^channel\s+(\d+)/);
    if (chMatch) {
      current.channel = Number.parseInt(chMatch[1], 10);
    }
  }

  if (current) interfaces.push(current);
  return interfaces;
}

export function listLinuxWifiInterfaces(runner = defaultRunner) {
  const res = runner('iw', ['dev']);
  if (!res.ok) return [];
  const parsed = parseIwDevOutput(res.stdout);

  return parsed.map((item) => {
    let operstate = 'unknown';
    let sysMac = item.mac;
    let driver = 'unknown';

    try {
      operstate = fs
        .readFileSync(`/sys/class/net/${item.name}/operstate`, 'utf8')
        .trim();
    } catch {
      // ignore
    }

    if (!sysMac) {
      try {
        sysMac = fs
          .readFileSync(`/sys/class/net/${item.name}/address`, 'utf8')
          .trim()
          .toLowerCase();
      } catch {
        // ignore
      }
    }

    try {
      const uevent = fs.readFileSync(
        `/sys/class/net/${item.name}/device/uevent`,
        'utf8'
      );
      const drvMatch = uevent.match(/^DRIVER=(.+)$/m);
      if (drvMatch) driver = drvMatch[1].trim();
    } catch {
      // ignore
    }

    return {
      ...item,
      mac: sysMac || '00:00:00:00:00:00',
      operstate,
      driver,
    };
  });
}

export function detectPermanentMac(iface, runner = defaultRunner) {
  validateInterfaceName(iface);

  const ethtool = runner('ethtool', ['-P', iface]);
  if (ethtool.ok) {
    const match = ethtool.stdout.match(/Permanent address:\s*([0-9a-fA-F:]{17})/i);
    if (match && isValidMac(match[1]) && match[1] !== '00:00:00:00:00:00') {
      return match[1].toLowerCase();
    }
  }

  try {
    const addr = fs.readFileSync(`/sys/class/net/${iface}/address`, 'utf8').trim();
    if (isValidMac(addr) && addr !== '00:00:00:00:00:00') {
      return addr.toLowerCase();
    }
  } catch {
    // ignore
  }

  const ipRes = runner('ip', ['link', 'show', 'dev', iface]);
  if (ipRes.ok) {
    const match = ipRes.stdout.match(/link\/ether\s+([0-9a-fA-F:]{17})/i);
    if (match && isValidMac(match[1])) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

export function isNetworkManagerManaging(iface, runner = defaultRunner) {
  const res = runner('nmcli', ['-t', '-f', 'DEVICE,STATE', 'dev']);
  if (!res.ok) return false;
  for (const line of res.stdout.split('\n')) {
    const [dev, state] = line.trim().split(':');
    if (dev === iface) {
      return Boolean(state && state.toLowerCase() !== 'unmanaged');
    }
  }
  return false;
}

export function isSystemdUnitActive(unitName, runner = defaultRunner) {
  const res = runner('systemctl', ['is-active', '--quiet', unitName]);
  return res.ok;
}

export function writeStateAtomic(statePath, stateObj) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${statePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(stateObj, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tmpPath, statePath);
}

export function readStateFile(statePath) {
  try {
    if (!fs.existsSync(statePath)) return null;
    const raw = fs.readFileSync(statePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function removeStateFile(statePath) {
  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
  } catch {
    // ignore
  }
}

export function snapshotInterfaceState(iface, options = {}) {
  validateInterfaceName(iface);
  const runner = options.runner || defaultRunner;
  const ownerPid = options.ownerPid ?? process.pid;
  const ownerStartTime =
    options.ownerStartTime !== undefined
      ? options.ownerStartTime
      : readProcStartTime(ownerPid);

  const wifiList = parseIwDevOutput(runner('iw', ['dev']).stdout);
  const found = wifiList.find((item) => item.name === iface);
  const currentMode = found?.mode || 'managed';

  const originalMac = detectPermanentMac(iface, runner);
  const nmManaged = isNetworkManagerManaging(iface, runner);
  const stoppedServices = [];

  // Only consider stopping per-interface Wi-Fi services if NetworkManager isn't managing it
  if (!nmManaged) {
    if (isSystemdUnitActive(`wpa_supplicant@${iface}.service`, runner)) {
      stoppedServices.push(`wpa_supplicant@${iface}.service`);
    }
    if (isSystemdUnitActive('iwd.service', runner)) {
      stoppedServices.push('iwd.service');
    }
  }

  let wasUp = true;
  const linkShow = runner('ip', ['link', 'show', 'dev', iface]);
  if (linkShow.ok) {
    wasUp = /\bUP\b/.test(linkShow.stdout);
  }

  return {
    version: 1,
    iface,
    monitorIface: null,
    originalMode: currentMode === 'monitor' ? 'managed' : currentMode,
    originalMac,
    wasUp,
    networkManagerManaged: nmManaged,
    stoppedServices,
    systemdNetworkd: isSystemdUnitActive('systemd-networkd.service', runner),
    ownerPid,
    ownerStartTime,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Safely captures a Wi-Fi interface into monitor mode with automatic rollback
 * on any failure and persistent state saving BEFORE touching the adapter.
 */
export function captureInterface(iface, options = {}) {
  validateInterfaceName(iface);
  const runner = options.runner || defaultRunner;
  const statePath = options.statePath || process.env.AIRGORAH_STATE_FILE || DEFAULT_STATE_FILE;
  const skipRootCheck = Boolean(options.skipRootCheck);

  if (!skipRootCheck && typeof process.geteuid === 'function' && process.geteuid() !== 0) {
    throw new Error(
      'Root privileges are required to capture a Wi-Fi interface. Re-run with "airgorah --sudo" or "sudo airgorah".'
    );
  }

  // If a stale state exists for another interface, restore it first
  const existing = readStateFile(statePath);
  if (existing && existing.iface && existing.iface !== iface) {
    restoreInterface(existing, { runner, statePath });
  }

  const snapshot = snapshotInterfaceState(iface, {
    runner,
    ownerPid: options.ownerPid ?? process.pid,
    ownerStartTime: options.ownerStartTime,
  });

  // Persist snapshot BEFORE modifying anything so even immediate SIGKILL / power loss can recover
  writeStateAtomic(statePath, snapshot);

  try {
    // 1. Detach ONLY this Wi-Fi interface from NetworkManager (never kills Ethernet/VPN/other Wi-Fi)
    if (snapshot.networkManagerManaged) {
      runner('nmcli', ['device', 'set', iface, 'managed', 'no']);
    }

    // 2. Stop only recorded non-NM Wi-Fi daemons holding this adapter
    for (const svc of snapshot.stoppedServices) {
      runner('systemctl', ['stop', svc]);
    }

    // 3. Unblock Wi-Fi rfkill and switch interface cleanly to monitor mode
    runner('rfkill', ['unblock', 'wifi']);

    const downRes = runner('ip', ['link', 'set', 'dev', iface, 'down']);
    if (!downRes.ok) {
      throw new Error(`Failed to bring ${iface} down: ${downRes.stderr.trim()}`);
    }

    if (options.spoofMac && isValidMac(options.spoofMac)) {
      runner('ip', ['link', 'set', 'dev', iface, 'address', options.spoofMac.toLowerCase()]);
    }

    const monRes = runner('iw', ['dev', iface, 'set', 'type', 'monitor']);
    if (!monRes.ok) {
      throw new Error(`Failed to enable monitor mode on ${iface}: ${monRes.stderr.trim()}`);
    }

    const upRes = runner('ip', ['link', 'set', 'dev', iface, 'up']);
    if (!upRes.ok) {
      throw new Error(`Failed to bring ${iface} up in monitor mode: ${upRes.stderr.trim()}`);
    }

    return snapshot;
  } catch (err) {
    // Immediate atomic rollback so a partial failure never leaves the adapter broken
    restoreInterface(snapshot, { runner, statePath });
    throw err;
  }
}

/**
 * Idempotent, best-effort Wi-Fi restoration. Every step runs independently so
 * one non-critical failure can never prevent restoring internet connectivity.
 */
export function restoreInterface(state, options = {}) {
  const runner = options.runner || defaultRunner;
  const statePath = options.statePath || process.env.AIRGORAH_STATE_FILE || DEFAULT_STATE_FILE;
  const steps = [];

  if (!state || !state.iface) {
    removeStateFile(statePath);
    return { restored: false, steps };
  }

  const iface = validateInterfaceName(state.iface);
  const targetMode =
    state.originalMode && state.originalMode !== 'monitor'
      ? state.originalMode
      : 'managed';

  const runStep = (label, cmd, args) => {
    const res = runner(cmd, args);
    steps.push({ label, cmd: [cmd, ...args].join(' '), ok: res.ok, stderr: res.stderr.trim() });
    return res;
  };

  // 1. Delete stray virtual monitor interface if one was created
  if (state.monitorIface && state.monitorIface !== iface) {
    validateInterfaceName(state.monitorIface);
    runStep('delete-monitor-vif', 'iw', ['dev', state.monitorIface, 'del']);
  }

  // 2. Ensure Wi-Fi is not soft-blocked
  runStep('rfkill-unblock', 'rfkill', ['unblock', 'wifi']);

  // 3. Bring adapter down before mode/MAC restoration
  runStep('link-down', 'ip', ['link', 'set', 'dev', iface, 'down']);

  // 4. Restore original hardware MAC if recorded
  if (state.originalMac && isValidMac(state.originalMac)) {
    runStep('restore-mac', 'ip', ['link', 'set', 'dev', iface, 'address', state.originalMac]);
  }

  // 5. Switch back to managed mode
  runStep('restore-managed-mode', 'iw', ['dev', iface, 'set', 'type', targetMode]);

  // 6. Bring adapter back UP (default UP so user's internet always returns)
  if (state.wasUp !== false) {
    runStep('link-up', 'ip', ['link', 'set', 'dev', iface, 'up']);
  }

  // 7. Re-attach to NetworkManager / iwd / wpa_supplicant / systemd-networkd
  if (state.networkManagerManaged || isSystemdUnitActive('NetworkManager.service', runner)) {
    runStep('nm-radio-on', 'nmcli', ['radio', 'wifi', 'on']);
    runStep('nm-managed-yes', 'nmcli', ['device', 'set', iface, 'managed', 'yes']);
    runStep('nm-reconnect', 'nmcli', ['device', 'connect', iface]);
  }

  for (const svc of state.stoppedServices || []) {
    runStep(`restart-${svc}`, 'systemctl', ['start', svc]);
  }

  if (state.systemdNetworkd) {
    runStep('networkd-reconfigure', 'networkctl', ['reconfigure', iface]);
  }

  removeStateFile(statePath);
  return { restored: true, iface, targetMode, steps };
}

/**
 * Restores from the saved pending-restore snapshot AND sweeps `iw dev` for any
 * orphaned monitor-mode interface so `airgorah --restore` always fixes internet.
 */
export function restoreFromStateAndSweep(options = {}) {
  const runner = options.runner || defaultRunner;
  const statePath = options.statePath || process.env.AIRGORAH_STATE_FILE || DEFAULT_STATE_FILE;
  const results = [];

  const saved = readStateFile(statePath);
  if (saved && saved.iface) {
    results.push(restoreInterface(saved, { runner, statePath }));
  }

  // Fallback sweep: check if any wireless interface is still stuck in monitor mode
  const currentIfaces = parseIwDevOutput(runner('iw', ['dev']).stdout);
  for (const item of currentIfaces) {
    if (item.mode === 'monitor') {
      const alreadyHandled = results.some((r) => r.iface === item.name);
      if (alreadyHandled) continue;
      const permMac = detectPermanentMac(item.name, runner);
      results.push(
        restoreInterface(
          {
            iface: item.name,
            originalMode: 'managed',
            originalMac: permMac,
            wasUp: true,
            networkManagerManaged: true,
            stoppedServices: [],
            systemdNetworkd: isSystemdUnitActive('systemd-networkd.service', runner),
          },
          { runner, statePath }
        )
      );
    }
  }

  return results;
}

/**
 * Spawns a detached independent watchdog process that survives SIGKILL/OOM
 * of the main Airgorah process and immediately restores the Wi-Fi module.
 */
export function spawnWatchdog({ launcherPath, ownerPid, statePath }) {
  const startTime = readProcStartTime(ownerPid) || '';
  const args = [
    launcherPath,
    '--watchdog',
    '--pid',
    String(ownerPid),
    '--state',
    statePath,
  ];
  if (startTime) {
    args.push('--start-time', startTime);
  }

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      AIRGORAH_STATE_FILE: statePath,
    },
  });
  child.unref();
  return child.pid;
}

/**
 * Runs inside the detached watchdog process.
 * Monitors `ownerPid` and restores Wi-Fi immediately if the owner dies for ANY reason
 * (including `kill -9` / SIGKILL, crash, or OOM kill).
 */
export function runWatchdogLoop({
  ownerPid,
  expectedStartTime = null,
  statePath = DEFAULT_STATE_FILE,
  pollMs = 400,
  runner = defaultRunner,
  onRestore = null,
}) {
  // Lower OOM score so the kernel won't kill the watchdog before the main process
  try {
    fs.writeFileSync('/proc/self/oom_score_adj', '-500', 'utf8');
  } catch {
    // Non-root or restricted container — ignore safely
  }

  let finished = false;
  const finishAndRestoreIfNeeded = (reason) => {
    if (finished) return;
    finished = true;
    clearInterval(timer);

    const pending = readStateFile(statePath);
    if (pending && pending.iface) {
      const result = restoreInterface(pending, { runner, statePath });
      runner('logger', [
        '-t',
        'airgorah-guard',
        `Restored Wi-Fi interface ${pending.iface} (${reason})`,
      ]);
      if (typeof onRestore === 'function') {
        onRestore(result, reason);
      }
    }
    process.exit(0);
  };

  const timer = setInterval(() => {
    // If state file was already cleaned up by graceful shutdown, watchdog can exit
    if (!fs.existsSync(statePath)) {
      finished = true;
      clearInterval(timer);
      process.exit(0);
      return;
    }

    if (!isProcessAlive(ownerPid, expectedStartTime)) {
      finishAndRestoreIfNeeded(`owner pid ${ownerPid} exited`);
    }
  }, pollMs);

  process.on('SIGTERM', () => finishAndRestoreIfNeeded('watchdog SIGTERM'));
  process.on('SIGINT', () => finishAndRestoreIfNeeded('watchdog SIGINT'));
  process.on('SIGHUP', () => finishAndRestoreIfNeeded('watchdog SIGHUP'));
}
