/**
 * Adaptive clip art (Wong, Zongker & Salesin, 1998).
 *
 * Elements carry simple proxies. Rules run one at a time. Each iteration finds the largest empty
 * circle next to the design and tries the nearest elements in order; failure puts the circle on an
 * exclude list until something changes nearby. The phases (structure, hero blooms, foliage, sprays,
 * fillers) are the paper's state preconditions, and they give the hierarchy it asks for.
 *
 * Branches join tangentially and arrive along the motif's axis, which is what the paper calls
 * intention. From florilegium comes the motif table of size, weight and limit; from tikz-flora the
 * idea that space left in text can be filled by the same loop.
 */
import { TAU, angleDiff, clamp, dist, hermite, lerp, polar, ribbon } from '../core/geom.ts';
import type { Pt } from '../core/geom.ts';
import { noise1 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import { buildFlower } from '../botany/flower.ts';
import { bud, buildLeaf, tendril } from '../botany/leaf.ts';
import type { Part } from '../botany/part.ts';
import { resolveSpecies } from '../botany/species.ts';
import type { FlowerRef, Species } from '../botany/species.ts';
import { buildSpray } from '../botany/spray.ts';
import type { SprayKind } from '../botany/spray.ts';
import { Field } from './field.ts';
import type { Circle, FieldOptions } from './field.ts';
import type { Region } from './region.ts';

/** Paint order, back to front. */
export const LAYER = { ghost: 0, stem: 1, leaf: 2, spray: 3, bloom: 4 } as const;

export interface Element {
  id: number;
  type: 'stem' | 'leaf' | 'bloom' | 'spray' | 'bud' | 'tendril';
  layer: number;
  parts: Part[];
  /** Growth order; 0 first. The animation replays it. */
  born: number;
  /** Elements this one grew from, for the animation. */
  parent: number;
  /** Where it opens from. */
  origin: Pt;
}

export interface Seed {
  at: Pt;
  /** Initial direction in radians. */
  heading: number;
  /** Length of this main stem as a share of the region's size. */
  length?: number;
  /** A flower pre-placed at the end of this stem. */
  crown?: boolean;
}

/** A stem the caller has already routed, such as a branch of a diagram. */
export interface PlantedStem {
  line: readonly Pt[];
  /** Half-width at the start and the end. */
  widths: readonly [number, number];
}

/** A flower the caller has already placed. */
export interface PlantedBloom {
  at: Pt;
  radius: number;
  /** Direction the flower faces, in radians. */
  facing: number;
  /** Index into `flowers`; picked by the seed when left out. */
  flower?: number;
  /** Palette bloom ink; picked by the seed when left out. */
  variant?: number;
}

/** A plant whose structure is given: only leaves, sprays and small fillers are grown. */
export interface Planted {
  stems: readonly PlantedStem[];
  blooms: readonly PlantedBloom[];
}

export interface GrowOptions {
  region: Region;
  /** Stems and blooms placed by the caller. When given, `seeds` are ignored and no hero blooms grow. */
  planted?: Planted;
  seeds: readonly Seed[];
  rng: Rng;
  flowers: readonly FlowerRef[];
  sprays: readonly SprayKind[];
  /** How many palette inks to use for blooms. */
  variants: number;
  /** Scale of the largest flower in pixels. */
  unit: number;
  /** 0 airy to 1 full, can exceed 1. */
  density: number;
  /** 1 stems meander, 0 stems run straight. */
  sway: number;
  wrap?: FieldOptions;
  /** Leaf size relative to `unit`. */
  leafScale?: number;
  tendrils?: boolean;
  /** Skip the structure: blooms float free of stems, as in a scattered pattern. */
  scattered?: boolean;
  /** Points no geometry may touch, such as text. Elements that would are not placed. */
  forbid?: (x: number, y: number) => boolean;
  /** One bloom and two leaves, nothing grown. */
  emblem?: boolean;
  detail?: number;
}

export interface Growth {
  elements: Element[];
  field: Field;
}

interface StemPoint {
  p: Pt;
  tangent: number;
  width: number;
  element: number;
  /** Distance from the stem's start; later branches avoid the same node. */
  used: number;
}

function stemPart(line: readonly Pt[], w0: number, w1: number): Part {
  return {
    kind: 'stem',
    outline: ribbon(line, (t) => lerp(w0, w1, t)),
    axis: [line[0]!, line[line.length - 1]!],
    size: w0 * 2,
    ink: 'stem',
    variant: 0,
    shade: 0,
    rib: line,
    widths: [w0, w1],
  };
}

class Grower {
  readonly o: GrowOptions;
  readonly field: Field;
  readonly rng: Rng;
  readonly elements: Element[] = [];
  readonly stems: StemPoint[] = [];
  readonly excluded: Circle[] = [];
  readonly species: Species[];
  readonly reachLimit: number;
  private born = 0;

  constructor(o: GrowOptions) {
    this.o = o;
    this.rng = o.rng;
    const [x0, y0, x1, y1] = o.region.bounds;
    const short = Math.min(x1 - x0, y1 - y0);
    const long = Math.max(x1 - x0, y1 - y0);
    // Resolution follows the design scale, not the output size.
    const cell = clamp(o.unit / 7, Math.max(1, long / 360), Math.max(short / 12, 2));
    this.field = new Field(o.region, cell, o.wrap);
    this.species = o.flowers.map(resolveSpecies);
    this.reachLimit = o.unit * 3.2;
  }

  /** True when no part reaches a forbidden point. */
  clear(parts: readonly Part[]): boolean {
    const forbid = this.o.forbid;
    if (!forbid) return true;
    return parts.every((p) => p.outline.every(([x, y]) => !forbid(x, y)) && (p.cluster ?? []).every((c) => c.every(([x, y]) => !forbid(x, y))));
  }

  /** The nearest open point to a seed, which may have landed on an excluded box. */
  settle(at: Pt): Pt | null {
    const { field, o } = this;
    if (field.at(at[0], at[1]) > o.unit * 0.1) return at;
    const step = field.cell;
    for (let r = step; r < o.unit * 8; r += step) {
      for (let k = 0; k < 24; k++) {
        const q = polar(at, (k / 24) * TAU, r);
        if (field.at(q[0], q[1]) > o.unit * 0.2) return q;
      }
    }
    return null;
  }

  add(type: Element['type'], layer: number, parts: Part[], origin: Pt, parent: number): Element {
    const e: Element = { id: this.elements.length, type, layer, parts, born: this.born++, parent, origin };
    this.elements.push(e);
    return e;
  }

  addStemPoints(line: readonly Pt[], w0: number, w1: number, element: number): void {
    const n = line.length;
    let last: Pt | null = null;
    const gap = this.field.cell;
    for (let i = 0; i < n; i++) {
      const p = line[i]!;
      if (last && dist(p, last) < gap) continue;
      last = p;
      const a = line[Math.max(0, i - 1)]!;
      const b = line[Math.min(n - 1, i + 1)]!;
      this.stems.push({ p, tangent: Math.atan2(b[1] - a[1], b[0] - a[0]), width: lerp(w0, w1, i / Math.max(1, n - 1)), element, used: 0 });
      this.field.markReach(p, this.reachLimit);
    }
  }

  /** A main stem: follows the region's skeleton by climbing the free-space field, and meanders. */
  mainStem(seed: Seed, index: number): void {
    const { field, o } = this;
    const r = this.rng.fork(`stem${index}`);
    const [x0, y0, x1, y1] = o.region.bounds;
    const size = Math.max(x1 - x0, y1 - y0);
    const maxLen = (seed.length ?? 1) * size;
    const step = Math.max(o.unit * 0.11, field.cell * 0.8);
    const wander = noise1(r.fork('w'), 3);
    const start = this.settle(seed.at);
    if (!start) return;
    const pts: Pt[] = [start];
    let heading = seed.heading;
    const home = seed.heading;
    let p = start;
    let len = 0;
    let phase = r.range(0, TAU);
    const flip = r.chance(0.5) ? 1 : -1;
    const margin = o.unit * 0.26;
    while (len < maxLen) {
      const free = Math.max(field.at(p[0], p[1]), 0);
      // The meander's period grows with the local width, so it fits the panel (paper, 2.1.3).
      const period = clamp(free * 5, o.unit * 3, o.unit * 9);
      phase += (step / period) * TAU;
      const meander = home + flip * Math.sin(phase) * 0.62 * o.sway + wander(len / (o.unit * 3)) * 0.25 * o.sway;
      const g = field.gradient(p[0], p[1], field.cell * 2.5);
      const wall = 1 - clamp(free / (o.unit * 0.9), 0, 1);
      const inward = Math.hypot(g[0], g[1]) > 0 ? Math.atan2(g[1], g[0]) : heading;
      const target = meander + angleDiff(meander, inward) * wall * 0.85;
      heading += clamp(angleDiff(heading, target), -0.24, 0.24);
      const q = polar(p, heading, step);
      if (field.at(q[0], q[1]) < margin * (len < o.unit ? 0 : 1)) {
        if (len > 2 * o.unit) break;
      }
      if (field.at(q[0], q[1]) < 0 || o.forbid?.(q[0], q[1])) break;
      pts.push(q);
      p = q;
      len += step;
    }
    if (pts.length < 4) return;
    const w0 = o.unit * 0.05;
    const w1 = o.unit * 0.012;
    const e = this.add('stem', LAYER.stem, [stemPart(pts, w0, w1)], pts[0]!, -1);
    this.addStemPoints(pts, w0, w1, e.id);
    field.stampLine(pts, o.unit * 0.09);
    if (seed.crown) this.bloomAt(pts[pts.length - 1]!, heading, o.unit, e.id);
  }

  bloomAt(c: Pt, facing: number, R: number, parent: number): Pt {
    const { o } = this;
    const r = this.rng.fork(`b${this.elements.length}`);
    const sp = r.pick(this.species);
    const tilt = r.range(sp.tilt[0], sp.tilt[1]);
    const v = r.int(0, Math.max(0, o.variants - 1));
    const built = buildFlower(sp, r, c, R, facing, tilt, v, o.detail ?? 1);
    this.add('bloom', LAYER.bloom, built.parts, c, parent);
    this.field.stampDisc(c[0], c[1], R, 0.92);
    return built.anchor;
  }

  /** Joins a point to the nearest stem with a curve that leaves along the stem. */
  branchTo(target: Pt, arrive: number, reachMax: number): { line: Pt[]; from: StemPoint } | null {
    const { o, field } = this;
    const near = this.stems
      .map((s) => ({ s, d: dist(s.p, target) }))
      .filter((c) => c.d > o.unit * 0.14 && c.d < reachMax)
      .sort((a, b) => a.d + a.s.used * o.unit - b.d - b.s.used * o.unit)
      .slice(0, 6);
    for (const { s, d } of near) {
      const toward = Math.atan2(target[1] - s.p[1], target[0] - s.p[0]);
      // Leave forwards along the stem, on whichever side faces the target.
      const off = angleDiff(s.tangent, toward);
      if (Math.abs(off) > 2.3) continue;
      const leave = s.tangent + clamp(off, -0.55, 0.55);
      const h = d * 1.1;
      const line = hermite(s.p, polar([0, 0], leave, h), target, polar([0, 0], arrive, h * 0.75), 22);
      let blocked = 0;
      for (let i = 4; i < line.length - 2; i++) {
        const q = line[i]!;
        if (field.at(q[0], q[1]) < -o.unit * 0.04) blocked++;
      }
      if (blocked > 3 || (o.forbid && line.some(([x, y]) => o.forbid!(x, y)))) continue;
      s.used++;
      return { line, from: s };
    }
    return null;
  }

  /** Commits a branch and returns its element id. */
  commitBranch(b: { line: Pt[]; from: StemPoint }, trim = 0.62): number {
    const { o } = this;
    const w0 = clamp(b.from.width * 0.72, o.unit * 0.012, o.unit * 0.034);
    const w1 = o.unit * 0.008;
    const e = this.add('stem', LAYER.stem, [stemPart(b.line, w0, w1)], b.line[0]!, b.from.element);
    // The end of a branch runs under its bloom, so nothing may sprout from it.
    this.addStemPoints(b.line.slice(0, Math.max(2, Math.round(b.line.length * trim))), w0, w1, e.id);
    this.field.stampLine(b.line, o.unit * 0.05);
    return e.id;
  }

  /** Lays down a caller's stems and blooms, as `mainStem` and `bloomAt` would have. */
  plant(p: Planted): void {
    const { o, field } = this;
    p.stems.forEach((s) => {
      if (s.line.length < 2) return;
      const [w0, w1] = s.widths;
      const e = this.add('stem', LAYER.stem, [stemPart(s.line, w0, w1)], s.line[0]!, -1);
      this.addStemPoints(s.line, w0, w1, e.id);
      field.stampLine(s.line, Math.max(w0, o.unit * 0.05));
    });
    p.blooms.forEach((b, i) => {
      const r = this.rng.fork(`pb${i}`);
      const sp = b.flower !== undefined ? this.species[b.flower % this.species.length]! : r.pick(this.species);
      const tilt = r.range(sp.tilt[0], sp.tilt[1]);
      const v = b.variant ?? r.int(0, Math.max(0, o.variants - 1));
      const built = buildFlower(sp, r, b.at, b.radius, b.facing, tilt, v, o.detail ?? 1);
      this.add('bloom', LAYER.bloom, built.parts, b.at, -1);
      field.stampDisc(b.at[0], b.at[1], b.radius, 1.02);
    });
  }

  /** Phase: hero blooms, largest holes first. */
  phaseBlooms(limit: number, rMin: number): void {
    const { o, field } = this;
    const maxTries = limit * 6;
    let placed = 0;
    for (let tries = 0; tries < maxTries && placed < limit; tries++) {
      const goal = field.largest(this.reachLimit, this.excluded);
      if (!goal || goal.r < rMin) break;
      const r = this.rng.fork(`g${tries}`);
      const R = clamp(goal.r * r.range(0.72, 0.92), rMin, o.unit * r.range(0.72, 1));
      const c: Pt = [goal.x, goal.y];
      // Flowers lean away from the plant and slightly to the light.
      const near = this.nearestStem(c);
      const away = near ? Math.atan2(c[1] - near.p[1], c[0] - near.p[0]) : -Math.PI / 2;
      const facing = away + angleDiff(away, -Math.PI / 2) * 0.3 + r.jit(0.4);
      const sp = r.pick(this.species);
      const tilt = r.range(sp.tilt[0], sp.tilt[1]);
      const v = r.int(0, Math.max(0, o.variants - 1));
      const built = buildFlower(sp, r, c, R, facing, tilt, v, o.detail ?? 1);
      const b = this.clear(built.parts) ? this.branchTo(built.anchor, facing, this.reachLimit * 1.15) : null;
      if (!this.clear(built.parts) || (!b && !o.scattered)) {
        this.excluded.push({ x: goal.x, y: goal.y, r: goal.r * 0.6 });
        continue;
      }
      const stemId = b ? this.commitBranch(b) : -1;
      this.add('bloom', LAYER.bloom, built.parts, c, stemId);
      field.stampDisc(c[0], c[1], R, 1.02);
      this.clearNear(c, goal.r * 2);
      placed++;
    }
  }

  nearestStem(c: Pt): StemPoint | null {
    let best: StemPoint | null = null;
    let bd = Infinity;
    for (const s of this.stems) {
      const d = dist(s.p, c);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  clearNear(c: Pt, r: number): void {
    for (let i = this.excluded.length - 1; i >= 0; i--) {
      const e = this.excluded[i]!;
      if (Math.hypot(e.x - c[0], e.y - c[1]) < r) this.excluded.splice(i, 1);
    }
  }

  /** Phase: leaves hung at nodes along the stems, alternating sides. */
  phaseLeaves(fromId = 0): void {
    const { o, field } = this;
    const s = o.leafScale ?? 1;
    const L = o.unit * 0.85 * s;
    const stems = this.elements.filter((e) => e.type === 'stem' && e.id >= fromId);
    for (const e of stems) {
      const rib = e.parts[0]!.rib!;
      const len = rib.length;
      const r = this.rng.fork(`l${e.id}`);
      const spacing = Math.max(3, Math.round(len / Math.max(2, (lineLen(rib) / (o.unit * 0.8)) * o.density)));
      let side = r.chance(0.5) ? 1 : -1;
      const start = Math.max(1, Math.round(len * 0.08));
      for (let i = start; i < len - 1; i += spacing) {
        const p = rib[i]!;
        const a = Math.atan2(rib[i + 1]![1] - rib[i - 1]![1], rib[i + 1]![0] - rib[i - 1]![0]);
        side = -side;
        const dir = a + side * r.range(0.62, 1.05);
        const sp = r.pick(this.species);
        const size = L * r.range(0.62, 1.12);
        const fit = this.fitLeaf(p, dir, size);
        if (fit < o.unit * 0.3) continue;
        const parts = buildLeaf(r.fork(i), p, dir, fit, sp.leaf, r.chance(0.5));
        if (!this.clear(parts)) continue;
        this.add('leaf', LAYER.leaf, parts, p, e.id);
        const c = polar(p, dir, fit * 0.55);
        field.stampDisc(c[0], c[1], fit * 0.36, 0.95);
      }
    }
  }

  /** How long a leaf may be in a direction before it runs out of room. */
  fitLeaf(p: Pt, dir: number, wanted: number): number {
    const { field } = this;
    let len = 0;
    const step = field.cell;
    for (; len < wanted; len += step) {
      const q = polar(p, dir, len);
      if (field.at(q[0], q[1]) < (len < step * 3 ? -this.o.unit : this.o.unit * 0.02)) break;
    }
    return len;
  }

  /** Phase: sprays into mid-sized holes, on branches that become stems themselves. */
  phaseSprays(rMin: number, limit: number): void {
    const { o, field } = this;
    if (!o.sprays.length) return;
    let placed = 0;
    for (let tries = 0; tries < limit * 5 && placed < limit; tries++) {
      const goal = field.largest(this.reachLimit, this.excluded);
      if (!goal || goal.r < rMin) break;
      const r = this.rng.fork(`s${tries}`);
      const c: Pt = [goal.x, goal.y];
      const near = this.nearestStem(c);
      if (!near) break;
      const toward = Math.atan2(c[1] - near.p[1], c[0] - near.p[0]);
      const size = clamp(goal.r * 1.5, o.unit * 0.35, o.unit * 1.7);
      const dir = toward + angleDiff(toward, -Math.PI / 2) * 0.25;
      const base = polar(c, dir + Math.PI, Math.min(goal.r * 0.8, size * 0.5));
      const kind = r.pick(o.sprays);
      const spray = buildSpray(kind, r, base, dir, size, r.int(0, Math.max(0, o.variants - 1)));
      const b = this.clear(spray) ? this.branchTo(base, dir, this.reachLimit) : null;
      if (!b) {
        this.excluded.push({ x: goal.x, y: goal.y, r: goal.r * 0.7 });
        continue;
      }
      const stemId = this.commitBranch(b);
      this.add('spray', LAYER.spray, spray, base, stemId);
      field.stampDisc(c[0], c[1], goal.r, 0.9);
      this.clearNear(c, goal.r * 2);
      placed++;
    }
  }

  /** The shortest clear run from a point out to the edge of the region, as [edge point, heading in]. */
  entry(c: Pt): { at: Pt; heading: number; length: number } | null {
    const { o, field } = this;
    const [x0, y0, x1, y1] = o.region.bounds;
    const near = field.cell * 2;
    let best: { at: Pt; heading: number; length: number } | null = null;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      for (let len = field.cell; !best || len < best.length; len += field.cell) {
        const q = polar(c, a, len);
        if (o.forbid?.(q[0], q[1]) || field.at(q[0], q[1]) < 0) break;
        if (q[0] < x0 + near || q[0] > x1 - near || q[1] < y0 + near || q[1] > y1 - near) {
          best = { at: q, heading: a + Math.PI, length: len };
          break;
        }
      }
    }
    return best;
  }

  /**
   * Phase: space walled in by text, such as beside a run of short lines. Nothing can branch across
   * the text, so a new stem comes in from the edge of the page. Returns the first new element id.
   */
  phasePockets(rMin: number, limit: number): number {
    const { o, field } = this;
    const first = this.elements.length;
    const [x0, y0, x1, y1] = o.region.bounds;
    const size = Math.max(x1 - x0, y1 - y0);
    const skipped: Circle[] = [];
    for (let placed = 0, tries = 0; placed < limit && tries < limit * 4; tries++) {
      const goal = field.largest(Infinity, skipped);
      if (!goal || goal.r < rMin) break;
      const way = this.entry([goal.x, goal.y]);
      const before = this.elements.length;
      if (way) this.mainStem({ at: way.at, heading: way.heading, length: (way.length + goal.r * 0.8) / size }, 100 + tries);
      if (this.elements.length === before) {
        skipped.push(goal);
        continue;
      }
      placed++;
    }
    return first;
  }

  /** Phase: buds, leaflets and tendrils tucked into what is left. */
  phaseFill(rMin: number, limit: number): void {
    const { o, field } = this;
    let placed = 0;
    for (let tries = 0; tries < limit * 3 && placed < limit; tries++) {
      const goal = field.largest(this.reachLimit, this.excluded);
      if (!goal || goal.r < rMin) break;
      const r = this.rng.fork(`f${tries}`);
      const c: Pt = [goal.x, goal.y];
      const near = this.nearestStem(c);
      if (!near) break;
      const d = dist(near.p, c);
      if (d > o.unit * 1.5) {
        this.excluded.push({ x: goal.x, y: goal.y, r: goal.r });
        continue;
      }
      const dir = Math.atan2(c[1] - near.p[1], c[0] - near.p[0]);
      const size = clamp(d + goal.r * 0.7, o.unit * 0.12, o.unit * 0.8);
      const roll = r.next();
      const sp = r.pick(this.species);
      let parts: Part[];
      let type: Element['type'] = 'leaf';
      if (roll < 0.45) {
        parts = buildLeaf(r, near.p, dir, size, sp.leaf);
      } else if (roll < 0.75 || !o.tendrils) {
        const stem = hermite(near.p, polar([0, 0], near.tangent, d), c, polar([0, 0], dir, d * 0.6), 10);
        const stalk = stemPart(stem, o.unit * 0.012, o.unit * 0.006);
        parts = bud(r, c, dir, Math.max(goal.r * 0.9, o.unit * 0.12), r.int(0, Math.max(0, o.variants - 1)));
        type = 'bud';
        if (this.clear([stalk, ...parts])) this.add('stem', LAYER.stem, [stalk], near.p, near.element);
        else parts = [];
      } else {
        parts = [tendril(r, near.p, near.tangent + r.jit(0.6), Math.max(goal.r, o.unit * 0.2))];
        type = 'tendril';
      }
      field.stampDisc(c[0], c[1], goal.r, 0.92);
      if (!parts.length || !this.clear(parts)) continue;
      this.add(type, type === 'bud' ? LAYER.bloom : LAYER.leaf, parts, near.p, near.element);
      placed++;
    }
  }

  /** Scattered layouts have no stems: every point counts as reachable. */
  openField(): void {
    this.field.reach.fill(0);
  }
}

function lineLen(l: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < l.length; i++) n += dist(l[i - 1]!, l[i]!);
  return n;
}

export function grow(o: GrowOptions): Growth {
  const g = new Grower(o);
  const { unit, density } = o;
  if (o.emblem) {
    const [x0, y0, x1, y1] = o.region.bounds;
    const c: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
    const size = Math.min(x1 - x0, y1 - y0);
    const r = o.rng.fork('emblem');
    const leaf = r.pick(g.species).leaf;
    const lean = r.jit(0.5);
    for (const s of [1, -1]) {
      const a = Math.PI / 2 + s * (1.05 + r.jit(0.2)) + lean;
      g.add('leaf', LAYER.leaf, buildLeaf(r.fork(s), c, a, size * 0.46, leaf === 'fern' || leaf === 'feather' ? 'ovate' : leaf), c, -1);
    }
    g.bloomAt([c[0], c[1] - size * 0.04], -Math.PI / 2 + lean * 0.3, size * 0.36, -1);
    return { elements: g.elements, field: g.field };
  }
  const D = clamp(density, 0.1, 1.6);
  if (o.planted) {
    // The structure is the caller's: dress it with foliage, a few sprays and small fillers.
    g.plant(o.planted);
    g.phaseLeaves();
    g.excluded.length = 0;
    g.phaseSprays(unit * lerp(0.6, 0.4, clamp(D, 0, 1)), Math.round(o.planted.blooms.length * 0.6 * D) + 1);
    g.excluded.length = 0;
    g.phaseFill(unit * lerp(0.32, 0.16, clamp(D, 0, 1)), Math.round(o.planted.blooms.length * 3 * D) + 2);
    return { elements: g.elements, field: g.field };
  }
  o.seeds.forEach((s, i) => g.mainStem(s, i));
  if (o.scattered || !g.stems.length) g.openField();

  const [x0, y0, x1, y1] = o.region.bounds;
  let area = 0;
  for (const v of g.field.inside) area += v;
  area *= g.field.cell ** 2;
  void x0;
  void y0;
  void x1;
  void y1;
  // Flower coverage aims at the same share of the region at any size.
  const bloomArea = Math.PI * (unit * 0.82) ** 2;
  const bloomLimit = Math.max(1, Math.round(((area * 0.34) / bloomArea) * D));
  g.phaseBlooms(bloomLimit, unit * lerp(0.62, 0.42, clamp(D, 0, 1)));
  if (!o.scattered) g.phaseLeaves();
  g.excluded.length = 0;
  g.phaseSprays(unit * lerp(0.6, 0.36, clamp(D, 0, 1)), Math.round(bloomLimit * 1.3 * D) + 1);
  g.phaseBlooms(Math.ceil(bloomLimit * 0.5), unit * 0.3);
  g.excluded.length = 0;
  if (o.forbid && !o.scattered) {
    const first = g.phasePockets(unit * 0.5, 3);
    if (g.elements.length > first) {
      g.phaseBlooms(Math.ceil(bloomLimit * 0.25), unit * 0.3);
      g.phaseLeaves(first);
      g.excluded.length = 0;
      g.phaseSprays(unit * 0.36, 3);
      g.excluded.length = 0;
    }
  }
  if (!o.scattered) g.phaseFill(unit * lerp(0.3, 0.13, clamp(D, 0, 1)), Math.round(bloomLimit * 10 * D) + 2);
  return { elements: g.elements, field: g.field };
}

export { TAU };
