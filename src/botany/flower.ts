/**
 * One flower model for every species: petals are surfaces in 3-D, arranged in whorls around an
 * axis and then projected. A tulip, a lotus, a daisy and a bell differ only in parameters, and any
 * flower can be seen from the front, at an angle or from the side.
 *
 * Silhouette profiles follow tikz-flora's petal formula (MIT, the tikz-flora authors).
 * Whorls and the floral-diagram view follow Ijiri et al. (2005); the seed disc is Vogel (1979).
 */
import { GOLDEN_ANGLE, TAU, circlePoly, clamp, lerp, ribbon, smoothstep } from '../core/geom.ts';
import type { Pt } from '../core/geom.ts';
import { noise1 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import type { Ink, Part } from './part.ts';

export type Profile = 'obovate' | 'lance' | 'round' | 'fan' | 'wedge' | 'strap' | 'spoon' | 'heart' | 'tepal';

const PROFILE: Record<Exclude<Profile, 'wedge'>, { k: number; e: number; claw: number }> = {
  obovate: { k: 0.72, e: 0.6, claw: 0.46 },
  lance: { k: 1.15, e: 1.3, claw: 0.1 },
  round: { k: 0.95, e: 0.5, claw: 0.2 },
  fan: { k: 0.56, e: 0.42, claw: 0.5 },
  strap: { k: 0.9, e: 0.28, claw: 0.08 },
  spoon: { k: 0.5, e: 0.55, claw: 0.62 },
  heart: { k: 0.62, e: 0.4, claw: 0.4 },
  tepal: { k: 1.0, e: 0.85, claw: 0.14 },
};

function halfWidth(p: Profile, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 0;
  if (p === 'wedge') {
    const sh = 0.74;
    if (t <= sh) return 0.06 + 0.94 * Math.sin(((Math.PI / 2) * t) / sh) ** 1.3;
    const u = (t - sh) / (1 - sh);
    return Math.sqrt(Math.max(0, 1 - u * u));
  }
  const k = PROFILE[p];
  return Math.sin(Math.PI * t ** k.k) ** k.e * smoothstep(0, k.claw, t) ** 0.7;
}

export interface Whorl {
  count: number;
  profile: Profile;
  /** Petal length as a share of the flower radius. */
  length: number;
  /** Half-width as a share of the flower radius. */
  width: number;
  /** Angle from the flower axis at base and tip, degrees: 0 upright, 90 flat, over 90 reflexed. */
  open: readonly [number, number];
  /** Rim waviness. */
  ruffle?: number;
  /** Depth of the notch at the tip. */
  notch?: number;
  /** Tooth amplitude at the tip, with the tooth count. */
  teeth?: readonly [number, number];
  /** How much the petal hollows across its width. */
  cup?: number;
  /** 1 wraps the petal around the axis, for closed cups. */
  wrap?: number;
  /** Place petals by the golden angle instead of evenly. */
  spiral?: boolean;
  /** Where the whorl starts around the axis, as a share of one step. */
  turn?: number;
  /** Variation in angle and size. */
  jitter?: number;
  /** Rays per petal in the surface pattern. */
  rays?: number;
  /** In a spiral, how far the youngest petal shrinks and closes (0 none, 1 to a point). */
  taper?: number;
  /** 0 pale, 1 fully inked; shifts this whorl's tone. */
  shade?: number;
  ink?: Ink;
}

export type Heart =
  | { type: 'stamens'; count: number; length: number }
  | { type: 'disc'; radius: number; count: number; dome?: number }
  | { type: 'column'; length: number }
  | { type: 'none' };

export interface FlowerSpec {
  whorls: readonly Whorl[];
  heart: Heart;
  /** Tilt range in degrees: 0 faces the viewer, 90 is a side view. */
  tilt: readonly [number, number];
  /** Sepals and calyx tube seen when tilted. */
  calyx?: { sepals: number; length: number; tube: number };
}

export interface BuiltFlower {
  parts: Part[];
  /** Where a stem joins. */
  anchor: Pt;
}

interface Projector {
  (x: number, y: number, z: number): { p: Pt; depth: number };
}

function projector(c: Pt, tilt: number, facing: number): Projector {
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const roll = facing + Math.PI / 2;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  return (x, y, z) => {
    const y2 = y * ct - z * st;
    const depth = y * st + z * ct;
    return { p: [c[0] + x * cr - y2 * sr, c[1] + x * sr + y2 * cr], depth };
  };
}

function buildPetal(w: Whorl, rng: Rng, R: number, angle: number, project: Projector, axisZ: number, variant: number, r0: number, eye: Pt, tilt: number): { part: Part; depth: number } {
  const jitter = w.jitter ?? 0.08;
  const L = R * w.length * rng.range(1 - jitter, 1 + jitter * 0.4);
  const W = R * w.width * rng.range(1 - jitter * 0.7, 1 + jitter * 0.7);
  const a0 = (w.open[0] * Math.PI) / 180;
  const a1 = (w.open[1] * Math.PI) / 180;
  const samples = 18;
  // The meridian: the petal's centre line in the (rho, z) plane.
  const rho = [r0 * R];
  const zed = [axisZ];
  for (let i = 1; i <= samples; i++) {
    const th = lerp(a0, a1, ((i - 0.5) / samples) ** 1.3);
    rho.push(rho[i - 1]! + (L / samples) * Math.sin(th));
    zed.push(zed[i - 1]! + (L / samples) * Math.cos(th));
  }
  const edgeL = noise1(rng.fork('l'), 3);
  const edgeR = noise1(rng.fork('r'), 3);
  const ruffle = w.ruffle ?? 0.06;
  const bend = rng.jit(0.08) * L;
  const wrap = w.wrap ?? 0;
  const cup = w.cup ?? 0.1;
  const surface = (t: number, off: number): { p: Pt; depth: number } => {
    const f = clamp(t, 0, 1) * samples;
    const i = Math.min(samples - 1, Math.floor(f));
    const u = f - i;
    const r = lerp(rho[i]!, rho[i + 1]!, u);
    const z = lerp(zed[i]!, zed[i + 1]!, u) + cup * (off * off) / Math.max(W, 1e-6) - cup * W * 0.3 * t;
    const across = off + bend * t * t;
    let x: number;
    let y: number;
    if (wrap > 0 && r > 1e-6) {
      const phi = clamp((wrap * across) / Math.max(r, L * 0.06), -2.6, 2.6);
      x = r * Math.cos(angle + phi) - (1 - wrap) * across * Math.sin(angle);
      y = r * Math.sin(angle + phi) + (1 - wrap) * across * Math.cos(angle);
    } else {
      x = r * Math.cos(angle) - across * Math.sin(angle);
      y = r * Math.sin(angle) + across * Math.cos(angle);
    }
    return project(x, y, z);
  };
  const n = L > 28 ? 15 : 9;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const notch = w.notch ?? 0;
  const teeth = w.teeth;
  let depthSum = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const base = W * halfWidth(w.profile, t);
    const wob = ruffle * t ** 1.5;
    const wl = base * (1 + wob * edgeL(t * 7) * 1.6);
    const wr = base * (1 + wob * edgeR(t * 7 + 9) * 1.6);
    let tl = t;
    let tr = t;
    if (notch > 0) {
      const dip = notch * Math.exp(-(((1 - t) / 0.09) ** 2));
      tl -= dip;
      tr -= dip;
    }
    if (teeth) {
      const k = smoothstep(0.62, 1, t) * teeth[0];
      tl += k * Math.cos((base / Math.max(W, 1e-6)) * Math.PI * teeth[1]);
      tr += k * Math.cos((base / Math.max(W, 1e-6)) * Math.PI * teeth[1]);
    }
    const a = surface(tl, -wl);
    const b = surface(tr, wr);
    left.push(a.p);
    right.push(b.p);
    depthSum += a.depth + b.depth;
  }
  right.reverse();
  const outline = [...left, ...right.slice(1, -1)];
  const rays = L < 12 ? 0 : L < 30 ? Math.min(2, w.rays ?? 5) : (w.rays ?? 5);
  const veins: Pt[][] = [];
  for (let v = 0; v < rays; v++) {
    const s = rays === 1 ? 0 : (v / (rays - 1)) * 2 - 1;
    const reach = rng.range(0.55, 0.92) * (1 - Math.abs(s) * 0.25);
    const line: Pt[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = 0.04 + (reach * i) / 5;
      line.push(surface(t, s * 0.78 * W * halfWidth(w.profile, Math.min(t, 0.98))).p);
    }
    veins.push(line);
  }
  // Facing test from the surface normal: seen from behind, a petal shows its paler back.
  const p0 = surface(0.3, 0);
  const p1 = surface(0.7, 0);
  const p2 = surface(0.5, W * 0.5);
  const cross = (p1.p[0] - p0.p[0]) * (p2.p[1] - p0.p[1]) - (p1.p[1] - p0.p[1]) * (p2.p[0] - p0.p[0]);
  const lean = Math.abs(tilt) > 0.5 && cross > 0 ? -0.5 : 0;
  const part: Part = {
    kind: 'petal',
    outline,
    axis: [surface(0, 0).p, surface(1, 0).p],
    size: L,
    ink: w.ink ?? 'bloom',
    variant,
    shade: (w.shade ?? 0) + lean,
    veins,
    eye,
  };
  return { part, depth: depthSum / (2 * (n + 1)) };
}

