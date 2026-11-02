/**
 * Colour in OKLCH. Oklab and its matrices are Bjorn Ottosson's (2020, public domain).
 * A single ink becomes a full tone ramp, the way a pigment thins with water.
 */
import { clamp, lerp } from './geom.ts';

export type Rgb = readonly [number, number, number];

const dec = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const enc = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function parseHex(hex: string): Rgb {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`flora: not a hex colour: ${hex}`);
  const n = parseInt(h, 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex(c: Rgb): string {
  const part = (v: number): string =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(c[0])}${part(c[1])}${part(c[2])}`;
}

export function rgbToOklch(c: Rgb): [number, number, number] {
  const r = dec(c[0]);
  const g = dec(c[1]);
  const b = dec(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function oklchRaw(L: number, C: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c: readonly number[]): boolean => c.every((v) => v >= -1e-4 && v <= 1.0001);

/** OKLCH to sRGB, reducing chroma until the colour is displayable. */
export function oklchToRgb(L: number, C: number, h: number): Rgb {
  let raw = oklchRaw(L, C, h);
  if (!inGamut(raw)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 16; i++) {
      const m = (lo + hi) / 2;
      if (inGamut(oklchRaw(L, m, h))) lo = m;
      else hi = m;
    }
    raw = oklchRaw(L, lo, h);
  }
  return [enc(clamp(raw[0], 0, 1)), enc(clamp(raw[1], 0, 1)), enc(clamp(raw[2], 0, 1))];
}

export function mixHex(a: string, b: string, t: number): string {
  const [l1, c1, h1] = rgbToOklch(parseHex(a));
  const [l2, c2, h2] = rgbToOklch(parseHex(b));
  const dh = (((h2 - h1) % 360) + 540) % 360 - 180;
  return toHex(oklchToRgb(lerp(l1, l2, t), lerp(c1, c2, t), h1 + dh * t));
}

export function relight(hex: string, dL: number, kC = 1, dH = 0): string {
  const [l, c, h] = rgbToOklch(parseHex(hex));
  return toHex(oklchToRgb(clamp(l + dL, 0, 1), c * kC, h + dH));
}

export function luminance(hex: string): number {
  return rgbToOklch(parseHex(hex))[0];
}

// Tone stops: t, lightness, chroma, hue drift. Darks lean one way and lights the other, as a
// pigment does when thinned (the idea follows florilegium's ramp; MIT, Kevin Raymond).
const STOPS: readonly (readonly [number, number, number, number])[] = [
  [0.0, 0.25, 0.105, 6],
  [0.18, 0.35, 0.15, 3],
  [0.38, 0.47, 0.175, 0],
  [0.58, 0.6, 0.145, -3],
  [0.8, 0.77, 0.08, -6],
  [1.0, 0.93, 0.03, -8],
];

export type Ramp = (t: number) => string;

/** A tone ramp from one ink: ramp(0) is the darkest, ramp(1) the palest. */
export function rampOf(ink: string): Ramp {
  const [L0, C0, hue] = rgbToOklch(parseHex(ink));
  const k = clamp(C0 / 0.175, 0.08, 1.35);
  // Shift the ramp so the ink itself sits on it at its own lightness.
  const shift = clamp(L0 - 0.47, -0.14, 0.2) * 0.8;
  const table: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    let s = 0;
    while (s < STOPS.length - 2 && STOPS[s + 1]![0] < t) s++;
    const a = STOPS[s]!;
    const b = STOPS[s + 1]!;
    const u = (t - a[0]) / (b[0] - a[0]);
    const wash = 1 - t;
    table.push(
      toHex(oklchToRgb(clamp(lerp(a[1], b[1], u) + shift * wash, 0.08, 0.97), lerp(a[2], b[2], u) * k, hue + lerp(a[3], b[3], u))),
    );
  }
  return (t) => table[Math.round(clamp(t, 0, 1) * 40)]!;
}
