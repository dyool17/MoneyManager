# MoneyManager Form Contracts

Base de trabajo para futuras pantallas de escritura. Se obtuvo leyendo `moneybook.js`, `asset.js`, `assetDetailList.js` y `setting.js` del cliente ExtJS v330. Ningún formulario fue enviado durante la extracción.

## Cómo Leer La Tabla

- **Requerido en cliente**: el formulario legacy bloquea el submit si falta el valor.
- **Restricción visible**: regla o comportamiento que se observa en la UI.
- **Servidor**: no confirmado hasta probarlo explícitamente en una instancia aislada.
- **Riesgo**: impacto si se envía un valor incorrecto.

La especificación OpenAPI usa extensiones `x-client-required` cuando la obligatoriedad proviene de la UI y no de una validación confirmada del servidor.

## Movimiento: Crear O Actualizar

Rutas observadas: `POST /moneyBook/create` y `POST /moneyBook/update`.

| Campo | Tipo visible | Requerido en cliente | Restricción visible | Servidor |
|---|---|---:|---|---|
| `id` | hidden/string | No en alta; existente en actualización | Identificador del registro | No confirmado |
| `mbDate` | datefield | Sí | Formato `Y-m-d`; mínimo `2006-01-01` en editor | No confirmado |
| `assetId` | combo value | Sí indirectamente | Se obtiene de la cuenta seleccionada; selección forzada | No confirmado |
| `payType` | combo label | Sí | Selección forzada; no texto libre | No confirmado |
| `mcid` | combo value | Sí indirectamente | Categoría dependiente del tipo ingreso/gasto | No confirmado |
| `mbCategory` | combo label | Sí | Selección forzada; no texto libre | No confirmado |
| `mcscid` | combo value | Condicional | Se limpia si la categoría no tiene subcategorías | No confirmado |
| `subCategory` | combo label | Condicional | Se deshabilita cuando la categoría no tiene subcategorías | No confirmado |
| `mbContent` | textfield | No | Texto libre | No confirmado |
| `mbCash` | numberfield | Sí | Número; alta inicializa `0` | No confirmado |
| `inOutCode` | hidden/record | Sí por modelo | `0` ingreso, `1` gasto; transferencias usan otros códigos | No confirmado |
| `inOutType` | disabled textfield | No editable | La UI lo deriva del contexto | No confirmado |
| `mbDetailContent` | textfield | No | Texto libre | No confirmado |

El cliente envía también campos de transferencia cuando existen (`toAssetId`, `targetAssetId`), aunque el editor de gasto/ingreso no los modifica directamente.

### Reglas De La UI

- En la pestaña de ingreso, el alta usa `inOutCode=0`.
- En la pestaña de gasto, el alta usa `inOutCode=1`.
- En la pestaña de transferencia, el botón de alta abre el formulario de transferencia en vez del editor normal.
- Los registros con códigos de transferencia no se editan con el editor normal.
- El monto no tiene `minValue` ni `maxValue` visible en el editor normal.

## Rango De Consulta

Se usa para lecturas, no para modificar datos.

| Campo | Tipo | Requerido | Restricción visible |
|---|---|---:|---|
| `mbid` | combo | Sí | Selección forzada y no editable |
| `startDate` | datefield | Sí | Formato `Y-m-d`; no editable manualmente |
| `endDate` | datefield | Sí | Formato `Y-m-d`; no editable manualmente |

Si `endDate < startDate`, la UI corrige automáticamente el otro extremo para mantener un rango válido. El servidor no fue probado con rangos invertidos.

## Activo: Alta

Ruta observada: `POST /moneyBook/assetAdd`.

| Campo | Tipo | Requerido en cliente | Restricción visible | Servidor |
|---|---|---:|---|---|
| `assetGroupName` | combo | Sí | Selección forzada | No confirmado |
| `assetGroupId` | hidden | Sí en submit normal | Se copia del grupo seleccionado | No confirmado |
| `assetName` | textfield | Sí | Texto no vacío | No confirmado |
| `linkAssetName` | combo | No | Se muestra para el grupo con ID `3`; selección forzada cuando se usa | No confirmado |
| `linkAssetId` | hidden | Condicional | Se copia de la cuenta vinculada | No confirmado |
| `assetMoney` | numberfield | Sí | Número; para grupos `9`, `5` y `3` la UI muestra indicación de monto negativo | No confirmado |

No se observó una regla de longitud máxima para `assetName`, ni límites numéricos explícitos para `assetMoney`.

## Activo: Modificación

Ruta observada: `POST /moneyBook/assetModify`.

Campos: `assetGroupName`, `assetGroupId`, `assetName`, `assetId`, `linkAssetName`, `linkAssetId`, `assetMoney`.

Restricciones visibles:

- `assetGroupName`, `assetName` y `assetMoney` son obligatorios.
- `assetId` es hidden y se carga desde el nodo seleccionado.
- La cuenta vinculada se muestra para el grupo con ID `3`.
- No se observan límites de longitud o monto.

