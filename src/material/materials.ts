/**
 * Materials repaint the same geometry. Every effect is built from filled paths, gradients, clips and
 * blends, so SVG and Canvas output match and no filter support is needed.
 *
 * The watercolor layering (flat wash, multiplied blotches, pooling at edges, lifted streaks) follows
 * Curtis et al. (1997) as simplified by florilegium and tikz-flora (MIT).
 */
import { mixHex, relight } from '../core/color.ts';
import { bounds, centroid, circlePoly, clamp, deform, dist, lerp, mid, pointInPolygon, ribbon, transform } from '../core/geom.ts';
import type { Pt } from '../core/geom.ts';
import type { Part } from '../botany/part.ts';
import { line, poly } from '../scene/types.ts';
import type { DrawOp, Paint, Sub } from '../scene/types.ts';
import { rampFor } from './types.ts';
import type { Material, PaintContext } from './types.ts';

const outlineSubs = (p: Part): Sub[] => (p.cluster ? p.cluster.map((c) => poly(c, false)) : [poly(p.outline, false)]);
const dots = (p: Part): boolean => p.kind === 'floret' || p.kind === 'anther';
const thin = (p: Part): boolean => !!p.open || p.kind === 'stem' || p.kind === 'tendril';
const fine = (w: number, c: PaintContext): number => Math.max(0.3, w * lerp(0.7, 1, c.detail));

function shaft(p: Part): readonly [Pt, Pt] {
  return p.axis;
}

function gradient(p: Part, stops: readonly (readonly [number, string])[]): Paint {
  const [a, b] = shaft(p);
  if (dist(a, b) < 0.5) return stops[stops.length - 1]![1];
  return { type: 'linear', from: a, to: b, stops: stops.map(([at, color]) => ({ at, color })) };
}

const body = (p: Part): Sub => poly(p.outline);

/** Tone for a part: filled shapes sit on the ramp by role, shade moves them. */
function baseTone(p: Part): number {
  const role = p.kind === 'leaf' ? 0.3 : p.kind === 'sepal' ? 0.24 : p.kind === 'stem' ? 0.16 : p.kind === 'tendril' ? 0.2 : p.kind === 'bud' ? 0.32 : p.kind === 'disc' ? 0.34 : 0.38;
  return clamp(role - p.shade * 0.14, 0.02, 0.9);
}

function taper(l: readonly Pt[], w: number): Pt[] {
  return ribbon(l, (t) => w * Math.sin(Math.PI * clamp(t * 0.96 + 0.04, 0, 1)) ** 0.7);
}

// ---------------------------------------------------------------- watercolor

