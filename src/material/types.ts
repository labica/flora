import type { Ramp } from '../core/color.ts';
import type { Rng } from '../core/rng.ts';
import type { Part } from '../botany/part.ts';
import type { ResolvedInks } from '../palette.ts';
import type { DrawOp, Paint } from '../scene/types.ts';

export interface PaintContext {
  rng: Rng;
  inks: ResolvedInks;
  /** 0 is a tiny icon, 1 is print. Controls how many strokes a part gets. */
  detail: number;
  /** Surface behind the ornament, for materials that knock out to it. */
  surface: string;
}

export interface Surface {
  name: string;
  /** Null lets the host app's background show through. */
  background: Paint | null;
  /** The flat colour materials treat as "paper". */
  base: string;
}

export interface Material {
  name: string;
  korean: string;
  /** The surface this material looks right on. */
  surface: string;
  paint(part: Part, ctx: PaintContext): DrawOp[];
}

export function rampFor(part: Part, ctx: PaintContext): Ramp {
  const i = ctx.inks;
  switch (part.ink) {
    case 'bloom':
      return i.bloom(part.variant);
    case 'heart':
      return i.heart;
    case 'leaf':
      return i.leaf;
    case 'stem':
      return i.stem;
    case 'gold':
      return i.gold;
  }
}
