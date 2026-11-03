/** Scene to SVG text. Works anywhere, including server rendering and web workers. */
import { cubicSegments } from './types.ts';
import type { Pt } from '../core/geom.ts';
import type { DrawOp, Paint, Scene, Sub } from './types.ts';

const num = (v: number): string => {
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

/** Default point tolerance in pixels: below what a screen can show at 1x. */
const TOLERANCE = 0.08;

function lineDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

/** Ramer-Douglas-Peucker on an index range, iterative so long stems cannot exhaust the stack. */
function mark(pts: readonly Pt[], from: number, to: number, tol: number, keep: boolean[]): void {
  const stack: [number, number][] = [[from, to]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = lineDistance(pts[i]!, pts[a]!, pts[b]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > tol) {
      keep[at] = true;
      stack.push([a, at], [at, b]);
    }
  }
}

/** A turn sharper than this is a tip or a notch, not part of a curve. */
const CORNER = 0.7;

/**
 * Keeps corners and their neighbours. A spline through a sharp tip overshoots when the spacing
 * around it turns uneven, which grows spikes on fine parts.
 */
function markCorners(pts: readonly Pt[], closed: boolean, keep: boolean[]): void {
  const n = pts.length;
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = pts[(i + n - 1) % n]!;
    const b = pts[i]!;
    const c = pts[(i + 1) % n]!;
    const turn = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > CORNER) {
      keep[(i + n - 1) % n] = true;
      keep[i] = true;
      keep[(i + 1) % n] = true;
    }
  }
}

