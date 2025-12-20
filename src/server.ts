import Fastify from "fastify";
import type { PoolConnection } from "mysql2/promise";
import { pool } from "./db.js";
import { assignSeats, buildSeatMap } from "./services/seatAssignment.js";

const app = Fastify({ logger: true });

type FlightRow = {
  flight_id: number;
  takeoff_date_time: number;
  takeoff_airport: string;
  landing_date_time: number;
  landing_airport: string;
  airplane_id: number;
};

type PassengerRow = {
  boarding_pass_id: number;
  purchase_id: number;
  passenger_id: number;
  seat_type_id: number;
  seat_id: number | null;
  dni: string | number | null;
  name: string;
  age: number;
  country: string;
};

type SeatRow = {
  seat_id: number;
  seat_row: number;
  seat_column: string;
  seat_type_id: number;
};

function normalizeDni(value: PassengerRow["dni"]): number | null {
  if (value == null) return null;

  const s = typeof value === "string" ? value.trim() : String(value);
  if (s === "") return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Healthcheck simple para Render / monitoreo
app.get("/healthz", async () => ({ ok: true }));

// Root informativo (evita 404 en "/")
app.get("/", async () => ({
  ok: true,
  message: "Use GET /flights/:id/passengers",
}));

app.get<{ Params: { id: string } }>("/flights/:id/passengers", async (req, reply) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(404).send({ code: 404, data: {} });
  }

  let conn: PoolConnection | null = null;

  try {
    conn = await pool.getConnection();

    const [flights] = (await conn.query(
      `SELECT flight_id, takeoff_date_time, takeoff_airport, landing_date_time, landing_airport, airplane_id
       FROM flight
       WHERE flight_id = ?`,
      [id]
    )) as unknown as [FlightRow[], unknown];

    const flight = flights.at(0);
    if (!flight) {
      return reply.code(404).send({ code: 404, data: {} });
    }

    const [rows] = (await conn.query(
      `SELECT
         bp.boarding_pass_id, bp.purchase_id, bp.passenger_id, bp.seat_type_id, bp.seat_id,
         p.dni, p.name, p.age, p.country
       FROM boarding_pass bp
       JOIN passenger p ON p.passenger_id = bp.passenger_id
       WHERE bp.flight_id = ?
       ORDER BY bp.purchase_id, bp.boarding_pass_id`,
      [id]
    )) as unknown as [PassengerRow[], unknown];

    const passengers = rows.map((r) => ({
      passengerId: r.passenger_id,
      dni: normalizeDni(r.dni),
      name: r.name,
      age: r.age,
      country: r.country,
      boardingPassId: r.boarding_pass_id,
      purchaseId: r.purchase_id,
      seatTypeId: r.seat_type_id,
      seatId: r.seat_id ?? null,
    }));

    const [seatRows] = (await conn.query(
      `SELECT seat_id, seat_row, seat_column, seat_type_id
       FROM seat
       WHERE airplane_id = ?`,
      [flight.airplane_id]
    )) as unknown as [SeatRow[], unknown];

    const seats = buildSeatMap(seatRows);
    const passengersAssigned = assignSeats(flight.airplane_id, passengers, seats);

    return reply.code(200).send({
      code: 200,
      data: {
        flightId: flight.flight_id,
        takeoffDateTime: flight.takeoff_date_time,
        takeoffAirport: flight.takeoff_airport,
        landingDateTime: flight.landing_date_time,
        landingAirport: flight.landing_airport,
        airplaneId: flight.airplane_id,
        passengers: passengersAssigned,
      },
    });
  } catch (err) {
    req.log.error(err);
    return reply.code(400).send({ code: 400, errors: "could not connect to db" });
  } finally {
    try {
      conn?.release();
    } catch {}
  }
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });