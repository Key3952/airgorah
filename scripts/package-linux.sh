#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="${RELEASE_VERSION:-$(node -p "require('./package.json').version")}"
VERSION="${VERSION#v}"
BUILD_NUM="${BUILD_NUMBER:-${GITHUB_RUN_NUMBER:-local}}"
COMMIT_SHORT="${COMMIT_SHA:-${GITHUB_SHA:-dev}}"
COMMIT_SHORT="${COMMIT_SHORT:0:7}"
REPO="${GITHUB_REPOSITORY:-Key3952/airgorah}"
OUT_DIR="${1:-$ROOT_DIR/release-artifacts}"
STAGE_DIR="$ROOT_DIR/.pkg-stage"

echo "==> Building Airgorah v${VERSION} (build #${BUILD_NUM}, ${REPO}) web assets..."
VITE_APP_VERSION="$VERSION" \
VITE_BUILD_NUMBER="$BUILD_NUM" \
VITE_COMMIT_SHA="$COMMIT_SHORT" \
VITE_GITHUB_REPO="$REPO" \
  npm run build

rm -rf "$STAGE_DIR"
mkdir -p "$OUT_DIR"

# 1. Stage standard FHS filesystem tree for .deb, .rpm, and Arch .pkg.tar.zst
mkdir -p \
  "$STAGE_DIR/usr/bin" \
  "$STAGE_DIR/usr/share/airgorah/bin" \
  "$STAGE_DIR/usr/share/airgorah/dist" \
  "$STAGE_DIR/usr/share/applications" \
  "$STAGE_DIR/usr/share/polkit-1/actions" \
  "$STAGE_DIR/usr/share/icons/hicolor/256x256/apps" \
  "$STAGE_DIR/usr/lib/systemd/user" \
  "$STAGE_DIR/usr/lib/systemd/system" \
  "$STAGE_DIR/usr/share/licenses/airgorah"

install -m 755 packaging/bin/airgorah "$STAGE_DIR/usr/bin/airgorah"
install -m 755 packaging/bin/airgorah-launcher.mjs "$STAGE_DIR/usr/share/airgorah/bin/airgorah-launcher.mjs"
install -m 644 packaging/bin/wifi-guard.mjs "$STAGE_DIR/usr/share/airgorah/bin/wifi-guard.mjs"
cp -r dist/. "$STAGE_DIR/usr/share/airgorah/dist/"
printf '%s\n' "$VERSION" > "$STAGE_DIR/usr/share/airgorah/version.txt"
printf '%s\n' "$BUILD_NUM" > "$STAGE_DIR/usr/share/airgorah/build.txt"
install -m 644 packaging/airgorah.desktop "$STAGE_DIR/usr/share/applications/airgorah.desktop"
install -m 644 packaging/com.airgorah.pkexec.policy "$STAGE_DIR/usr/share/polkit-1/actions/com.airgorah.pkexec.policy"
install -m 644 public/app_icon.png "$STAGE_DIR/usr/share/icons/hicolor/256x256/apps/airgorah.png"
install -m 644 packaging/airgorah.service "$STAGE_DIR/usr/lib/systemd/user/airgorah.service"
install -m 644 packaging/airgorah-restore.service "$STAGE_DIR/usr/lib/systemd/system/airgorah-restore.service"
install -m 644 LICENSE "$STAGE_DIR/usr/share/licenses/airgorah/LICENSE"

# 2. Build universal portable tarball (.tar.gz)
PORTABLE_DIR="$ROOT_DIR/.pkg-portable/airgorah-${VERSION}"
rm -rf "$ROOT_DIR/.pkg-portable"
mkdir -p \
  "$PORTABLE_DIR/bin" \
  "$PORTABLE_DIR/share/airgorah/bin" \
  "$PORTABLE_DIR/share/airgorah/dist"