function buildHeart(h: Heart, rng: Rng, R: number, project: Projector, variant: number, tiltRad: number): { part: Part; depth: number }[] {
  const out: { part: Part; depth: number }[] = [];
  const add = (part: Part, depth: number): void => void out.push({ part, depth });
  if (h.type === 'stamens') {
    const a0 = rng.range(0, TAU);
    for (let i = 0; i < h.count; i++) {
      const a = a0 + ((i + rng.jit(0.35)) / h.count) * TAU;
      const len = R * h.length * rng.range(0.72, 1.1);
      const spread = rng.range(0.45, 0.95);
      const line: Pt[] = [];
      let d = 0;
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const q = project(Math.cos(a) * len * spread * t, Math.sin(a) * len * spread * t, len * (1 - spread * 0.5) * Math.sin(t * 1.4));
        line.push(q.p);
        d = q.depth;
      }
      const tip = line[6]!;
      add(
        { kind: 'filament', outline: ribbon(line, () => Math.max(0.25, R * 0.006)), axis: [line[0]!, tip], size: len, ink: 'heart', variant, shade: 0, rib: line, open: true },
        d + 0.5,
      );
      const r = Math.max(0.5, R * 0.022);
      add({ kind: 'anther', outline: circlePoly(tip, r * 1.25, 8, r * 0.8, a), axis: [line[5]!, tip], size: r, ink: 'gold', variant, shade: 0 }, d + 0.6);
    }
  } else if (h.type === 'disc') {
    const rad = R * h.radius;
    const dome = (h.dome ?? 0.25) * rad;
    const base = project(0, 0, 0);
    const ring = circlePoly([0, 0], rad, 22).map(([x, y]) => project(x, y, 0).p);
    add({ kind: 'disc', outline: ring, axis: [base.p, project(rad, 0, 0).p], size: rad, ink: 'heart', variant, shade: 0, eye: base.p }, dome);
    const seeds: Pt[][] = [];
    for (let i = 1; i <= h.count; i++) {
      const r = rad * Math.sqrt(i / (h.count + 1));
      const a = i * GOLDEN_ANGLE;
      const z = dome * (1 - (r / rad) ** 2);
      const s = Math.max(0.35, rad * 0.075 * (0.6 + 0.5 * (r / rad)));
      seeds.push(circlePoly(project(r * Math.cos(a), r * Math.sin(a), z).p, s, 5));
    }
    if (seeds.length) add({ kind: 'floret', outline: seeds[0]!, cluster: seeds, axis: [base.p, base.p], size: 1, ink: 'gold', variant, shade: 0 }, dome + 0.1);
  } else if (h.type === 'column') {
    const line: Pt[] = [];
    const lean = rng.range(0, TAU);
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      line.push(project(Math.cos(lean) * R * h.length * 0.35 * t * t, Math.sin(lean) * R * h.length * 0.35 * t * t, R * h.length * t).p);
    }
    add(
      { kind: 'filament', outline: ribbon(line, (t) => R * lerp(0.03, 0.016, t)), axis: [line[0]!, line[8]!], size: R * h.length, ink: 'heart', variant, shade: 0, rib: line, open: true },
      R,
    );
    for (let i = 0; i < 16; i++) {
      const t = rng.range(0.55, 1);
      const q = line[Math.round(t * 8)]!;
      const a = rng.range(0, TAU);
      const r = Math.max(0.5, R * 0.018);
      add({ kind: 'anther', outline: circlePoly([q[0] + Math.cos(a) * R * 0.05, q[1] + Math.sin(a) * R * 0.05], r, 6), axis: [q, q], size: r, ink: 'gold', variant, shade: 0 }, R + 1);
    }
  }
  void tiltRad;
  return out;
}

