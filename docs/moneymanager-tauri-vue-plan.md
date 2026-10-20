# MoneyManager Desktop Rebuild

Plan para reemplazar la interfaz ExtJS de MoneyManager PC Manager con una aplicación de escritorio basada en Tauri y Vue, consumiendo el servidor local de Android.

## Decisión

Construir una aplicación Tauri 2 + Vue 3 + TypeScript que consuma los contratos HTTP del PC Manager, en lugar de scrapear o reutilizar el DOM ExtJS.

El primer alcance será estrictamente de lectura. La aplicación no tendrá un cliente HTTP genérico ni comandos Tauri capaces de enviar métodos mutables.

## Alcance Inicial

- Conectar a una IP y puerto configurables de la red local.
- Probar disponibilidad del PC Manager.
- Leer configuración, cuentas, categorías y subcategorías.
- Mostrar dashboard de activos, pasivos y tendencias.
- Consultar movimientos por período.
- Filtrar por fecha, cuenta, tipo, categoría y texto.
- Mostrar tarjetas y saldos pendientes.
- Distinguir movimientos registrados de cargos futuros.
- Mostrar estados de carga, desconexión y respuestas inválidas.
- No modificar ningún dato del teléfono.

## Arquitectura

```text
Vue 3 / TypeScript
        |
        | invoke: comandos tipados de lectura
        v
Tauri / Rust
        |
        | GET únicamente
        v
MoneyManager PC Manager
192.168.1.161:8080
```

### Frontend

- Vue 3 con `<script setup lang="ts">`.
- Vite para desarrollo y compilación.
- Pinia para el estado compartido.
- Vue Router sólo si la navegación por pantallas lo necesita.
- Componentes separados para dashboard, movimientos, cuentas, tarjetas y configuración.
- Estado explícito para `loading`, `ready`, `offline` y `invalid-response`.

### Backend Tauri

- Cliente HTTP restringido a `GET`.
- Comandos Tauri tipados, por ejemplo `get_init_data` y `get_movements`.
- URL del servidor validada como HTTP local/LAN y no como destino arbitrario.
- Allowlist de URL en las capabilities de Tauri.
- Sin comandos `request(url, method, body)` genéricos.
- Sin `eval` para interpretar respuestas del servidor.

## Contratos De Lectura

| Operación | Ruta | Respuesta | Uso |
|---|---|---|---|
| Init | `GET /moneyBook/getInitData` | Objeto JavaScript no estricto | Libros, cuentas, categorías y activos |
| Movimientos | `GET /moneyBook/getDataByPeriod?startDate=...&endDate=...&mbid=...&assetId=...` | XML | Gastos, ingresos y transferencias |
| Resumen | `GET /moneyBook/getSummaryDataByPeriod?...` | Objeto JavaScript no estricto | Ingresos, gastos, neto y presupuesto |
| Dashboard | `GET /moneyBook/getDashBoardData` | Objeto JavaScript no estricto | Patrimonio y distribución |
| Activos | `GET /moneyBook/getAssetData` | Árbol JavaScript no estricto | Saldos de cuentas |
| Tarjetas | `GET /moneyBook/getCardData` | Árbol JavaScript no estricto | Crédito usado y pendiente |
| Tendencia | `GET /moneyBook/getEachAssetChartData?assetId=...` | Objeto JavaScript no estricto | Historial de una cuenta |

Los objetos JavaScript deben parsearse con un parser compatible con JSON5 o una normalización equivalente segura. No se debe ejecutar el texto recibido.

Los movimientos no tienen paginación. El cliente debe consultar por meses, combinar resultados y deduplicar por `id`.

El parámetro `mbid` no debe tratarse como una frontera de seguridad: las pruebas mostraron que un valor inexistente puede devolver datos del libro existente.

Los endpoints pueden calcular cifras con alcances diferentes. Por ejemplo, `$Nexa` presentó valores distintos en el dashboard y en el árbol de activos. La UI debe conservar la fuente de cada cifra.

## Modelo Normalizado

