/** Scene to SVG text. Works anywhere, including server rendering and web workers. */
import { cubicSegments } from './types.ts';
import type { DrawOp, Paint, Scene, Sub } from './types.ts';

const num = (v: number): string => {
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

/** Relative commands at 0.1 px, tracking the rounded position so error never accumulates. */
export function pathData(subs: readonly Sub[]): string {
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
  for (const sub of subs) {
    if (sub.pts.length < 2) continue;
    let cx = tenth(sub.pts[0]![0]);
    let cy = tenth(sub.pts[0]![1]);
    d += `M${join([cx, cy])}`;
    if (sub.smooth && sub.pts.length > 2) {
      d += 'c';
      const parts: number[] = [];
      for (const s of cubicSegments(sub).segs) {
        const q = s.map(tenth);
        parts.push(q[0]! - cx, q[1]! - cy, q[2]! - cx, q[3]! - cy, q[4]! - cx, q[5]! - cy);
        cx = q[4]!;
        cy = q[5]!;
      }
      d += join(parts);
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

class Defs {
  private readonly body: string[] = [];
  private readonly seen = new Map<string, string>();
  private next = 0;
  private readonly prefix: string;
  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private add(key: string, build: (id: string) => string): string {
    const hit = this.seen.get(key);
    if (hit) return hit;
    const id = `${this.prefix}${(this.next++).toString(36)}`;
    this.seen.set(key, id);
    this.body.push(build(id));
    return id;
  }

  paint(p: Paint): string {
    if (typeof p === 'string') return p;
    const stops = p.stops
      .map((s) => `<stop offset="${s.at.toFixed(3)}" stop-color="${s.color}"${s.opacity === undefined ? '' : ` stop-opacity="${s.opacity.toFixed(2)}"`}/>`)
      .join('');
    if (p.type === 'linear') {
      const attrs = `gradientUnits="userSpaceOnUse" x1="${num(p.from[0])}" y1="${num(p.from[1])}" x2="${num(p.to[0])}" y2="${num(p.to[1])}"`;
      return `url(#${this.add(attrs + stops, (id) => `<linearGradient id="${id}" ${attrs}>${stops}</linearGradient>`)})`;
    }
    const attrs = `gradientUnits="userSpaceOnUse" cx="${num(p.center[0])}" cy="${num(p.center[1])}" r="${num(p.radius)}"`;
    return `url(#${this.add(attrs + stops, (id) => `<radialGradient id="${id}" ${attrs}>${stops}</radialGradient>`)})`;
  }

  clip(subs: readonly Sub[]): string {
    const d = pathData(subs);
    return this.add(`c${d}`, (id) => `<clipPath id="${id}"><path d="${d}"/></clipPath>`);
  }

  toString(): string {
    return this.body.length ? `<defs>${this.body.join('')}</defs>` : '';
  }
}

function common(op: { opacity?: number; blend?: string }): string {
  let s = '';
  if (op.opacity !== undefined && op.opacity < 0.995) s += ` opacity="${op.opacity.toFixed(2)}"`;
  if (op.blend) s += ` style="mix-blend-mode:${op.blend}"`;
  return s;
}

function emit(ops: readonly DrawOp[], defs: Defs): string {
  let out = '';
  for (const op of ops) {
    if (op.op === 'group') {
      let a = common(op);
      if (op.clip) a += ` clip-path="url(#${defs.clip(op.clip)})"`;
      if (op.matrix) a += ` transform="matrix(${op.matrix.map((v) => +v.toFixed(4)).join(' ')})"`;
      out += `<g${a}>${emit(op.ops, defs)}</g>`;
      continue;
    }
    const d = pathData(op.subs);
    if (!d) continue;
    if (op.op === 'fill') {
      out += `<path d="${d}" fill="${defs.paint(op.paint)}"${common(op)}/>`;
    } else {
      out += `<path d="${d}" fill="none" stroke="${defs.paint(op.paint)}" stroke-width="${op.width.toFixed(2)}" stroke-linecap="${op.cap ?? 'round'}" stroke-linejoin="round"${common(op)}/>`;
    }
  }
  return out;
}

export interface SvgOptions {
  /** Id prefix for gradients and clips. Give each inline SVG on a page its own. */
  idPrefix?: string;
  title?: string;
}

export function toSVG(scene: Scene, options: SvgOptions = {}): string {
  const defs = new Defs(options.idPrefix ?? 'fl');
  const bg = scene.background
    ? `<rect width="${scene.width}" height="${scene.height}" fill="${defs.paint(scene.background)}"/>`
    : '';
  const body = emit(scene.ops, defs);
  const title = options.title ? `<title>${options.title.replace(/[<&>]/g, '')}</title>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" style="isolation:isolate">` +
    `${title}${defs}${bg}${body}</svg>`
  );
}