const watercolor: Material = {
  name: 'watercolor',
  korean: '수채화',
  surface: 'paper',
  paint(p, c) {
    const ramp = rampFor(p, c);
    const t = baseTone(p);
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: ramp(p.kind === 'anther' ? 0.3 : 0.2), opacity: 0.92 }];
    if (thin(p)) {
      return [
        { op: 'fill', subs: [poly(p.outline, true)], paint: gradient(p, [[0, ramp(t * 0.5)], [1, ramp(t + 0.12)]]) },
      ];
    }
    const size = p.size;
    const r = c.rng;
    const ops: DrawOp[] = [];
    if (p.kind === 'petal' || p.kind === 'bud') {
      const pale = clamp(t + 0.52, 0, 0.98);
      ops.push({ op: 'fill', subs: [body(p)], paint: gradient(p, [[0, ramp(pale)], [0.32, ramp(t + 0.22)], [0.7, ramp(t)], [1, ramp(t - 0.05)]]) });
    } else {
      ops.push({ op: 'fill', subs: [body(p)], paint: gradient(p, [[0, ramp(t - 0.1)], [0.6, ramp(t)], [1, ramp(t + 0.18)]]) });
    }
    if (size < 13 * (1.5 - c.detail)) {
      if (p.rib && size > 6) ops.push({ op: 'stroke', subs: [line(p.rib)], paint: ramp(0.9), width: 0.4, opacity: 0.7 });
      return ops;
    }
    const inner: DrawOp[] = [];
    const center = centroid(p.outline);
    const blots = Math.round(lerp(1, 4, c.detail));
    for (let i = 0; i < blots; i++) {
      const q = mid(center, p.outline[r.int(0, p.outline.length - 1)]!, r.range(0.2, 0.85));
      const rad = size * r.range(0.14, 0.32);
      inner.push({ op: 'fill', subs: [poly(deform(circlePoly(q, rad, 6), r, rad * 0.5, 1))], paint: ramp(t - 0.1), opacity: r.range(0.08, 0.2), blend: 'multiply' });
    }
    // Lifted streaks: pigment wiped back to pale along the surface.
    for (const v of p.veins ?? []) {
      if (p.kind === 'leaf') continue;
      inner.push({ op: 'fill', subs: [poly(taper(v, Math.max(0.3, size * r.range(0.005, 0.016))), false)], paint: '#ffffff', opacity: r.range(0.32, 0.72) });
    }
    if (p.kind === 'leaf') {
      const veins = p.veins ?? [];
      for (const v of veins) inner.push({ op: 'stroke', subs: [line(v)], paint: ramp(0.86), width: fine(Math.max(0.4, size * 0.009), c), opacity: 0.6 });
      if (p.rib) inner.push({ op: 'fill', subs: [poly(ribbon(p.rib, (u) => size * lerp(0.016, 0.003, u)), false)], paint: ramp(0.93), opacity: 0.92 });
    }
    // Pigment pools at the rim.
    inner.push({ op: 'stroke', subs: [body(p)], paint: ramp(t - 0.3), width: Math.max(0.6, size * 0.07), opacity: 0.42, blend: 'multiply' });
    ops.push({ op: 'group', clip: [body(p)], ops: inner });
    ops.push({ op: 'stroke', subs: [body(p)], paint: ramp(0.06), width: Math.max(0.25, size * 0.007), opacity: 0.5 });
    return ops;
  },
};

// ---------------------------------------------------------------- gouache

const gouache: Material = {
  name: 'gouache',
  korean: '구아슈',
  surface: 'linen',
  paint(p, c) {
    const ramp = rampFor(p, c);
    const t = baseTone(p) + 0.08;
    const flat: DrawOp = { op: 'fill', subs: [poly(p.outline, !dots(p))], paint: ramp(t) };
    if (dots(p) || thin(p)) return [flat];
    const r = c.rng;
    const light: Pt[] = p.outline.map((q) => mid(q, p.axis[1], 0.5));
    const ops: DrawOp[] = [flat];
    if (p.size > 8) {
      const under = transform(p.outline, p.size * 0.03, p.size * 0.04);
      ops.unshift({ op: 'fill', subs: [poly(under)], paint: ramp(t - 0.2), opacity: 0.8 });
      ops.push({ op: 'group', clip: [body(p)], ops: [{ op: 'fill', subs: [poly(light)], paint: ramp(t + 0.2), opacity: 0.8 }] });
      for (const v of (p.veins ?? []).slice(0, 7)) ops.push({ op: 'fill', subs: [poly(taper(v, Math.max(0.4, p.size * r.range(0.008, 0.016))), false)], paint: ramp(t - 0.2), opacity: 0.85 });
      if (p.rib) ops.push({ op: 'fill', subs: [poly(ribbon(p.rib, (u) => p.size * lerp(0.016, 0.004, u)), false)], paint: ramp(0.85) });
    }
    return ops;
  },
};

// ---------------------------------------------------------------- pen & ink, engraving

