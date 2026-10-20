# MoneyManager API Artifacts

Estos archivos describen el contrato observado del PC Manager v330 para que el nuevo frontend pueda desarrollarse sin el teléfono conectado.

## Archivos

- `moneymanager-pcmanager.openapi.yaml`: contrato completo observado. Incluye lecturas, variantes legacy por POST, exportación y operaciones mutables documentadas.
- `../../fixtures/moneymanager/`: respuestas sintéticas con el formato real del servidor.
- `../moneymanager-form-contracts.md`: formularios, campos, restricciones visibles y límites de lo que todavía no está confirmado.

## Regla De Seguridad

El nuevo frontend sólo debe implementar las operaciones etiquetadas `x-mutability: read` cuyo método sea `GET`.

Las operaciones `POST` están documentadas para análisis futuro, pero no deben entrar al cliente read-only ni generarse automáticamente. La OpenAPI es evidencia del contrato observado, no autorización para ejecutar mutaciones.

## Desarrollo Offline

El adaptador de datos del frontend debe tener dos implementaciones detrás de la misma interfaz:

```text
MoneyManagerClient
├── LiveMoneyManagerClient   -> Tauri/Rust, GET contra Android
└── FixtureMoneyManagerClient -> archivos de fixtures, sin red
```

La implementación de fixtures debe mapear cada operación a un archivo y mantener los mismos modelos normalizados que la implementación live. Así, los componentes Vue no necesitan saber si existe conexión.

## Limitaciones Conocidas

- Los cuerpos `text/plain` de configuración, resumen, dashboard, activos, tarjetas y tendencias son objetos JavaScript no estrictamente JSON.
- Los movimientos son XML.
- No se observó paginación.
- `mbid` no debe considerarse un aislamiento de seguridad.
- El servidor puede calcular cifras distintas entre endpoints.
- Las validaciones de los formularios son las visibles en el cliente legacy; las validaciones server-side no fueron probadas.
