/**
 * The semantic geometry of a plant. As in Wong et al. (1998), making the structure and rendering
 * it are separate steps: botany emits Parts, and any material can paint any Part.
 */
import type { Pt } from '../core/geom.ts';

export type PartKind = 'petal' | 'sepal' | 'leaf' | 'stem' | 'disc' | 'floret' | 'filament' | 'anther' | 'bud' | 'berry' | 'tendril';

/** Which palette ink paints a part. */
export type Ink = 'bloom' | 'heart' | 'leaf' | 'stem' | 'gold';

export interface Part {
  kind: PartKind;
  outline: readonly Pt[];
  /** Base to tip, used for gradients and stitch direction. */
  axis: readonly [Pt, Pt];
  /** Characteristic size in pixels, used for level of detail. */
  size: number;
  ink: Ink;
  /** Index into the palette's bloom inks. */
  variant: number;
  /** -1 in shadow (back of a petal), 0 neutral, 1 catching light. */
  shade: number;
  /** Lines that follow the surface: petal rays, leaf side veins. */
  veins?: readonly (readonly Pt[])[];
  /** Spine: leaf midrib or stem centreline. */
  rib?: readonly Pt[];
  /** A flower's eye. Petals paint their light toward it. */
  eye?: Pt;
  /** Many tiny shapes painted as one, such as the seeds of a disc. */
  cluster?: readonly (readonly Pt[])[];
  /** True for parts drawn as an open tapered line. */
  open?: boolean;
  /** Half-width of a stem at its start and end. */
  widths?: readonly [number, number];
}

export function mapPart(p: Part, fn: (pts: readonly Pt[]) => Pt[]): Part {
  const axis = fn(p.axis);
  return {
    ...p,
    outline: fn(p.outline),
    axis: [axis[0]!, axis[1]!],
    veins: p.veins?.map(fn),
    rib: p.rib ? fn(p.rib) : undefined,
    eye: p.eye ? fn([p.eye])[0] : undefined,
    cluster: p.cluster?.map(fn),
  };
}
