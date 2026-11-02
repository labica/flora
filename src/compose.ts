/**
 * Compositions turn a page size into a region and seeds. They cover the paper's taxonomy of contexts:
 * bands, half-open borders, panels and the open plane, plus wreaths and symmetric rosettes.
 */
import { TAU } from './core/geom.ts';
import type { Pt } from './core/geom.ts';
import type { Rng } from './core/rng.ts';
import type { FieldOptions } from './grow/field.ts';
import type { Seed } from './grow/engine.ts';
import { ellipse, keepOut, mask, polygon, rect, subtract, union } from './grow/region.ts';
import type { Box, Region } from './grow/region.ts';

export type CompositionName =
  | 'panel' | 'margin' | 'marginRight' | 'corner' | 'frame' | 'header' | 'footer' | 'band' | 'wreath' | 'rosette'
  | 'tile' | 'arch' | 'bouquet' | 'specimen' | 'scatter' | 'emblem';

export interface Plan {
  region: Region;
  seeds: Seed[];
  wrap?: FieldOptions;
  /** Copies around the centre, or mirrored across the vertical centre line. */
  symmetry?: { type: 'radial'; count: number; center: Pt } | { type: 'mirror'; x: number };
  scattered?: boolean;
  /** One bloom and two leaves, for file and folder icons. */
  emblem?: boolean;
  /** Density multiplier for layouts that want air. */
  density?: number;
  /** Largest bloom as a share of the base size. */
  scale?: number;
}

const UP = -Math.PI / 2;
const RIGHT = 0;

export interface PlanInput {
  width: number;
  height: number;
  exclude: readonly Box[];
  pad: number;
  rng: Rng;
  /** Depth of bordered layouts: margin width, frame thickness. */
  thickness?: number;
}

