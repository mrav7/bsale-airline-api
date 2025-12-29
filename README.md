# Andes Airline API

API REST (Fastify + TypeScript + MySQL) desarrollada para el desafío técnico de **Bsale**: dado un `flightId`, retorna la información del vuelo + pasajeros y **simula** el check-in asignando `seatId` a todas las `boarding_pass` que lo tengan `null`, respetando reglas de negocio.

---

## URL (deploy)

- **Base URL:** `https://bsale-airline-api-kwht.onrender.com`
- **Healthcheck:** `GET /healthz`
- **Endpoint principal:** `GET /flights/:id/passengers`

> Nota: la ruta raíz `GET /` devuelve un mensaje informativo para evitar `404` en Render.

---

## Stack y tecnologías

- **Runtime:** Node.js (ESM)
- **Lenguaje:** TypeScript (modo `strict`)
- **Framework HTTP:** Fastify
- **DB client:** `mysql2/promise`
- **Config:** `dotenv` (cargado vía `import "dotenv/config"`)
- **Dev runner:** `tsx` (watch mode)

---

## Estructura del repositorio

```
.
├── src/
│   ├── server.ts                  # Fastify server + endpoints + queries SQL + mapping respuesta
│   ├── db.ts                      # Pool MySQL (mysql2/promise) + lectura de variables de entorno
│   └── services/
│       └── seatAssignment.ts      # Lógica de asignación de asientos (simulación)
├── scripts/
│   └── validate-seatid.ps1        # Smoke test (Windows): valida seatId != null en vuelos 1..300
├── .env.example                   # Plantilla de variables de entorno
├── package.json                   # Scripts (dev/build/start) + dependencias
└── tsconfig.json                  # Config TS (strict, moduleResolution nodenext, outDir dist)
```

---

## Requisitos

- **Node.js 18+** (por ESM y toolchain)
- Acceso a **MySQL** (DB del desafío, **solo lectura**)

---

## Configuración (variables de entorno)

1) Copia `.env.example` a `.env` y completa las credenciales.

```env
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=airline
DB_PORT=3306

# Puerto del servidor HTTP
PORT=3001

# (opcional) tamaño del pool
DB_CONN_LIMIT=10
```

> Las credenciales/valores exactos fueron provistos por el empleador en el PDF del ejercicio.

---

## Instalación

```bash
npm install
```

---

## Ejecutar en local

### Desarrollo (watch)

```bash
npm run dev
```

### Producción (build + start)

```bash
npm run build
npm start
```

- Por defecto escucha en `http://localhost:3000`.
- Si defines `PORT`, escucha en `http://localhost:<PORT>`.

---

## Scripts disponibles

- `npm run dev` → `tsx watch src/server.ts`
- `npm run build` → compila TypeScript a `dist/`
- `npm start` → ejecuta `node dist/server.js`

### Smoke test (Windows PowerShell)

El script `scripts/validate-seatid.ps1` consulta vuelos `1..300` y reporta si existe algún pasajero con `seatId == null` en la respuesta.

```powershell
# Asegúrate de tener la API corriendo localmente (por defecto el script usa http://localhost:3001)
.\scripts\validate-seatid.ps1
```

> Si tu API corre en otro puerto, ajusta la variable `$base` dentro del script.

---

## Endpoints

### 1) Healthcheck

`GET /healthz`

```json
{ "ok": true }
```

---

### 2) Root informativo

`GET /`

```json
{ "ok": true, "message": "Use GET /flights/:id/passengers" }
```

---

### 3) Pasajeros por vuelo (asignación de asientos)

`GET /flights/:id/passengers`

#### Respuesta exitosa (200)

- La respuesta sigue el formato exigido en el enunciado: `{ "code": 200, "data": { ... } }`.
- Los campos provenientes de la BD (`snake_case`) se transforman a **camelCase**.
- `dni` se normaliza a **number** (o `null` si viene vacío / no numérico).
- El listado se retorna en orden determinista (`ORDER BY purchase_id, boarding_pass_id`).

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

> En esta implementación, un `id` inválido (no entero positivo) se trata igual que un vuelo inexistente: `404`.

#### Error de conexión a BD (400)

```json
{ "code": 400, "errors": "could not connect to db" }
```

---

## Consultas SQL principales

En `src/server.ts`:

1) **Vuelo**
```sql
SELECT flight_id, takeoff_date_time, takeoff_airport,
       landing_date_time, landing_airport, airplane_id
FROM flight
WHERE flight_id = ?
```

