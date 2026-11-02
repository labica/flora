/**
 * The free-space field. Wong et al. keep a low-resolution buffer and its medial axis to find the
 * largest empty circle; here each cell stores its exact distance to the nearest obstacle, which
 * gives the same circle, and placing a proxy only touches nearby cells.
 */
import type { Pt } from '../core/geom.ts';
import type { Region } from './region.ts';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** 1-D squared distance transform (Felzenszwalb & Huttenlocher, 2012). */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = 0;
    for (;;) {
      const p = v[k]!;
      s = (f[q]! + q * q - f[p]! - p * p) / (2 * q - 2 * p);
      if (s > z[k]!) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const p = v[k]!;
    d[q] = (q - p) * (q - p) + f[p]!;
  }
}

export interface FieldOptions {
  wrapX?: boolean;
  wrapY?: boolean;
}

export class Field {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly height: number;
  readonly wrapX: boolean;
  readonly wrapY: boolean;
  readonly free: Float32Array;
  readonly inside: Uint8Array;
  /** Distance to the nearest stem, for the "within reach" test. */
  readonly reach: Float32Array;

  constructor(region: Region, cell: number, options: FieldOptions = {}) {
    const [x0, y0, x1, y1] = region.bounds;
    this.x0 = x0;
    this.y0 = y0;
    this.width = x1 - x0;
    this.height = y1 - y0;
    this.cell = cell;
    this.cols = Math.max(2, Math.ceil(this.width / cell));
    this.rows = Math.max(2, Math.ceil(this.height / cell));
    this.wrapX = !!options.wrapX;
    this.wrapY = !!options.wrapY;
    const n = this.cols * this.rows;
    this.free = new Float32Array(n);
    this.reach = new Float32Array(n).fill(Infinity);
    this.inside = new Uint8Array(n);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        this.inside[j * this.cols + i] = region.contains(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell) ? 1 : 0;
      }
    }
    this.initDistances();
  }

  private initDistances(): void {
    // A wrapped axis is solved on three copies, so distances run across the seam.
    const tx = this.wrapX ? 3 : 1;
    const ty = this.wrapY ? 3 : 1;
    const W = this.cols * tx + 2;
    const H = this.rows * ty + 2;
    const g = new Float64Array(W * H);
    const INF = 1e12;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const ii = i - 1;
        const jj = j - 1;
        const out = (!this.wrapX && (ii < 0 || ii >= this.cols)) || (!this.wrapY && (jj < 0 || jj >= this.rows)) || ii < 0 || jj < 0 || ii >= this.cols * tx || jj >= this.rows * ty;
        const open = !out && this.inside[((jj % this.rows) * this.cols) + (ii % this.cols)] === 1;
        g[j * W + i] = open ? INF : 0;
      }
    }
    const m = Math.max(W, H);
    const f = new Float64Array(m);
    const d = new Float64Array(m);
    const v = new Int32Array(m);
    const z = new Float64Array(m + 1);
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) f[j] = g[j * W + i]!;
      edt1(f, H, d, v, z);
      for (let j = 0; j < H; j++) g[j * W + i] = d[j]!;
    }
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) f[i] = g[j * W + i]!;
      edt1(f, W, d, v, z);
      for (let i = 0; i < W; i++) g[j * W + i] = d[i]!;
    }
    const ox = this.wrapX ? this.cols : 0;
    const oy = this.wrapY ? this.rows : 0;
    const cap = Math.max(this.width, this.height);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const v2 = g[(j + oy + 1) * W + (i + ox + 1)]!;
        const r = v2 >= INF ? cap : (Math.sqrt(v2) - 0.5) * this.cell;
        this.free[j * this.cols + i] = this.inside[j * this.cols + i] ? Math.min(cap, r) : -1;
      }
    }
  }

  private wrapped(x: number, y: number): Pt {
    let px = x;
    let py = y;
    if (this.wrapX) px = this.x0 + ((((px - this.x0) % this.width) + this.width) % this.width);
    if (this.wrapY) py = this.y0 + ((((py - this.y0) % this.height) + this.height) % this.height);
    return [px, py];
  }

  index(x: number, y: number): number {
    const [px, py] = this.wrapped(x, y);
    const i = Math.floor((px - this.x0) / this.cell);
    const j = Math.floor((py - this.y0) / this.cell);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -1;
    return j * this.cols + i;
  }

  /** Free radius at a point; negative outside the region. */
  at(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? -1 : this.free[i]!;
  }

  gradient(x: number, y: number, h = this.cell * 2): Pt {
    const dx = this.at(x + h, y) - this.at(x - h, y);
    const dy = this.at(x, y + h) - this.at(x, y - h);
    const l = Math.hypot(dx, dy);
    return l < 1e-6 ? [0, 0] : [dx / l, dy / l];
  }

  private forNear(x: number, y: number, R: number, fn: (index: number, d: number) => void): void {
    const copiesX = this.wrapX ? [-this.width, 0, this.width] : [0];
    const copiesY = this.wrapY ? [-this.height, 0, this.height] : [0];
    for (const ox of copiesX) {
      for (const oy of copiesY) {
        const cx = x + ox;
        const cy = y + oy;
        const i0 = Math.max(0, Math.floor((cx - R - this.x0) / this.cell));
        const i1 = Math.min(this.cols - 1, Math.ceil((cx + R - this.x0) / this.cell));
        const j0 = Math.max(0, Math.floor((cy - R - this.y0) / this.cell));
        const j1 = Math.min(this.rows - 1, Math.ceil((cy + R - this.y0) / this.cell));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const px = this.x0 + (i + 0.5) * this.cell;
            const py = this.y0 + (j + 0.5) * this.cell;
            fn(j * this.cols + i, Math.hypot(px - cx, py - cy));
          }
        }
      }
    }
  }

  /** Records a disc proxy. `soft` below 1 lets later elements tuck slightly under it. */
  stampDisc(x: number, y: number, r: number, soft = 0.85, influence?: number): void {
    const R = r * soft;
    const reach = influence ?? Math.max(this.width, this.height) * 0.35;
    this.forNear(x, y, R + reach, (i, d) => {
      const v = d - R;
      if (v < this.free[i]!) this.free[i] = v;
    });
  }

  /** Records a line proxy of the given half-width. */
  stampLine(pts: readonly Pt[], halfWidth: number, step = this.cell): void {
    let last: Pt | null = null;
    for (const p of pts) {
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < step) continue;
      this.stampDisc(p[0], p[1], halfWidth, 1);
      last = p;
    }
    const end = pts[pts.length - 1];
    if (end) this.stampDisc(end[0], end[1], halfWidth, 1);
  }

  markReach(p: Pt, limit: number): void {
    this.forNear(p[0], p[1], limit, (i, d) => {
      if (d < this.reach[i]!) this.reach[i] = d;
    });
  }

  /** The largest empty circle within `reachLimit` of a stem, and not on the exclude list. */
  largest(reachLimit: number, excluded: readonly Circle[]): Circle | null {
    let best = -Infinity;
    let hit = -1;
    const { free, reach, cols, rows, inside } = this;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const r = free[k]!;
        if (r <= best || !inside[k] || reach[k]! > reachLimit) continue;
        const x = this.x0 + (i + 0.5) * this.cell;
        const y = this.y0 + (j + 0.5) * this.cell;
        let bad = false;
        for (const e of excluded) {
          if (Math.hypot(x - e.x, y - e.y) < Math.max(e.r, r * 0.8)) {
            bad = true;
            break;
          }
        }
        if (bad) continue;
        best = r;
        hit = k;
      }
    }
    if (hit < 0) return null;
    return { x: this.x0 + ((hit % cols) + 0.5) * this.cell, y: this.y0 + (Math.floor(hit / cols) + 0.5) * this.cell, r: best };
  }

  /** The share of the region's area still free of any element, at clearance `r`. */
  emptiness(r: number): number {
    let open = 0;
    let all = 0;
    for (let i = 0; i < this.free.length; i++) {
      if (!this.inside[i]) continue;
      all++;
      if (this.free[i]! > r) open++;
    }
    return all ? open / all : 0;
  }
}
