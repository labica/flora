/** Leaves: a curved midrib, an edge function, and side veins that follow the blade. */
import { TAU, circlePoly, clamp, hermite, lerp, pointAt, polar, ribbon, smoothstep } from '../core/geom.ts';
import type { Pt } from '../core/geom.ts';
import { noise1 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import type { Part } from './part.ts';

export type LeafKind = 'ovate' | 'lance' | 'serrate' | 'heart' | 'lobed' | 'palmate' | 'spatulate' | 'strap' | 'fern' | 'feather' | 'ginkgo' | 'ivy';

const pw = (t: number, k: number, e: number): number => Math.sin(Math.PI * clamp(t, 0, 1) ** k) ** e;

const EDGE: Record<'ovate' | 'lance' | 'serrate' | 'heart' | 'lobed' | 'spatulate' | 'strap', (t: number, s: number) => number> = {
  ovate: (t) => pw(t, 0.8, 0.9),
  lance: (t) => pw(t, 0.85, 1.25),
  serrate: (t) => pw(t, 0.8, 0.95) * (1 + 0.09 * (1 - ((t * 11) % 1))),
  heart: (t) => pw(t, 0.58, 0.8),
  // Deep sinuses, in the manner of the oak and the chrysanthemum.
  lobed: (t, s) => pw(t, 0.82, 0.8) * (0.56 + 0.44 * Math.abs(Math.sin(t * Math.PI * 3.5 + s * 0.4)) ** 0.75),
  spatulate: (t) => pw(t, 1.5, 0.75),
  strap: (t) => pw(t, 0.86, 0.5) * (1 - 0.3 * t),
};

/** A simple leaf from `base` along `angle`. */
export function simpleLeaf(rng: Rng, base: Pt, angle: number, length: number, kind: keyof typeof EDGE, width = 0.26, variant = 0): Part {
  const curl = rng.jit(0.5);
  const tip = polar(base, angle + curl * 0.45, length);
  const rib = hermite(base, polar([0, 0], angle - curl * 0.5, length), tip, polar([0, 0], angle + curl, length), 20);
  const edge = EDGE[kind];
  const wob = noise1(rng.fork('e'), 2);
  const seed = rng.range(0, 3);
  const W = length * width;
  const blade = (pts: readonly Pt[], s: number): Pt[] =>
    pts.map((p, i, all) => {
      const t = i / (all.length - 1);
      const a = all[Math.max(0, i - 1)]!;
      const b = all[Math.min(all.length - 1, i + 1)]!;
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const w = W * edge(t, seed + s) * (1 + 0.05 * wob(t * 5 + s * 3)) * (s > 0 ? 1 : 0.92);
      return [p[0] - ((b[1] - a[1]) / d) * w * s, p[1] + ((b[0] - a[0]) / d) * w * s] as Pt;
    });
  const fine = pointsAlong(rib, length < 26 ? 9 : kind === 'lobed' || kind === 'serrate' ? 30 : 15);
  const L = blade(fine, 1);
  const R = blade(fine, -1).reverse();
  const veins: Pt[][] = [];
  const count = length < 18 ? 0 : Math.max(3, Math.round(3 + length / 34));
  for (let i = 1; i <= count; i++) {
    const t = lerp(0.1, 0.78, i / count);
    for (const s of [1, -1]) {
      const { p, angle: a } = pointAt(rib, t + (s > 0 ? 0 : 0.02));
      const reach = W * edge(t + 0.08, seed + s) * 0.92 * (s > 0 ? 1 : 0.92);
      const out = a + s * 0.95;
      const end = polar(p, out, reach * 1.25);
      const end2 = polar(end, a, reach * 0.3);
      veins.push(hermite(p, polar([0, 0], out, reach * 0.7), end2, polar([0, 0], a, reach * 0.6), 6));
    }
  }
  return {
    kind: 'leaf',
    outline: [...L, ...R.slice(1, -1)],
    axis: [base, rib[rib.length - 1]!],
    size: length,
    ink: 'leaf',
    variant,
    shade: rng.range(-0.3, 0.3),
    rib,
    veins,
  };
}

function pointsAlong(line: readonly Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(pointAt(line, i / n).p);
  return out;
}

function stalk(line: readonly Pt[], w: number): Part {
  return {
    kind: 'stem',
    outline: ribbon(line, (t) => lerp(w, w * 0.35, t)),
    axis: [line[0]!, line[line.length - 1]!],
    size: w * 2,
    ink: 'stem',
    variant: 0,
    shade: 0,
    rib: line,
    widths: [w, w * 0.35],
  };
}

/** Radial blades around one point: maple, ivy, ginkgo. */
function radial(rng: Rng, base: Pt, angle: number, length: number, kind: 'palmate' | 'ivy' | 'ginkgo'): Part {
  const noise = noise1(rng.fork('r'), 2);
  const rim: Pt[] = [];
  const veins: Pt[][] = [];
  const lobes = kind === 'palmate' ? 5 : kind === 'ivy' ? 5 : 1;
  const spread = kind === 'ginkgo' ? 1.05 : kind === 'ivy' ? 1.6 : 1.75;
  const steps = kind === 'ginkgo' ? 28 : lobes * 12;
  const c = polar(base, angle, length * 0.1);
  rim.push(c);
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * 2 - 1;
    const a = angle + u * spread;
    let r: number;
    if (kind === 'ginkgo') {
      const notch = 1 - 0.26 * Math.exp(-((u / 0.08) ** 2));
      r = (0.82 + 0.12 * Math.abs(u) ** 0.4) * notch * (1 - 0.34 * u * u) * (1 + 0.03 * noise(u * 9));
    } else {
      const lobe = Math.abs(Math.cos(((u * lobes) / 2) * Math.PI));
      const depth = kind === 'palmate' ? 0.62 : 0.32;
      const main = 1 - 0.34 * u * u;
      r = main * (1 - depth + depth * lobe ** (kind === 'palmate' ? 2.1 : 1.4)) * (1 + 0.04 * noise(u * 8));
    }
    rim.push(polar(c, a, length * r));
  }
  const nv = kind === 'ginkgo' ? 13 : lobes;
  for (let i = 0; i < nv; i++) {
    const u = nv === 1 ? 0 : (i / (nv - 1)) * 2 - 1;
    const a = angle + u * spread * (kind === 'ginkgo' ? 0.96 : (lobes - 1) / lobes);
    veins.push([c, polar(c, a, length * (kind === 'ginkgo' ? 0.72 : 0.8) * (1 - 0.34 * u * u))]);
  }
  return { kind: 'leaf', outline: rim, axis: [base, polar(base, angle, length)], size: length, ink: 'leaf', variant: 0, shade: rng.range(-0.3, 0.3), veins, rib: [base, polar(base, angle, length * 0.8)] };
}

