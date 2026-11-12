import { pageElementsAt, rafThrottle, scrollPosition } from '../lib/dom';
import {
  ALL_EDGES,
  type Axis,
  collectEdges,
  type EdgeSelection,
  type Point,
  type Rect,
  rectFromPoints,
  snapPoint,
  snapRect,
  toDocument,
  toRect,
  toViewport,
  translate,
  moveEdges,
} from '../lib/geometry';
import { formatNumber } from '../lib/units';
import { onDrag } from '../overlay/drag';
import { h, placeBox } from '../overlay/h';
import { hLine, label, vLine } from './draw';
import { BaseTool, pointFromEvent } from './tool';

/** A measurement rectangle in document coordinates, so it stays put while scrolling. */
interface Measurement {
  readonly id: number;
  rect: Rect;
}

/** A guide line; `position` is a document coordinate on `axis` (x → vertical line). */
interface Guide {
  readonly id: number;
  readonly axis: Axis;
  position: number;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const BAR_SIZE = 20;
const SNAP_DISTANCE = 6;
const MIN_SIZE = 2;
const NUDGE = 1;
const NUDGE_LARGE = 10;

const handleEdges = (handle: Handle): EdgeSelection => ({
  left: handle.includes('w'),
  right: handle.includes('e'),
  top: handle.includes('n'),
  bottom: handle.includes('s'),
});

const HANDLE_CURSOR: Readonly<Record<Handle, string>> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

const isHandle = (value: string | undefined): value is Handle => HANDLES.includes(value as Handle);

/**
 * Ruler — draw any number of measurement boxes and guides. Edges snap to the
 * elements under the pointer, other measurements and guides. Everything is stored in
 * document coordinates, so measurements stay attached to the page when scrolling.
 */
export class RulerTool extends BaseTool {
  readonly id = 'ruler';
  readonly hint = 'Drag to measure · drag from rulers for guides · [Alt] no snap · [⇧] [⌫] clear';

  private measurements: Measurement[] = [];
  private guides: Guide[] = [];
  private selectedId: number | null = null;
  private nextId = 1;
  private cursor: Point | null = null;

  private readonly measureElements = new Map<number, HTMLElement>();
  private readonly guideElements = new Map<number, HTMLElement>();
  private measureLayer: HTMLElement | null = null;
  private guideLayer: HTMLElement | null = null;
  private infoLayer: HTMLElement | null = null;
  private topCanvas: HTMLCanvasElement | null = null;
  private leftCanvas: HTMLCanvasElement | null = null;
  private signal: AbortSignal | null = null;

  protected onActivate(signal: AbortSignal, root: HTMLElement): void {
    this.signal = signal;
    this.infoLayer = h('div');
    this.measureLayer = h('div');
    this.guideLayer = h('div');
    this.topCanvas = h('canvas');
    this.leftCanvas = h('canvas');
    const topBar = h(
      'div',
      { class: 'ct-rulerbar ct-rulerbar--top', title: 'Drag down to add a guide' },
      [this.topCanvas],
    );
    const leftBar = h(
      'div',
      { class: 'ct-rulerbar ct-rulerbar--left', title: 'Drag right to add a guide' },
      [this.leftCanvas],
    );
    root.append(
      this.infoLayer,
      this.measureLayer,
      this.guideLayer,
      topBar,
      leftBar,
      h('div', { class: 'ct-rulerbar__corner' }),
    );

    this.bindDrawing(signal);
    this.bindGuideCreation(topBar, 'y', signal);
    this.bindGuideCreation(leftBar, 'x', signal);

    const trackCursor = rafThrottle((point: Point) => {
      this.cursor = point;
      this.renderInfo();
      this.drawRulers();
    });
    window.addEventListener(
      'pointermove',
      (e) => {
        trackCursor(pointFromEvent(e));
      },
      {
        signal,
        capture: true,
        passive: true,
      },
    );
    this.stage.addEventListener(
      'pointerleave',
      () => {
        this.cursor = null;
        this.renderInfo();
        this.drawRulers();
      },
      { signal },
    );
    this.onViewportChange(
      signal,
      rafThrottle(() => {
        this.render();
      }),
    );
    this.render();
  }

  protected override onDeactivate(): void {
    this.measureElements.clear();
    this.guideElements.clear();
    this.signal = null;
    this.cursor = null;
  }

  override reset(): void {
    this.measurements = [];
    this.guides = [];
    this.selectedId = null;
  }

  override refresh(): void {
    this.render();
  }

