/** Scene to any Canvas 2D context: browser, OffscreenCanvas in a worker, or node-canvas. */
import { cubicSegments } from './types.ts';
import type { Blend, DrawOp, Paint, Scene, Sub } from './types.ts';

/** The subset of CanvasRenderingContext2D that flora uses. */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function trace(ctx: Ctx2D, subs: readonly Sub[]): void {
  ctx.beginPath();
  for (const sub of subs) {
    if (sub.pts.length < 2) continue;
    if (sub.smooth && sub.pts.length > 2) {
      const { start, segs } = cubicSegments(sub);
      ctx.moveTo(start[0], start[1]);
      for (const s of segs) ctx.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
    } else {
      ctx.moveTo(sub.pts[0]![0], sub.pts[0]![1]);
      for (let i = 1; i < sub.pts.length; i++) ctx.lineTo(sub.pts[i]![0], sub.pts[i]![1]);
    }
    if (sub.closed) ctx.closePath();
  }
}

function style(ctx: Ctx2D, p: Paint): string | CanvasGradient {
  if (typeof p === 'string') return p;
  const g =
    p.type === 'linear'
      ? ctx.createLinearGradient(p.from[0], p.from[1], p.to[0], p.to[1])
      : ctx.createRadialGradient(p.center[0], p.center[1], 0, p.center[0], p.center[1], p.radius);
  for (const s of p.stops) {
    if (s.opacity === undefined || s.opacity >= 1) g.addColorStop(s.at, s.color);
    else g.addColorStop(s.at, s.color + Math.round(s.opacity * 255).toString(16).padStart(2, '0'));
  }
  return g;
}

const BLEND: Record<Blend, GlobalCompositeOperation> = {
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  'soft-light': 'soft-light',
};

function draw(ctx: Ctx2D, ops: readonly DrawOp[], alpha: number): void {
  for (const op of ops) {
    if (op.op === 'group') {
      ctx.save();
      if (op.matrix) ctx.transform(...op.matrix);
      if (op.clip) {
        trace(ctx, op.clip);
        ctx.clip();
      }
      draw(ctx, op.ops, alpha * (op.opacity ?? 1));
      ctx.restore();
      continue;
    }
    ctx.globalAlpha = alpha * (op.opacity ?? 1);
    ctx.globalCompositeOperation = op.blend ? BLEND[op.blend] : 'source-over';
    trace(ctx, op.subs);
    if (op.op === 'fill') {
      ctx.fillStyle = style(ctx, op.paint);
      ctx.fill();
    } else {
      ctx.strokeStyle = style(ctx, op.paint);
      ctx.lineWidth = op.width;
      ctx.lineCap = op.cap ?? 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** Paints at the scene's own size; scale the context first for HiDPI. */
export function drawScene(ctx: Ctx2D, scene: Scene): void {
  if (scene.background) {
    ctx.fillStyle = style(ctx, scene.background);
    ctx.fillRect(0, 0, scene.width, scene.height);
  }
  draw(ctx, scene.ops, 1);
}
