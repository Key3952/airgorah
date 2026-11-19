#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  DEFAULT_STATE_FILE,
  captureInterface,
  listLinuxWifiInterfaces,
  readStateFile,
  restoreFromStateAndSweep,
  restoreInterface,
  runWatchdogLoop,
  spawnWatchdog,
} from './wifi-guard.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function parseArgs(argv) {
  const opts = {
    host: process.env.AIRGORAH_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.PORT || process.env.AIRGORAH_PORT || '3000', 10),
    open: true,
    showHelp: false,
    showVersion: false,
    elevate: false,
    allowFallback: false,
    restore: false,
    quiet: false,
    iface: null,
    watchdog: false,
    watchdogPid: null,
    watchdogStartTime: null,
    stateFile: process.env.AIRGORAH_STATE_FILE || DEFAULT_STATE_FILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.showHelp = true;
    } else if (arg === '--version' || arg === '-v') {
      opts.showVersion = true;
    } else if (arg === '--no-open') {
      opts.open = false;
    } else if (arg === '--sudo' || arg === '--elevate') {
      opts.elevate = true;
    } else if (arg === '--no-elevate') {
      opts.elevate = false;
    } else if (arg === '--allow-fallback') {
      opts.allowFallback = true;
    } else if (arg === '--restore') {
      opts.restore = true;
    } else if (arg === '--quiet' || arg === '-q') {
      opts.quiet = true;
    } else if ((arg === '--iface' || arg === '-i') && argv[i + 1]) {
      opts.iface = argv[++i];
      opts.elevate = true;
    } else if (arg.startsWith('--iface=')) {
      opts.iface = arg.slice('--iface='.length);
      opts.elevate = true;
    } else if (arg === '--watchdog') {
      opts.watchdog = true;
    } else if (arg === '--pid' && argv[i + 1]) {
      opts.watchdogPid = Number.parseInt(argv[++i], 10);
    } else if (arg === '--start-time' && argv[i + 1]) {
      opts.watchdogStartTime = argv[++i];
    } else if (arg === '--state' && argv[i + 1]) {
      opts.stateFile = argv[++i];
    } else if (arg === '--host' && argv[i + 1]) {
      opts.host = argv[++i];
    } else if (arg.startsWith('--host=')) {
      opts.host = arg.slice('--host='.length);
    } else if ((arg === '--port' || arg === '-p') && argv[i + 1]) {
      opts.port = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith('--port=')) {
      opts.port = Number.parseInt(arg.slice('--port='.length), 10);
    }
  }

  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    throw new Error(`Invalid port value: ${opts.port}`);
  }

  return opts;
}

export function resolveDistDir(baseDir = __dirname) {
  const candidates = [
    process.env.AIRGORAH_DIST_DIR,
    path.resolve(baseDir, '../dist'),
    path.resolve(baseDir, '../share/airgorah/dist'),
    '/usr/share/airgorah/dist',
    path.resolve(baseDir, '../../dist'),
    path.resolve(process.cwd(), 'dist'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }

  throw new Error(
    `Could not locate Airgorah dist/ assets. Checked:\n${candidates.join('\n')}`
  );
}

export function resolveVersion(baseDir = __dirname) {
  const candidates = [
    path.resolve(baseDir, '../version.txt'),
    path.resolve(baseDir, '../share/airgorah/version.txt'),
    '/usr/share/airgorah/version.txt',
    path.resolve(baseDir, '../../package.json'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const raw = fs.readFileSync(candidate, 'utf8').trim();
    if (candidate.endsWith('.json')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.version) return String(parsed.version);
      } catch {
        // continue
      }
    } else if (raw) {
      return raw;
    }
  }

  return '0.9.0';
}

export function resolveSafeAssetPath(distDir, requestUrl) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((requestUrl || '/').split('?')[0]);
  } catch {
    return null;
  }
  const cleanRel = urlPath.replace(/^\/+/, '');
  const resolved = path.resolve(distDir, cleanRel || 'index.html');
  const normalizedRoot = path.resolve(distDir);

  if (
    resolved !== normalizedRoot &&
    !resolved.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    return null;
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }

  // SPA fallback for client routes (only if no explicit file extension was requested)
  if (!path.extname(cleanRel)) {
    return path.join(normalizedRoot, 'index.html');
  }

  return null;
}

