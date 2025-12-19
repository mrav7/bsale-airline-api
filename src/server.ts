import Fastify from "fastify";
import { pool } from "./db.js";
import { assignSeats, buildSeatMap } from "./services/seatAssignment.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

app.get("/flights/:id/passengers", async (req, reply) => {
  const id = Number((req.params as any).id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(404).send({ code: 404, data: {} });
  }

  let conn: any;
  try {
    conn = await pool.getConnection();

    const [flights] = await conn.query<any[]>(
      `SELECT flight_id, takeoff_date_time, takeoff_airport, landing_date_time, landing_airport, airplane_id
       FROM flight
       WHERE flight_id = ?`,
      [id]
    );

    if (!flights.length) {
      return reply.code(404).send({ code: 404, data: {} });
    }

    const flight = flights[0];

    const [rows] = await conn.query<any[]>(
      `SELECT
         bp.boarding_pass_id, bp.purchase_id, bp.passenger_id, bp.seat_type_id, bp.seat_id,
         p.dni, p.name, p.age, p.country
       FROM boarding_pass bp
       JOIN passenger p ON p.passenger_id = bp.passenger_id
       WHERE bp.flight_id = ?
       ORDER BY bp.purchase_id, bp.boarding_pass_id`,
      [id]
    );

    const passengers = rows.map((r) => ({
      passengerId: r.passenger_id,
      dni: r.dni,
      name: r.name,
      age: r.age,
      country: r.country,
      boardingPassId: r.boarding_pass_id,
      purchaseId: r.purchase_id,
      seatTypeId: r.seat_type_id,
      seatId: r.seat_id ?? null,
    }));

    const [seatRows] = await conn.query<any[]>(
      `SELECT seat_id, seat_row, seat_column, seat_type_id
       FROM seat
       WHERE airplane_id = ?`,
      [flight.airplane_id]
    );

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
        passengers: passengersAssigned, // 👈 reemplaza passengers
      },
    });
  } catch (err) {
    req.log.error(err);
    return reply.code(400).send({ code: 400, errors: "could not connect to db" });
  } finally {
    try {
      conn?.release?.();
    } catch {}
  }
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
