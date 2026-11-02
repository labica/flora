/** Inflorescences: many small flowers on one structure, what makes a garden read as plants. */
import { TAU, clamp, hermite, lerp, pointAt, polar, ribbon } from '../core/geom.ts';
import type { Pt } from '../core/geom.ts';
import type { Rng } from '../core/rng.ts';
import { buildFlower } from './flower.ts';
import type { FlowerSpec } from './flower.ts';
import { berry, bud, simpleLeaf } from './leaf.ts';
import type { Part } from './part.ts';

export type SprayKind = 'cyme' | 'umbel' | 'gypsophila' | 'lavender' | 'wisteria' | 'hydrangea' | 'berries' | 'wheat' | 'fern';

function twig(line: readonly Pt[], w: number): Part {
  const n = line.length;
  return { kind: 'stem', outline: ribbon(line, (t) => lerp(w, w * 0.4, t)), axis: [line[0]!, line[n - 1]!], size: w * 2, ink: 'stem', variant: 0, shade: 0, rib: line, widths: [w, w * 0.4] };
}

const FLORET: FlowerSpec = {
  whorls: [{ count: 5, profile: 'round', length: 1, width: 0.5, open: [70, 90], ruffle: 0.02, cup: 0.1, rays: 1, jitter: 0.05 }],
  heart: { type: 'disc', radius: 0.2, count: 0 },
  tilt: [0, 40],
};
const FOUR: FlowerSpec = { ...FLORET, whorls: [{ ...FLORET.whorls[0]!, count: 4, width: 0.6, profile: 'obovate' }] };
const BELL: FlowerSpec = {
  whorls: [{ count: 4, profile: 'tepal', length: 1, width: 0.5, open: [28, 88], wrap: 0.3, ruffle: 0.02, rays: 1 }],
  heart: { type: 'none' },
  tilt: [58, 72],
};

const floret = (spec: FlowerSpec, rng: Rng, c: Pt, r: number, up: number, tilt: number, v: number): Part[] => buildFlower(spec, rng, c, r, up, tilt, v, 0.4).parts;