function hatch(p: Part, gap: number): Sub[] {
  const [a, b] = p.axis;
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + 0.5;
  const rad = p.size * 1.3;
  const c = centroid(p.outline);
  const out: Sub[] = [];
  for (let s = -rad; s < rad; s += gap) {
    const q: Pt = [c[0] - Math.sin(ang) * s, c[1] + Math.cos(ang) * s];
    out.push(line([[q[0] - Math.cos(ang) * rad, q[1] - Math.sin(ang) * rad], [q[0] + Math.cos(ang) * rad, q[1] + Math.sin(ang) * rad]], false));
  }
  return out;
}

const ink: Material = {
  name: 'ink',
  korean: '펜화',
  surface: 'paper',
  paint(p, c) {
    const col = rampFor(p, c)(0.06);
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: col }];
    if (thin(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: col }];
    const w = Math.max(0.35, p.size * 0.012);
    const ops: DrawOp[] = [{ op: 'fill', subs: [body(p)], paint: c.surface }];
    const inner: DrawOp[] = [];
    for (const v of p.veins ?? []) inner.push({ op: 'fill', subs: [poly(taper(v, w * 0.55), false)], paint: col });
    if (p.rib) inner.push({ op: 'fill', subs: [poly(ribbon(p.rib, (u) => w * lerp(0.9, 0.2, u)), false)], paint: col });
    if (inner.length) ops.push({ op: 'group', clip: [body(p)], ops: inner });
    ops.push({ op: 'stroke', subs: [body(p)], paint: col, width: w });
    return ops;
  },
};

const engraving: Material = {
  name: 'engraving',
  korean: '동판화',
  surface: 'ivory',
  paint(p, c) {
    const col = rampFor(p, c)(0.04);
    if (dots(p) || thin(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: col }];
    const w = Math.max(0.3, p.size * 0.007);
    const gap = Math.max(2.2, p.size * 0.075);
    const inner: DrawOp[] = [{ op: 'stroke', subs: hatch(p, gap), paint: col, width: w, cap: 'butt' }];
    // A paper-coloured highlight cuts the hatching toward the tip.
    const light = p.outline.map((q) => mid(q, p.axis[0], 0.56));
    inner.push({ op: 'fill', subs: [poly(light)], paint: c.surface, opacity: p.shade < 0 ? 0 : 0.86 });
    for (const v of p.veins ?? []) inner.push({ op: 'fill', subs: [poly(taper(v, w * 0.8), false)], paint: col });
    return [
      { op: 'fill', subs: [body(p)], paint: c.surface },
      { op: 'group', clip: [body(p)], ops: inner },
      { op: 'stroke', subs: [body(p)], paint: col, width: Math.max(0.4, p.size * 0.012) },
    ];
  },
};

// ---------------------------------------------------------------- gold, enamel, glass, mother of pearl

function goldPaint(p: Part, a: string, b: string, cc: string): Paint {
  const [s, e] = p.axis;
  return {
    type: 'linear',
    from: s,
    to: e,
    stops: [
      { at: 0, color: b },
      { at: 0.3, color: a },
      { at: 0.46, color: cc },
      { at: 0.6, color: a },
      { at: 1, color: b },
    ],
  };
}

const gilt: Material = {
  name: 'gilt',
  korean: '금박',
  surface: 'lacquer',
  paint(p) {
    const a = '#d9a93b';
    const b = '#8d6420';
    const hi = '#fff0b8';
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: '#f0c95c' }];
    if (thin(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: goldPaint(p, a, b, hi) }];
    const ops: DrawOp[] = [{ op: 'fill', subs: [body(p)], paint: goldPaint(p, a, b, hi) }];
    const inner: DrawOp[] = [];
    for (const v of p.veins ?? []) inner.push({ op: 'fill', subs: [poly(taper(v, Math.max(0.3, p.size * 0.012)), false)], paint: b, opacity: 0.85 });
    if (p.rib) inner.push({ op: 'fill', subs: [poly(ribbon(p.rib, (u) => p.size * lerp(0.016, 0.004, u)), false)], paint: b });
    if (p.shade < -0.2) inner.push({ op: 'fill', subs: [body(p)], paint: '#3a2608', opacity: 0.25 });
    inner.push({ op: 'stroke', subs: [body(p)], paint: hi, width: Math.max(0.3, p.size * 0.016), opacity: 0.7 });
    ops.push({ op: 'group', clip: [body(p)], ops: inner });
    ops.push({ op: 'stroke', subs: [body(p)], paint: '#4a3010', width: Math.max(0.25, p.size * 0.006), opacity: 0.8 });
    return ops;
  },
};

