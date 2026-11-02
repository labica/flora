/** Palettes name inks; ramps are derived, so one hex can seed a whole coherent garden. */
import { rampOf, relight, rgbToOklch, oklchToRgb, parseHex, toHex } from './core/color.ts';
import type { Ramp } from './core/color.ts';

export interface Palette {
  /** Flower inks. Each bloom picks one. */
  blooms: readonly string[];
  leaf: string;
  stem: string;
  heart: string;
  gold: string;
}

export const PALETTES = {
  cobalt: { blooms: ['#2456c4', '#3a6fd8', '#6f9be8'], leaf: '#1b46a8', stem: '#16307a', heart: '#b0562e', gold: '#c0793a' },
  garden: { blooms: ['#d6336c', '#f08c00', '#7048e8', '#e64980'], leaf: '#2b8a3e', stem: '#4f6f3a', heart: '#e0a12c', gold: '#e8b93f' },
  morris: { blooms: ['#a23b3b', '#c9852e', '#3f5f8a'], leaf: '#3f6f5b', stem: '#6b5a3c', heart: '#d3a93c', gold: '#c49a3a' },
  minhwa: { blooms: ['#c92a4b', '#e8598b', '#f2a33a', '#fff0e6'], leaf: '#2f7d6a', stem: '#5c4a3a', heart: '#f0b429', gold: '#d9a441' },
  ukiyo: { blooms: ['#c8413b', '#e7a9a0', '#274c77'], leaf: '#3b7a57', stem: '#2d3a3a', heart: '#e0a030', gold: '#caa24a' },
  autumn: { blooms: ['#b5451b', '#d98a29', '#8c2f39'], leaf: '#7a6a2f', stem: '#5a3d24', heart: '#c9a227', gold: '#d4a53a' },
  dusk: { blooms: ['#7c3aed', '#c026d3', '#4f46e5'], leaf: '#0f766e', stem: '#334155', heart: '#f59e0b', gold: '#fbbf24' },
  pastel: { blooms: ['#f4a6c0', '#b9a7ea', '#9fd3e6', '#f6c88f'], leaf: '#8fc09a', stem: '#8aa98f', heart: '#eec364', gold: '#e6c177' },
  rouge: { blooms: ['#b91c3c', '#e11d48', '#9f1239'], leaf: '#14532d', stem: '#3f2a1f', heart: '#eab308', gold: '#d6a72c' },
  sepia: { blooms: ['#6b4a33', '#8a6444', '#a98660'], leaf: '#5a4633', stem: '#3d2c20', heart: '#7a5230', gold: '#a57c3f' },
  jade: { blooms: ['#0f766e', '#14b8a6', '#2dd4bf'], leaf: '#065f46', stem: '#064e3b', heart: '#ca8a04', gold: '#d4af37' },
  mono: { blooms: ['#1f2937', '#374151', '#6b7280'], leaf: '#111827', stem: '#111827', heart: '#111827', gold: '#4b5563' },
} as const satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;
export type PaletteRef = PaletteName | Palette | string;

/** One hex builds a palette: analogous blooms and a complementary-leaning leaf. */
export function paletteFrom(ink: string): Palette {
  const [L, C, h] = rgbToOklch(parseHex(ink));
  const at = (dL: number, kC: number, dH: number): string => toHex(oklchToRgb(L + dL, C * kC, h + dH));
  return {
    blooms: [ink, at(0.08, 0.9, 18), at(-0.06, 1, -18)],
    leaf: at(-0.06, 0.8, -6),
    stem: at(-0.18, 0.7, 4),
    heart: at(0.16, 1, 150),
    gold: '#c79a3b',
  };
}

export function resolvePalette(p: PaletteRef): Palette {
  if (typeof p !== 'string') return p;
  if (p.startsWith('#')) return paletteFrom(p);
  const found = (PALETTES as Record<string, Palette>)[p];
  if (!found) throw new Error(`flora: unknown palette "${p}". Known: ${Object.keys(PALETTES).join(', ')} or a #hex ink`);
  return found;
}

export interface ResolvedInks {
  bloom: (variant: number) => Ramp;
  heart: Ramp;
  leaf: Ramp;
  stem: Ramp;
  gold: Ramp;
  raw: Palette;
}

export function inks(p: Palette): ResolvedInks {
  const blooms = p.blooms.map(rampOf);
  return {
    bloom: (v) => blooms[((v % blooms.length) + blooms.length) % blooms.length]!,
    heart: rampOf(p.heart),
    leaf: rampOf(p.leaf),
    stem: rampOf(p.stem),
    gold: rampOf(p.gold),
    raw: p,
  };
}

export { relight };