/** Builds a flower of radius R at c. `facing` is the screen direction of the flower's axis. */
export function buildFlower(spec: FlowerSpec, rng: Rng, c: Pt, R: number, facing: number, tiltDeg: number, variant: number, detail = 1): BuiltFlower {
  const tilt = (tiltDeg * Math.PI) / 180;
  const project = projector(c, tilt, facing);
  const eye = project(0, 0, 0).p;
  const items: { part: Part; depth: number }[] = [];
  spec.whorls.forEach((w, wi) => {
    const start = rng.range(0, TAU) + (w.turn ?? 0) * (TAU / w.count);
    const r = rng.fork(`w${wi}`);
    const count = detail < 0.5 ? Math.ceil(w.count * (w.count > 12 ? 0.6 : 1)) : w.count;
    for (let i = 0; i < count; i++) {
      const a = w.spiral ? start + i * GOLDEN_ANGLE : start + (i / count) * TAU + r.jit(0.5 * (w.jitter ?? 0.08) * (TAU / count));
      const pr = r.fork(i);
      const u = w.spiral && w.taper ? (i / Math.max(1, count - 1)) * w.taper : 0;
      const grown: Whorl = u
        ? { ...w, length: w.length * (1 - u * 0.78), width: w.width * (1 - u * 0.72), open: [w.open[0] * (1 - u * 0.8), w.open[1] * (1 - u * 0.86)], shade: (w.shade ?? 0) + u * 0.5 }
        : w;
      const built = buildPetal(grown, pr, R, a, project, 0, variant, 0.02, eye, tilt);
      // Inner whorls sit above outer ones even when their depth is the same; in a spiral the
      // youngest (innermost) petal is on top.
      const order = (wi + (w.spiral ? i / count : 0)) * R * 0.03 * Math.cos(tilt);
      items.push({ part: built.part, depth: built.depth + order });
    }
  });
  items.push(...buildHeart(spec.heart, rng.fork('heart'), R, project, variant, tilt));
  items.sort((a, b) => a.depth - b.depth);
  const parts = items.map((i) => i.part);

  // The calyx shows only when the flower is turned away from the viewer.
  const tube = spec.calyx?.tube ?? 0.28;
  const anchor = project(0, 0, -R * tube).p;
  if (spec.calyx && tiltDeg > 25) {
    const line: Pt[] = [];
    for (let i = 0; i <= 6; i++) line.push(project(0, 0, -R * tube * (1 - i / 6)).p);
    const under: Part[] = [
      {
        kind: 'sepal',
        outline: ribbon(line, (t) => R * lerp(0.035, 0.11, t ** 1.5)),
        axis: [line[0]!, line[6]!],
        size: R * 0.3,
        ink: 'leaf',
        variant,
        shade: 0,
      },
    ];
    const sr = rng.fork('sepal');
    const n = spec.calyx.sepals;
    for (let i = 0; i < n; i++) {
      const a = sr.range(0, TAU);
      const sw: Whorl = { count: n, profile: 'lance', length: spec.calyx.length, width: 0.09, open: [55, 80], ruffle: 0.02, rays: 1, ink: 'leaf', jitter: 0.15 };
      const s = buildPetal(sw, sr.fork(i), R, a, project, -R * 0.03, variant, 0.03, eye, tilt);
      s.part.kind = 'sepal';
      under.push(s.part);
    }
    return { parts: [...under, ...parts], anchor };
  }
  return { parts, anchor: tiltDeg > 25 ? anchor : eye };
}