```ts
type MovementType = 'income' | 'expense' | 'transfer-in' | 'transfer-out'

interface Movement {
  id: string
  date: string
  assetId: string
  toAssetId?: string
  accountName: string
  targetAccountName?: string
  categoryId?: string
  categoryName?: string
  subcategoryId?: string
  subcategoryName?: string
  content?: string
  detail?: string
  amount: number
  type: MovementType
  isFuture: boolean
}
```

La normalización debe conservar el valor original y la fuente cuando una respuesta no coincida con otra. Los importes deben tratarse como números decimales durante cálculos y formatearse sólo en la UI.

## Pantallas

### Dashboard

- Patrimonio total.
- Activos y pasivos.
- Serie temporal del patrimonio.
- Distribución de activos.
- Indicador de fecha de consulta y fuente.

### Movimientos

- Tabla virtualizable si el volumen lo requiere.
- Rango de fechas.
- Cuenta y cuenta destino.
- Tipo de movimiento.
- Categoría y subcategoría.
- Búsqueda en contenido y detalle.
- Separación visible entre registros hasta hoy y cargos futuros.

### Cuentas

- Árbol de cuentas y grupos.
- Saldo actual.
- Tendencia individual.
- Detalle de movimientos de la cuenta.

### Tarjetas

- Tarjetas de crédito.
- Este mes.
- Próximo mes.
- Cuenta vinculada cuando el endpoint la exponga.

## Fases

### Fase 0: Contrato Y Seguridad

- Crear el scaffold Tauri/Vue.
- Añadir tipos de respuesta y modelos normalizados.
- Implementar parser seguro de XML y JSON5.
- Crear fixtures a partir de respuestas reales sin datos adicionales.
- Bloquear métodos mutables en código y capabilities.

### Fase 1: Vertical Slice Read-Only

- Configuración de IP/puerto.
- Prueba de conexión.
- `getInitData`.
- Resumen del período.
- Tabla de movimientos.
- Errores de red y servidor apagado.

### Fase 2: Dashboard Y Cuentas

- Dashboard de patrimonio.
- Árbol de activos.
- Tarjetas.
- Tendencias por cuenta.

### Fase 3: Calidad De Uso

- Filtros combinables.
- Paginación visual o virtualización local.
- Cache de consultas de lectura.
- Refresh manual y automático opcional.
- Exportación local sólo si se define como una operación de salida, no de escritura en el teléfono.

### Fase 4: Distribución

- Build para Windows.
- Instalador.
- Diagnóstico de conectividad LAN.
- Documentación de cómo activar PC Manager en Android.

## Inventario De Operaciones Mutables

Este inventario se obtuvo leyendo los scripts del cliente publicado. No se invocó ninguna ruta.

| Método observado | Ruta | Operación |
|---|---|---|
| `POST` | `/moneyBook/create` | Crear movimiento |
| `POST` | `/moneyBook/update` | Actualizar movimiento |
| `POST` | `/moneyBook/delete` | Eliminar movimientos |
| `POST` | `/moneyBook/removeAsset` | Eliminar activo o tarjeta |
| `POST` | `/moneyBook/assetAdd` | Crear activo |
| `POST` | `/moneyBook/assetModify` | Modificar activo |
| `POST` | `/moneyBook/addAssetCard` | Crear tarjeta |
| `POST` | `/moneyBook/modifyCard` | Modificar tarjeta |
| `POST` | `/moneyBook/moveAsset` | Crear transferencia |
| `POST` | `/moneyBook/modifyMoveAsset` | Modificar transferencia |
| `POST` | `/moneyBook/getExcelFile` | Exportar movimientos a Excel |
| `POST` | `/moneyBook/uploadSqlFile` | Subir y restaurar respaldo |
| `POST` en el cliente viejo | `/moneyBook/getEachAssetChartData` | El cliente lo declara así, aunque el servidor respondió a `GET`; la nueva app usará sólo `GET` |

No se encontró ninguna ruta `PUT` en los scripts revisados. La ausencia de una ruta en los scripts no constituye garantía de que el servidor no acepte otros métodos; por eso el cliente nuevo bloqueará todos los métodos excepto `GET`.

### Parámetros Observables

Estos parámetros se deducen de los formularios y llamadas del cliente publicado. No se enviaron.