  override handleEscape(): boolean {
    if (this.selectedId === null) return false;
    this.select(null);
    return true;
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.metaKey || event.ctrlKey) return false;
    if ((event.key === 'Backspace' || event.key === 'Delete') && event.shiftKey) {
      this.measurements = [];
      this.guides = [];
      this.selectedId = null;
      this.render();
      this.ctx.toast('Cleared all measurements');
      return true;
    }
    const selected = this.selected();
    if (!selected) return false;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      this.measurements = this.measurements.filter((m) => m !== selected);
      this.selectedId = null;
      this.render();
      return true;
    }
    const step = event.shiftKey ? NUDGE_LARGE : NUDGE;
    const delta: Readonly<Record<string, Point>> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = delta[event.key];
    if (!move) return false;
    selected.rect = event.altKey
      ? {
          ...selected.rect,
          width: Math.max(1, selected.rect.width + move.x),
          height: Math.max(1, selected.rect.height + move.y),
        }
      : translate(selected.rect, move.x, move.y);
    this.render();
    return true;
  }

  // ---------- Interaction ----------

  private bindDrawing(signal: AbortSignal): void {
    let anchor: Point = { x: 0, y: 0 };
    let draft: Measurement | null = null;
    onDrag(
      this.stage,
      {
        start: (event) => {
          anchor = toDocument(this.snap(pointFromEvent(event), event), scrollPosition());
          draft = { id: this.nextId++, rect: { ...anchor, width: 0, height: 0 } };
          this.measurements.push(draft);
          this.selectedId = draft.id;
          this.render();
          return true;
        },
        move: (_delta, event) => {
          if (!draft) return;
          const point = toDocument(
            this.snap(pointFromEvent(event), event, draft.id),
            scrollPosition(),
          );
          draft.rect = rectFromPoints(anchor, point);
          this.render();
        },
        end: () => {
          if (draft && draft.rect.width < MIN_SIZE && draft.rect.height < MIN_SIZE) {
            const tiny = draft;
            this.measurements = this.measurements.filter((m) => m !== tiny);
            this.selectedId = null;
            this.render();
          }
          draft = null;
        },
      },
      signal,
    );
  }

  private bindGuideCreation(bar: HTMLElement, axis: Axis, signal: AbortSignal): void {
    let guide: Guide | null = null;
    onDrag(
      bar,
      {
        start: (event) => {
          guide = {
            id: this.nextId++,
            axis,
            position: this.guidePosition(axis, pointFromEvent(event)),
          };
          this.guides.push(guide);
          this.render();
          return true;
        },
        move: (_delta, event) => {
          if (!guide) return;
          guide.position = this.guidePosition(axis, pointFromEvent(event));
          this.render();
        },
        end: (event) => {
          if (guide) this.dropGuide(guide, pointFromEvent(event));
          guide = null;
        },
      },
      signal,
    );
  }

  private guidePosition(axis: Axis, point: Point): number {
    const scroll = scrollPosition();
    return axis === 'x' ? point.x + scroll.x : point.y + scroll.y;
  }

  /** Guides dropped back onto their ruler are removed. */
  private dropGuide(guide: Guide, point: Point): void {
    const onRuler = guide.axis === 'x' ? point.x < BAR_SIZE : point.y < BAR_SIZE;
    if (onRuler) {
      this.guides = this.guides.filter((g) => g !== guide);
      this.render();
    }
  }

  private select(id: number | null): void {
    this.selectedId = id;
    this.render();
  }

  private selected(): Measurement | undefined {
    return this.measurements.find((m) => m.id === this.selectedId);
  }

  private snappingEnabled(event: { altKey: boolean }): boolean {
    return this.ctx.settings().snapping && !event.altKey;
  }

  /** Edges near `point` that measurements can snap to, in viewport coordinates. */
  private snapCandidates(point: Point, excludeId?: number): { xs: number[]; ys: number[] } {
    const rects: Rect[] = [];
    for (const element of pageElementsAt(point, this.ctx.host.element).slice(0, 8)) {
      rects.push(toRect(element.getBoundingClientRect()));
      for (const child of [...element.children].slice(0, 40))
        rects.push(toRect(child.getBoundingClientRect()));
    }
    const scroll = scrollPosition();
    for (const m of this.measurements) {
      if (m.id !== excludeId) rects.push(toViewport(m.rect, scroll));
    }
    const edges = collectEdges(rects);
    for (const guide of this.guides) {
      if (guide.axis === 'x') edges.xs.push(guide.position - scroll.x);
      else edges.ys.push(guide.position - scroll.y);
    }
    edges.xs.push(0, window.innerWidth);
    edges.ys.push(0, window.innerHeight);
    return edges;
  }

  private snap(point: Point, event: { altKey: boolean }, excludeId?: number): Point {
    if (!this.snappingEnabled(event)) return point;
    return snapPoint(point, this.snapCandidates(point, excludeId), SNAP_DISTANCE);
  }

  // ---------- Rendering ----------

  private render(): void {
    this.syncMeasurements();
    this.syncGuides();
    this.renderInfo();
    this.drawRulers();
  }

  private syncMeasurements(): void {
    const layer = this.measureLayer;
    if (!layer) return;
    const scroll = scrollPosition();
    const live = new Set(this.measurements.map((m) => m.id));
    for (const [id, element] of this.measureElements) {
      if (!live.has(id)) {
        element.remove();
        this.measureElements.delete(id);
      }
    }
    for (const measurement of this.measurements) {
      let element = this.measureElements.get(measurement.id);
      if (!element) {
        element = this.createMeasureElement(measurement);
        this.measureElements.set(measurement.id, element);
        layer.append(element);
      }
      const { rect } = measurement;
      placeBox(element, toViewport(rect, scroll));
      element.classList.toggle('is-selected', measurement.id === this.selectedId);
      const [sizeLabel, positionLabel] =
        element.querySelectorAll<HTMLElement>('.ct-measure__label');
      if (sizeLabel) sizeLabel.textContent = this.size(rect.width, rect.height);
      if (positionLabel)
        positionLabel.textContent = `x ${formatNumber(rect.x)}  y ${formatNumber(rect.y)}`;
    }
  }

  private createMeasureElement(measurement: Measurement): HTMLElement {
    const handles = HANDLES.map((handle) => {
      const element = h('div', {
        class: `ct-handle ct-handle--${handle}`,
        attrs: { 'data-handle': handle },
      });
      element.style.cursor = HANDLE_CURSOR[handle];
      return element;
    });
    const element = h('div', { class: 'ct-measure' }, [
      h('div', { class: 'ct-measure__label ct-measure__label--size' }),
      h('div', { class: 'ct-measure__label ct-measure__label--pos' }),
      ...handles,
    ]);

    let startRect: Rect = measurement.rect;
    let edges: EdgeSelection = ALL_EDGES;
    let isResize = false;
    onDrag(
      element,
      {
        start: (event) => {
          const handle = (event.target as HTMLElement).dataset.handle;
          isResize = isHandle(handle);
          edges = isHandle(handle) ? handleEdges(handle) : ALL_EDGES;
          startRect = measurement.rect;
          this.select(measurement.id);
          return true;
        },
        move: (delta, event) => {
          const scroll = scrollPosition();
          let next = isResize
            ? moveEdges(startRect, edges, delta.x, delta.y)
            : translate(startRect, delta.x, delta.y);
          if (this.snappingEnabled(event)) {
            const candidates = this.snapCandidates(pointFromEvent(event), measurement.id);
            next = toDocument(
              snapRect(toViewport(next, scroll), edges, candidates, SNAP_DISTANCE),
              scroll,
            );
          }
          measurement.rect = next;
          this.render();
        },
      },
      this.signal ?? undefined,
    );
    return element;
  }

  private syncGuides(): void {
    const layer = this.guideLayer;
    if (!layer) return;
    const scroll = scrollPosition();
    const live = new Set(this.guides.map((g) => g.id));
    for (const [id, element] of this.guideElements) {
      if (!live.has(id)) {
        element.remove();
        this.guideElements.delete(id);
      }
    }
    for (const guide of this.guides) {
      let element = this.guideElements.get(guide.id);
      if (!element) {
        element = this.createGuideElement(guide);
        this.guideElements.set(guide.id, element);
        layer.append(element);
      }
      const viewport = guide.axis === 'x' ? guide.position - scroll.x : guide.position - scroll.y;
      element.style[guide.axis === 'x' ? 'left' : 'top'] = `${viewport}px`;
      const text = element.firstElementChild;
      if (text) text.textContent = formatNumber(guide.position);
    }
  }

  private createGuideElement(guide: Guide): HTMLElement {
    const element = h(
      'div',
      {
        class: `ct-guide ct-guide--${guide.axis}`,
        title: 'Drag to move · double-click or drag onto the ruler to remove',
      },
      [h('span', { class: 'ct-guide__label' })],
    );
    let start = guide.position;
    onDrag(
      element,
      {
        start: () => {
          start = guide.position;
          return true;
        },
        move: (delta) => {
          guide.position = start + (guide.axis === 'x' ? delta.x : delta.y);
          this.render();
        },
        end: (event) => {
          this.dropGuide(guide, pointFromEvent(event));
        },
      },
      this.signal ?? undefined,
    );
    element.addEventListener('dblclick', () => {
      this.guides = this.guides.filter((g) => g !== guide);
      this.render();
    });
    return element;
  }

  /** Cursor crosshair and the distances between neighbouring guides. */
  private renderInfo(): void {
    const layer = this.infoLayer;
    if (!layer) return;
    const nodes: HTMLElement[] = [];
    const scroll = scrollPosition();

    for (const axis of ['x', 'y'] as const) {
      const positions = this.guides
        .filter((g) => g.axis === axis)
        .map((g) => g.position)
        .sort((a, b) => a - b);
      for (let i = 1; i < positions.length; i++) {
        const from = (positions[i - 1] ?? 0) - (axis === 'x' ? scroll.x : scroll.y);
        const to = (positions[i] ?? 0) - (axis === 'x' ? scroll.x : scroll.y);
        const text = this.length(to - from, axis);
        nodes.push(
          axis === 'x'
            ? label(text, (from + to) / 2, BAR_SIZE + 16, 'ct-label--danger')
            : label(text, BAR_SIZE + 34, (from + to) / 2, 'ct-label--danger'),
        );
      }
    }

    if (this.cursor) {
      const { x, y } = this.cursor;
      nodes.push(
        hLine(BAR_SIZE, window.innerWidth, y, 'ct-line--dashed ct-line--muted'),
        vLine(BAR_SIZE, window.innerHeight, x, 'ct-line--dashed ct-line--muted'),
        label(
          `${formatNumber(x + scroll.x)}, ${formatNumber(y + scroll.y)}`,
          x + 44,
          y + 16,
          'ct-label--dark',
        ),
      );
    }
    layer.replaceChildren(...nodes);
  }

  private drawRulers(): void {
    const scroll = scrollPosition();
    const styles = getComputedStyle(this.ctx.host.root);
    const colors = {
      text: styles.getPropertyValue('--ct-text-muted').trim() || '#888',
      accent: styles.getPropertyValue('--ct-accent').trim() || '#6d5efc',
    };
    if (this.topCanvas) {
      drawRuler(
        this.topCanvas,
        'x',
        scroll.x + BAR_SIZE,
        colors,
        this.cursor ? this.cursor.x - BAR_SIZE : null,
        this.selectedSpan('x'),
      );
    }
    if (this.leftCanvas) {
      drawRuler(
        this.leftCanvas,
        'y',
        scroll.y + BAR_SIZE,
        colors,
        this.cursor ? this.cursor.y - BAR_SIZE : null,
        this.selectedSpan('y'),
      );
    }
  }

  /** Selected measurement projected onto a ruler (in ruler pixels), for highlighting. */
  private selectedSpan(axis: Axis): [number, number] | null {
    const selected = this.selected();
    if (!selected) return null;
    const scroll = scrollPosition();
    const start = axis === 'x' ? selected.rect.x - scroll.x : selected.rect.y - scroll.y;
    const size = axis === 'x' ? selected.rect.width : selected.rect.height;
    return [start - BAR_SIZE, start - BAR_SIZE + size];
  }
}

