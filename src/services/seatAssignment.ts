type Seat = {
  seatId: number;
  seatRow: number;
  seatColumn: string;
  seatTypeId: number;
};

type PassengerLike = {
  age: number;
  purchaseId: number;
  seatTypeId: number;
  seatId: number | null;
} & Record<string, any>;

type Coord = { row: number; block: number; pos: number };

const LAYOUTS: Record<number, string[][]> = {
  // AirNova-660: A B C | E F G (en primera clase solo existen A,B y F,G pero sirve igual)
  1: [["A", "B", "C"], ["E", "F", "G"]],
  // AirMax-720neo: A B | D E F | H I (en primera clase existen A, E, I)
  2: [["A", "B"], ["D", "E", "F"], ["H", "I"]],
};

function normCol(col: string): string {
  return String(col ?? "").trim().toUpperCase();
}

function getBlocks(airplaneId: number, seats: Seat[]): string[][] {
  if (LAYOUTS[airplaneId]) return LAYOUTS[airplaneId];

  // Fallback: deducir bloques por letras presentes (no perfecto, pero salva)
  const cols = Array.from(new Set(seats.map((s) => normCol(s.seatColumn)))).sort();
  return [cols];
}

function seatCoord(seat: Seat, blocks: string[][]): Coord {
  const col = normCol(seat.seatColumn);
  for (let b = 0; b < blocks.length; b++) {
    const idx = blocks[b].indexOf(col);
    if (idx !== -1) return { row: seat.seatRow, block: b, pos: idx };
  }
  return { row: seat.seatRow, block: 99, pos: 99 };
}

function adjacentCols(col: string, blocks: string[][]): string[] {
  const c = normCol(col);
  for (const block of blocks) {
    const i = block.indexOf(c);
    if (i !== -1) {
      const out: string[] = [];
      if (i - 1 >= 0) out.push(block[i - 1]);
      if (i + 1 < block.length) out.push(block[i + 1]);
      return out;
    }
  }
  return [];
}

function dist(a: Seat, b: Seat, blocks: string[][]): number {
  const ca = seatCoord(a, blocks);
  const cb = seatCoord(b, blocks);
  return Math.abs(ca.row - cb.row) * 10 + Math.abs(ca.block - cb.block) * 4 + Math.abs(ca.pos - cb.pos);
}

function buildSeatMap(raw: any[]): Seat[] {
  return raw.map((r) => ({
    seatId: Number(r.seat_id),
    seatRow: Number(r.seat_row),
    seatColumn: String(r.seat_column),
    seatTypeId: Number(r.seat_type_id),
  }));
}