const stainedGlass: Material = {
  name: 'stainedGlass',
  korean: '스테인드글라스',
  surface: 'night',
  paint(p, c) {
    const ramp = rampFor(p, c);
    const lead = '#14151a';
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: ramp(0.7) }];
    // Stems are glass too: lead would vanish on the dark surface this material defaults to.
    if (thin(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: ramp(0.4) }, { op: 'stroke', subs: outlineSubs(p), paint: ramp(0.4), width: 0.8 }];
    const q = centroid(p.outline);
    const t = baseTone(p);
    const ops: DrawOp[] = [
      {
        op: 'fill',
        subs: [body(p)],
        paint: { type: 'radial', center: q, radius: p.size * 0.72, stops: [{ at: 0, color: relight(ramp(t + 0.28), 0.08, 1.5) }, { at: 0.55, color: relight(ramp(t + 0.1), 0.02, 1.5) }, { at: 1, color: ramp(t - 0.14) }] },
      },
    ];
    const inner: DrawOp[] = [];
    const r = c.rng;
    for (let i = 0; i < Math.round(lerp(0, 4, c.detail)); i++) {
      const s = mid(q, p.outline[r.int(0, p.outline.length - 1)]!, r.range(0.2, 0.9));
      inner.push({ op: 'fill', subs: [poly(circlePoly(s, p.size * r.range(0.05, 0.12), 6), true)], paint: '#ffffff', opacity: r.range(0.05, 0.14), blend: 'overlay' });
    }
    for (const v of (p.veins ?? []).slice(0, 5)) inner.push({ op: 'stroke', subs: [line(v)], paint: lead, width: Math.max(0.7, p.size * 0.03) });
    if (p.rib) inner.push({ op: 'stroke', subs: [line(p.rib)], paint: lead, width: Math.max(0.8, p.size * 0.03) });
    if (inner.length) ops.push({ op: 'group', clip: [body(p)], ops: inner });
    ops.push({ op: 'stroke', subs: [body(p)], paint: lead, width: Math.max(1, p.size * 0.05) });
    return ops;
  },
};

const cloisonne: Material = {
  name: 'cloisonne',
  korean: '칠보',
  surface: 'ink',
  paint(p, c) {
    const ramp = rampFor(p, c);
    const wire = '#e3bb5a';
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: wire }];
    if (thin(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: wire }];
    const t = baseTone(p);
    const w = Math.max(0.5, p.size * 0.02);
    const shine = p.outline.map((q) => mid(q, mid(p.axis[0], p.axis[1], 0.62), 0.74));
    const inner: DrawOp[] = [{ op: 'fill', subs: [poly(shine)], paint: '#ffffff', opacity: 0.26 }];
    for (const v of p.veins ?? []) inner.push({ op: 'stroke', subs: [line(v)], paint: wire, width: w * 0.6 });
    if (p.rib) inner.push({ op: 'stroke', subs: [line(p.rib)], paint: wire, width: w * 0.8 });
    return [
      { op: 'fill', subs: [body(p)], paint: gradient(p, [[0, relight(ramp(t + 0.28), 0, 1.4)], [1, relight(ramp(t), 0, 1.4)]]) },
      { op: 'group', clip: [body(p)], ops: inner },
      { op: 'stroke', subs: [body(p)], paint: wire, width: w },
    ];
  },
};