install -m 755 packaging/bin/airgorah "$PORTABLE_DIR/bin/airgorah"
install -m 755 packaging/bin/airgorah-launcher.mjs "$PORTABLE_DIR/share/airgorah/bin/airgorah-launcher.mjs"
install -m 644 packaging/bin/wifi-guard.mjs "$PORTABLE_DIR/share/airgorah/bin/wifi-guard.mjs"
cp -r dist/. "$PORTABLE_DIR/share/airgorah/dist/"
printf '%s\n' "$VERSION" > "$PORTABLE_DIR/share/airgorah/version.txt"
printf '%s\n' "$BUILD_NUM" > "$PORTABLE_DIR/share/airgorah/build.txt"
install -m 644 LICENSE "$PORTABLE_DIR/LICENSE"
install -m 644 README.md "$PORTABLE_DIR/README.md"

tar -C "$ROOT_DIR/.pkg-portable" -czf \
  "$OUT_DIR/airgorah_${VERSION}_linux_portable.tar.gz" \
  "airgorah-${VERSION}"

# 3. Copy Arch PKGBUILD (with synced pkgver and repo URL) into release artifacts
sed -e "s/^pkgver=.*/pkgver=${VERSION}/" \
    -e "s|^url=.*|url=\"https://github.com/${REPO}\"|" \
    packaging/arch/PKGBUILD > "$OUT_DIR/PKGBUILD"

# 4. Build distro-native packages via fpm (Arch .pkg.tar.zst, Debian .deb, Fedora/RHEL/openSUSE .rpm)
if command -v fpm >/dev/null 2>&1; then
  COMMON_FPM_ARGS=(
    -s dir
    -C "$STAGE_DIR"
    --name airgorah
    --version "$VERSION"
    --iteration 1
    --license "MIT"
    --maintainer "Airgorah Maintainers"
    --vendor "Airgorah"
    --url "https://github.com/${REPO}"
    --description "WiFi security auditing workbench with crash-proof Wi-Fi auto-restore"
    --force
  )

  echo "==> Building Arch Linux package (.pkg.tar.zst)..."
  fpm "${COMMON_FPM_ARGS[@]}" \
    -t pacman \
    -a any \
    --depends nodejs \
    --pacman-optional-depends "iw: switch Wi-Fi adapters between monitor and managed modes" \
    --pacman-optional-depends "iproute2: restore link state and hardware MAC addresses" \
    --pacman-optional-depends "polkit: graphical password prompt (pkexec) for Wi-Fi capture" \
    --pacman-optional-depends "networkmanager: cleanly detach and reconnect Wi-Fi without affecting Ethernet" \
    --pacman-optional-depends "xdg-utils: automatically open Airgorah in the default browser" \
    --pacman-compression zstd \
    -p "$OUT_DIR/airgorah_${VERSION}_any.pkg.tar.zst" \
    usr

  echo "==> Building Debian/Ubuntu package (.deb)..."
  fpm "${COMMON_FPM_ARGS[@]}" \
    -t deb \
    -a all \
    --depends "nodejs" \
    --deb-recommends "iw" \
    --deb-recommends "iproute2" \
    --deb-recommends "policykit-1" \
    --deb-recommends "xdg-utils" \
    -p "$OUT_DIR/airgorah_${VERSION}_all.deb" \
    usr

  echo "==> Building Fedora/RHEL/openSUSE package (.rpm)..."
  fpm "${COMMON_FPM_ARGS[@]}" \
    -t rpm \
    -a noarch \
    --depends "nodejs" \
    --rpm-tag "Recommends: iw" \
    --rpm-tag "Recommends: iproute" \
    --rpm-tag "Recommends: polkit" \
    --rpm-tag "Recommends: xdg-utils" \
    -p "$OUT_DIR/airgorah_${VERSION}_noarch.rpm" \
    usr
else
  echo "Warning: fpm not found in PATH — skipped .pkg.tar.zst/.deb/.rpm generation (portable .tar.gz and PKGBUILD created)."
fi

# 5. Generate SHA256SUMS.txt and INSTALL.md with exact filenames and hashes
RELEASE_VERSION="$VERSION" BUILD_NUMBER="$BUILD_NUM" GITHUB_REPOSITORY="$REPO" \
  node scripts/generate-install-docs.mjs "$OUT_DIR"

rm -rf "$STAGE_DIR" "$ROOT_DIR/.pkg-portable"
echo "==> Packaging complete. Artifacts in: $OUT_DIR"
ls -la "$OUT_DIR"
