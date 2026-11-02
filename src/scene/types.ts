/** A renderer-neutral display list. Growth makes geometry; materials turn it into these ops. */
import type { Pt } from '../core/geom.ts';

export interface Sub {
  pts: readonly Pt[];
  closed?: boolean;
  /** Catmull-Rom through the points instead of straight segments. */
  smooth?: boolean;
}

export interface GradientStop {
  at: number;
  color: string;
  opacity?: number;
}
export type Paint =
  | string
  | { type: 'linear'; from: Pt; to: Pt; stops: readonly GradientStop[] }
  | { type: 'radial'; center: Pt; radius: number; stops: readonly GradientStop[] };

export type Blend = 'multiply' | 'screen' | 'overlay' | 'soft-light';

export interface FillOp {
  op: 'fill';
  subs: readonly Sub[];
  paint: Paint;
  opacity?: number;
  blend?: Blend;
}
export interface StrokeOp {
  op: 'stroke';
  subs: readonly Sub[];
  paint: Paint;
  width: number;
  opacity?: number;
  blend?: Blend;
  cap?: 'round' | 'butt';
}
export interface GroupOp {
  op: 'group';
  ops: readonly DrawOp[];
  clip?: readonly Sub[];
  opacity?: number;
  /** a, b, c, d, e, f of an SVG matrix. */
  matrix?: readonly [number, number, number, number, number, number];
}
export type DrawOp = FillOp | StrokeOp | GroupOp;

export interface Scene {
  width: number;
  height: number;
  /** Null leaves the background transparent so the host surface shows through. */
  background: Paint | null;
  ops: readonly DrawOp[];
}

export const poly = (pts: readonly Pt[], smooth = true): Sub => ({ pts, closed: true, smooth });
export const line = (pts: readonly Pt[], smooth = true): Sub => ({ pts, closed: false, smooth });

/** The cubic control points of a Catmull-Rom spline through a sub-path. */
export function cubicSegments(sub: Sub): { start: Pt; segs: [number, number, number, number, number, number][] } {
  const pts = sub.pts;
  const n = pts.length;
  const at = (i: number): Pt => (sub.closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  const segs: [number, number, number, number, number, number][] = [];
  const count = sub.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    segs.push([
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1],
    ]);
  }
  return { start: pts[0]!, segs };
}
