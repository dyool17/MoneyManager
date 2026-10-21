# Money Manager Desktop

App de escritorio para ver y analizar en la computadora los datos de la app móvil **Money Manager** (Realbyte). Se conecta al teléfono por Wi-Fi mediante **PC Manager**, muestra el patrimonio, los gastos y los presupuestos, y calcula reportes para tomar decisiones con tu dinero.

> Proyecto personal, no oficial. No tiene relación con Realbyte.

## Qué puedes hacer

| Pantalla | Para qué sirve |
|---|---|
| **Net worth** | Patrimonio actual, evolución mensual y en qué cuentas está tu dinero. |
| **Insights** | Puntaje de salud financiera, riesgos, fortalezas, oportunidades de ahorro y patrones de gasto de hasta 12 meses. |
| **Ask AI** | Chat sobre tus reportes con Claude, ChatGPT u OpenCode Go; eliges proveedor, modelo y effort. |
| **Monthly summary** | Ingresos, gastos y categorías de un mes. |
| **Budgets** | Avance de cada presupuesto en el mes. |
| **Transactions** | Movimientos del mes; crear, editar y eliminar con confirmación. |
| **Accounts / Credit cards** | Saldos por cuenta y deuda por tarjeta. |
| **Account metadata** | Qué cuentas suman al total, sus monedas y tasas. |
| **Help** | Guía de uso dentro de la app. |

Sin teléfono conectado la app abre con **datos demo**, así puedes explorarla sin riesgo.

## Inicio rápido

1. Instala la app: sigue [docs/INSTALL.md](docs/INSTALL.md).
2. En el teléfono abre Money Manager → **More → PC Manager → Start**.
3. Con el teléfono y la computadora en la misma red Wi-Fi, abre **Connect phone** y escribe la dirección que muestra el teléfono, por ejemplo `http://192.168.1.161:8080`.
4. Mantén el teléfono desbloqueado y con Money Manager en pantalla: PC Manager se apaga al bloquearlo o al cambiar de app.

## Reportes de Insights

Todos los cálculos son deterministas: reglas fijas sobre tus datos, sin modelos ni servicios externos.

- **Salud financiera (0-100):** ahorro (25), colchón de emergencia (25), carga de deuda (20), estabilidad del gasto (15) y meses con saldo positivo (15).
- **Riesgos:** meses que aguanta tu dinero disponible, proyección de cierre de mes según tu historial, deuda frente al ingreso y gastos ya programados para los próximos 12 meses.
- **Fortalezas y puntos débiles:** reparto entre grupos de categorías (por ejemplo, Fijo / Variable), racha de meses positivos, variabilidad del gasto, categorías que bajaron, historial de presupuestos y gastos inusuales.
- **Oportunidades:** categorías en crecimiento, cobros repetidos, compras pequeñas acumuladas y un simulador de recortes.
- **Patrones:** ingreso contra gasto por mes, ranking de subcategorías, día de la semana más caro, días con más gasto y calendario diario.

Sin el teléfono a mano, **Open backup…** carga un respaldo `.mmbak` y calcula los reportes sin conexión. El archivo se lee en memoria y no se guarda.

## Chat con IA (Ask AI)

Conversa sobre tus reportes con tres tipos de proveedor:

| Proveedor | Cómo se conecta | Quién cobra |
|---|---|---|
| **Suscripción de Claude** | CLI oficial de Claude Code (`claude -p`), sin herramientas ni sesiones guardadas. | Tu plan de Claude. |
| **Suscripción de ChatGPT** | CLI oficial de Codex (`codex exec`), en modo de solo lectura. | Tu plan de ChatGPT. |
| **API key (OpenCode Go u otro compatible con OpenAI)** | `POST {base}/chat/completions`. Base por defecto: `https://opencode.ai/zen/go/v1`. | El servicio de la key. |

Las suscripciones se usan a través de sus CLIs oficiales porque Anthropic no permite usar el login de Claude en apps de terceros. Para usarlas, instala el CLI correspondiente e inicia sesión una vez (`claude` o `codex login`).

Si los reportes no alcanzan, el asistente puede pedir datos puntuales con un menú fijo de consultas de solo lectura: movimientos por categoría, cuenta, fechas o texto; totales por mes, categoría, cuenta o día de la semana; y el detalle de un día. La app las ejecuta localmente (cargando del teléfono hasta 24 meses atrás si hace falta), con un máximo de 3 rondas y 50 filas por consulta, y muestra bajo cada respuesta qué consultó. Nunca modifica nada.

Privacidad: el asistente recibe las mismas cifras agregadas que muestra Insights. Los nombres de comercios y notas se envían sólo si activas **Share transaction descriptions**. En **What is shared** ves el texto exacto que se envía. La conversación no se guarda. La API key se guarda en la carpeta de datos de la app con permisos `0600` y nunca vuelve a la interfaz.

## Seguridad de los datos

- Todo se queda en tu computadora. Sólo el chat con IA envía datos fuera, y únicamente al proveedor que elijas.
- Al conectar, la app guarda un respaldo automático.
- Cualquier cambio en el teléfono pide confirmación y exige un respaldo de los últimos 30 minutos.
- Si el teléfono no está disponible, los cambios esperan en una bandeja local (outbox) y no se pierden.

## Desarrollo

Stack: **Tauri 2** (Rust) + **Vue 3** + TypeScript + Pinia + Vite. Tests con Vitest.

```bash
cd app
pnpm install
pnpm dev          # la interfaz en el navegador, con datos demo
pnpm tauri dev    # la app de escritorio
pnpm test         # tests
pnpm build        # typecheck + build
```

```text
app/src/
  domain/          reglas puras y testeables (insights, health, budget-history, metadata…)
  infrastructure/  cliente de PC Manager, parsers y lector de respaldos
  stores/          estado de la app (Pinia)
  components/      vistas Vue
app/src-tauri/     lado nativo (HTTP al teléfono, respaldos, registro de escrituras)
docs/              instalación, límites del servidor, contratos de la API
fixtures/          respuestas reales anonimizadas para tests y modo demo
```

## Documentación

- [Instalación](docs/INSTALL.md)
- [Totales con metadata de cuentas](docs/ACCOUNT-METADATA.md)
- [Límites observados de PC Manager](docs/PC-MANAGER-LIMITS.md)
- [Contrato de la API (OpenAPI)](docs/api/README.md)
