/** The public entry point: options in, a re-renderable ornament out. */
import type { Part } from './botany/part.ts';
import { mapPart } from './botany/part.ts';
import { SPECIES_NAMES, inventSpecies } from './botany/species.ts';
import type { FlowerRef, Species } from './botany/species.ts';
import { SPRAY_NAMES } from './botany/spray.ts';
import type { SprayKind } from './botany/spray.ts';
import { plan } from './compose.ts';
import type { CompositionName } from './compose.ts';
import { bounds, clamp, prefix, ribbon, lerp, smoothstep } from './core/geom.ts';
import type { Pt } from './core/geom.ts';
import { Rng, hashString } from './core/rng.ts';
import type { Seed as SeedValue } from './core/rng.ts';
import { grow } from './grow/engine.ts';
import type { Element } from './grow/engine.ts';
import type { Box, Region } from './grow/region.ts';
import { MATERIAL_NAMES, resolveMaterial } from './material/materials.ts';
import type { MaterialRef } from './material/materials.ts';
import { SURFACES, resolveSurface } from './material/surface.ts';
import type { SurfaceRef } from './material/surface.ts';
import type { Material } from './material/types.ts';
import { PALETTES, inks, resolvePalette } from './palette.ts';
import type { PaletteName, PaletteRef } from './palette.ts';
import { drawScene } from './scene/canvas.ts';
import type { Ctx2D } from './scene/canvas.ts';
import { toSVG } from './scene/svg.ts';
import type { SvgOptions } from './scene/svg.ts';
import type { DrawOp, Scene } from './scene/types.ts';
import { STYLES } from './styles.ts';
import type { StyleName } from './styles.ts';

export interface FloraOptions {
  width: number;
  height: number;
  /** Same seed, same ornament. A file path or document id works well. */
  seed?: SeedValue;
  /** A named look. Any option below overrides it. */
  style?: StyleName;
  composition?: CompositionName;
  /** A custom region; takes the place of the composition's own. */
  region?: Region;
  /** Flowers to use. 'invent' crosses catalogue species into new ones for this seed. */
  flowers?: readonly FlowerRef[] | 'invent';
  sprays?: readonly SprayKind[];
  material?: MaterialRef;
  palette?: PaletteRef;
  surface?: SurfaceRef;
  /** 0 airy to 1 full. */
  density?: number;
  /** Largest flower radius in pixels. Defaults to a size that suits the layout. */
  bloomSize?: number;
  /** Stem meander, 0 to 1. */
  sway?: number;
  /** Boxes to keep clear, such as text blocks. */
  exclude?: readonly Box[];
  /** Clear space around excluded boxes. */
  padding?: number;
  /** Margin width or frame thickness. */
  thickness?: number;
  /** 0 to 1. Lower costs fewer shapes; the default follows the output size. */
  detail?: number;
}

export interface Stats {
  elements: number;
  blooms: number;
  /** Share of the region within a bloom's reach that stayed empty. */
  emptiness: number;
  ops: number;
}

export interface Art {
  readonly options: Required<Pick<FloraOptions, 'width' | 'height'>> & FloraOptions;
  readonly scene: Scene;
  readonly stats: Stats;
  toSVG(options?: SvgOptions): string;
  /** A `data:` URL, ready for CSS `background-image` or `<img src>`. */
  toDataURL(): string;
  draw(ctx: Ctx2D): void;
  /** The scene part-way through growing: 0 is bare, 1 is finished. */
  frame(progress: number): Scene;
}

const count = (ops: readonly DrawOp[]): number => ops.reduce((n, o) => n + (o.op === 'group' ? 1 + count(o.ops) : 1), 0);

/** Scales a chunk of paint about a point, for opening blooms. */
function scaled(ops: readonly DrawOp[], o: Pt, s: number): DrawOp {
  return { op: 'group', ops, matrix: [s, 0, 0, s, o[0] * (1 - s), o[1] * (1 - s)] };
}

