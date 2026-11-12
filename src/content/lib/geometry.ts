export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Axis-aligned rectangle; x/y is the top-left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Axis = 'x' | 'y';

/** A measured gap between two edges, drawn as a line along `axis` at cross-axis position `at`. */
export interface Gap {
  readonly axis: Axis;
  readonly from: number;
  readonly to: number;
  readonly at: number;
  readonly length: number;
}

export const right = (r: Rect): number => r.x + r.width;
export const bottom = (r: Rect): number => r.y + r.height;
export const centerX = (r: Rect): number => r.x + r.width / 2;
export const centerY = (r: Rect): number => r.y + r.height / 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function toRect(domRect: { x: number; y: number; width: number; height: number }): Rect {
  return { x: domRect.x, y: domRect.y, width: domRect.width, height: domRect.height };
}

/** Normalised rectangle spanning two arbitrary corner points. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function translate(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

/** Converts between viewport and document coordinates given the current scroll offset. */
export function toDocument<T extends Point>(value: T, scroll: Point): T {
  return { ...value, x: value.x + scroll.x, y: value.y + scroll.y };
}

export function toViewport<T extends Point>(value: T, scroll: Point): T {
  return { ...value, x: value.x - scroll.x, y: value.y - scroll.y };
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x && point.x <= right(rect) && point.y >= rect.y && point.y <= bottom(rect)
  );
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    right(inner) <= right(outer) &&
    bottom(inner) <= bottom(outer)
  );
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;
}

/** Shrinks a rectangle by per-side insets (used for box-model layers). Never returns negative sizes. */
export function inset(
  rect: Rect,
  sides: { top: number; right: number; bottom: number; left: number },
): Rect {
  return {
    x: rect.x + sides.left,
    y: rect.y + sides.top,
    width: Math.max(0, rect.width - sides.left - sides.right),
    height: Math.max(0, rect.height - sides.top - sides.bottom),
  };
}

/** Returns `value` moved to the closest candidate within `threshold`, or unchanged. */
export function snapValue(value: number, candidates: Iterable<number>, threshold: number): number {
  let best = value;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function snapPoint(
  point: Point,
  edges: { readonly xs: Iterable<number>; readonly ys: Iterable<number> },
  threshold: number,
): Point {
  return { x: snapValue(point.x, edges.xs, threshold), y: snapValue(point.y, edges.ys, threshold) };
}

export function collectEdges(rects: Iterable<Rect>): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rects) {
    xs.push(r.x, centerX(r), right(r));
    ys.push(r.y, centerY(r), bottom(r));
  }
  return { xs, ys };
}

function overlapMidpoint(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number | null {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return start <= end ? (start + end) / 2 : null;
}

function gap(axis: Axis, from: number, to: number, at: number): Gap {
  return { axis, from, to, at, length: to - from };
}

/** Distances from each edge of `inner` to the matching edge of `outer`. */
function insideGaps(outer: Rect, inner: Rect): Gap[] {
  return [
    gap('y', outer.y, inner.y, centerX(inner)),
    gap('y', bottom(inner), bottom(outer), centerX(inner)),
    gap('x', outer.x, inner.x, centerY(inner)),
    gap('x', right(inner), right(outer), centerY(inner)),
  ].filter((g) => g.length > 0);
}

/**
 * Figma-style spacing between two boxes:
 *  - nested boxes  → gap from every edge of the inner box to the outer box
 *  - separate boxes → horizontal and/or vertical gap between the facing edges
 *  - overlapping boxes → offsets between their left and top edges
 */
export function distanceBetween(a: Rect, b: Rect): Gap[] {
  if (containsRect(a, b)) return insideGaps(a, b);
  if (containsRect(b, a)) return insideGaps(b, a);

  const gaps: Gap[] = [];
  const crossY = overlapMidpoint(a.y, bottom(a), b.y, bottom(b)) ?? centerY(b);
  const crossX = overlapMidpoint(a.x, right(a), b.x, right(b)) ?? centerX(b);

  if (b.x >= right(a)) gaps.push(gap('x', right(a), b.x, crossY));
  else if (right(b) <= a.x) gaps.push(gap('x', right(b), a.x, crossY));

  if (b.y >= bottom(a)) gaps.push(gap('y', bottom(a), b.y, crossX));
  else if (bottom(b) <= a.y) gaps.push(gap('y', bottom(b), a.y, crossX));

  if (gaps.length === 0) {
    if (a.x !== b.x) gaps.push(gap('x', Math.min(a.x, b.x), Math.max(a.x, b.x), crossY));
    if (a.y !== b.y) gaps.push(gap('y', Math.min(a.y, b.y), Math.max(a.y, b.y), crossX));
  }
  return gaps;
}

/** Which edges of a rectangle an interaction moves. */
export interface EdgeSelection {
  readonly left: boolean;
  readonly right: boolean;
  readonly top: boolean;
  readonly bottom: boolean;
}

export const ALL_EDGES: EdgeSelection = { left: true, right: true, top: true, bottom: true };

/** Moves the selected edges by (dx, dy); the result is normalised if edges cross. */
export function moveEdges(rect: Rect, edges: EdgeSelection, dx: number, dy: number): Rect {
  const left = rect.x + (edges.left ? dx : 0);
  const rightEdge = right(rect) + (edges.right ? dx : 0);
  const top = rect.y + (edges.top ? dy : 0);
  const bottomEdge = bottom(rect) + (edges.bottom ? dy : 0);
  return rectFromPoints({ x: left, y: top }, { x: rightEdge, y: bottomEdge });
}

function smallestShift(a: number, b: number): number {
  if (a === 0) return b;
  if (b === 0) return a;
  return Math.abs(a) <= Math.abs(b) ? a : b;
}

function snapSpan(
  start: number,
  end: number,
  moveStart: boolean,
  moveEnd: boolean,
  candidates: readonly number[],
  threshold: number,
): [number, number] {
  const startShift = moveStart ? snapValue(start, candidates, threshold) - start : 0;
  const endShift = moveEnd ? snapValue(end, candidates, threshold) - end : 0;
  if (moveStart && moveEnd) {
    const shift = smallestShift(startShift, endShift);
    return [start + shift, end + shift];
  }
  return [start + startShift, end + endShift];
}

/**
 * Snaps the moving edges of a rectangle to nearby candidate lines. When both opposite
 * edges move (dragging the whole rectangle) it is translated, preserving its size.
 */
export function snapRect(
  rect: Rect,
  edges: EdgeSelection,
  candidates: { readonly xs: readonly number[]; readonly ys: readonly number[] },
  threshold: number,
): Rect {
  const [x1, x2] = snapSpan(rect.x, right(rect), edges.left, edges.right, candidates.xs, threshold);
  const [y1, y2] = snapSpan(
    rect.y,
    bottom(rect),
    edges.top,
    edges.bottom,
    candidates.ys,
    threshold,
  );
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