/** A spray growing from `base` along `angle`, about `size` long. */
export function buildSpray(kind: SprayKind, rng: Rng, base: Pt, angle: number, size: number, variant: number): Part[] {
  const out: Part[] = [];
  const w = Math.max(0.45, size * 0.012);
  const bow = rng.jit(0.5);
  const main = hermite(base, polar([0, 0], angle - bow * 0.5, size), polar(base, angle + bow * 0.3, size), polar([0, 0], angle + bow, size), 20);
  const tip = main[main.length - 1]!;

  if (kind === 'cyme') {
    // A scorpioid cyme: forget-me-nots along a curling stalk, buds at the tip.
    const dir = rng.chance(0.5) ? 1 : -1;
    const hook: Pt[] = [];
    let p: Pt = base;
    let a = angle - dir * 0.4;
    const n = 26;
    for (let i = 0; i < n; i++) {
      hook.push(p);
      a += dir * (0.02 + 0.16 * (i / n) ** 2.2);
      p = polar(p, a, (size / n) * 1.25);
    }
    out.push(twig(hook, w * 0.8));
    for (let i = 8; i < n; i += 2) {
      const t = i / (n - 1);
      const c = polar(hook[i]!, a + (i % 4 ? 1 : -1) * 1.4, size * 0.05);
      const r = size * lerp(0.1, 0.035, t ** 1.5) * rng.range(0.9, 1.1);
      out.push(...floret(FLORET, rng.fork(i), c, r, rng.range(0, TAU), rng.range(0, 34), variant));
    }
  } else if (kind === 'umbel') {
    // Spokes from one point, each with its own small umbellet.
    out.push(twig(main, w));
    const rays = rng.int(11, 17);
    const spreadA = 1.15;
    for (let i = 0; i < rays; i++) {
      const u = rays === 1 ? 0 : (i / (rays - 1)) * 2 - 1;
      const a = angle + bow + u * spreadA;
      const len = size * 0.62 * (1 - 0.18 * u * u) * rng.range(0.92, 1.05);
      const end = polar(tip, a, len);
      out.push(twig([tip, polar(tip, a, len * 0.5), end], w * 0.32));
      const k = rng.int(4, 7);
      for (let j = 0; j < k; j++) {
        const b = a + ((j / (k - 1 || 1)) * 2 - 1) * 0.65;
        const q = polar(end, b, size * 0.1 * rng.range(0.7, 1.1));
        out.push(twig([end, q], w * 0.18));
        out.push(...floret(FLORET, rng.fork(`${i}.${j}`), q, size * 0.026, b, 20, variant));
      }
    }
  } else if (kind === 'gypsophila') {
    // Baby's breath: forking twigs ending in specks.
    const walk = (from: Pt, a: number, len: number, depth: number, label: string): void => {
      const r = rng.fork(label);
      const to = polar(from, a + r.jit(0.2), len);
      out.push(twig([from, polar(from, a, len * 0.5), to], w * (0.5 - depth * 0.08)));
      if (depth >= 3) {
        out.push(...floret(FOUR, r.fork('f'), to, size * r.range(0.035, 0.05), a, r.range(0, 30), variant));
        return;
      }
      for (let i = 0; i < 2 + (r.chance(0.4) ? 1 : 0); i++) walk(to, a + r.range(-0.75, 0.75), len * r.range(0.56, 0.78), depth + 1, `${label}${i}`);
    };
    walk(base, angle, size * 0.42, 0, 'g');
  } else if (kind === 'lavender' || kind === 'wheat') {
    out.push(twig(main, w));
    const n = kind === 'lavender' ? 22 : 16;
    for (let i = 0; i < n; i++) {
      const t = lerp(0.42, 1, i / (n - 1));
      const { p, angle: a } = pointAt(main, t);
      const s = i % 2 ? 1 : -1;
      const sz = size * (kind === 'lavender' ? 0.09 : 0.12) * Math.sin(Math.PI * clamp((t - 0.38) / 0.66, 0, 1)) ** 0.5;
      const lf = simpleLeaf(rng.fork(i), p, a + s * (kind === 'lavender' ? 0.5 : 0.28), Math.max(sz, 1), 'ovate', kind === 'lavender' ? 0.42 : 0.26, variant);
      lf.kind = 'bud';
      lf.ink = kind === 'lavender' ? 'bloom' : 'gold';
      lf.veins = [];
      lf.eye = p;
      out.push(lf);
    }
  } else if (kind === 'wisteria') {
    // A hanging raceme: florets large at the top, tiny at the tip.
    const line = hermite(base, polar([0, 0], angle, size * 0.5), polar(base, Math.PI / 2, size), [rng.jit(size * 0.2), size], 20);
    out.push(twig(line, w * 0.7));
    const n = 30;
    for (let i = 0; i < n; i++) {
      const t = lerp(0.06, 1, i / (n - 1));
      const { p } = pointAt(line, t);
      const s = i % 2 ? 1 : -1;
      const r = size * lerp(0.075, 0.018, t);
      const c: Pt = [p[0] + s * r * rng.range(0.7, 1.2), p[1]];
      out.push(...floret(BELL, rng.fork(i), c, r, Math.PI / 2 + s * 0.6, 62, variant));
    }
  } else if (kind === 'hydrangea') {
    out.push(twig(main, w));
    const R = size * 0.42;
    const c = tip;
    for (let i = 0; i < 36; i++) {
      const r = R * Math.sqrt((i + 0.5) / 36);
      const a = i * 2.39996;
      out.push(...floret(FOUR, rng.fork(i), polar(c, a, r), size * 0.1 * rng.range(0.82, 1.08), a, (r / R) * 36, variant + (i % 3 === 0 ? 1 : 0)));
    }
  } else if (kind === 'berries') {
    out.push(twig(main, w));
    const n = rng.int(5, 8);
    for (let i = 0; i < n; i++) {
      const t = lerp(0.35, 1, i / (n - 1));
      const { p, angle: a } = pointAt(main, t);
      const s = i % 2 ? 1 : -1;
      const q = polar(p, a + s * 0.8, size * 0.13);
      out.push(twig([p, q], w * 0.45));
      out.push(berry(q, size * rng.range(0.05, 0.07), variant));
      if (i % 2 === 0) out.push(simpleLeaf(rng.fork(`l${i}`), p, a - s * 0.9, size * 0.26, 'ovate', 0.26));
    }
  } else {
    out.push(twig(main, w));
    const n = 12;
    for (let i = 1; i <= n; i++) {
      const t = lerp(0.2, 1, i / n);
      const { p, angle: a } = pointAt(main, t);
      for (const s of [1, -1]) out.push(simpleLeaf(rng.fork(`${i}${s}`), p, a + s * 1.05, size * 0.26 * (1 - 0.72 * t), 'lobed', 0.26));
    }
  }
  if (kind === 'cyme' && rng.chance(0.5)) out.push(...bud(rng.fork('b'), base, angle + 0.9, size * 0.14, variant));
  return out;
}

export const SPRAY_NAMES: readonly SprayKind[] = ['cyme', 'umbel', 'gypsophila', 'lavender', 'wisteria', 'hydrangea', 'berries', 'wheat', 'fern'];
