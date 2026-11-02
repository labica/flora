/** Deterministic random numbers. The same seed gives the same ornament on every platform. */

/** cyrb53-style string hash folded to 32 bits. */
export function hashString(s: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export type Seed = number | string;

export function seedNumber(seed: Seed): number {
  return typeof seed === 'number' ? seed >>> 0 : hashString(seed);
}

/** mulberry32 (Tommy Ettinger, public domain). */
export class Rng {
  private readonly base: number;
  private state: number;

  constructor(seed: Seed) {
    this.base = seedNumber(seed);
    this.state = this.base;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * An independent stream named by `label`. It depends only on this stream's seed and the
   * label, never on how many numbers were drawn, so changing one decision leaves the rest.
   */
  fork(label: string | number): Rng {
    return new Rng(hashString(`${this.base}/${label}`));
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Uniform in [-a, a]. */
  jit(a: number): number {
    return a * (2 * this.next() - 1);
  }

  int(a: number, b: number): number {
    return a + Math.floor((b - a + 1) * this.next());
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return undefined;
    let x = this.next() * total;
    for (const it of items) {
      x -= Math.max(0, weight(it));
      if (x <= 0) return it;
    }
    return items[items.length - 1];
  }

  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
}

/** Smooth 1-D value noise in roughly [-1, 1], with its own seeded lattice. */
export function noise1(rng: Rng, octaves = 2): (x: number) => number {
  const size = 64;
  const tables: number[][] = [];
  for (let o = 0; o < octaves; o++) {
    const t: number[] = [];
    for (let i = 0; i < size; i++) t.push(rng.jit(1));
    tables.push(t);
  }
  return (x: number) => {
    let v = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const t = tables[o]!;
      const p = x * freq + o * 7.3;
      const i = Math.floor(p);
      const f = p - i;
      const u = f * f * (3 - 2 * f);
      const a = t[((i % size) + size) % size]!;
      const b = t[(((i + 1) % size) + size) % size]!;
      v += amp * (a + (b - a) * u);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return v / norm;
  };
}
