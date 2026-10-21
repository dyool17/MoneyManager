# Instalación de Money Manager Desktop (beta)

Versión actual: `0.1.0-beta.2`. La app puede modificar datos del teléfono sólo cuando tú lo confirmas, y exige un respaldo reciente.

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
sudo apt install "./src-tauri/target/release/bundle/deb/Money Manager_0.1.0-beta.2_amd64.deb"
```

### Desinstalar

```bash
rm -rf ~/.local/opt/money-manager ~/.local/bin/money-manager \
  ~/.local/share/applications/money-manager.desktop \
  ~/.local/share/icons/hicolor/128x128/apps/money-manager.png
```

Los backups no se borran al desinstalar. Están en `~/.local/share/com.dyool.moneymanager/backups/`.

## Windows

Para Windows 11 x64. Windows 11 ya trae WebView2, el único requisito.

1. Descarga `MoneyManager_<versión>_x64-setup.exe` desde [Releases](https://github.com/dyool17/MoneyManager/releases).
2. Ábrelo. El instalador no está firmado, así que SmartScreen muestra «Windows protegió su PC»: pulsa **Más información → Ejecutar de todas formas**.
3. La instalación es por usuario y no pide permisos de administrador. La app queda en el menú Inicio como **Money Manager**.
Los datos de la app (backups, `writes.log`, la API key del asistente) se guardan en `%APPDATA%\com.dyool.moneymanager\`. Para desinstalar usa **Configuración → Aplicaciones**; los backups no se borran.

Para usar los asistentes por suscripción instala el CLI con npm (`npm install -g @anthropic-ai/claude-code` o `npm install -g @openai/codex`) e inicia sesión una vez. La app los busca en el `PATH` y en `%APPDATA%\npm`.

El instalador se compila en GitHub Actions (`.github/workflows/windows-release.yml`) al publicar una release. Para compilarlo en una máquina Windows: `cd app && pnpm install && pnpm tauri build --bundles nsis`. No se genera `.msi` porque WiX no acepta versiones beta como `0.1.0-beta.2`.

## Primer uso

1. En el teléfono abre Money Manager, ve a **More → PC Manager** y pulsa **Start**.
2. Mantén el teléfono y la computadora en la misma red Wi-Fi.
3. Abre la app, entra en **Connect phone** y escribe la dirección que muestra el teléfono, con el puerto (por ejemplo `http://192.168.1.161:8080`).
4. Al conectar, la app guarda un backup automático. El resultado aparece en la misma pantalla.

Sin teléfono, la app abre con datos demo.

Para configurar qué cuentas suman al patrimonio y sus monedas, abre **Account metadata**. Puedes importar metadata de un respaldo nativo o guardar ajustes manuales; ninguna de esas acciones modifica el teléfono. Consulta [Totales con metadata de cuentas](ACCOUNT-METADATA.md).

## Modificar datos del teléfono

La app puede crear, editar y eliminar movimientos, transferencias, cuentas y tarjetas. Antes de aplicar cada cambio te muestra un resumen y pide confirmación; las eliminaciones exigen escribir `delete`.

Reglas de seguridad:

- Necesitas un respaldo de los últimos 30 minutos. Al conectar el teléfono se guarda uno automático; también puedes forzarlo con **Back up now**.
- Cada intento queda registrado en `~/.local/share/com.dyool.moneymanager/writes.log` (fecha, teléfono, operación, resultado y error). No se guardan respuestas completas del teléfono.
- Un cambio se envía una sola vez, nunca se reintenta: si el teléfono no responde a tiempo, la app no reintenta para no duplicar el movimiento.
- Si la respuesta del teléfono no es una confirmación reconocible, la app informa que el cambio **no está confirmado** y te pide revisar el teléfono antes de reintentar.
- En modo demo no se puede escribir nada.

Ejemplos de cambios que la app todavía no cubre: restaurar un respaldo sobre el teléfono, cambiar categorías o presupuestos, y exportar a Excel.

## Cambios pendientes (outbox)

**PC Manager se apaga cuando bloqueas el móvil o cambias de aplicación.** Por eso la app no pierde tus cambios: los que no pudieron salir quedan en un *outbox* local.

| Situación | Qué hace la app |
|---|---|
| El móvil está apagado o bloqueado al confirmar | El cambio **no se envía**: se guarda en este computador y el diálogo dice «Saved on this computer, not sent yet». |
| Vuelve el móvil | Abre **Pending changes** y pulsa **Sync pending changes**. Necesita un respaldo reciente, así que primero **Back up now**. |
| El móvil no responde a tiempo | El cambio queda en «Check on the phone»: puede haberse aplicado, así que **nunca se reenvía solo**. Revísalo en el móvil y márcalo como revisado. |
| El móvil rechaza el cambio | Se informa el motivo y no queda pendiente. |

Nunca se reenvía un cambio cuyo resultado se desconoce: podría duplicar el movimiento. El outbox se guarda en este computador (`localStorage`) y se vacía solo cuando los cambios se envían o los marcas como revisados.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| "Cannot reach PC Manager" | Verifica que PC Manager esté iniciado y que ambos equipos estén en la misma Wi-Fi. |
| "Address must include the port" | Escribe la dirección completa con `:puerto`. |
| "Host must be on the local network" | La app sólo acepta IPs locales (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`). |
| "The phone sent an empty full backup" | El teléfono no entregó `money.sqlite`; sólo quedó el snapshot legible. |
| "Take a backup before changing data on the phone" | Ve a **Connect phone** y pulsa **Back up now**. El respaldo caduca a los 30 minutos. |
| "The phone did not confirm the change" | El teléfono respondió algo que la app no reconoce. Revisa el teléfono antes de reintentar: el cambio pudo aplicarse. |
| "The phone rejected the change" | El teléfono rechazó la operación. El motivo aparece en el mensaje. |
| "This backup does not match any loaded accounts" | El respaldo es de otro teléfono o de otro libro. Exporta uno nuevo desde el móvil. |
| "PC Manager did not answer in time" | El servidor del móvil se cuelga con algunos periodos de fechas. La app ensancha la consulta y filtra el resultado; si persiste, reinicia PC Manager en el teléfono. |
| "PC Manager is not reachable" | El móvil está bloqueado, cerraste la app o cambiaste de aplicación. Vuelve a Money Manager, deja PC Manager iniciado y mantén la pantalla encendida. |
