// The 3D cosmos layout: one source of truth for the browser (CosmicGraph3D) and the build step
// (scripts/build-layout.mjs, which precomputes positions so the browser never has to run the simulation).
// No runtime imports, so Node can load this file directly.

export const RING_R = 380;
export const LAYOUT_TICKS = 350; // 90 warm-up + 260 cool-down ticks, as the live simulation ran
export const ALPHA_DECAY = 0.022;
export const VELOCITY_DECAY = 0.33;
export const CHARGE = { strength: -22, distanceMax: 420 };

export const LINK_DIST: Record<string, number> = {
  BELONGS_TO: 30, NEXT_VERSE: 9, SPOKE: 240, NARRATED: 240, ADDRESSES: 60, MENTIONS_CHARACTER: 180, MENTIONS_CONCEPT: 120,
  MENTIONS_STATE: 120, EXPOUNDS: 150, NEXT_CHAPTER: 120,
};
export const LINK_STR: Record<string, number> = {
  BELONGS_TO: 0.9, NEXT_VERSE: 0.5, SPOKE: 0.003, NARRATED: 0.003, ADDRESSES: 0.02, MENTIONS_CHARACTER: 0.008, MENTIONS_CONCEPT: 0.025,
  MENTIONS_STATE: 0.025, EXPOUNDS: 0.04, NEXT_CHAPTER: 0,
};
export const linkDistance = (type: string) => LINK_DIST[type] ?? 85;
export const linkStrength = (type: string) => LINK_STR[type] ?? 0.07;

/** Chapters sit on a gently waved ring; Kṛṣṇa is the fixed centre. Everything else is placed by the forces. */
export function fixedPosition(node: { id: string; type: string; number?: number }): [number, number, number] | null {
  if (node.type === "Chapter" && typeof node.number === "number") {
    const th = ((node.number - 1) / 18) * Math.PI * 2;
    return [RING_R * Math.cos(th), 26 * Math.sin(th * 3), RING_R * Math.sin(th)];
  }
  if (node.id === "character:krishna") return [0, 0, 0];
  return null;
}

type SimNode = { type: string; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number; fx?: number };

/** Keeps the cosmos inside its wheel: ontology within the inner circle, verses near the rim, all near the plane. */
export function containForce() {
  let nodes: SimNode[] = [];
  return Object.assign(
    (alpha: number) => {
      for (const n of nodes) {
        if (n.fx !== undefined || n.x === undefined || n.z === undefined) continue;
        const r = Math.hypot(n.x, n.z);
        const max = n.type === "Verse" ? RING_R * 1.2 : RING_R * 0.72;
        if (r > max) {
          const k = ((r - max) / r) * alpha * 0.35;
          n.vx = (n.vx ?? 0) - n.x * k;
          n.vz = (n.vz ?? 0) - n.z * k;
        }
        n.vy = (n.vy ?? 0) - (n.y ?? 0) * alpha * 0.03;
      }
    },
    { initialize: (ns: SimNode[]) => (nodes = ns) },
  );
}

/** Stable small offset from an id, so a personal thought always lands in the same place. */
export function hashUnit(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Where a personal thought goes without a simulation: a little above the things it connects to, or (unconnected) on a
 * quiet orbit above the centre. Deterministic per thought.
 */
export function placeThought(id: string, targets: [number, number, number][]): [number, number, number] {
  const a = hashUnit(id) * Math.PI * 2;
  const j = 10 + hashUnit(id, 7) * 14;
  if (targets.length) {
    const c = targets.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / targets.length);
    return [c[0] + Math.cos(a) * j, c[1] + 46 + hashUnit(id, 3) * 18, c[2] + Math.sin(a) * j];
  }
  return [Math.cos(a) * 150, 150 + hashUnit(id, 5) * 30, Math.sin(a) * 150];
}