const najeon: Material = {
  name: 'najeon',
  korean: '나전칠기',
  surface: 'lacquer',
  paint(p, c) {
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: '#f4e9ff' }];
    const hue = (s: string, n: number): string => relight(s, 0, 1, n);
    const r = c.rng;
    const shift = r.range(-60, 60);
    const [s, e] = p.axis;
    const shell: Paint = {
      type: 'linear',
      from: s,
      to: e,
      stops: [
        { at: 0, color: hue('#c7f0ec', shift) },
        { at: 0.28, color: hue('#f3d9f7', shift) },
        { at: 0.52, color: '#fbfaf0' },
        { at: 0.75, color: hue('#bfd6fb', shift) },
        { at: 1, color: hue('#d4f4d1', shift) },
      ],
    };
    if (thin(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: shell }];
    const inner: DrawOp[] = [];
    // Shell inlays crack into plates; the lacquer shows through as fine lines.
    for (const v of p.veins ?? []) inner.push({ op: 'stroke', subs: [line(v)], paint: '#101014', width: Math.max(0.4, p.size * 0.014), opacity: 0.85 });
    const cracks = Math.round(lerp(0, 6, c.detail));
    for (let i = 0; i < cracks; i++) {
      const q = centroid(p.outline);
      const a = p.outline[r.int(0, p.outline.length - 1)]!;
      inner.push({ op: 'stroke', subs: [line([q, a], false)], paint: '#101014', width: 0.35, opacity: 0.5 });
    }
    if (p.rib) inner.push({ op: 'stroke', subs: [line(p.rib)], paint: '#101014', width: Math.max(0.4, p.size * 0.02) });
    return [
      { op: 'fill', subs: [body(p)], paint: shell },
      { op: 'group', clip: [body(p)], ops: inner },
    ];
  },
};

// ---------------------------------------------------------------- textile & paper

const embroidery: Material = {
  name: 'embroidery',
  korean: '자수',
  surface: 'linen',
  paint(p, c) {
    const ramp = rampFor(p, c);
    const t = baseTone(p) + 0.08;
    const r = c.rng;
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: ramp(0.45) }, { op: 'stroke', subs: outlineSubs(p), paint: ramp(0.15), width: 0.3 }];
    if (thin(p)) {
      // Stem stitch: short overlapping dashes along the line.
      const rib = p.rib ?? p.outline;
      const w = Math.max(0.5, (p.widths?.[0] ?? 1) * 1.6);
      const subs: Sub[] = [];
      const step = Math.max(2, w * 2.2);
      for (let i = 0; i + 1 < rib.length; i++) subs.push(line([rib[i]!, rib[Math.min(rib.length - 1, i + 1)]!], false));
      void step;
      return [
        { op: 'stroke', subs: [line(rib)], paint: ramp(t - 0.14), width: w * 1.5 },
        { op: 'stroke', subs: [line(rib)], paint: ramp(t + 0.12), width: w * 0.6, opacity: 0.8 },
      ];
    }
    // Satin stitch: parallel threads crossing the part, each its own tone.
    const [a, b] = p.axis;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (p.kind === 'leaf' ? 0.72 : 0);
    const c0 = centroid(p.outline);
    const rad = p.size * 1.2;
    const gap = Math.max(0.9, lerp(1.6, 1.1, c.detail) * (p.size > 30 ? 1.25 : 1));
    const buckets: Sub[][] = [[], [], []];
    for (let s = -rad; s < rad; s += gap) {
      const q: Pt = [c0[0] - Math.sin(ang) * s, c0[1] + Math.cos(ang) * s];
      const j = r.jit(p.size * 0.04);
      buckets[r.int(0, 2)]!.push(
        line([[q[0] - Math.cos(ang) * (rad + j), q[1] - Math.sin(ang) * (rad + j)], [q[0] + Math.cos(ang) * (rad - j), q[1] + Math.sin(ang) * (rad - j)]], false),
      );
    }
    const inner: DrawOp[] = [
      { op: 'fill', subs: [body(p)], paint: ramp(t - 0.1) },
      { op: 'stroke', subs: buckets[0]!, paint: ramp(t - 0.03), width: gap * 0.9, cap: 'butt' },
      { op: 'stroke', subs: buckets[1]!, paint: ramp(t + 0.09), width: gap * 0.9, cap: 'butt' },
      { op: 'stroke', subs: buckets[2]!, paint: ramp(t + 0.2), width: gap * 0.9, cap: 'butt' },
    ];
    if (p.rib) inner.push({ op: 'stroke', subs: [line(p.rib)], paint: ramp(0.88), width: Math.max(0.6, p.size * 0.02) });
    return [
      { op: 'fill', subs: [poly(transform(p.outline, 0.7, 1))], paint: '#000000', opacity: 0.16 },
      { op: 'group', clip: [body(p)], ops: inner },
    ];
  },
};