/** A pinnate frond: leaflets paired along a rachis. */
function pinnate(rng: Rng, base: Pt, angle: number, length: number, kind: 'fern' | 'feather'): Part[] {
  const curl = rng.jit(0.55);
  const rib = hermite(base, polar([0, 0], angle - curl * 0.5, length), polar(base, angle + curl * 0.4, length), polar([0, 0], angle + curl, length), 22);
  const parts: Part[] = [stalk(rib, Math.max(0.5, length * 0.012))];
  const n = kind === 'fern' ? Math.round(lerp(9, 15, clamp(length / 140, 0, 1))) : 7;
  for (let i = 1; i <= n; i++) {
    const t = lerp(0.14, 0.97, i / n);
    const { p, angle: a } = pointAt(rib, t);
    const size = length * (kind === 'fern' ? 0.34 : 0.3) * Math.sin(Math.PI * clamp(t * 0.92 + 0.08, 0, 1)) ** 0.8 + length * 0.03;
    for (const s of [1, -1]) {
      const q = pointAt(rib, Math.min(1, t + (s > 0 ? 0 : 0.012))).p;
      const lf = simpleLeaf(rng.fork(`${i}${s}`), q, a + s * (kind === 'fern' ? 1.0 : 0.72), size, kind === 'fern' ? 'lobed' : 'strap', kind === 'fern' ? 0.27 : 0.08);
      if (s > 0 || i < n) parts.push(lf);
    }
    void p;
  }
  return parts;
}

