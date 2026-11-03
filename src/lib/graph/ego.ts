// "Focus" view for the 3D graph: one node and a readable selection of its connections, laid out around it.
// Pure (type imports only), so the selection and layout rules run under `node --test`.

export interface EgoCandidate {
  id: string;
  /** Relation type joining the focus node and this neighbour. */
  type: string;
  group: "structure" | "lexical" | "curated" | "personal";
  /** true when the relation points from the focus node to the neighbour */
  outgoing: boolean;
  degree: number;
}

export interface EgoKind {
  type: string;
  outgoing: boolean;
  total: number;
  shown: number;
}

export interface EgoPick {
  /** Chosen neighbours, grouped by kind (so each kind sits together in the layout). */
  members: EgoCandidate[];
  /** Distinct neighbours in the whole graph. */
  total: number;
  kinds: EgoKind[];
}

// Curated meaning first, then the person's own links, then word matches, then structure (chapter, speaker, sequence).
const GROUP_RANK: Record<EgoCandidate["group"], number> = { curated: 0, personal: 1, lexical: 2, structure: 3 };

/**
 * Picks at most `max` neighbours, sharing the places fairly between kinds of connection (round-robin, best-connected
 * first within each kind), so one very large kind — Kṛṣṇa speaks 574 verses — cannot crowd out every other.
 * A neighbour joined by several relations is counted once, under its most meaningful one.
 */
export function pickEgo(candidates: EgoCandidate[], max = 40): EgoPick {
  const best = new Map<string, EgoCandidate>();
  for (const c of candidates) {
    const cur = best.get(c.id);
    if (!cur || GROUP_RANK[c.group] < GROUP_RANK[cur.group]) best.set(c.id, c);
  }
  const byKind = new Map<string, EgoCandidate[]>();
  for (const c of best.values()) {
    const k = `${c.type}|${c.outgoing ? 1 : 0}`;
    byKind.set(k, [...(byKind.get(k) ?? []), c]);
  }
  const kinds = [...byKind.values()]
    .map((list) => list.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id)))
    .sort((a, b) => GROUP_RANK[a[0].group] - GROUP_RANK[b[0].group] || b.length - a.length || a[0].type.localeCompare(b[0].type));
  const taken = kinds.map(() => 0);
  let left = Math.min(max, best.size);
  while (left > 0) {
    let progressed = false;
    for (let i = 0; i < kinds.length && left > 0; i++) {
      if (taken[i] < kinds[i].length) {
        taken[i]++;
        left--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return {
    members: kinds.flatMap((list, i) => list.slice(0, taken[i])),
    total: best.size,
    kinds: kinds.map((list, i) => ({ type: list[0].type, outgoing: list[0].outgoing, total: list.length, shown: taken[i] })),
  };
}

/**
 * Places `n` neighbours on a slightly flattened sphere around the centre (a Fibonacci spiral, so consecutive members —
 * one kind of connection — sit in the same band). The radius grows gently with the number shown.
 */
export function egoPositions(center: [number, number, number], n: number): [number, number, number][] {
  const radius = 70 + 7 * Math.sqrt(n);
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = i * golden;
    return [center[0] + radius * r * Math.cos(t), center[1] + radius * y * 0.72, center[2] + radius * r * Math.sin(t)];
  });
}
