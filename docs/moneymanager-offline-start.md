# MoneyManager Offline Start

La base para comenzar el nuevo frontend ya está preparada. El desarrollo puede avanzar sin que el teléfono tenga PC Manager activo.

## Artefactos Disponibles

- `docs/api/moneymanager-pcmanager.openapi.yaml` — contrato HTTP observado.
- `docs/api/README.md` — cómo consumir el contrato desde el frontend.
- `docs/moneymanager-form-contracts.md` — campos de formularios y restricciones visibles del cliente legacy.
- `docs/moneymanager-tauri-vue-plan.md` — arquitectura, fases y garantía read-only.
- `fixtures/moneymanager/` — respuestas sintéticas offline.

## Prerrequisitos

- Node.js y npm.
- Rust toolchain.
- Dependencias de desarrollo de Tauri para Windows.
- El scaffold puede crearse con `npm create tauri-app@latest` y seleccionar Vue + TypeScript.

No hace falta conectar el teléfono para instalar dependencias, compilar la UI o ejecutar los tests de parsing y normalización.

## Primer Vertical Slice

1. Crear el scaffold Tauri + Vue + TypeScript.
2. Añadir un `MoneyManagerClient` con una interfaz común.
3. Implementar `FixtureMoneyManagerClient` usando `fixtures/moneymanager/`.
4. Implementar parsing seguro de JSON5 y XML.
5. Mostrar el resumen offline.
6. Mostrar la tabla offline de movimientos.
7. Añadir una pantalla de conexión que cambie entre fixture y servidor real.
8. Implementar `LiveMoneyManagerClient` usando solamente `GET`.
9. Probar el mismo dashboard y la misma tabla contra ambas implementaciones.

## Interfaz De Datos

```ts
interface MoneyManagerClient {
  getInitData(): Promise<InitData>
  getMovements(query: MovementQuery): Promise<Movement[]>
  getSummary(query: PeriodQuery): Promise<Summary>
  getDashboard(): Promise<Dashboard>
  getAssets(): Promise<AssetNode[]>
  getCards(): Promise<CardNode[]>
  getAssetTrend(assetId: string): Promise<AssetTrend>
}
```

Los componentes Vue sólo deben depender de esta interfaz. Así, el modo offline no es un mock específico de una pantalla, sino una implementación completa del mismo contrato.

## Criterios Para Conectar El Servidor

- El parser pasa los fixtures locales.
- La app no contiene `eval`.
- El cliente live sólo expone métodos `GET`.
- La UI funciona con `FixtureMoneyManagerClient` sin red.
- Los tests verifican que un rango dividido por meses no duplique IDs.
- Los cargos futuros se marcan de forma explícita.
- Las respuestas inválidas muestran error y no actualizan el estado anterior.

## No Hacer Todavía

- No generar clientes desde las operaciones `POST` de la OpenAPI.
- No probar constraints server-side contra el libro real.
- No restaurar `money.sqlite` desde la app; la descarga se usa sólo como respaldo local al conectar (ver `odd/tasks/phase1-read-only.md`, L8).
- No implementar formularios de escritura en Vue.
- No usar el DOM o los estilos de ExtJS como dependencia.

## Cuando Se Retome En Otra Sesión

Buscar primero:

1. `docs/moneymanager-offline-start.md`
2. `docs/api/moneymanager-pcmanager.openapi.yaml`
3. `docs/moneymanager-form-contracts.md`
4. `docs/moneymanager-tauri-vue-plan.md`

Después continuar con el vertical slice, no con la integración de escritura.