| Ruta | Parámetros observables |
|---|---|
| `/moneyBook/create`, `/moneyBook/update` | Campos del movimiento: `id`, `mbDate`, `assetId`, `toAssetId`, `targetAssetId`, `payType`, `mcid`, `mbCategory`, `mcscid`, `subCategory`, `mbContent`, `mbCash`, `inOutCode`, `inOutType`, `mbDetailContent` |
| `/moneyBook/delete` | `ids`, una cadena de IDs separados por `:` |
| `/moneyBook/removeAsset` | `assetId` |
| `/moneyBook/getInitData` vía `POST` | `mbid` |
| `/moneyBook/assetAdd` | `assetGroupName`, `assetGroupId`, `assetName`, `linkAssetName`, `linkAssetId`, `assetMoney` |
| `/moneyBook/assetModify` | `assetGroupName`, `assetGroupId`, `assetName`, `assetId`, `linkAssetName`, `linkAssetId`, `assetMoney` |
| `/moneyBook/addAssetCard` | `cardName`, `linkAssetName`, `linkAssetId`, `notPayMoney`, `jungsanDay`, `paymentDay` |
| `/moneyBook/modifyCard` | `cardName`, `assetId`, `linkAssetName`, `linkAssetId`, `jungsanDay`, `paymentDay` |
| `/moneyBook/moveAsset` | `id`, `moveDate`, `fromAssetName`, `fromAssetId`, `toAssetName`, `toAssetId`, `moveMoney`, `moneyContent`, `mbDetailContent` |
| `/moneyBook/modifyMoveAsset` | Los mismos campos de transferencia, con `id` existente |
| `/moneyBook/getExcelFile` | `startDate`, `endDate`, `mbid`, `assetId`, `inOutType` |
| `/moneyBook/uploadSqlFile` | Multipart file `file` |
| `/moneyBook/getEachAssetChartData` vía `POST` | `assetId` |

La lista anterior describe lo que el frontend publicado construye. Para descubrir rutas adicionales sin mutar datos se puede seguir inspeccionando recursos estáticos o documentación del servidor; no es necesario probar los métodos mutables.

## Futuro Alcance De Escritura

Sí es técnicamente posible agregar modificaciones más adelante, pero no deben habilitarse como una extensión informal del cliente actual.

Antes de agregar escritura se requiere:

- Confirmación explícita del usuario para abandonar el modo read-only.
- Especificación de cada operación y sus parámetros.
- Copia de seguridad descargada y verificada localmente.
- Confirmación visual previa a cada mutación.
- Protección contra doble envío.
- Registro local de auditoría.
- Manejo de errores y rollback cuando el servidor lo permita.
- Tests contra un fixture o una instancia aislada.
- Revisión separada de seguridad y datos.
- Habilitación por capability/comando, no por una bandera de UI.

La descarga de `money.sqlite` y su restauración quedan fuera del MVP. La ruta de descarga respondió sin cuerpo durante las pruebas actuales y la restauración es una operación destructiva.

## Criterios De Aceptación Del MVP

- La aplicación funciona aunque el servidor esté apagado y muestra un error accionable.
- Todas las solicitudes de la aplicación son `GET`.
- No existe código frontend o Rust que acepte un método HTTP arbitrario.
- Los movimientos XML se parsean sin ejecutar contenido remoto.
- Los objetos no estrictos se parsean sin `eval`.
- Las consultas históricas no pierden ni duplican movimientos al dividirse por meses.
- Los cargos futuros se identifican explícitamente.
- Las cifras muestran su período y endpoint de origen.
- Los tests cubren respuestas válidas, vacías, malformadas y desconexiones.

## Artefactos Offline

- `docs/moneymanager-offline-start.md` — prerrequisitos y primer vertical slice.
- `docs/api/moneymanager-pcmanager.openapi.yaml` — contrato HTTP observado.
- `docs/api/README.md` — reglas de uso del contrato.
- `docs/moneymanager-form-contracts.md` — campos y restricciones observables de formularios.
- `fixtures/moneymanager/` — respuestas sintéticas para desarrollo sin servidor.

## Próximo Entregable

Crear el scaffold y construir el vertical slice de la Fase 1. No se debe añadir todavía ninguna pantalla o comando de escritura.
