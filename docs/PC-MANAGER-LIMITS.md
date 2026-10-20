# Límites observados del servidor PC Manager

Notas de comportamiento real, medidas contra un teléfono Money Manager con PC Manager activo (2026-10-20). No son documentación oficial: son observaciones de campo.

## Periodos de fechas: se cuelga con certainos inicios

`GET /moneyBook/getDataByPeriod` **nunca responde** cuando el `startDate` cae en los últimos días respecto de hoy. Medido con `today = 2026-10-20`:

| Periodo pedido | Respuesta |
|---|---|
| `2026-10-01..2026-10-31` | OK, 43 KB |
| `2026-10-01..2026-10-20` | OK, 42 KB |
| `2026-10-17..2026-10-20` | OK, 8,8 KB |
| `2026-10-18..2026-10-20` | **cuelga** |
| `2026-10-19..2026-10-20` | **cuelga** |
| `2026-10-20..2026-10-20` | **cuelga** |
| `2026-10-19..2026-10-19` | **cuelga** |
| `2026-10-19..2026-10-18` (invertido) | **cuelga** |

El límite es el `startDate`: los inicios de los últimos dos días respecto de hoy fallan, con cualquier `endDate`. Los rangos que empiezan el día 1 del mes funcionan siempre.

`GET /moneyBook/getSummaryDataByPeriod` **no** sufre este problema: responde con cualquier combinación de fechas.

### Mitigación en la app

`app/src/domain/period.ts` expone `safeQueryStart(startDate, today)`: si el inicio cae a dos días o menos de hoy, la consulta se adelanta tres días y las filas extra se filtran por fecha, de modo que el resultado es idéntico al periodo pedido. La app consulta siempre meses completos, así que el caso sólo aparecería con un `initStartDate` que no fuese el día 1.

## Otros límites medidos

- `GET /moneyBook/money.sqlite` responde `200` con **cero bytes**: la copia completa de la base no está disponible por HTTP. El respaldo automático guarda el snapshot legible y lo marca como tal.
- `GET /moneyBook/getCardData` devuelve el total de deuda **en cero** aunque las tarjetas tengan importes pendientes. Hay que sumar el `notPayMoney` de cada tarjeta.
- `GET /moneyBook/getAssetData` devuelve en los grupos el saldo ya convertido a la moneda principal y sin las cuentas excluidas, pero cada hijo conserva su saldo original sin convertir. Los totales por grupo no coinciden con la suma de sus hijos.
- `GET /moneyBook/getDashBoardData` devuelve un patrimonio que **no** coincide con el total del móvil: 65.901,4796 frente a 44.513,75 en el mismo libro. La app no usa ese valor como patrimonio corregido.
- Las escrituras responden con un objeto literal JavaScript (`{success:true}`) sin identificadores nuevos: después de crear hay que releer para conocer el id.
