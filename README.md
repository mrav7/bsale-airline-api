# Bsale Airline API (Fastify + MySQL)

API para un desafío técnico: obtener pasajeros por vuelo y asignar asientos faltantes respetando reglas de negocio.

## Requisitos
- Node.js 18+ (probado con Node 24)
- Acceso a la base de datos (credenciales en `.env`)

## Instalación
```bash
npm install
```

## Configuración
Crea un archivo `.env` a partir del ejemplo:

### PowerShell (Windows)
```powershell
Copy-Item .env.example .env
```

### Bash (Linux/macOS)
```bash
cp .env.example .env
```

Variables esperadas:
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME` (default: `airline`)
- `DB_PORT` (default: `3306`)
- `PORT` (ej: `3001`)

## Ejecutar en desarrollo
```bash
npm run dev
```

## Endpoints

### Healthcheck
`GET /health`

Respuesta:
```json
{ "ok": true }
```

### Pasajeros por vuelo (con asignación de asientos faltantes)
`GET /flights/:id/passengers`

- Si el vuelo no existe: `404` con `{ "code": 404, "data": {} }`
- Si existe: `200` con `{ "code": 200, "data": { ... } }`
- Asigna `seatId` a pasajeros que lo tengan `null`, priorizando:
  - Menores junto a un adulto del mismo `purchaseId`
  - Grupo (`purchaseId`) lo más cercano posible
  - No mezclar clase (`seatTypeId`)

Ejemplo:
```bash
curl http://localhost:3001/flights/1/passengers
```

Validación rápida (no debe aparecer `null`):
```bash
curl -s http://localhost:3001/flights/1/passengers | findstr "null"
```

## Notas de implementación
La asignación se realiza en memoria usando la tabla `seat` del avión correspondiente y respetando el layout por modelo (`airplaneId`).
