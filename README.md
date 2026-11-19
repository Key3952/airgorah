<h1 align="center">
  <img src="public/app_icon.png" width="96" height="96" alt="Airgorah logo" /><br>
  Airgorah
</h1>

<p align="center">
  <span>WiFi security auditing workbench — React + TypeScript + Vite web edition</span>
</p>

## Overview

Airgorah Web ports the core graphical workflow of [Airgorah](https://github.com/Key3952/airgorah) into a lightweight, cross-distribution web workbench backed by a zero-dependency Node.js launcher (`airgorah`), Freedesktop `.desktop` integration, and an optional `systemd` user service.

### Features Ported

- **Wireless Scanning & Split-Pane Workbench**: High-density sortable Access Points and Clients tables with draggable vertical pane split, live channel hopping, RSSI updates, and right-click copy context menus.
- **Band & Channel Filter Validation**: Full 2.4 GHz and 5 GHz channel filter validation, single-channel focus, channel hop list addition, and automatic channel locking/parking during active attacks.
- **Deauthentication & PMKID Solicitation**: Configurable deauth modal (packet rate, disassociation frames, all vs. selected clients), clientless PMKID solicitation, red/blue attack row highlights, and simulated 4-way handshake / PMKID capture notifications.
- **WPA Decryption Workbench**: Dictionary and Bruteforce decryption modes (including custom charset deduplication, password length bounds, and built-in or uploaded wordlists) with an interactive `aircrack-ng` / `crunch` terminal view.
- **Exports & Preferences**: Downloadable libpcap v2.4 (`.cap`) capture files, Airgorah-compatible `.json` scan reports, wireless interface selection (with 5 GHz capability enforcement), and persistent MAC / display / process settings.

## Linux Installation (Multi-Distribution)

Every `git push` to [`Key3952/airgorah`](https://github.com/Key3952/airgorah/releases) automatically increments the release version, verifies packages inside real `archlinux:latest`, `ubuntu-24.04`, and `fedora:latest` containers, and publishes a full **GitHub Release** with `.pkg.tar.zst`, `.deb`, `.rpm`, `.tar.gz`, `PKGBUILD`, `INSTALL.md`, and `SHA256SUMS.txt`.

### Arch Linux / Manjaro / EndeavourOS / CachyOS

**Option 1 — Prebuilt Pacman package (`.pkg.tar.zst`):**
```bash
sudo pacman -S --needed nodejs xdg-utils
sudo pacman -U --noconfirm ./airgorah_<version>_any.pkg.tar.zst
airgorah
```

**Option 2 — Build locally with `makepkg` (`PKGBUILD`):**
```bash
cd packaging/arch
makepkg -si
airgorah
```

### Debian / Ubuntu / Kali / Linux Mint / Pop!_OS

```bash
sudo apt update
sudo apt install -y ./airgorah_<version>_all.deb
airgorah
```

### Fedora / RHEL / Rocky Linux / AlmaLinux

```bash
sudo dnf install -y ./airgorah_<version>_noarch.rpm
airgorah
```

### openSUSE Tumbleweed / Leap

```bash
sudo zypper --no-gpg-checks install -y ./airgorah_<version>_noarch.rpm
airgorah
```

### Universal Linux Portable Tarball (Alpine, Void, Gentoo, NixOS)

```bash
tar -xzf airgorah_<version>_linux_portable.tar.gz
cd airgorah-<version>
./bin/airgorah
```

### Optional Background Service (systemd)

```bash
systemctl --user enable --now airgorah.service
```

## Easy Root Elevation & Crash-Proof Wi-Fi Auto-Restore

- **Desktop (GUI)**: Clicking **Airgorah** in your application launcher uses the bundled PolicyKit policy (`pkexec`) to ask for your password once (if you cancel, it falls back cleanly to unprivileged UI mode). The web browser always opens as your normal desktop user, never as `root`.
- **Terminal**: Run `airgorah --sudo` or `airgorah --iface wlan0` to automatically elevate via `sudo` / `doas` / `pkexec`.
- **Guaranteed Wi-Fi Restoration (even after `kill -9` or power loss)**:
  1. **Atomic Snapshot**: Records original interface mode, permanent hardware MAC, link state, and NetworkManager / `iwd` / `wpa_supplicant` ownership before touching the adapter.
  2. **Per-Adapter Isolation**: Detaches only the captured Wi-Fi interface (`nmcli device set <iface> managed no`) instead of killing NetworkManager globally, keeping Ethernet/VPN/other interfaces online.
  3. **Independent Root Watchdog**: Monitors Airgorah's PID + `/proc/<pid>/stat` start time. If Airgorah exits cleanly, crashes, loses its terminal, gets OOM-killed, or is terminated with `kill -9`, the watchdog immediately restores `managed` mode, original MAC, link `UP`, and NetworkManager/`iwd` reconnection.
  4. **Boot-Time & Manual Recovery**: Enable `sudo systemctl enable airgorah-restore.service` to recover even after a sudden power cut, or run `airgorah --restore` at any time.

## Development

```bash
npm install
npm run dev            # Starts Vite dev server on http://0.0.0.0:3000
npm run test           # Runs unit tests (channel, audit engine, Linux launcher)
npm run lint           # TypeScript strict type-checking
npm run build          # Production build
npm run package:linux  # Builds Linux packages + INSTALL.md into release-artifacts/
```

## License

MIT License — see [LICENSE](LICENSE).
