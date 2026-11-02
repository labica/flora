/** The flower catalogue. Each entry is parameters of the one model in flower.ts. */
import { lerp } from '../core/geom.ts';
import type { Rng } from '../core/rng.ts';
import type { FlowerSpec, Whorl } from './flower.ts';
import type { LeafKind } from './leaf.ts';

export interface Species extends FlowerSpec {
  name: string;
  korean: string;
  leaf: LeafKind;
}

const calyx = { sepals: 5, length: 0.34, tube: 0.26 };

/** Concentric rings of petals, shrinking and closing inward. */
function rings(n: number, each: number, base: Whorl, close: number): Whorl[] {
  const out: Whorl[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out.push({
      ...base,
      count: Math.round(each * lerp(1, 0.7, t)),
      length: base.length * lerp(1, 0.46, t),
      width: base.width * lerp(1, 0.56, t),
      open: [base.open[0] - close * t, base.open[1] - close * t * 1.25],
      turn: i * 0.5,
      shade: lerp(0, 0.5, t),
    });
  }
  return out;
}

export const SPECIES = {
  rose: {
    name: 'rose', korean: '장미', leaf: 'serrate', tilt: [0, 48], calyx,
    whorls: [
      { count: 5, profile: 'round', length: 1, width: 0.56, open: [62, 106], ruffle: 0.12, cup: 0.32, turn: 0.1, rays: 5 },
      { count: 8, profile: 'round', length: 0.84, width: 0.46, open: [52, 92], ruffle: 0.1, cup: 0.3, turn: 0.5, shade: 0.12, rays: 3 },
      { count: 21, profile: 'round', length: 0.66, width: 0.44, open: [42, 62], ruffle: 0.08, cup: 0.32, wrap: 0.75, spiral: true, taper: 0.9, jitter: 0.06, shade: 0.28, rays: 2 },
    ],
    heart: { type: 'none' },
  },
  camellia: {
    name: 'camellia', korean: '동백', leaf: 'ovate', tilt: [0, 50], calyx,
    whorls: rings(3, 7, { count: 7, profile: 'round', length: 1, width: 0.46, open: [72, 92], ruffle: 0.06, cup: 0.18, rays: 5 }, 25),
    heart: { type: 'stamens', count: 26, length: 0.3 },
  },
  peony: {
    name: 'peony', korean: '모란', leaf: 'lobed', tilt: [0, 45], calyx,
    whorls: rings(5, 10, { count: 10, profile: 'fan', length: 1, width: 0.5, open: [70, 96], ruffle: 0.22, notch: 0.05, cup: 0.2, jitter: 0.14, rays: 7 }, 45),
    heart: { type: 'stamens', count: 18, length: 0.16 },
  },
  plumBlossom: {
    name: 'plumBlossom', korean: '매화', leaf: 'ovate', tilt: [0, 55], calyx: { sepals: 5, length: 0.28, tube: 0.2 },
    whorls: [{ count: 5, profile: 'round', length: 0.98, width: 0.52, open: [66, 88], ruffle: 0.04, cup: 0.2, rays: 3 }],
    heart: { type: 'stamens', count: 30, length: 0.5 },
  },
  cherryBlossom: {
    name: 'cherryBlossom', korean: '벚꽃', leaf: 'serrate', tilt: [0, 60], calyx: { sepals: 5, length: 0.26, tube: 0.42 },
    whorls: [{ count: 5, profile: 'heart', length: 1, width: 0.5, open: [64, 90], ruffle: 0.05, notch: 0.16, cup: 0.14, rays: 5 }],
    heart: { type: 'stamens', count: 22, length: 0.42 },
  },
  mugunghwa: {
    name: 'mugunghwa', korean: '무궁화', leaf: 'lobed', tilt: [0, 50], calyx,
    whorls: [{ count: 5, profile: 'wedge', length: 1, width: 0.62, open: [62, 96], ruffle: 0.16, cup: 0.12, jitter: 0.05, rays: 9 }],
    heart: { type: 'column', length: 0.56 },
  },
  morningGlory: {
    name: 'morningGlory', korean: '나팔꽃', leaf: 'heart', tilt: [10, 62], calyx: { sepals: 5, length: 0.3, tube: 0.5 },
    whorls: [{ count: 5, profile: 'fan', length: 1, width: 0.78, open: [34, 96], ruffle: 0.08, cup: 0.04, jitter: 0.03, rays: 3 }],
    heart: { type: 'stamens', count: 5, length: 0.12 },
  },
  poppy: {
    name: 'poppy', korean: '양귀비', leaf: 'fern', tilt: [0, 58], calyx: { sepals: 2, length: 0.3, tube: 0.16 },
    whorls: [
      { count: 2, profile: 'fan', length: 1, width: 0.86, open: [58, 90], ruffle: 0.3, cup: 0.24, turn: 0.25, rays: 7 },
      { count: 2, profile: 'fan', length: 0.94, width: 0.8, open: [48, 82], ruffle: 0.3, cup: 0.28, turn: 0.75, rays: 7 },
    ],
    heart: { type: 'disc', radius: 0.13, count: 40, dome: 0.5 },
  },
  anemone: {
    name: 'anemone', korean: '아네모네', leaf: 'palmate', tilt: [0, 52], calyx,
    whorls: [{ count: 7, profile: 'obovate', length: 1, width: 0.38, open: [68, 92], ruffle: 0.08, cup: 0.16, rays: 5 }],
    heart: { type: 'disc', radius: 0.17, count: 60 },
  },
  cosmos: {
    name: 'cosmos', korean: '코스모스', leaf: 'feather', tilt: [0, 55], calyx,
    whorls: [{ count: 8, profile: 'spoon', length: 1, width: 0.38, open: [70, 92], ruffle: 0.05, teeth: [0.07, 5], cup: 0.08, jitter: 0.05, rays: 5 }],
    heart: { type: 'disc', radius: 0.17, count: 70, dome: 0.3 },
  },
  daisy: {
    name: 'daisy', korean: '데이지', leaf: 'spatulate', tilt: [0, 55], calyx,
    whorls: [
      { count: 21, profile: 'strap', length: 1, width: 0.11, open: [72, 94], ruffle: 0.04, cup: 0.02, jitter: 0.1, rays: 2 },
      { count: 13, profile: 'strap', length: 0.86, width: 0.1, open: [66, 88], ruffle: 0.04, cup: 0.02, jitter: 0.1, turn: 0.5, shade: 0.2, rays: 1 },
    ],
    heart: { type: 'disc', radius: 0.25, count: 110, dome: 0.4 },
  },
  sunflower: {
    name: 'sunflower', korean: '해바라기', leaf: 'heart', tilt: [0, 42], calyx,
    whorls: [
      { count: 21, profile: 'tepal', length: 1, width: 0.13, open: [74, 100], ruffle: 0.06, jitter: 0.12, rays: 3 },
      { count: 21, profile: 'tepal', length: 0.92, width: 0.13, open: [70, 92], ruffle: 0.06, jitter: 0.12, turn: 0.5, shade: 0.2, rays: 3 },
    ],
    heart: { type: 'disc', radius: 0.52, count: 240, dome: 0.3 },
  },
  chrysanthemum: {
    name: 'chrysanthemum', korean: '국화', leaf: 'lobed', tilt: [0, 42], calyx,
    whorls: rings(6, 21, { count: 21, profile: 'strap', length: 1, width: 0.13, open: [78, 100], ruffle: 0.04, cup: 0.2, jitter: 0.1, rays: 1 }, 62),
    heart: { type: 'none' },
  },
  dahlia: {
    name: 'dahlia', korean: '다알리아', leaf: 'serrate', tilt: [0, 42], calyx,
    whorls: [{ count: 64, profile: 'tepal', length: 1, width: 0.2, open: [80, 92], ruffle: 0.02, cup: 0.5, spiral: true, taper: 1, jitter: 0.02, rays: 1 }],
    heart: { type: 'none' },
  },
  lotus: {
    name: 'lotus', korean: '연꽃', leaf: 'heart', tilt: [38, 72],
    whorls: rings(4, 10, { count: 10, profile: 'tepal', length: 1, width: 0.32, open: [58, 82], ruffle: 0.01, cup: 0.4, rays: 7 }, 56),
    heart: { type: 'disc', radius: 0.18, count: 16, dome: 0.1 },
  },
  tulip: {
    name: 'tulip', korean: '튤립', leaf: 'strap', tilt: [62, 84], calyx: { sepals: 0, length: 0, tube: 0.05 },
    whorls: [
      { count: 3, profile: 'tepal', length: 1.2, width: 0.56, open: [64, -6], ruffle: 0.02, cup: 0.2, wrap: 0.75, rays: 5 },
      { count: 3, profile: 'tepal', length: 1.14, width: 0.54, open: [58, -12], ruffle: 0.02, cup: 0.2, wrap: 0.75, turn: 0.5, shade: 0.2, rays: 5 },
    ],
    heart: { type: 'none' },
  },
  lily: {
    name: 'lily', korean: '백합', leaf: 'lance', tilt: [25, 66], calyx: { sepals: 0, length: 0, tube: 0.4 },
    whorls: [
      { count: 3, profile: 'tepal', length: 1.05, width: 0.26, open: [26, 118], ruffle: 0.08, cup: 0.18, turn: 0.5, rays: 3 },
      { count: 3, profile: 'tepal', length: 1, width: 0.32, open: [24, 112], ruffle: 0.1, cup: 0.2, shade: 0.15, rays: 3 },
    ],
    heart: { type: 'stamens', count: 6, length: 0.62 },
  },
  bellflower: {
    name: 'bellflower', korean: '도라지꽃', leaf: 'serrate', tilt: [58, 80], calyx: { sepals: 5, length: 0.32, tube: 0.14 },
    whorls: [{ count: 5, profile: 'tepal', length: 1.1, width: 0.44, open: [24, 76], ruffle: 0.03, wrap: 0.5, cup: 0.06, jitter: 0.04, rays: 3 }],
    heart: { type: 'column', length: 0.4 },
  },
  pansy: {
    name: 'pansy', korean: '팬지', leaf: 'spatulate', tilt: [0, 34], calyx,
    whorls: [
      { count: 3, profile: 'fan', length: 0.92, width: 0.58, open: [72, 92], ruffle: 0.12, shade: -0.1, rays: 9 },
      { count: 2, profile: 'fan', length: 0.98, width: 0.66, open: [78, 96], ruffle: 0.12, turn: 0.25, shade: 0.35, rays: 7 },
    ],
    heart: { type: 'stamens', count: 4, length: 0.07 },
  },
  gentian: {
    name: 'gentian', korean: '용담', leaf: 'lance', tilt: [48, 74], calyx: { sepals: 5, length: 0.36, tube: 0.3 },
    whorls: [{ count: 5, profile: 'lance', length: 1.15, width: 0.34, open: [14, 74], ruffle: 0.02, wrap: 0.45, rays: 3 }],
    heart: { type: 'none' },
  },
  clematis: {
    name: 'clematis', korean: '으아리', leaf: 'heart', tilt: [0, 50], calyx,
    whorls: [{ count: 6, profile: 'tepal', length: 1, width: 0.34, open: [78, 96], ruffle: 0.06, jitter: 0.05, rays: 3 }],
    heart: { type: 'stamens', count: 38, length: 0.26 },
  },
  aster: {
    name: 'aster', korean: '쑥부쟁이', leaf: 'lance', tilt: [0, 50], calyx,
    whorls: [{ count: 34, profile: 'strap', length: 1, width: 0.075, open: [78, 96], ruffle: 0.05, jitter: 0.14, spiral: true, rays: 1 }],
    heart: { type: 'disc', radius: 0.28, count: 80 },
  },
} as const satisfies Record<string, Species>;