const papercut: Material = {
  name: 'papercut',
  korean: '페이퍼컷',
  surface: 'cream',
  paint(p, c) {
    const ramp = rampFor(p, c);
    const t = baseTone(p) + 0.14;
    const smooth = !dots(p);
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: ramp(0.3) }];
    const drop = Math.min(3.5, Math.max(0.5, p.size * 0.05));
    const ops: DrawOp[] = [
      { op: 'fill', subs: [poly(transform(p.outline, drop * 0.6, drop), smooth)], paint: '#20140a', opacity: 0.17 },
      { op: 'fill', subs: [poly(p.outline, smooth)], paint: gradient(p, [[0, ramp(t + 0.06)], [1, ramp(t - 0.06)]]) },
    ];
    if (p.rib && p.kind === 'leaf') ops.push({ op: 'fill', subs: [poly(ribbon(p.rib, (u) => Math.max(0.4, p.size * lerp(0.016, 0.004, u))), false)], paint: ramp(t + 0.3) });
    return ops;
  },
};

// ---------------------------------------------------------------- print

/** The screen sits on one grid for the whole page, as a real plate does, so dots line up across parts. */
function halftone(p: Part, gap: number): { large: Sub[]; small: Sub[] } {
  const [x0, y0, x1, y1] = bounds(p.outline);
  const [a, b] = p.axis;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy || 1;
  const large: Sub[] = [];
  const small: Sub[] = [];
  for (let row = Math.floor(y0 / gap); row * gap <= y1; row++) {
    const shift = row % 2 ? gap : 0;
    for (let col = Math.floor((x0 - shift) / (gap * 2)); col * gap * 2 + shift <= x1; col++) {
      const q: Pt = [col * gap * 2 + shift, row * gap];
      if (!pointInPolygon(q, p.outline)) continue;
      // Tone falls from the base of the part to its tip.
      const along = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len;
      if (along > 0.82) continue;
      // A hair of length keeps the round cap on Canvas, which prunes zero-length lines.
      (along < 0.38 ? large : small).push(line([q, [q[0] + 0.01, q[1]]], false));
    }
  }
  return { large, small };
}

const riso: Material = {
  name: 'riso',
  korean: '리소 인쇄',
  surface: 'paper',
  paint(p, c) {
    const ramp = rampFor(p, c);
    const t = baseTone(p);
    // Leaves print paler so the blooms lead and overprints do not turn to black.
    const leaf = p.kind === 'leaf' || p.kind === 'sepal';
    const flat = ramp(leaf ? 0.66 : clamp(t + 0.26, 0.34, 0.62));
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: ramp(0.3), blend: 'multiply' }];
    if (thin(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: ramp(0.3), blend: 'multiply' }];
    const ops: DrawOp[] = [{ op: 'fill', subs: [body(p)], paint: flat, blend: 'multiply' }];
    if (p.size >= 12) {
      const gap = lerp(3.4, 2.4, c.detail);
      const { large, small } = halftone(p, gap);
      const screen: DrawOp[] = [];
      const dot = ramp(leaf ? 0.4 : 0.2);
      if (large.length) screen.push({ op: 'stroke', subs: large, paint: dot, width: gap * (leaf ? 0.6 : 0.92) });
      if (small.length) screen.push({ op: 'stroke', subs: small, paint: dot, width: gap * (leaf ? 0.34 : 0.5) });
      if (screen.length) ops.push({ op: 'group', clip: [body(p)], ops: screen, opacity: 0.86 });
    }
    // The key plate prints a little out of register.
    const slip = Math.min(1.8, 0.5 + p.size * 0.03);
    ops.push({ op: 'stroke', subs: [poly(transform(p.outline, slip, -slip * 0.7))], paint: ramp(0.12), width: Math.max(0.5, p.size * 0.012), blend: 'multiply' });
    return ops;
  },
};