export function flora(input: FloraOptions): Art {
  const preset = input.style ? STYLES[input.style] : undefined;
  if (input.style && !preset) throw new Error(`flora: unknown style "${input.style}". Known: ${Object.keys(STYLES).join(', ')}`);
  // An option left undefined must not erase the style's value for it.
  const given = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as unknown as FloraOptions;
  const o: FloraOptions = { ...preset, ...given };
  const { width, height } = o;
  if (!(width > 0) || !(height > 0)) throw new Error('flora: width and height must be positive');
  const seed = o.seed ?? 1;
  const rng = new Rng(seed);
  const material: Material = resolveMaterial(o.material ?? 'watercolor');
  const surface = resolveSurface(o.surface ?? (material.surface as keyof typeof SURFACES));
  const palette = resolvePalette(o.palette ?? 'garden');
  const ink = inks(palette);
  const composition = o.composition ?? 'panel';
  const layout = plan(composition, {
    width,
    height,
    exclude: o.exclude ?? [],
    pad: o.padding ?? Math.min(width, height) * 0.02,
    rng: rng.fork('plan'),
    thickness: o.thickness,
  });
  const region = o.region ?? layout.region;
  const [rx0, ry0, rx1, ry1] = region.bounds;
  const area = Math.max(1, (rx1 - rx0) * (ry1 - ry0));
  const baseUnit = clamp(Math.sqrt(area) / 7.5, 14, 170);
  const unit = o.bloomSize ?? baseUnit * (layout.scale ?? 1);
  const detail = o.detail ?? (layout.emblem ? clamp(Math.min(width, height) / 160, 0.1, 1) : clamp(unit / 80, 0.25, 1));

  let flowers: readonly FlowerRef[];
  if (o.flowers === 'invent') {
    const r = rng.fork('species');
    const made: Species[] = [];
    for (let i = 0; i < 4; i++) made.push(inventSpecies(r.fork(i)));
    flowers = made;
  } else if (o.flowers?.length) {
    flowers = o.flowers;
  } else {
    const r = rng.fork('species');
    flowers = [0, 1, 2, 3].map(() => r.pick(SPECIES_NAMES));
  }

  const keep = o.exclude ?? [];
  const forbid = keep.length ? (x: number, y: number): boolean => keep.some((b) => x > b.x && x < b.x + b.width && y > b.y && y < b.y + b.height) : undefined;
  const growth = grow({
    region,
    seeds: layout.seeds,
    rng: rng.fork('grow'),
    flowers,
    sprays: o.sprays ?? SPRAY_NAMES.filter(() => true).slice(0, 4),
    variants: palette.blooms.length,
    unit,
    density: (o.density ?? 0.85) * (layout.density ?? 1),
    sway: o.sway ?? 1,
    wrap: layout.wrap,
    scattered: layout.scattered,
    forbid,
    emblem: layout.emblem,
    tendrils: true,
    detail,
  });

  // Copies: symmetry repeats the elements, and wrapped layouts repeat across seams.
  const copies = expand(growth.elements, layout, width, height);
  const painter = (part: Part, id: string): DrawOp[] =>
    material.paint(part, { rng: rng.fork(`paint${id}`), inks: ink, detail, surface: surface.base });
  interface Painted {
    e: Element;
    copy: number;
    ops: DrawOp[];
  }
  const painted: Painted[] = copies.map(({ e, copy }) => ({
    e,
    copy,
    ops: e.parts.flatMap((p, i) => painter(p, `${e.id}.${copy}.${i}`)),
  }));
  painted.sort((a, b) => a.e.layer - b.e.layer || a.e.born - b.e.born);

  const ops: DrawOp[] = painted.flatMap((p) => p.ops);
  const background = surface.background;
  const scene: Scene = { width, height, background, ops };
  // Ids must differ between ornaments inlined on one page, even with the same seed.
  const idPrefix = `fl${hashString(JSON.stringify([seed, o.style, composition, material.name, palette, surface.name, width, height, o.density, o.flowers, o.exclude, o.thickness, unit, detail])).toString(36)}-`;
  const lastBorn = Math.max(1, ...growth.elements.map((e) => e.born));

  const art: Art = {
    options: { ...o, width, height },
    scene,
    stats: {
      elements: growth.elements.length,
      blooms: growth.elements.filter((e) => e.type === 'bloom').length,
      emptiness: growth.field.emptiness(unit * 0.3),
      ops: count(ops),
    },
    toSVG: (opts) => toSVG(scene, { idPrefix, ...opts }),
    toDataURL: () => `data:image/svg+xml,${encodeURIComponent(toSVG(scene, { idPrefix }))}`,
    draw: (ctx) => drawScene(ctx, scene),
    frame(progress) {
      const p = clamp(progress, 0, 1);
      const out: DrawOp[] = [];
      for (const it of painted) {
        const start = (it.e.born / lastBorn) * 0.86;
        const dur = it.e.type === 'stem' ? 0.2 : 0.09;
        const t = (p - start) / dur;
        if (t <= 0) continue;
        if (t >= 1) {
          out.push(...it.ops);
        } else if (it.e.type === 'stem') {
          out.push(...it.e.parts.flatMap((part, i) => painter(growingStem(part, t), `${it.e.id}.${it.copy}.${i}`)));
        } else {
          out.push(scaled(it.ops, it.e.origin, smoothstep(0, 1, t)));
        }
      }
      return { width, height, background, ops: out };
    },
  };
  return art;
}

