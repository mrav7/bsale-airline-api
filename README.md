# Bsale Airline API (Fastify + MySQL)

API REST para el desafío técnico de **Andes Airlines**: dado un `flightId`, retorna la información del vuelo + pasajeros, asignando `seatId` a todas las tarjetas de embarque que lo tengan `null`, respetando reglas de negocio.

## URL (deploy)

- Base URL: `https://bsale-airline-api-kwht.onrender.com`
- Healthcheck: `GET /healthz`
- Endpoint principal: `GET /flights/:id/passengers`

> Nota: la ruta raíz `GET /` devuelve un mensaje informativo para evitar `404` en Render.

---

## Requisitos

- Node.js **18+** (probado en Node 24)
- Acceso a base de datos MySQL (solo lectura)

---

## Variables de entorno

Crear un archivo `.env` en la raíz con:

```env
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=airline
DB_PORT=3306
PORT=3001
```

> Las credenciales/valores exactos fueron provistos por el empleador en el PDF del ejercicio.

---

## Instalación

```bash
npm install
```

---

## Ejecutar en local

### Modo desarrollo (si aplica)

```bash
npm run dev
```

### Build + start (producción)

```bash
npm run build
npm start
```

La API quedará escuchando en `http://localhost:<PORT>` (por defecto `3000` si no defines `PORT`).

---

## Endpoints

### 1) Healthcheck

`GET /healthz`

Respuesta:

```json
{ "ok": true }
```

### 2) Root informativo

`GET /`

Respuesta:

```json
{ "ok": true, "message": "Use GET /flights/:id/passengers" }
```

### 3) Pasajeros por vuelo (asignación de asientos)

`GET /flights/:id/passengers`

#### Respuesta exitosa (200)

- La respuesta sigue el formato exigido en el enunciado: `{ "code": 200, "data": { ... } }`.
- Los campos provenientes de la BD (snake_case) se transforman a **camelCase** en la respuesta.
- `dni` se normaliza a número (o `null` si viene vacío / no numérico).

Ejemplo:

```bash
curl -s http://localhost:3001/flights/1/passengers
```

#### Vuelo no encontrado (404)

```json
{ "code": 404, "data": {} }
```

Ejemplos:

```bash
curl -s http://localhost:3001/flights/999999/passengers
curl -s http://localhost:3001/flights/abc/passengers
```

#### Error de conexión a BD (400)

```json
{ "code": 400, "errors": "could not connect to db" }
```

---

## Reglas de negocio implementadas (asignación de asientos)

Al retornar la simulación se asigna un asiento a cada `boarding_pass` que tenga `seat_id = null`, tomando en cuenta:

1. **Menores** deben quedar al lado de al menos un acompañante **adulto** dentro de la misma compra (`purchaseId`).
2. Se intenta que los pasajeros de una misma compra queden **juntos o muy cercanos** (fila/columna).
3. No se mezcla clase: si `seatTypeId` es económica, no se asigna un asiento de otra clase.

---

## Consideraciones de conexión (timeout 5s)

El servidor de BD aborta conexiones inactivas por más de **5 segundos**, por lo que la API obtiene conexiones desde un pool por request y libera siempre la conexión al finalizar.

---

## Pruebas rápidas

```bash
# health
curl -i http://localhost:3001/healthz

# root
curl -i http://localhost:3001/

# endpoint principal (debe retornar code 200)
curl -s http://localhost:3001/flights/1/passengers | jq '.code'

# validación rápida (no deberían quedar seatId null)
curl -s http://localhost:3001/flights/1/passengers | jq '.data.passengers[] | select(.seatId == null)'
```

> En Windows sin `jq`, puedes usar:
> - `ConvertFrom-Json` en PowerShell
> - o instalar `jq` (recomendado)

---

## Entregables (según enunciado)

- `README.md` con instrucciones de ejecución y explicación de la solución.
- Repositorio privado en GitHub y acceso al usuario **postulaciones-bsale**.
- URL del deploy + URL del repo para el formulario.