// ---------------------------------------------------------------- inlay

const celadon: Material = {
  name: 'celadon',
  korean: '청자 상감',
  surface: 'celadon',
  paint(p, c) {
    const white = '#f1eee0';
    const black = '#33362f';
    const r = c.rng;
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: p.kind === 'anther' ? black : white }];
    if (thin(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: black }];
    const w = Math.max(0.4, p.size * 0.016);
    const glaze = mixHex(c.surface, '#1d3a33', 0.42);
    const leaf = p.kind === 'leaf' || p.kind === 'sepal';
    const inner: DrawOp[] = [];
    // Glaze pools in the carved channel, so the rim of each inlay reads darker and softer.
    inner.push({ op: 'stroke', subs: [body(p)], paint: glaze, width: Math.max(0.8, p.size * 0.08), opacity: 0.34 });
    for (const v of (p.veins ?? []).slice(0, 7)) inner.push({ op: 'stroke', subs: [line(v)], paint: black, width: w * 0.7, opacity: 0.9 });
    if (p.rib) inner.push({ op: 'stroke', subs: [line(p.rib)], paint: black, width: w });
    return [
      { op: 'fill', subs: [body(p)], paint: leaf ? mixHex(c.surface, black, 0.14) : white, opacity: leaf ? 1 : r.range(0.9, 1) },
      { op: 'group', clip: [body(p)], ops: inner },
      { op: 'stroke', subs: [body(p)], paint: black, width: w },
    ];
  },
};

// ---------------------------------------------------------------- light

const neon: Material = {
  name: 'neon',
  korean: '네온',
  surface: 'night',
  paint(p, c) {
    const ramp = rampFor(p, c);
    const col = relight(ramp(0.5), 0.12, 1.6);
    const closed = !thin(p);
    if (dots(p)) return [{ op: 'fill', subs: outlineSubs(p), paint: col }];
    const sub: Sub = closed ? poly(p.outline) : line(p.rib ?? p.outline);
    const w = Math.max(0.5, closed ? Math.min(1.5, p.size * 0.03) : (p.widths?.[0] ?? 1));
    const ops: DrawOp[] = [
      { op: 'stroke', subs: [sub], paint: col, width: w * 7, opacity: 0.1, blend: 'screen' },
      { op: 'stroke', subs: [sub], paint: col, width: w * 3, opacity: 0.32, blend: 'screen' },
      { op: 'stroke', subs: [sub], paint: mixHex(col, '#ffffff', 0.72), width: w },
    ];
    if (closed) ops.unshift({ op: 'fill', subs: [sub], paint: c.surface, opacity: 0.84 });
    return ops;
  },
};

export const MATERIALS = { watercolor, gouache, ink, engraving, gilt, stainedGlass, cloisonne, najeon, embroidery, papercut, riso, celadon, neon } as const satisfies Record<string, Material>;

export type MaterialName = keyof typeof MATERIALS;
export const MATERIAL_NAMES = Object.keys(MATERIALS) as MaterialName[];
export type MaterialRef = MaterialName | Material;

export function resolveMaterial(m: MaterialRef): Material {
  if (typeof m !== 'string') return m;
  const found = MATERIALS[m];
  if (!found) throw new Error(`flora: unknown material "${m}". Known: ${MATERIAL_NAMES.join(', ')}`);
  return found;
}
