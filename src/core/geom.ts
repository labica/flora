/** Small 2-D geometry kit. Points are `[x, y]` in pixels with y pointing down. */
import type { Rng } from './rng.ts';

export type Pt = readonly [number, number];

export const TAU = Math.PI * 2;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const angleOf = (a: Pt, b: Pt): number => Math.atan2(b[1] - a[1], b[0] - a[0]);
export const polar = (c: Pt, a: number, r: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
export const mid = (a: Pt, b: Pt, t = 0.5): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Smallest signed turn from angle a to angle b. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Scale, rotate, then translate. */
export function transform(pts: readonly Pt[], x: number, y: number, rot = 0, sx = 1, sy = sx): Pt[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return pts.map(([px, py]) => {
    const a = px * sx;
    const b = py * sy;
    return [x + a * c - b * s, y + a * s + b * c] as Pt;
  });
}

export function lineLength(pts: readonly Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1]!, pts[i]!);
  return l;
}

/** The point at arc-length fraction t, with the local direction. */
export function pointAt(pts: readonly Pt[], t: number): { p: Pt; angle: number } {
  const target = lineLength(pts) * clamp(t, 0, 1);
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = dist(a, b);
    if (run + d >= target && d > 0) return { p: mid(a, b, (target - run) / d), angle: angleOf(a, b) };
    run += d;
  }
  const n = pts.length;
  return { p: pts[n - 1]!, angle: n > 1 ? angleOf(pts[n - 2]!, pts[n - 1]!) : 0 };
}

export function resample(pts: readonly Pt[], step: number): Pt[] {
  const len = lineLength(pts);
  const n = Math.max(2, Math.ceil(len / step));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(pointAt(pts, i / n).p);
  return out;
}

/** The first `t` of a polyline by length. */
export function prefix(pts: readonly Pt[], t: number): Pt[] {
  if (t >= 1) return [...pts];
  const target = lineLength(pts) * Math.max(t, 0);
  const out: Pt[] = [pts[0]!];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = dist(a, b);
    if (run + d >= target) {
      out.push(mid(a, b, d > 0 ? (target - run) / d : 0));
      return out;
    }
    run += d;
    out.push(b);
  }
  return out;
}

/** Cubic Hermite curve; d0 and d1 are tangent vectors. */
export function hermite(p0: Pt, d0: Pt, p1: Pt, d1: Pt, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    out.push([
      h00 * p0[0] + h10 * d0[0] + h01 * p1[0] + h11 * d1[0],
      h00 * p0[1] + h10 * d0[1] + h01 * p1[1] + h11 * d1[1],
    ]);
  }
  return out;
}

/** A closed outline around a centreline; width(t) is the half-width at fraction t. */
export function ribbon(line: readonly Pt[], width: (t: number) => number): Pt[] {
  const n = line.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)]!;
    const b = line[Math.min(n - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = width(n > 1 ? i / (n - 1) : 0);
    const p = line[i]!;
    left.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w]);
    right.push([p[0] + (dy / l) * w, p[1] - (dx / l) * w]);
  }
  return [...left, ...right.reverse()];
}

export function circlePoly(c: Pt, r: number, n = 16, ry = r, rot = 0): Pt[] {
  const out: Pt[] = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = r * Math.cos(a);
    const y = ry * Math.sin(a);
    out.push([c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]);
  }
  return out;
}

/** Recursive midpoint displacement of a closed polygon, the basis of organic washes. */
export function deform(poly: readonly Pt[], rng: Rng, amp: number, depth = 2): Pt[] {
  let cur: Pt[] = [...poly];
  let a = amp;
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [];
    for (let i = 0; i < cur.length; i++) {
      const p = cur[i]!;
      const q = cur[(i + 1) % cur.length]!;
      next.push(p);
      const m = mid(p, q);
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const l = Math.hypot(nx, ny) || 1;
      const k = rng.normal() * a * 0.5;
      next.push([m[0] + (nx / l) * k, m[1] + (ny / l) * k]);
    }
    cur = next;
    a *= 0.5;
  }
  return cur;
}

export function bounds(pts: readonly Pt[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function centroid(pts: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  const n = pts.length || 1;
  return [x / n, y / n];
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
