#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function getVersion() {
  const fromEnv = process.env.RELEASE_VERSION;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim().replace(/^v/, '');
  }
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  return pkg.version;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function generateDocs() {
  const version = getVersion();
  const buildNumber = process.env.BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || 'local';
  const outDir = path.resolve(process.argv[2] || 'release-artifacts');
  const repo = process.env.GITHUB_REPOSITORY || 'Key3952/airgorah';
  const tag = process.env.RELEASE_TAG || `v${version}`;

  fs.mkdirSync(outDir, { recursive: true });

  const files = {
    arch: `airgorah_${version}_any.pkg.tar.zst`,
    deb: `airgorah_${version}_all.deb`,
    rpm: `airgorah_${version}_noarch.rpm`,
    tarball: `airgorah_${version}_linux_portable.tar.gz`,
  };

  // Compute SHA256SUMS.txt if built artifacts exist in outDir
  const checksumLines = [];
  for (const filename of Object.values(files)) {
    const fullPath = path.join(outDir, filename);
    if (fs.existsSync(fullPath)) {
      checksumLines.push(`${sha256File(fullPath)}  ${filename}`);
    }
  }

  if (checksumLines.length > 0) {
    fs.writeFileSync(
      path.join(outDir, 'SHA256SUMS.txt'),
      `${checksumLines.join('\n')}\n`,
      'utf8'
    );
  }

  const baseDownloadUrl = `https://github.com/${repo}/releases/download/${tag}`;

  const markdown = `# Airgorah v${version} (build #${buildNumber}) — Linux Installation Guide

Automated multi-distribution release for **Airgorah v${version}** (\`build #${buildNumber}\`, \`nodejs\` runtime, architecture-independent) from \`${repo}\`.

---

## Arch Linux / Manjaro / EndeavourOS / CachyOS

### Option 1: Install prebuilt Pacman package (\`.pkg.tar.zst\`)
\`\`\`bash
curl -LO "${baseDownloadUrl}/${files.arch}"
sudo pacman -S --needed nodejs xdg-utils
sudo pacman -U --noconfirm "./${files.arch}"
airgorah
\`\`\`

### Option 2: Build locally from \`PKGBUILD\`
\`\`\`bash
git clone "https://github.com/${repo}.git"
cd "$(basename "${repo}")/packaging/arch"
makepkg -si
airgorah
\`\`\`

---

## Debian / Ubuntu / Kali Linux / Linux Mint / Pop!_OS

\`\`\`bash
curl -LO "${baseDownloadUrl}/${files.deb}"
sudo apt update
sudo apt install -y "./${files.deb}"
airgorah
\`\`\`

---

## Fedora / RHEL / Rocky Linux / AlmaLinux

\`\`\`bash
curl -LO "${baseDownloadUrl}/${files.rpm}"
sudo dnf install -y "./${files.rpm}"
airgorah
\`\`\`

---

## openSUSE Tumbleweed / Leap

\`\`\`bash
curl -LO "${baseDownloadUrl}/${files.rpm}"
sudo zypper --no-gpg-checks install -y "./${files.rpm}"
airgorah
\`\`\`

---

## Universal Linux Portable Archive (Alpine, Void, Gentoo, NixOS, Slackware)

Requires **Node.js 18+** in \`PATH\`:

\`\`\`bash
curl -LO "${baseDownloadUrl}/${files.tarball}"
tar -xzf "${files.tarball}"
cd "airgorah-${version}"
./bin/airgorah
\`\`\`

---

## Wi-Fi Capture Privileges & Crash-Proof Auto-Restore

Airgorah includes a built-in **Polkit policy** (\`pkexec\`), terminal \`sudo\` auto-elevation, an independent **crash-proof watchdog**, and a \`systemd\` boot-recovery service so your Wi-Fi adapter and internet connection are **never left broken**:

\`\`\`bash
# Launch with automatic sudo (terminal) or Polkit password prompt (desktop)
airgorah --sudo

# Or capture a specific Wi-Fi interface immediately under watchdog protection
airgorah --iface wlan0

# Enable boot-time safety net (restores Wi-Fi even after a hard power cut)
sudo systemctl enable airgorah-restore.service

# Emergency one-command Wi-Fi & internet restore at any time
airgorah --restore
\`\`\`

> **How your internet stays safe:** Before switching a Wi-Fi adapter to monitor mode, Airgorah snapshots its original mode, hardware MAC, and NetworkManager/\`iwd\` state, detaches **only** that adapter (never killing Ethernet/VPN), and arms a detached root watchdog process. Whether you exit normally, close the terminal, hit a crash, or run \`kill -9\`, the adapter is automatically returned to \`managed\` mode with its original MAC and reconnected to NetworkManager/\`iwd\`.

---

## Running as a Background User Service (systemd)

Included in the Arch, Debian, and RPM packages:

\`\`\`bash
systemctl --user enable --now airgorah.service
# Opens on http://127.0.0.1:3000
\`\`\`

### CLI Flags
\`\`\`bash
airgorah --help
airgorah --sudo --port 3000
airgorah --iface wlan0
airgorah --restore
airgorah --port 8080 --host 0.0.0.0 --no-open
\`\`\`

---

## Verify Package Integrity (SHA-256)

\`\`\`bash
curl -LO "${baseDownloadUrl}/SHA256SUMS.txt"
sha256sum -c --ignore-missing SHA256SUMS.txt
\`\`\`
${
  checksumLines.length > 0
    ? `\n\`\`\`text\n${checksumLines.join('\n')}\n\`\`\`\n`
    : ''
}`;

  fs.writeFileSync(path.join(outDir, 'INSTALL.md'), markdown, 'utf8');
  console.log(`Generated ${path.join(outDir, 'INSTALL.md')}`);
}

generateDocs();
