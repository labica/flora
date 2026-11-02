/** Regions: where an ornament may grow. Any point test works, so any shape can be filled. */
import { pointInPolygon } from '../core/geom.ts';
import type { Pt } from '../core/geom.ts';

export interface Region {
  bounds: readonly [number, number, number, number];
  contains(x: number, y: number): boolean;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rect(x: number, y: number, w: number, h: number): Region {
  return { bounds: [x, y, x + w, y + h], contains: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h };
}

export function roundedRect(x: number, y: number, w: number, h: number, r: number): Region {
  return {
    bounds: [x, y, x + w, y + h],
    contains(px, py) {
      const dx = Math.max(x + r - px, px - (x + w - r), 0);
      const dy = Math.max(y + r - py, py - (y + h - r), 0);
      return dx * dx + dy * dy <= r * r && px >= x && px <= x + w && py >= y && py <= y + h;
    },
  };
}

export function ellipse(cx: number, cy: number, rx: number, ry = rx): Region {
  return { bounds: [cx - rx, cy - ry, cx + rx, cy + ry], contains: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 };
}

export function polygon(pts: readonly Pt[]): Region {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { bounds: [x0, y0, x1, y1], contains: (x, y) => pointInPolygon([x, y], pts) };
}

export function union(...rs: readonly Region[]): Region {
  return {
    bounds: [Math.min(...rs.map((r) => r.bounds[0])), Math.min(...rs.map((r) => r.bounds[1])), Math.max(...rs.map((r) => r.bounds[2])), Math.max(...rs.map((r) => r.bounds[3]))],
    contains: (x, y) => rs.some((r) => r.contains(x, y)),
  };
}

export function subtract(a: Region, ...holes: readonly Region[]): Region {
  return { bounds: a.bounds, contains: (x, y) => a.contains(x, y) && !holes.some((h) => h.contains(x, y)) };
}

/** A region from any predicate, for masks or text flow. */
export function mask(bounds: Region['bounds'], contains: Region['contains']): Region {
  return { bounds, contains };
}

/** Keep-out boxes, typically text blocks, grown by `pad` so nothing touches them. */
export function keepOut(region: Region, boxes: readonly Box[], pad = 0): Region {
  if (!boxes.length) return region;
  return subtract(region, ...boxes.map((b) => rect(b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad)));
}