export function assignSeats<T extends PassengerLike>(
  airplaneId: number,
  passengers: T[],
  seats: Seat[]
): T[] {
  const blocks = getBlocks(airplaneId, seats);

  const seatsById = new Map<number, Seat>();
  for (const s of seats) seatsById.set(s.seatId, s);

  const result = passengers.map((p) => ({ ...p }));

  const occupied = new Set<number>();
  for (const p of result) {
    if (p.seatId != null) occupied.add(p.seatId);
  }

  // disponibles por tipo
  const seatsByType = new Map<number, Seat[]>();
  for (const s of seats) {
    if (!seatsByType.has(s.seatTypeId)) seatsByType.set(s.seatTypeId, []);
    seatsByType.get(s.seatTypeId)!.push(s);
  }
  for (const [t, list] of seatsByType.entries()) {
    list.sort((a, b) =>
      a.seatRow - b.seatRow ||
      seatCoord(a, blocks).block - seatCoord(b, blocks).block ||
      seatCoord(a, blocks).pos - seatCoord(b, blocks).pos
    );
    seatsByType.set(t, list);
  }

  const availableIdsByType = new Map<number, Set<number>>();
  for (const [t, list] of seatsByType.entries()) {
    const set = new Set<number>();
    for (const s of list) if (!occupied.has(s.seatId)) set.add(s.seatId);
    availableIdsByType.set(t, set);
  }

  const takeSeat = (seatId: number) => {
    const s = seatsById.get(seatId);
    if (!s) return;
    occupied.add(seatId);
    availableIdsByType.get(s.seatTypeId)?.delete(seatId);
  };

  const pickBestSeat = (seatTypeId: number, anchor: Seat | null): Seat | null => {
    const list = seatsByType.get(seatTypeId) ?? [];
    const avail = availableIdsByType.get(seatTypeId);
    if (!avail || avail.size === 0) return null;

    if (!anchor) {
      for (const s of list) if (avail.has(s.seatId)) return s;
      return null;
    }

    let best: Seat | null = null;
    let bestD = Infinity;
    for (const s of list) {
      if (!avail.has(s.seatId)) continue;
      const d = dist(s, anchor, blocks);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };

  const pickAdjacentSeat = (seatTypeId: number, seat: Seat): Seat | null => {
    const avail = availableIdsByType.get(seatTypeId);
    if (!avail) return null;

    const neighbors = adjacentCols(seat.seatColumn, blocks);
    for (const nc of neighbors) {
      const candidate = (seatsByType.get(seatTypeId) ?? []).find(
        (s) => s.seatRow === seat.seatRow && normCol(s.seatColumn) === nc
      );
      if (candidate && avail.has(candidate.seatId)) return candidate;
    }
    return null;
  };

  const findAdjacentPair = (seatTypeId: number, anchor: Seat | null): [Seat, Seat] | null => {
    const list = seatsByType.get(seatTypeId) ?? [];
    const avail = availableIdsByType.get(seatTypeId);
    if (!avail || avail.size === 0) return null;

    let best: [Seat, Seat] | null = null;
    let bestScore = Infinity;

    // recorrer por fila/bloque y buscar vecinos contiguos dentro del mismo bloque
    const byRow = new Map<number, Seat[]>();
    for (const s of list) {
      if (!avail.has(s.seatId)) continue;
      if (!byRow.has(s.seatRow)) byRow.set(s.seatRow, []);
      byRow.get(s.seatRow)!.push(s);
    }

    for (const [row, rowSeats] of byRow.entries()) {
      rowSeats.sort((a, b) => seatCoord(a, blocks).block - seatCoord(b, blocks).block || seatCoord(a, blocks).pos - seatCoord(b, blocks).pos);
      for (let i = 0; i < rowSeats.length; i++) {
        const a = rowSeats[i];
        const neighCols = adjacentCols(a.seatColumn, blocks);
        for (const nc of neighCols) {
          const b = rowSeats.find((s) => normCol(s.seatColumn) === nc);
          if (!b) continue;
          const pair: [Seat, Seat] = a.seatId < b.seatId ? [a, b] : [b, a];
          const score = anchor ? dist(pair[0], anchor, blocks) + dist(pair[1], anchor, blocks) : row * 10;
          if (score < bestScore) {
            bestScore = score;
            best = pair;
          }
        }
      }
    }

    return best;
  };

  // agrupar por compra
  const groups = new Map<number, T[]>();
  for (const p of result) {
    if (!groups.has(p.purchaseId)) groups.set(p.purchaseId, []);
    groups.get(p.purchaseId)!.push(p);
  }

  for (const [purchaseId, group] of groups.entries()) {
    // anclas por tipo
    const anchorsByType = new Map<number, Seat>();
    for (const p of group) {
      if (p.seatId != null) {
        const s = seatsById.get(p.seatId);
        if (s && !anchorsByType.has(p.seatTypeId)) anchorsByType.set(p.seatTypeId, s);
      }
    }

    // 1) menores primero
    const minors = group.filter((p) => p.seatId == null && p.age < 18);
    for (const minor of minors) {
      const type = minor.seatTypeId;

      // buscar adulto ya sentado en el mismo tipo
      const seatedAdult = group.find((p) => p.age >= 18 && p.seatId != null && p.seatTypeId === type);
      if (seatedAdult?.seatId != null) {
        const adultSeat = seatsById.get(seatedAdult.seatId) ?? null;
        if (adultSeat) {
          const adj = pickAdjacentSeat(type, adultSeat);
          if (adj) {
            minor.seatId = adj.seatId;
            takeSeat(adj.seatId);
            if (!anchorsByType.has(type)) anchorsByType.set(type, adultSeat);
            continue;
          }
        }
      }

      // si no hay adulto sentado, sentar un par (adulto + menor) adyacente
      const unseatedAdult = group.find((p) => p.age >= 18 && p.seatId == null && p.seatTypeId === type);
      const anchor = anchorsByType.get(type) ?? null;
      if (unseatedAdult) {
        const pair = findAdjacentPair(type, anchor);
        if (pair) {
          unseatedAdult.seatId = pair[0].seatId;
          minor.seatId = pair[1].seatId;
          takeSeat(pair[0].seatId);
          takeSeat(pair[1].seatId);
          anchorsByType.set(type, seatsById.get(pair[0].seatId)!);
          continue;
        }
      }

      // fallback: asignar lo mejor posible (por si el dataset trae casos raros)
      const best = pickBestSeat(type, anchor);
      if (best) {
        minor.seatId = best.seatId;
        takeSeat(best.seatId);
        if (!anchorsByType.has(type)) anchorsByType.set(type, best);
      }
    }

    // 2) resto del grupo: cerca del ancla
    const remaining = group.filter((p) => p.seatId == null);
    for (const p of remaining) {
      const type = p.seatTypeId;
      const anchor = anchorsByType.get(type) ?? null;
      const best = pickBestSeat(type, anchor);
      if (!best) continue;
      p.seatId = best.seatId;
      takeSeat(best.seatId);
      if (!anchorsByType.has(type)) anchorsByType.set(type, best);
    }
  }

  return result;
}

export { buildSeatMap };
