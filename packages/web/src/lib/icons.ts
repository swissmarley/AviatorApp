import { ICON_KINDS, type IconKind } from '@contrail/shared';

export const ATLAS_CELL = 64;

/**
 * Builds the aircraft sprite atlas: one 64×64 cell per icon kind, white silhouettes pointing
 * up (north) so the shader can rotate by heading. Drawn procedurally — no image assets needed.
 */
export function buildAtlas(): { canvas: HTMLCanvasElement; index: Record<IconKind, number> } {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_CELL * ICON_KINDS.length;
  canvas.height = ATLAS_CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  const index = {} as Record<IconKind, number>;
  ICON_KINDS.forEach((kind, i) => {
    index[kind] = i;
    ctx.save();
    ctx.translate(i * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2);
    ctx.fill(SHAPES[kind]());
    ctx.restore();
  });
  return { canvas, index };
}

/** Shapes are defined in a -24..24 box, nose at the top (negative y). */
const SHAPES: Record<IconKind, () => Path2D> = {
  jet: () => airliner(1, 0.72),
  heavy: () => airliner(1.15, 0.9),
  military: () => fighter(),
  prop: () => prop(1),
  light: () => prop(0.82),
  heli: () => heli(),
  glider: () => glider(),
  ground: () => ground(),
};

function airliner(scale: number, wingSweep: number): Path2D {
  const p = new Path2D();
  const s = scale;
  // fuselage
  p.moveTo(0, -24 * s);
  p.bezierCurveTo(2.6 * s, -24 * s, 3 * s, -18 * s, 3 * s, -12 * s);
  p.lineTo(3 * s, -4 * s);
  // right wing
  p.lineTo(24 * s, 8 * s * wingSweep + 2);
  p.lineTo(24 * s, 12 * s * wingSweep + 2);
  p.lineTo(3 * s, 7 * s);
  p.lineTo(3 * s, 15 * s);
  // right stabilizer
  p.lineTo(10 * s, 21 * s);
  p.lineTo(10 * s, 23.5 * s);
  p.lineTo(2 * s, 21 * s);
  p.lineTo(0, 24 * s);
  // mirror
  p.lineTo(-2 * s, 21 * s);
  p.lineTo(-10 * s, 23.5 * s);
  p.lineTo(-10 * s, 21 * s);
  p.lineTo(-3 * s, 15 * s);
  p.lineTo(-3 * s, 7 * s);
  p.lineTo(-24 * s, 12 * s * wingSweep + 2);
  p.lineTo(-24 * s, 8 * s * wingSweep + 2);
  p.lineTo(-3 * s, -4 * s);
  p.lineTo(-3 * s, -12 * s);
  p.bezierCurveTo(-3 * s, -18 * s, -2.6 * s, -24 * s, 0, -24 * s);
  p.closePath();
  return p;
}

function prop(scale: number): Path2D {
  const p = new Path2D();
  const s = scale;
  p.moveTo(0, -22 * s);
  p.bezierCurveTo(2.5 * s, -22 * s, 3 * s, -16 * s, 3 * s, -10 * s);
  p.lineTo(3 * s, -6 * s);
  p.lineTo(23 * s, -4 * s);
  p.lineTo(23 * s, 1 * s);
  p.lineTo(3 * s, 3 * s);
  p.lineTo(2.5 * s, 16 * s);
  p.lineTo(9 * s, 19 * s);
  p.lineTo(9 * s, 22 * s);
  p.lineTo(0, 21 * s);
  p.lineTo(-9 * s, 22 * s);
  p.lineTo(-9 * s, 19 * s);
  p.lineTo(-2.5 * s, 16 * s);
  p.lineTo(-3 * s, 3 * s);
  p.lineTo(-23 * s, 1 * s);
  p.lineTo(-23 * s, -4 * s);
  p.lineTo(-3 * s, -6 * s);
  p.lineTo(-3 * s, -10 * s);
  p.bezierCurveTo(-3 * s, -16 * s, -2.5 * s, -22 * s, 0, -22 * s);
  p.closePath();
  return p;
}

function fighter(): Path2D {
  const p = new Path2D();
  p.moveTo(0, -24);
  p.lineTo(3, -14);
  p.lineTo(3.5, 2);
  p.lineTo(20, 12);
  p.lineTo(20, 16);
  p.lineTo(4, 12);
  p.lineTo(4, 17);
  p.lineTo(10, 22);
  p.lineTo(10, 24);
  p.lineTo(0, 21);
  p.lineTo(-10, 24);
  p.lineTo(-10, 22);
  p.lineTo(-4, 17);
  p.lineTo(-4, 12);
  p.lineTo(-20, 16);
  p.lineTo(-20, 12);
  p.lineTo(-3.5, 2);
  p.lineTo(-3, -14);
  p.closePath();
  return p;
}

function heli(): Path2D {
  const p = new Path2D();
  // body
  p.moveTo(0, -12);
  p.bezierCurveTo(6, -12, 7, -6, 7, 0);
  p.bezierCurveTo(7, 6, 5, 9, 2, 10);
  p.lineTo(1.5, 22);
  p.lineTo(6, 24);
  p.lineTo(-6, 24);
  p.lineTo(-1.5, 22);
  p.lineTo(-2, 10);
  p.bezierCurveTo(-5, 9, -7, 6, -7, 0);
  p.bezierCurveTo(-7, -6, -6, -12, 0, -12);
  p.closePath();
  // rotor blades (thin cross)
  p.rect(-1.2, -24, 2.4, 44);
  p.rect(-22, -1.2, 44, 2.4);
  return p;
}

function glider(): Path2D {
  const p = new Path2D();
  p.moveTo(0, -20);
  p.bezierCurveTo(1.6, -20, 2, -14, 2, -8);
  p.lineTo(2, -4);
  p.lineTo(24, -2);
  p.lineTo(24, 0.5);
  p.lineTo(2, 0);
  p.lineTo(1.5, 18);
  p.lineTo(7, 20);
  p.lineTo(7, 22);
  p.lineTo(0, 21.5);
  p.lineTo(-7, 22);
  p.lineTo(-7, 20);
  p.lineTo(-1.5, 18);
  p.lineTo(-2, 0);
  p.lineTo(-24, 0.5);
  p.lineTo(-24, -2);
  p.lineTo(-2, -4);
  p.lineTo(-2, -8);
  p.bezierCurveTo(-2, -14, -1.6, -20, 0, -20);
  p.closePath();
  return p;
}

function ground(): Path2D {
  const p = new Path2D();
  p.roundRect(-9, -13, 18, 26, 4);
  return p;
}

/** SVG string for a single icon kind, for use in HTML lists/legend. */
export function iconSvg(kind: IconKind, color = 'currentColor', size = 20): string {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS_CELL;
  const ctx = c.getContext('2d')!;
  ctx.translate(ATLAS_CELL / 2, ATLAS_CELL / 2);
  ctx.fillStyle = color;
  ctx.fill(SHAPES[kind]());
  return `<img width="${size}" height="${size}" src="${c.toDataURL()}" alt="${kind}">`;
}
