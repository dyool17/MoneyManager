#!/usr/bin/env bash
# Builds the Money Manager desktop beta and installs it for the current user
# (no sudo): AppImage in ~/.local/opt, launcher in ~/.local/bin, menu entry.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
OPT="$HOME/.local/opt/money-manager"

if [[ "${1:-}" != "--no-build" ]]; then
  # shellcheck disable=SC1091
  [[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
  (cd "$APP" && pnpm install --frozen-lockfile && pnpm tauri build --bundles appimage)
fi

IMAGE="$(ls -t "$APP"/src-tauri/target/release/bundle/appimage/*.AppImage | head -n1)"
mkdir -p "$OPT" "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/128x128/apps"
install -m 755 "$IMAGE" "$OPT/MoneyManager.AppImage"
ln -sf "$OPT/MoneyManager.AppImage" "$HOME/.local/bin/money-manager"
install -m 644 "$APP/src-tauri/icons/128x128.png" "$HOME/.local/share/icons/hicolor/128x128/apps/money-manager.png"

cat > "$HOME/.local/share/applications/money-manager.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Money Manager
Comment=Read your Money Manager data on the desktop (beta)
Exec=$OPT/MoneyManager.AppImage
Icon=money-manager
Categories=Office;Finance;
Terminal=false
EOF
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo "Installed $(basename "$IMAGE") to $OPT"
echo "Run it from the app menu or with: money-manager"
