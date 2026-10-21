# Totales con metadata de cuentas

El neto actual se calcula con los saldos recibidos del teléfono y la metadata de cada cuenta: inclusión en totales, moneda y tipo de cambio. Importar metadata **no restaura un respaldo ni modifica el teléfono**.

## Configurar

1. Conecta el teléfono y abre **Account metadata**.
2. Selecciona un respaldo nativo `.mmbak` o `.sqlite`, o usa **Configure** para configurar cada cuenta manualmente.
3. Revisa la moneda principal, la moneda de cada cuenta, su tasa de conversión y **Include in totals**.
4. Regresa a **Net worth**. El total corregido aparece cuando todas las cuentas y tarjetas cargadas tienen metadata.

Una tasa de `7.78` para USD con moneda principal GTQ significa **1 USD = 7.78 GTQ**. La tasa de la moneda principal debe ser `1`.

## Prioridad y actualización

| Situación | Comportamiento |
|---|---|
| Configuración manual | Tiene prioridad sobre el respaldo importado. |
| Nueva importación | Actualiza la base importada; conserva los ajustes locales. |
| **Use imported settings** | Elimina el ajuste local y vuelve al dato importado, si existe. |
| Cuenta nueva sin metadata | Señala la cuenta como pendiente; no muestra un total parcial como completo. |
| Cuenta excluida | Sigue visible, pero no aporta al neto ni a su distribución. |
| Cambio de nombre desde el respaldo | Muestra un aviso para revisar la metadata. |
| Cambio de switch, moneda o tasa en el móvil | Importa un respaldo actualizado o modifica la configuración local; HTTP no permite detectar todos esos cambios. |

El archivo se lee en memoria con SQLite WASM incluido en la aplicación, sin servicios externos. Sólo se guardan IDs, nombres, inclusión, monedas, tasas y fecha de importación en el almacenamiento local de la aplicación. La importación de metadata no lee transacciones ni conserva una copia del archivo. (Aparte, **Insights → Open backup…** sí lee las transacciones de un respaldo para reportes sin conexión, sólo en memoria y sin guardarlas.) Máximo: 64 MiB. Archivos cifrados, esquemas desconocidos y metadata inválida se rechazan sin reemplazar la configuración anterior.

## Alcance de las cifras

- La configuración se guarda por dirección del servidor del teléfono. Si cambia su IP, debes volver a importar o configurar. Una dirección reutilizada por otro dispositivo no demuestra identidad: revisa siempre las cuentas antes de usar sus totales.
- Los saldos de cuentas se convierten a la moneda principal y se excluyen los que no contabilizan.
- Para tarjetas se usa el importe individual **To pay**, no el total agregado del grupo, que puede llegar en cero.
- Las series históricas siguen siendo las que entrega PC Manager y están identificadas como tales; la configuración actual no reescribe el pasado.
- Las tasas importadas son las del respaldo, no cotizaciones actualizadas automáticamente.
- Si faltan datos, el neto remoto se muestra únicamente como **Unverified PC Manager net worth**, no como neto corregido.

No incluyas tus respaldos privados en Git. Las extensiones `.mmbak`, `.sqlite` y `.sqlite3` están ignoradas en este repositorio.