function growingStem(p: Part, t: number): Part {
  if (!p.rib || !p.widths) return p;
  const rib = prefix(p.rib, t);
  const [a, b] = p.widths;
  return { ...p, rib, outline: ribbon(rib, (u) => lerp(a, b, u * t)), axis: [rib[0]!, rib[rib.length - 1]!] };
}

function expand(elements: readonly Element[], layout: ReturnType<typeof plan>, W: number, H: number): { e: Element; copy: number }[] {
  const out: { e: Element; copy: number }[] = [];
  const sym = layout.symmetry;
  if (sym?.type === 'radial') {
    const [cx, cy] = sym.center;
    const n = sym.count;
    for (const e of elements) {
      for (let k = 0; k < n; k++) {
        const a = (Math.floor(k / 2) * 2 * Math.PI * 2) / n;
        const flip = k % 2 === 1;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const map = (pts: readonly Pt[]): Pt[] =>
          pts.map(([x, y]) => {
            const dx = x - cx;
            const dy = flip ? -(y - cy) : y - cy;
            return [cx + dx * c - dy * s, cy + dx * s + dy * c] as Pt;
          });
        out.push({ e: { ...e, parts: e.parts.map((p) => mapPart(p, map)), origin: map([e.origin])[0]! }, copy: k });
      }
    }
    return out;
  }
  const wrap = layout.wrap;
  if (wrap?.wrapX || wrap?.wrapY) {
    for (const e of elements) {
      const all = e.parts.flatMap((p) => p.outline);
      const [x0, y0, x1, y1] = bounds(all);
      const xs = wrap.wrapX ? [0, ...(x0 < 0 ? [W] : []), ...(x1 > W ? [-W] : [])] : [0];
      const ys = wrap.wrapY ? [0, ...(y0 < 0 ? [H] : []), ...(y1 > H ? [-H] : [])] : [0];
      let copy = 0;
      for (const dx of xs) {
        for (const dy of ys) {
          const map = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [x + dx, y + dy] as Pt);
          out.push({ e: dx || dy ? { ...e, parts: e.parts.map((p) => mapPart(p, map)), origin: map([e.origin])[0]! } : e, copy: copy++ });
        }
      }
    }
    return out;
  }
  return elements.map((e) => ({ e, copy: 0 }));
}

export { MATERIAL_NAMES, PALETTES, SURFACES };
export type { PaletteName };