export type SpeciesName = keyof typeof SPECIES;
export const SPECIES_NAMES = Object.keys(SPECIES) as SpeciesName[];

export type FlowerRef = SpeciesName | Species;

export function resolveSpecies(s: FlowerRef): Species {
  if (typeof s !== 'string') return s;
  const found = SPECIES[s];
  if (!found) throw new Error(`flora: unknown species "${s}". Known: ${SPECIES_NAMES.join(', ')}`);
  return found;
}

function blendWhorl(a: Whorl, b: Whorl, t: number): Whorl {
  return {
    ...(t < 0.5 ? a : b),
    count: Math.round(lerp(a.count, b.count, t)),
    length: lerp(a.length, b.length, t),
    width: lerp(a.width, b.width, t),
    open: [lerp(a.open[0], b.open[0], t), lerp(a.open[1], b.open[1], t)],
    ruffle: lerp(a.ruffle ?? 0.06, b.ruffle ?? 0.06, t),
    cup: lerp(a.cup ?? 0.1, b.cup ?? 0.1, t),
    notch: lerp(a.notch ?? 0, b.notch ?? 0, t),
    wrap: lerp(a.wrap ?? 0, b.wrap ?? 0, t),
  };
}

/** A cross of two species: an imaginary flower that still reads as a plant. */
export function hybrid(a: FlowerRef, b: FlowerRef, t = 0.5, name?: string): Species {
  const x = resolveSpecies(a);
  const y = resolveSpecies(b);
  const n = Math.max(x.whorls.length, y.whorls.length);
  const whorls: Whorl[] = [];
  for (let i = 0; i < n; i++) {
    const p = x.whorls[Math.min(i, x.whorls.length - 1)]!;
    const q = y.whorls[Math.min(i, y.whorls.length - 1)]!;
    whorls.push(blendWhorl(p, q, t));
  }
  const pick = t < 0.5 ? x : y;
  return {
    name: name ?? `${x.name}×${y.name}`,
    korean: `${x.korean}×${y.korean}`,
    leaf: pick.leaf,
    heart: pick.heart,
    calyx: pick.calyx,
    tilt: [lerp(x.tilt[0], y.tilt[0], t), lerp(x.tilt[1], y.tilt[1], t)],
    whorls,
  };
}

/** A new flower for a seed, crossed from two catalogue parents. */
export function inventSpecies(rng: Rng): Species {
  const a = rng.pick(SPECIES_NAMES);
  const b = rng.pick(SPECIES_NAMES);
  return hybrid(a, b, rng.range(0.25, 0.75));
}