## Tarjeta: Alta

Ruta observada: `POST /moneyBook/addAssetCard`.

| Campo | Tipo | Requerido en cliente | Restricción visible | Servidor |
|---|---|---:|---|---|
| `cardName` | textfield | Sí | Texto no vacío | No confirmado |
| `linkAssetName` | combo | Sí | Cuenta vinculada obligatoria; selección forzada | No confirmado |
| `linkAssetId` | hidden | Sí en submit | Se copia de la cuenta seleccionada | No confirmado |
| `notPayMoney` | numberfield | Sí | La UI muestra indicación de monto negativo | No confirmado |
| `jungsanDay` | numberfield | No | Placeholder `1 ~ 31`; no hay min/max validator visible | No confirmado |
| `paymentDay` | numberfield | No | Placeholder `1 ~ 31`; no hay min/max validator visible | No confirmado |

El rango `1..31` es una indicación visual, no una restricción aplicada por el cliente legacy.

## Tarjeta: Modificación

Ruta observada: `POST /moneyBook/modifyCard`.

Campos: `cardName`, `assetId`, `linkAssetName`, `linkAssetId`, `jungsanDay`, `paymentDay`.

Restricciones visibles:

- `cardName` es de sólo lectura.
- `assetId` es hidden y obligatorio para identificar la tarjeta.
- `linkAssetName` es obligatorio y usa selección forzada.
- `jungsanDay` y `paymentDay` son numéricos y opcionales en la UI.
- No hay min/max validator visible para los días.

## Transferencia: Alta O Modificación

Rutas observadas: `POST /moneyBook/moveAsset` y `POST /moneyBook/modifyMoveAsset`.

| Campo | Tipo | Requerido en cliente | Restricción visible | Servidor |
|---|---|---:|---|---|
| `id` | hidden | Sólo modificación | Identificador del movimiento existente | No confirmado |
| `moveDate` | datefield | Sí | Formato `Y-m-d`; inicia con la fecha actual | No confirmado |
| `fromAssetName` | combo | Sí | Selección forzada | No confirmado |
| `fromAssetId` | hidden | Sí en submit | Se copia de la cuenta de retiro | No confirmado |
| `toAssetName` | combo | Sí | Selección forzada | No confirmado |
| `toAssetId` | hidden | Sí en submit | Se copia de la cuenta de depósito | No confirmado |
| `moveMoney` | numberfield | Sí | Número; para pago de tarjeta la UI puede cargar un monto negativo | No confirmado |
| `moneyContent` | textfield | No | Texto libre | No confirmado |
| `mbDetailContent` | textfield | No | Texto libre | No confirmado |

No se observó una validación que impida seleccionar la misma cuenta como origen y destino.

## Eliminación

Ruta observada: `POST /moneyBook/delete`.

- El cliente exige una confirmación visual.
- Envía `ids` como cadena concatenada con `:`; para dos registros tiene forma `:id-1:id-2`.
- No existe un formulario de campos adicional.
- Operación destructiva; no debe incluirse en el MVP.

## Activos Y Tarjetas: Eliminación

Ruta observada: `POST /moneyBook/removeAsset`.

- Envía únicamente `assetId`.
- El cliente exige confirmación visual.
- Puede eliminar un activo o una tarjeta según el árbol desde el que se invoque.
- No debe probarse contra datos reales.

## Respaldo

### Descarga

Ruta: `GET /moneyBook/money.sqlite`.

El cliente usa un iframe para descargarla. La respuesta observada fue `200` con cuerpo vacío en este entorno. La descarga debe considerarse no verificada y fuera del MVP.

### Restauración

Ruta: `POST /moneyBook/uploadSqlFile`.

| Campo | Tipo | Requerido en cliente | Restricción visible |
|---|---|---:|---|
| `file` | multipart file | Sí | El texto de la UI menciona `money.sqlite`; no hay `accept` ni MIME validator visible |

La restauración es potencialmente destructiva. Nunca debe ejecutarse como parte de una prueba de contrato.

## Exportación Excel

Ruta: `POST /moneyBook/getExcelFile`.

Campos hidden observados:

- `startDate`
- `endDate`
- `mbid`
- `assetId`
- `inOutType`

El formulario se envía directamente con `submit()`. No se verificó su respuesta. Aunque exportar no debería modificar el libro, usa POST y queda fuera de la garantía GET-only del MVP.

## Lo Que Falta Confirmar

- Validaciones server-side y mensajes de error.
- Límites de longitud de textos.
- Precisión y rango de importes.
- Semántica exacta de todos los `inOutCode`.
- Si `targetAssetId` se usa en alguna operación no expuesta por la UI actual.
- Respuestas y códigos HTTP de las operaciones mutables.
- Si existen rutas no referenciadas por los scripts publicados.

Estas preguntas deben resolverse con documentación oficial, una copia aislada o pruebas explícitamente autorizadas. No se deben responder probando contra el libro real.