/**
 * Draws ticks every 10px (labels every 100px) on a ruler canvas.
 * `origin` is the document coordinate at the ruler's first pixel.
 */
function drawRuler(
  canvas: HTMLCanvasElement,
  axis: Axis,
  origin: number,
  colors: { text: string; accent: string },
  cursor: number | null,
  span: [number, number] | null,
): void {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(box.width * ratio);
  const height = Math.round(box.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);

  const horizontal = axis === 'x';
  const length = horizontal ? box.width : box.height;
  const thickness = horizontal ? box.height : box.width;

  if (span) {
    context.fillStyle = colors.accent;
    context.globalAlpha = 0.25;
    if (horizontal) context.fillRect(span[0], 0, span[1] - span[0], thickness);
    else context.fillRect(0, span[0], thickness, span[1] - span[0]);
    context.globalAlpha = 1;
  }

  context.strokeStyle = colors.text;
  context.fillStyle = colors.text;
  context.lineWidth = 1;
  context.font = '9px ui-monospace, Menlo, monospace';
  context.beginPath();
  const first = Math.floor(origin / 10) * 10;
  for (let value = first; value <= origin + length; value += 10) {
    const position = Math.round(value - origin) + 0.5;
    const tick =
      value % 100 === 0 ? thickness * 0.6 : value % 50 === 0 ? thickness * 0.35 : thickness * 0.2;
    if (horizontal) {
      context.moveTo(position, thickness);
      context.lineTo(position, thickness - tick);
    } else {
      context.moveTo(thickness, position);
      context.lineTo(thickness - tick, position);
    }
    if (value % 100 === 0) {
      if (horizontal) {
        context.fillText(String(value), position + 3, 9);
      } else {
        context.save();
        context.translate(9, position + 3);
        context.rotate(-Math.PI / 2);
        context.textAlign = 'right';
        context.fillText(String(value), 0, 0);
        context.restore();
      }
    }
  }
  context.stroke();

  if (cursor !== null) {
    context.strokeStyle = colors.accent;
    context.lineWidth = 1.5;
    context.beginPath();
    if (horizontal) {
      context.moveTo(cursor, 0);
      context.lineTo(cursor, thickness);
    } else {
      context.moveTo(0, cursor);
      context.lineTo(thickness, cursor);
    }
    context.stroke();
  }
}