/** A compound leaf, like a rose's: an odd number of leaflets. */
function compound(rng: Rng, base: Pt, angle: number, length: number): Part[] {
  const curl = rng.jit(0.4);
  const rib = hermite(base, polar([0, 0], angle, length), polar(base, angle + curl * 0.4, length * 0.72), polar([0, 0], angle + curl, length), 14);
  const parts: Part[] = [stalk(rib, Math.max(0.5, length * 0.012))];
  for (let i = 0; i < 2; i++) {
    const t = 0.34 + i * 0.3;
    const { p, angle: a } = pointAt(rib, t);
    for (const s of [1, -1]) parts.push(simpleLeaf(rng.fork(`${i}${s}`), p, a + s * 0.95, length * 0.42, 'serrate', 0.32));
  }
  const end = pointAt(rib, 1);
  parts.push(simpleLeaf(rng.fork('end'), end.p, end.angle, length * 0.48, 'serrate', 0.32));
  return parts;
}

/** Any leaf of the catalogue, as parts. */
export function buildLeaf(rng: Rng, base: Pt, angle: number, length: number, kind: LeafKind, compoundLeaf = false): Part[] {
  if (kind === 'fern' || kind === 'feather') return pinnate(rng, base, angle, length * 1.5, kind);
  if (kind === 'palmate' || kind === 'ivy' || kind === 'ginkgo') {
    return [radial(rng, base, angle, length * 0.72, kind)];
  }
  if (compoundLeaf && kind === 'serrate') return compound(rng, base, angle, length * 1.45);
  const width = kind === 'lance' ? 0.15 : kind === 'strap' ? 0.1 : kind === 'heart' ? 0.42 : kind === 'lobed' ? 0.34 : kind === 'spatulate' ? 0.2 : 0.28;
  return [simpleLeaf(rng, base, angle, kind === 'strap' ? length * 1.6 : length, kind, width)];
}

/** A closed bud on its axis. */
export function bud(rng: Rng, base: Pt, angle: number, length: number, variant: number): Part[] {
  const a = simpleLeaf(rng.fork('a'), base, angle + rng.jit(0.06), length, 'ovate', 0.3, variant);
  a.kind = 'bud';
  a.ink = 'bloom';
  a.veins = a.veins?.slice(0, 3);
  a.eye = base;
  const sepal = simpleLeaf(rng.fork('s'), base, angle + 0.4, length * 0.6, 'lance', 0.2);
  const sepal2 = simpleLeaf(rng.fork('t'), base, angle - 0.4, length * 0.6, 'lance', 0.2);
  sepal.kind = sepal2.kind = 'sepal';
  return [a, sepal, sepal2];
}

/** An equal-angle spiral, the motif Wong et al. use for tendrils. */
export function tendril(rng: Rng, base: Pt, angle: number, size: number): Part {
  const dir = rng.chance(0.5) ? 1 : -1;
  const turns = rng.range(1.3, 2.3);
  const pts: Pt[] = [];
  const n = 42;
  const k = 0.22;
  const total = turns * TAU;
  let x = base[0];
  let y = base[1];
  const step = (size * 3.2) / n;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x, y]);
    const h = angle + dir * (total * t ** 1.8);
    const s = step * Math.exp(-k * total * t);
    x += Math.cos(h) * s;
    y += Math.sin(h) * s;
  }
  const w = Math.max(0.35, size * 0.03);
  return { kind: 'tendril', outline: ribbon(pts, (t) => lerp(w, w * 0.3, t)), axis: [base, pts[n]!], size, ink: 'stem', variant: 0, shade: 0, rib: pts, open: true, widths: [w, w * 0.3] };
}

/** One small round berry. */
export function berry(c: Pt, r: number, variant: number): Part {
  return { kind: 'berry', outline: circlePoly(c, r, 10), axis: [[c[0] - r, c[1] - r], [c[0] + r, c[1] + r]], size: r * 2, ink: 'bloom', variant, shade: 0.1, eye: c };
}

export const smooth = smoothstep;