export function isRunningAsRoot() {
  return typeof process.geteuid === 'function' && process.geteuid() === 0;
}

function commandExists(cmd) {
  const res = spawnSync('which', [cmd], { stdio: 'ignore' });
  return res.status === 0;
}

function resolveUsernameFromUid(uid) {
  try {
    const passwd = fs.readFileSync('/etc/passwd', 'utf8');
    for (const line of passwd.split('\n')) {
      const parts = line.split(':');
      if (parts.length >= 3 && parts[2] === String(uid)) {
        return parts[0];
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveInvokingDesktopUser() {
  if (process.env.AIRGORAH_REAL_USER && process.env.AIRGORAH_REAL_USER !== 'root') {
    return process.env.AIRGORAH_REAL_USER;
  }
  if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
    return process.env.SUDO_USER;
  }
  if (process.env.PKEXEC_UID && process.env.PKEXEC_UID !== '0') {
    return resolveUsernameFromUid(process.env.PKEXEC_UID);
  }
  return null;
}

/**
 * Re-executes Airgorah with root privileges via sudo/doas (terminal) or pkexec (GUI).
 * Preserves desktop display variables so the browser still opens as the normal user.
 */
export function buildElevationCommand(argv, env = process.env, { isTTY, hasPkexec, hasSudo, hasDoas, execPath }) {
  const filteredArgs = argv.filter(
    (a) => a !== '--sudo' && a !== '--elevate' && a !== '--allow-fallback'
  );
  const currentUser = env.USER || env.LOGNAME || '';
  const preservedEnvKeys = [
    'DISPLAY',
    'WAYLAND_DISPLAY',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    'XAUTHORITY',
    'AIRGORAH_DIST_DIR',
    'AIRGORAH_STATE_FILE',
  ];

  const envPairs = preservedEnvKeys
    .filter((k) => Boolean(env[k]))
    .map((k) => `${k}=${env[k]}`);
  if (currentUser && currentUser !== 'root') {
    envPairs.push(`AIRGORAH_REAL_USER=${currentUser}`);
  }

  // Prefer sudo/doas inside interactive terminal, pkexec in graphical desktop sessions
  if (isTTY) {
    if (hasSudo) {
      return {
        cmd: 'sudo',
        args: ['env', ...envPairs, execPath, ...filteredArgs],
        method: 'sudo',
      };
    }
    if (hasDoas) {
      return {
        cmd: 'doas',
        args: ['env', ...envPairs, execPath, ...filteredArgs],
        method: 'doas',
      };
    }
  }

  const hasDisplay = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
  if (hasDisplay && hasPkexec) {
    // Use Polkit policy action directly on /usr/bin/airgorah when installed there,
    // otherwise pass env wrapper.
    if (execPath === '/usr/bin/airgorah') {
      return {
        cmd: 'pkexec',
        args: [execPath, ...filteredArgs],
        method: 'pkexec',
      };
    }
    return {
      cmd: 'pkexec',
      args: ['env', ...envPairs, execPath, ...filteredArgs],
      method: 'pkexec',
    };
  }

  if (hasSudo) {
    return {
      cmd: 'sudo',
      args: ['env', ...envPairs, execPath, ...filteredArgs],
      method: 'sudo',
    };
  }

  return null;
}

function tryElevateProcess(rawArgv, allowFallback) {
  const realExec = (() => {
    try {
      const candidate = process.argv[1] ? path.resolve(process.argv[1]) : __filename;
      return candidate === '/usr/bin/airgorah' ? '/usr/bin/airgorah' : fs.realpathSync(__filename);
    } catch {
      return __filename;
    }
  })();

  const plan = buildElevationCommand(rawArgv, process.env, {
    isTTY: Boolean(process.stdin.isTTY),
    hasPkexec: commandExists('pkexec'),
    hasSudo: commandExists('sudo'),
    hasDoas: commandExists('doas'),
    execPath: realExec,
  });

  if (!plan) {
    if (allowFallback) {
      console.warn('airgorah: neither sudo nor pkexec found; launching in unprivileged mode.');
      return false;
    }
    console.error('airgorah: root privileges requested, but neither sudo, doas, nor pkexec is available.');
    process.exit(1);
  }

  const res = spawnSync(plan.cmd, plan.args, { stdio: 'inherit' });
  const code = typeof res.status === 'number' ? res.status : 1;

  // Exit codes 126/127 from pkexec mean user cancelled the password dialog
  if (allowFallback && (code === 126 || code === 127)) {
    console.warn('airgorah: elevation cancelled; launching in unprivileged mode.');
    return false;
  }

  process.exit(code);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 64 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

export function createAirgorahServer(distDir, runtimeControl = null) {
  return http.createServer(async (req, res) => {
    const pathname = (req.url || '/').split('?')[0];

    // Localhost system API for Linux privilege status & fail-safe Wi-Fi capture/restore
    if (pathname.startsWith('/api/system/')) {
      if (pathname === '/api/system/status' && req.method === 'GET') {
        const status = runtimeControl
          ? runtimeControl.getStatus()
          : {
              managedByLauncher: true,
              isRoot: isRunningAsRoot(),
              elevatedUser: resolveInvokingDesktopUser(),
              activeLease: null,
              watchdogPid: null,
              interfaces: [],
            };
        sendJson(res, 200, status);
        return;
      }

      if (pathname === '/api/system/capture' && req.method === 'POST') {
        if (!runtimeControl) {
          sendJson(res, 501, { error: 'Wi-Fi guard is unavailable in this server context.' });
          return;
        }
        try {
          const body = await readJsonBody(req);
          const result = runtimeControl.capture(body.iface, body.spoofMac);
          sendJson(res, 200, result);
        } catch (err) {
          const status = err.code === 'EACCES' ? 403 : 400;
          sendJson(res, status, { error: String(err.message || err) });
        }
        return;
      }

      if (pathname === '/api/system/restore' && req.method === 'POST') {
        if (!runtimeControl) {
          sendJson(res, 501, { error: 'Wi-Fi guard is unavailable in this server context.' });
          return;
        }
        try {
          const result = runtimeControl.restore();
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 500, { error: String(err.message || err) });
        }
        return;
      }

      sendJson(res, 404, { error: 'Not Found' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    const filePath = resolveSafeAssetPath(distDir, req.url);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Cache-Control':
        ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal Server Error');
    });
    stream.pipe(res);
  });
}

function resolveUidFromUsername(username) {
  try {
    const passwd = fs.readFileSync('/etc/passwd', 'utf8');
    for (const line of passwd.split('\n')) {
      const parts = line.split(':');
      if (parts.length >= 3 && parts[0] === username) {
        return parts[2];
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function buildUserGuiEnv(targetUser) {
  const env = { ...process.env };
  const uid = process.env.PKEXEC_UID || process.env.SUDO_UID || resolveUidFromUsername(targetUser);
  if (uid && uid !== '0') {
    const runtimeDir = `/run/user/${uid}`;
    if (!env.XDG_RUNTIME_DIR && fs.existsSync(runtimeDir)) {
      env.XDG_RUNTIME_DIR = runtimeDir;
    }
    if (!env.DBUS_SESSION_BUS_ADDRESS && fs.existsSync(`${runtimeDir}/bus`)) {
      env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${runtimeDir}/bus`;
    }
    if (!env.WAYLAND_DISPLAY && fs.existsSync(runtimeDir)) {
      try {
        const sock = fs
          .readdirSync(runtimeDir)
          .find((name) => /^wayland-\d+$/.test(name));
        if (sock) env.WAYLAND_DISPLAY = sock;
      } catch {
        // ignore
      }
    }
    if (!env.DISPLAY && !env.WAYLAND_DISPLAY && fs.existsSync('/tmp/.X11-unix/X0')) {
      env.DISPLAY = ':0';
    }
  }
  return env;
}

function tryOpenBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';

  // Never launch the user's web browser as root — drop privileges back to the desktop user
  if (isRunningAsRoot()) {
    const targetUser = resolveInvokingDesktopUser();
    if (!targetUser) return;
    const guiEnv = buildUserGuiEnv(targetUser);
    if (!guiEnv.DISPLAY && !guiEnv.WAYLAND_DISPLAY) return;

    const envArgs = [
      guiEnv.DISPLAY ? `DISPLAY=${guiEnv.DISPLAY}` : null,
      guiEnv.WAYLAND_DISPLAY ? `WAYLAND_DISPLAY=${guiEnv.WAYLAND_DISPLAY}` : null,
      guiEnv.XDG_RUNTIME_DIR ? `XDG_RUNTIME_DIR=${guiEnv.XDG_RUNTIME_DIR}` : null,
      guiEnv.DBUS_SESSION_BUS_ADDRESS
        ? `DBUS_SESSION_BUS_ADDRESS=${guiEnv.DBUS_SESSION_BUS_ADDRESS}`
        : null,
    ].filter(Boolean);

    try {
      const child = spawn('runuser', ['-u', targetUser, '--', 'env', ...envArgs, opener, url], {
        detached: true,
        stdio: 'ignore',
        env: guiEnv,
      });
      child.on('error', () => {});
      child.unref();
    } catch {
      // Ignore gracefully if runuser/xdg-open is unavailable
    }
    return;
  }

  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  if (!hasDisplay) return;

  try {
    const child = spawn(opener, [url], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Headless or xdg-utils not installed — ignore gracefully
  }
}

function printHelp(version) {
  console.log(`Airgorah v${version} — WiFi Security Auditing Workbench

Usage:
  airgorah [options]

Options:
  -i, --iface <dev>   Capture Wi-Fi interface with crash-proof auto-restore (auto-elevates)
      --sudo          Elevate privileges via sudo/pkexec on launch for Wi-Fi capture
      --elevate       Alias for --sudo
      --restore       Immediately restore Wi-Fi adapter(s) to managed mode & reconnect internet
  -p, --port <port>   Port to listen on (default: 3000, or $PORT)
      --host <host>   Bind address (default: 127.0.0.1, or $AIRGORAH_HOST)
      --no-open       Do not automatically open the default browser
  -v, --version       Print version and exit
  -h, --help          Show this help message

Safety guarantee:
  When capturing a Wi-Fi interface, Airgorah snapshots its original mode, MAC, and
  NetworkManager/iwd state and spawns an independent watchdog process. Even on
  Ctrl+C, terminal close, crash, or kill -9, your Wi-Fi is automatically restored.`);
}

function main() {
  const rawArgv = process.argv.slice(2);
  const version = resolveVersion();
  let opts;
  try {
    opts = parseArgs(rawArgv);
  } catch (err) {
    console.error(`airgorah: ${err.message}`);
    process.exit(1);
  }

  if (opts.showHelp) {
    printHelp(version);
    process.exit(0);
  }

  if (opts.showVersion) {
    console.log(`airgorah ${version}`);
    process.exit(0);
  }

  // Detached crash-proof watchdog mode
  if (opts.watchdog) {
    if (!opts.watchdogPid) {
      console.error('airgorah --watchdog requires --pid <pid>');
      process.exit(1);
    }
    runWatchdogLoop({
      ownerPid: opts.watchdogPid,
      expectedStartTime: opts.watchdogStartTime,
      statePath: opts.stateFile,
    });
    return;
  }

  // Emergency / boot-time Wi-Fi restoration mode
  if (opts.restore) {
    if (!isRunningAsRoot()) {
      tryElevateProcess(rawArgv, false);
    }
    const results = restoreFromStateAndSweep({ statePath: opts.stateFile });
    if (!opts.quiet) {
      if (results.length === 0) {
        console.log('Airgorah Wi-Fi Guard: No interfaces needed restoration.');
      } else {
        for (const r of results) {
          console.log(
            `Airgorah Wi-Fi Guard: Restored ${r.iface} -> ${r.targetMode} mode and re-attached network manager.`
          );
        }
      }
    }
    process.exit(0);
  }

  // Auto-elevation via sudo/pkexec when requested (or when --iface is passed)
  if (opts.elevate && !isRunningAsRoot()) {
    tryElevateProcess(rawArgv, opts.allowFallback);
  }

  let distDir;
  try {
    distDir = resolveDistDir();
  } catch (err) {
    console.error(`airgorah: ${err.message}`);
    process.exit(1);
  }

  let activeLease = null;
  let watchdogPid = null;
  let restoring = false;

  const ensureRestoredSync = (reason) => {
    if (restoring) return;
    restoring = true;
    try {
      const current = activeLease || readStateFile(opts.stateFile);
      if (current && current.iface) {
        restoreInterface(current, { statePath: opts.stateFile });
        console.log(
          `Airgorah Wi-Fi Guard: Restored ${current.iface} to original managed state (${reason}).`
        );
      }
    } catch (err) {
      console.error(`Airgorah Wi-Fi Guard restore warning: ${err.message}`);
    } finally {
      activeLease = null;
      watchdogPid = null;
      restoring = false;
    }
  };

  const captureWithGuard = (ifaceName, spoofMac = null) => {
    if (!isRunningAsRoot()) {
      const err = new Error(
        'Root privileges are required to capture a Wi-Fi module. Launch with "airgorah --sudo" or "sudo airgorah".'
      );
      err.code = 'EACCES';
      throw err;
    }
    const snapshot = captureInterface(ifaceName, {
      statePath: opts.stateFile,
      spoofMac,
      ownerPid: process.pid,
    });
    activeLease = snapshot;
    watchdogPid = spawnWatchdog({
      launcherPath: fs.realpathSync(__filename),
      ownerPid: process.pid,
      statePath: opts.stateFile,
    });
    console.log(
      `Airgorah Wi-Fi Guard: Captured ${snapshot.iface} (watchdog PID ${watchdogPid} armed for crash-proof auto-restore).`
    );
    return {
      captured: true,
      lease: snapshot,
      watchdogPid,
    };
  };

  const runtimeControl = {
    getStatus: () => ({
      managedByLauncher: true,
      platform: process.platform,
      isRoot: isRunningAsRoot(),
      elevatedUser: resolveInvokingDesktopUser(),
      activeLease: activeLease || readStateFile(opts.stateFile),
      watchdogPid,
      interfaces: process.platform === 'linux' ? listLinuxWifiInterfaces() : [],
    }),
    capture: captureWithGuard,
    restore: () => {
      const results = restoreFromStateAndSweep({ statePath: opts.stateFile });
      activeLease = null;
      watchdogPid = null;
      return { restored: true, results };
    },
  };

  // If --iface <dev> was provided on launch, capture it immediately under watchdog protection
  if (opts.iface) {
    try {
      captureWithGuard(opts.iface);
    } catch (err) {
      console.error(`airgorah: ${err.message}`);
      process.exit(1);
    }
  }

  const server = createAirgorahServer(distDir, runtimeControl);

  server.on('error', (err) => {
    ensureRestoredSync('server bind error');
    console.error(`airgorah: failed to bind ${opts.host}:${opts.port}: ${err.message}`);
    process.exit(1);
  });

  server.listen(opts.port, opts.host, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : opts.port;
    const url = `http://${opts.host}:${actualPort}`;
    const privLabel = isRunningAsRoot() ? 'root + crash-proof Wi-Fi guard' : 'unprivileged UI mode';
    console.log(`Airgorah v${version} (${privLabel}) running at ${url}`);
    if (opts.open) {
      tryOpenBrowser(url);
    }
  });

  const shutdown = (signal) => {
    ensureRestoredSync(signal);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));
  process.on('uncaughtException', (err) => {
    console.error('airgorah fatal error:', err);
    ensureRestoredSync('uncaughtException');
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    console.error('airgorah unhandled rejection:', err);
    ensureRestoredSync('unhandledRejection');
    process.exit(1);
  });
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(__filename);
  }
}

if (isDirectExecution()) {
  main();
}
