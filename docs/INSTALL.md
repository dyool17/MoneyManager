# Instalación de Money Manager Desktop (beta)

Versión actual: `0.1.0-beta.1`. Sólo lectura: la app no modifica datos del teléfono.

## Linux (instalación por usuario, sin sudo)

### 1. Prerrequisitos (una sola vez)

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev build-essential libssl-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

También necesitas Node.js 22 o superior y `pnpm`.

### 2. Compilar e instalar

```bash
./scripts/install-beta.sh
```

El script:

- compila el AppImage (`pnpm tauri build --bundles appimage`);
- lo copia a `~/.local/opt/money-manager/MoneyManager.AppImage`;
- crea el comando `money-manager` en `~/.local/bin`;
- agrega "Money Manager" al menú de aplicaciones.

Para reinstalar un AppImage ya compilado sin volver a compilar: `./scripts/install-beta.sh --no-build`.

### Alternativa: paquete `.deb` (sistema, con sudo)

```bash
cd app && pnpm tauri build --bundles deb
sudo apt install "./src-tauri/target/release/bundle/deb/Money Manager_0.1.0-beta.1_amd64.deb"
```

### Desinstalar

```bash
rm -rf ~/.local/opt/money-manager ~/.local/bin/money-manager \
  ~/.local/share/applications/money-manager.desktop \
  ~/.local/share/icons/hicolor/128x128/apps/money-manager.png
```

Los backups no se borran al desinstalar. Están en `~/.local/share/com.dyool.moneymanager/backups/`.

## Windows

Pendiente (fase 4). Se generará un instalador `.msi` con `pnpm tauri build` en una máquina Windows.

## Primer uso

1. En el teléfono abre Money Manager, ve a **More → PC Manager** y pulsa **Start**.
2. Mantén el teléfono y la computadora en la misma red Wi-Fi.
3. Abre la app, entra en **Connect phone** y escribe la dirección que muestra el teléfono, con el puerto (por ejemplo `http://192.168.1.161:8080`).
4. Al conectar, la app guarda un backup automático. El resultado aparece en la misma pantalla.

Sin teléfono, la app abre con datos demo.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| "Cannot reach PC Manager" | Verifica que PC Manager esté iniciado y que ambos equipos estén en la misma Wi-Fi. |
| "Address must include the port" | Escribe la dirección completa con `:puerto`. |
| "Host must be on the local network" | La app sólo acepta IPs locales (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`). |
| "The phone sent an empty full backup" | El teléfono no entregó `money.sqlite`; sólo quedó el snapshot legible. |