export function plan(name: CompositionName, i: PlanInput): Plan {
  const { width: W, height: H, rng } = i;
  const m = Math.min(W, H) * 0.02;
  const inner = rect(m, m, W - 2 * m, H - 2 * m);
  const guard = (r: Region): Region => keepOut(r, i.exclude, i.pad);
  const short = Math.min(W, H);
  switch (name) {
    case 'panel':
      return {
        region: guard(inner),
        seeds: [
          { at: [W * rng.range(0.18, 0.32), H - m * 1.5], heading: UP - 0.1, length: 0.95 },
          { at: [W * rng.range(0.66, 0.84), H - m * 1.5], heading: UP + 0.1, length: 0.72 },
        ],
      };
    case 'margin':
    case 'marginRight': {
      const t = i.thickness ?? Math.max(W * 0.3, Math.min(W, 300));
      const left = name === 'margin';
      const x = left ? m : W - t - m;
      const region = guard(rect(x, m, t, H - 2 * m));
      const base = left ? x + t * 0.32 : x + t * 0.68;
      return {
        region,
        seeds: [
          { at: [base, H - m * 1.5], heading: UP + (left ? 0.06 : -0.06), length: 1 },
          { at: [left ? x + t * 0.14 : x + t * 0.86, H - m * 1.5], heading: UP + (left ? 0.3 : -0.3), length: 0.6 },
        ],
      };
    }
    case 'corner': {
      const r = Math.min(short * 0.75, i.thickness ?? short * 0.75);
      const region = guard(mask([0, 0, r, r], (x, y) => x + y < r * 1.32 && x >= m && y >= m));
      return {
        region,
        seeds: [
          { at: [m * 1.5, m * 1.5], heading: 0.2, length: 0.9 },
          { at: [m * 1.5, m * 1.5], heading: Math.PI / 2 - 0.2, length: 0.9 },
        ],
      };
    }
    case 'frame': {
      const t = i.thickness ?? short * 0.17;
      const hole = rect(t, t, W - 2 * t, H - 2 * t);
      return {
        region: guard(subtract(inner, hole)),
        seeds: [
          { at: [W / 2, H - m * 1.5 - t * 0.4], heading: Math.PI, length: 0.95 },
          { at: [W / 2, H - m * 1.5 - t * 0.4], heading: RIGHT, length: 0.95 },
          { at: [W / 2, m * 1.5 + t * 0.4], heading: Math.PI, length: 0.95 },
          { at: [W / 2, m * 1.5 + t * 0.4], heading: RIGHT, length: 0.95 },
        ],
        symmetry: undefined,
      };
    }
    case 'header':
    case 'footer': {
      const t = i.thickness ?? Math.min(H, W * 0.24);
      const y = name === 'header' ? 0 : H - t;
      return {
        region: guard(rect(m, y + m * 0.5, W - 2 * m, t - m)),
        seeds: [{ at: [m * 2, y + t / 2], heading: RIGHT, length: 1 }],
      };
    }
    case 'band':
      return { region: guard(rect(0, m, W, H - 2 * m)), wrap: { wrapX: true }, seeds: [{ at: [0, H / 2], heading: RIGHT, length: 1.2 }] };
    case 'wreath': {
      const R = short / 2 - m;
      const t = i.thickness ?? R * 0.42;
      const c: Pt = [W / 2, H / 2];
      const ring = subtract(ellipse(c[0], c[1], R, R), ellipse(c[0], c[1], R - t, R - t));
      const mids = R - t / 2;
      return {
        region: guard(ring),
        seeds: [
          { at: [c[0], c[1] + mids], heading: Math.PI, length: 1.45 },
          { at: [c[0], c[1] + mids], heading: 0, length: 1.45 },
        ],
      };
    }
    case 'rosette': {
      const R = short / 2 - m;
      const count = 2 * rng.int(3, 6);
      const half = TAU / count;
      const c: Pt = [W / 2, H / 2];
      // One wedge is grown; the rest are its reflections, so seams stay continuous.
      const wedge = polygon([c, [c[0] + R * 1.05 * Math.cos(-half), c[1] + R * 1.05 * Math.sin(-half)], [c[0] + R * 1.05, c[1]]]);
      const clipped = mask(wedge.bounds, (x, y) => wedge.contains(x, y) && Math.hypot(x - c[0], y - c[1]) < R);
      return {
        region: clipped,
        seeds: [{ at: [c[0] + R * 0.1 * Math.cos(-half / 2), c[1] + R * 0.1 * Math.sin(-half / 2)], heading: -half / 2, length: 0.4 }],
        symmetry: { type: 'radial', count, center: c },
        scale: 0.8,
      };
    }
    case 'tile':
      return {
        region: rect(0, 0, W, H),
        wrap: { wrapX: true, wrapY: true },
        seeds: [
          { at: [W * 0.2, H * 0.3], heading: rng.range(0, TAU), length: 0.7 },
          { at: [W * 0.7, H * 0.72], heading: rng.range(0, TAU), length: 0.7 },
        ],
      };
    case 'arch': {
      const pts: Pt[] = [];
      const b = H * 0.98;
      const spring = H * 0.42;
      const hw = W * 0.47;
      pts.push([W / 2 - hw, b], [W / 2 + hw, b], [W / 2 + hw, spring]);
      for (let k = 0; k <= 16; k++) pts.push([W / 2 + hw * Math.cos((k / 16) * 1.05) ** 1.1 - hw * (k / 16) * 0.5, spring - spring * 0.95 * Math.sin(((k / 16) * Math.PI) / 2)]);
      const half = pts.slice(2).reverse().map(([x, y]) => [W - x, y] as Pt);
      return {
        region: guard(polygon([...pts, ...half.reverse()])),
        seeds: [{ at: [W * 0.5, b - m], heading: UP, length: 0.92 }, { at: [W * 0.26, b - m], heading: UP + 0.1, length: 0.5 }, { at: [W * 0.74, b - m], heading: UP - 0.1, length: 0.5 }],
      };
    }
    case 'bouquet': {
      const root: Pt = [W / 2, H * 0.97];
      // An ellipse, so a tall page fills to the top instead of stopping at a radius set by its width.
      const Rx = Math.min(W * 0.82, H * 1.1);
      const Ry = H * 0.92;
      const region = mask([0, 0, W, H], (x, y) => {
        const d = Math.hypot((x - root[0]) / Rx, (y - root[1]) / Ry);
        const a = Math.atan2(y - root[1], x - root[0]);
        return d < 1 && Math.abs(a - UP) < 1.15 && x > m && x < W - m && y > m;
      });
      return {
        region: guard(region),
        seeds: [-0.7, -0.34, 0, 0.34, 0.7].map((d, k) => ({ at: root, heading: UP + d, length: k === 2 ? 0.86 : 0.7 })),
      };
    }
    case 'specimen':
      return { region: guard(inner), seeds: [{ at: [W / 2, H - m * 1.5], heading: UP, length: 0.8, crown: true }], density: 0.55 };
    case 'emblem':
      return { region: inner, seeds: [], emblem: true };
    case 'scatter':
      return { region: guard(inner), seeds: [], scattered: true, density: 0.8 };
  }
}

export { union };
