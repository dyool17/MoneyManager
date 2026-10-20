# MoneyManager Offline Fixtures

Fixtures sintéticos para desarrollar y probar el frontend sin conectar el teléfono.

No contienen la extracción financiera real. Conservan la forma de las respuestas observadas:

- `init-data.json5`: objeto JavaScript no estricto de `getInitData`.
- `summary.json5`: objeto JavaScript no estricto de `getSummaryDataByPeriod`.
- `dashboard.json5`: objeto JavaScript no estricto de `getDashBoardData`.
- `assets.json5`: array JavaScript no estricto de `getAssetData`.
- `cards.json5`: array JavaScript no estricto de `getCardData`.
- `asset-trend.json5`: objeto JavaScript no estricto de `getEachAssetChartData`.
- `movements.xml`: XML de `getDataByPeriod` con ingreso, gasto y transferencias.

Los archivos `.json5` usan claves sin comillas y strings con comillas simples de forma intencional. El parser de producción no debe usar `eval`.