2) **Pasajeros del vuelo**
```sql
SELECT bp.boarding_pass_id, bp.purchase_id, bp.passenger_id,
       bp.seat_type_id, bp.seat_id,
       p.dni, p.name, p.age, p.country
FROM boarding_pass bp
JOIN passenger p ON p.passenger_id = bp.passenger_id
WHERE bp.flight_id = ?
ORDER BY bp.purchase_id, bp.boarding_pass_id
```

3) **Asientos del avión**
```sql
SELECT seat_id, seat_row, seat_column, seat_type_id
FROM seat
WHERE airplane_id = ?
```

---

## Lógica de negocio implementada (asignación de asientos)

> Importante: la BD es **solo lectura**. La asignación es una **simulación**: se calcula y se retorna en la respuesta, sin hacer `UPDATE`.

### Reglas
1) **Menores (< 18)** deben quedar al lado de al menos un acompañante **adulto** dentro de la misma compra (`purchaseId`).
2) Se intenta que los pasajeros de una misma compra queden **juntos o muy cercanos** (misma fila/columna o cerca).
3) No se mezcla clase: a un pasajero con `seatTypeId = X` se le asigna solo un asiento con `seat_type_id = X`.

---

## Detalle del algoritmo (src/services/seatAssignment.ts)

### Layout por avión (pasillos)
Para modelar “al lado” correctamente, el algoritmo define bloques de columnas por avión (separados por pasillo):

- **Airplane 1 (AirNova-660):** `A B C | E F G`
- **Airplane 2 (AirMax-720neo):** `A B | D E F | H I`

Esto evita considerar adyacencia cruzando el pasillo (por ejemplo, `C` no es vecino de `E` en el avión 1).

### Paso a paso

1) **Indexación y ocupación**
   - Se construye un mapa `seatId -> Seat(row, col, type)`.
   - Se marcan como **ocupados** los `seatId` que ya venían asignados en `boarding_pass`.

2) **Disponibilidad por clase**
   - Se agrupan asientos por `seatTypeId`.
   - Para cada tipo, se ordenan por fila/bloque/posición para que la elección sea determinista.

3) **Agrupación por compra**
   - Se agrupan pasajeros por `purchaseId`.
   - Por cada compra, se calculan “anclas” por tipo (`seatTypeId`) si alguien ya está sentado.

4) **Menores primero**
   Para cada menor sin asiento:
   - Si existe un **adulto sentado** del mismo `seatTypeId`, se intenta asignar un **asiento adyacente** (misma fila + columna vecina dentro del mismo bloque).
   - Si no hay adulto sentado, pero existe un **adulto sin asiento**, se intenta sentar **adulto+menor** como **par adyacente**.
   - Si lo anterior no es posible, se asigna el “mejor” asiento disponible (heurística de cercanía).

5) **Resto del grupo**
   - Para cada pasajero restante sin asiento, se asigna el asiento disponible que minimice una distancia heurística respecto del ancla del grupo (si existe).
   - Si el grupo no tenía ancla para ese tipo, el primer asiento asignado se convierte en ancla.

### Heurística de cercanía

La cercanía entre 2 asientos se calcula como:

```
dist = |Δfila| * 10 + |Δbloque| * 4 + |Δpos| * 1
```

- Prioriza fuertemente **misma fila**,
- luego **mismo bloque** (evitar cruzar pasillo),
- luego cercanía de columna dentro del bloque.

---

## Consideraciones de conexión (timeout 5s)

El enunciado indica que el servidor de BD aborta conexiones inactivas por más de **5 segundos**.

Para evitar usar conexiones “viejas”:
- Se utiliza un **pool** (`mysql.createPool`) en `src/db.ts`.
- En cada request se hace `pool.getConnection()` y se libera siempre con `conn.release()` en `finally`.

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

En Windows sin `jq`, puedes usar:
- `ConvertFrom-Json` (PowerShell)
- o instalar `jq` (recomendado)

---

## Troubleshooting

### “Missing required environment variable: DB_HOST”
Falta alguna variable requerida en tu `.env`. Revisa que exista y no esté vacía.

### `{ "code": 400, "errors": "could not connect to db" }`
- Credenciales incorrectas (`DB_*`).
- IP/host inaccesible.
- Puerto incorrecto (`DB_PORT`).
- DB apagada o bloqueando conexiones.

### El script de PowerShell usa otro puerto
`validate-seatid.ps1` usa por defecto `http://localhost:3001`. Ajusta `$base` si tu API corre en otro puerto.

---

## Entregables (según enunciado)

- `README.md` con instrucciones de ejecución y explicación de la solución.
- Repositorio privado en GitHub y acceso al usuario **postulaciones-bsale**.
- URL del deploy + URL del repo para el formulario.