/** Drops points that do not move the shape by more than `tol`. */
export function simplify(pts: readonly Pt[], closed: boolean, tol: number, smooth = false): readonly Pt[] {
  if (tol <= 0 || pts.length < 5) return pts;
  const n = pts.length;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  if (smooth) markCorners(pts, closed, keep);
  if (closed) {
    let far = 0;
    let best = -1;
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(pts[i]![0] - pts[0]![0], pts[i]![1] - pts[0]![1]);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    keep[far] = true;
    mark(pts, 0, far, tol, keep);
    mark(pts, far, n - 1, tol, keep);
  } else {
    mark(pts, 0, n - 1, tol, keep);
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= (closed ? 3 : 2) ? out : pts;
}

/**
 * Relative commands at 0.1 px, tracking the rounded position so error never accumulates.
 * A Catmull-Rom spline's control points mirror across each joint, so the shorthand `s` drops a
 * third of the numbers. Rounding can break the mirror on tiny parts; those segments stay `c`.
 */
export function pathData(subs: readonly Sub[], tolerance = 0): string {
  const tenth = (v: number): number => Math.round(v * 10);
  const join = (vals: readonly number[]): string => {
    let out = '';
    vals.forEach((v, i) => {
      const s = (v / 10).toString().replace(/^(-?)0\./, '$1.');
      out += i > 0 && !s.startsWith('-') ? ` ${s}` : s;
    });
    return out;
  };
  let d = '';
  for (const input of subs) {
    if (input.pts.length < 2) continue;
    const sub: Sub = { ...input, pts: simplify(input.pts, !!input.closed, tolerance, !!input.smooth) };
    let cx = tenth(sub.pts[0]![0]);
    let cy = tenth(sub.pts[0]![1]);
    d += `M${join([cx, cy])}`;
    if (sub.smooth && sub.pts.length > 2) {
      let command = '';
      let parts: number[] = [];
      let mx = NaN;
      let my = NaN;
      const flush = (): void => {
        if (parts.length) d += command + join(parts);
        parts = [];
      };
      for (const seg of cubicSegments(sub).segs) {
        const q = seg.map(tenth);
        const mirrored = Math.abs(mx - q[0]!) <= 1 && Math.abs(my - q[1]!) <= 1;
        const want = mirrored ? 's' : 'c';
        if (want !== command) {
          flush();
          command = want;
        }
        if (!mirrored) parts.push(q[0]! - cx, q[1]! - cy);
        parts.push(q[2]! - cx, q[3]! - cy, q[4]! - cx, q[5]! - cy);
        mx = 2 * q[4]! - q[2]!;
        my = 2 * q[5]! - q[3]!;
        cx = q[4]!;
        cy = q[5]!;
      }
      flush();
    } else {
      d += 'l';
      const parts: number[] = [];
      for (let i = 1; i < sub.pts.length; i++) {
        const x = tenth(sub.pts[i]![0]);
        const y = tenth(sub.pts[i]![1]);
        parts.push(x - cx, y - cy);
        cx = x;
        cy = y;
      }
      d += join(parts);
    }
    if (sub.closed) d += 'z';
  }
  return d;
}

/** Shorter paths cost more as a reference than as text. */
const SHARE_FROM = 48;

class Defs {
  private readonly body: string[] = [];
  private readonly seen = new Map<string, string>();
  private readonly ramps = new Map<string, string>();
  private readonly data = new Map<readonly Sub[], string>();
  private readonly uses = new Map<string, number>();
  private next = 0;
  private readonly prefix: string;
  private readonly tolerance: number;
  constructor(prefix: string, tolerance: number) {
    this.prefix = prefix;
    this.tolerance = tolerance;
  }

  private add(key: string, build: (id: string) => string): string {
    const hit = this.seen.get(key);
    if (hit) return hit;
    const id = `${this.prefix}${(this.next++).toString(36)}`;
    this.seen.set(key, id);
    this.body.push(build(id));
    return id;
  }

  d(subs: readonly Sub[]): string {
    let d = this.data.get(subs);
    if (d === undefined) {
      d = pathData(subs, this.tolerance);
      this.data.set(subs, d);
    }
    return d;
  }

  /** First pass: how often each outline appears, so repeats can share one definition. */
  count(ops: readonly DrawOp[]): void {
    const tally = (subs: readonly Sub[]): void => {
      const d = this.d(subs);
      this.uses.set(d, (this.uses.get(d) ?? 0) + 1);
    };
    for (const op of ops) {
      if (op.op === 'group') {
        if (op.clip) tally(op.clip);
        this.count(op.ops);
      } else {
        tally(op.subs);
      }
    }
  }

  /** The start of a shape tag: an inline path, or a `use` of a shared one. */
  shape(d: string): string {
    if (d.length < SHARE_FROM || (this.uses.get(d) ?? 0) < 2) return `<path d="${d}"`;
    return `<use href="#${this.add(`p${d}`, (id) => `<path id="${id}" d="${d}"/>`)}"`;
  }

  paint(p: Paint): string {
    if (typeof p === 'string') return p;
    const stops = p.stops
      .map((s) => `<stop offset="${+s.at.toFixed(3)}" stop-color="${s.color}"${s.opacity === undefined ? '' : ` stop-opacity="${+s.opacity.toFixed(2)}"`}/>`)
      .join('');
    const tag = p.type === 'linear' ? 'linearGradient' : 'radialGradient';
    const place = p.type === 'linear' ? `x1="${num(p.from[0])}" y1="${num(p.from[1])}" x2="${num(p.to[0])}" y2="${num(p.to[1])}"` : `cx="${num(p.center[0])}" cy="${num(p.center[1])}" r="${num(p.radius)}"`;
    // Gradients with the same colours inherit stops and units from the first one.
    const rampKey = tag + stops;
    const id = this.add(tag + place + stops, (id) => {
      const ramp = this.ramps.get(rampKey);
      if (ramp) return `<${tag} id="${id}" href="#${ramp}" ${place}/>`;
      this.ramps.set(rampKey, id);
      return `<${tag} id="${id}" gradientUnits="userSpaceOnUse" ${place}>${stops}</${tag}>`;
    });
    return `url(#${id})`;
  }

  clip(subs: readonly Sub[]): string {
    const d = this.d(subs);
    return this.add(`c${d}`, (id) => `<clipPath id="${id}">${this.shape(d)}/></clipPath>`);
  }

  toString(): string {
    return this.body.length ? `<defs>${this.body.join('')}</defs>` : '';
  }
}

function common(op: { opacity?: number; blend?: string }): string {
  let s = '';
  if (op.opacity !== undefined && op.opacity < 0.995) s += ` opacity="${+op.opacity.toFixed(2)}"`;
  if (op.blend) s += ` style="mix-blend-mode:${op.blend}"`;
  return s;
}

function emit(ops: readonly DrawOp[], defs: Defs): string {
  let out = '';
  for (const op of ops) {
    if (op.opacity !== undefined && op.opacity <= 0) continue;
    if (op.op === 'group') {
      const body = emit(op.ops, defs);
      if (!body) continue;
      let a = common(op);
      if (op.clip) a += ` clip-path="url(#${defs.clip(op.clip)})"`;
      if (op.matrix) a += ` transform="matrix(${op.matrix.map((v) => +v.toFixed(4)).join(' ')})"`;
      out += `<g${a}>${body}</g>`;
      continue;
    }
    const d = defs.d(op.subs);
    if (!d) continue;
    if (op.op === 'fill') {
      out += `${defs.shape(d)} fill="${defs.paint(op.paint)}"${common(op)}/>`;
    } else {
      const cap = op.cap && op.cap !== 'round' ? ` stroke-linecap="${op.cap}"` : '';
      out += `${defs.shape(d)} fill="none" stroke="${defs.paint(op.paint)}" stroke-width="${+op.width.toFixed(2)}"${cap}${common(op)}/>`;
    }
  }
  return out;
}

export interface SvgOptions {
  /** Id prefix for gradients and clips. Give each inline SVG on a page its own. */
  idPrefix?: string;
  title?: string;
  /** Points closer to the shape than this many pixels are dropped. Raise it for small file sizes. */
  tolerance?: number;
}

export function toSVG(scene: Scene, options: SvgOptions = {}): string {
  const defs = new Defs(options.idPrefix ?? 'fl', options.tolerance ?? TOLERANCE);
  const bg = scene.background
    ? `<rect width="${scene.width}" height="${scene.height}" fill="${defs.paint(scene.background)}"/>`
    : '';
  defs.count(scene.ops);
  const body = emit(scene.ops, defs);
  const title = options.title ? `<title>${options.title.replace(/[<&>]/g, '')}</title>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" stroke-linecap="round" stroke-linejoin="round" style="isolation:isolate">` +
    `${title}${defs}${bg}${body}</svg>`
  );
}

/** A `data:` URL escaping only what URLs and CSS need, far shorter than `encodeURIComponent`. */
export function svgDataURL(svg: string): string {
  const safe = svg.replace(/"/g, "'").replace(/[%#<>&\\^`{|}]|[^\x20-\x7e]/g, encodeURIComponent);
  return `data:image/svg+xml,${safe}`;
}
