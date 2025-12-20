# Bsale Airline API (Fastify + MySQL)

API para un desafío técnico: obtener pasajeros por vuelo y **asignar asientos faltantes** respetando reglas de negocio.

## Requisitos

- Node.js 18+ (probado con Node 22/24)
- Acceso a la base de datos MySQL (credenciales vía variables de entorno)

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

### Variables esperadas

> **Nota:** `DB_HOST`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` son requeridas (si falta alguna, la app falla al iniciar).

- `DB_HOST` (requerida)
- `DB_USER` (requerida)
- `DB_PASSWORD` (requerida)
- `DB_NAME` (requerida)
- `DB_PORT` (opcional, default: `3306`)
- `DB_CONN_LIMIT` (opcional, default: `10`)
- `PORT` (opcional; Render lo inyecta automáticamente en deploy)

Ejemplo `.env`:

```bash
DB_HOST=your-host
DB_USER=your-user
DB_PASSWORD=your-password
DB_NAME=airline
DB_PORT=3306
PORT=3000
```

## Ejecutar local

### Desarrollo (watch)
```bash
npm run dev
```

### Build + Start (producción local)
```bash
npm run build
npm start
```

Por defecto levanta en `http://localhost:3000` (o el puerto que definas en `PORT`).

## Endpoints

### Healthcheck
`GET /healthz`

Respuesta (200):
```json
{ "ok": true }
```

### Root (ayuda rápida)
`GET /`

Respuesta (200):
```json
{ "ok": true, "message": "Use GET /flights/:id/passengers" }
```

### Pasajeros por vuelo (con asignación de asientos faltantes)
`GET /flights/:id/passengers`

- Si el vuelo no existe o el id es inválido: `404` con `{ "code": 404, "data": {} }`
- Si existe: `200` con `{ "code": 200, "data": { ... } }`
- En caso de error de conexión DB: `400` con `{ "code": 400, "errors": "could not connect to db" }`

Ejemplo:

```bash
curl http://localhost:3000/flights/1/passengers
```

Validación rápida:
- No debe quedar ningún `seatId` en `null` para el vuelo 1:

```powershell
$j = curl.exe -s http://localhost:3000/flights/1/passengers | ConvertFrom-Json
($j.data.passengers | Where-Object { $_.seatId -eq $null }).Count
```

- `dni` se normaliza a número o `null` (no debería venir como string).

## Lógica de asignación de asientos (resumen)

La asignación se realiza en memoria usando la tabla `seat` del avión correspondiente:

- Agrupa pasajeros por `purchaseId`
- Prioriza **menores**:
  - Si hay un adulto del mismo `purchaseId` ya sentado (misma clase), intenta asignar un asiento **adyacente**
  - Si no hay adulto sentado, intenta sentar **un par adyacente** (adulto + menor)
- Luego asigna el resto del grupo intentando quedar lo más cercano posible al “ancla”
- Nunca mezcla clases: respeta `seatTypeId`

Para calcular cercanía se usa un layout por modelo (`airplaneId`) y una distancia por fila/bloque/posición.

## Deploy en Render (Web Service)

1. Crea un **Web Service** desde el repo (Node).
2. Configura:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/healthz`
3. Agrega environment variables:
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (y opcionalmente `DB_PORT`, `DB_CONN_LIMIT`)
4. Deploy.

> Render asigna el puerto vía `PORT`. La app ya escucha en `process.env.PORT` (con fallback a 3000).

### URL (ejemplo)

- Base URL: `https://<tu-servicio>.onrender.com`
- Endpoint principal: `https://<tu-servicio>.onrender.com/flights/1/passengers`

## Scripts (opcional)

- `scripts/validate-seatid.ps1`: utilidades de validación local (PowerShell).

## Notas

- La API usa `mysql2/promise` con pool de conexiones y libera la conexión al final de cada request.
- `.gitignore` ignora `.env` y artefactos de build (`dist/`), y `.gitattributes` normaliza EOL (LF para código, CRLF para `.ps1`).
