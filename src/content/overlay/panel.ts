import { createIcon, type IconName } from '../../shared/icons';
import { clamp, intersects, type Point, type Rect, toRect } from '../lib/geometry';
import { iconButton } from './components';
import { onDrag } from './drag';
import { h, placeAt } from './h';

export type PanelAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface PanelOptions {
  readonly title: string;
  readonly icon: IconName;
  readonly onClose?: () => void;
  /** Initial docking corner. Defaults to top-right. */
  readonly anchor?: PanelAnchor;
}

const EDGE_GAP = 12;
/** Space kept free at the bottom for the toolbar when docking to a bottom corner. */
const BOTTOM_RESERVE = 96;

const PANEL_GAP = 8;

/** Mounted panels in mount order; used to stack panels that share a side of the viewport. */
const mounted = new Set<Panel>();

/**
 * Lays out every docked panel: panels on the same side form a column (top-anchored ones
 * stack downwards, bottom-anchored ones upwards) and share the available height, so they
 * never overlap. Panels the user dragged keep their own position.
 */
function layoutPanels(): void {
  for (const side of ['left', 'right'] as const) {
    const column = [...mounted].filter((panel) => panel.dockedSide === side);
    const available = window.innerHeight - EDGE_GAP - BOTTOM_RESERVE;
    const share = Math.floor(
      (available - PANEL_GAP * (column.length - 1)) / Math.max(1, column.length),
    );
    let top = EDGE_GAP;
    let bottom = window.innerHeight - BOTTOM_RESERVE;
    for (const panel of column) panel.setMaxHeight(column.length > 1 ? share : null);
    for (const panel of column.filter((p) => p.dockedVertical === 'top')) {
      panel.placeDocked(top);
      top += panel.height + PANEL_GAP;
    }
    for (const panel of column.filter((p) => p.dockedVertical === 'bottom')) {
      bottom -= panel.height;
      panel.placeDocked(Math.max(EDGE_GAP, bottom));
      bottom -= PANEL_GAP;
    }
  }
}

const flipSide = (anchor: PanelAnchor): PanelAnchor =>
  anchor.endsWith('right')
    ? (anchor.replace('right', 'left') as PanelAnchor)
    : (anchor.replace('left', 'right') as PanelAnchor);

/** Floating, draggable, minimisable information card used by every tool. */
export class Panel {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  private readonly toolActions = h('span', { class: 'ct-panel__actions' });
  private readonly titleElement: HTMLElement;
  private readonly controller = new AbortController();
  /** Position chosen by the user via dragging; overrides automatic docking. */
  private userPosition: Point | null = null;
  private readonly homeAnchor: PanelAnchor;
  private anchor: PanelAnchor;

  constructor(options: PanelOptions) {
    this.homeAnchor = options.anchor ?? 'top-right';
    this.anchor = this.homeAnchor;
    this.titleElement = h('span', { class: 'ct-panel__title', text: options.title });
    const minimize = iconButton('minus', 'Minimise panel', () => {
      this.toggleMinimised();
    });
    const header = h('header', { class: 'ct-panel__header' }, [
      h('span', { class: 'ct-panel__icon' }, [createIcon(options.icon, 14)]),
      this.titleElement,
      this.toolActions,
      minimize,
      options.onClose ? iconButton('close', 'Close panel', options.onClose) : null,
    ]);
    this.body = h('div', { class: 'ct-panel__body' });
    this.element = h(
      'aside',
      { class: 'ct-panel', attrs: { role: 'dialog', 'aria-label': options.title } },
      [header, this.body],
    );

    let start: Point = { x: 0, y: 0 };
    onDrag(
      header,
      {
        start: (event) => {
          if ((event.target as Element).closest('button')) return false;
          const rect = this.element.getBoundingClientRect();
          start = { x: rect.left, y: rect.top };
          return true;
        },
        move: (delta) => {
          const wasDocked = this.userPosition === null;
          this.userPosition = this.clampToViewport({ x: start.x + delta.x, y: start.y + delta.y });
          placeAt(this.element, this.userPosition.x, this.userPosition.y);
          if (wasDocked) {
            this.setMaxHeight(null);
            layoutPanels();
          }
        },
      },
      this.controller.signal,
    );
    header.addEventListener(
      'dblclick',
      (event) => {
        if ((event.target as Element).closest('button')) return;
        this.toggleMinimised();
      },
      { signal: this.controller.signal },
    );
    window.addEventListener(
      'resize',
      () => {
        this.reposition();
      },
      { signal: this.controller.signal, passive: true },
    );
  }

  mount(parent: HTMLElement): this {
    parent.append(this.element);
    mounted.add(this);
    this.reposition();
    return this;
  }

  /** Side of the viewport this panel is docked to, or null once the user has moved it. */
  get dockedSide(): 'left' | 'right' | null {
    if (this.userPosition || !this.element.isConnected) return null;
    return this.anchor.endsWith('left') ? 'left' : 'right';
  }

  get dockedVertical(): 'top' | 'bottom' {
    return this.anchor.startsWith('top') ? 'top' : 'bottom';
  }

  get height(): number {
    return this.element.offsetHeight;
  }

  setMaxHeight(px: number | null): void {
    this.element.style.maxHeight = px === null ? '' : `${px}px`;
  }

  /** Called by the layout manager with the vertical position inside the panel's column. */
  placeDocked(y: number): void {
    const x = this.anchor.endsWith('right')
      ? window.innerWidth - this.element.offsetWidth - EDGE_GAP
      : EDGE_GAP;
    placeAt(this.element, x, y);
  }

  setTitle(title: string): void {
    this.titleElement.textContent = title;
    this.titleElement.title = title;
  }

  /** Replaces the tool-specific header buttons (minimise and close are kept). */
  setActions(...actions: readonly Node[]): void {
    this.toolActions.replaceChildren(...actions);
  }

  setContent(...children: readonly (Node | null)[]): void {
    const scrollTop = this.body.scrollTop;
    this.body.replaceChildren(...children.filter((child): child is Node => child !== null));
    this.body.scrollTop = scrollTop;
    this.reposition();
  }

  /** Moves the panel to the opposite side of the viewport if it would cover `target`. */
  avoid(target: Rect | null): void {
    if (this.userPosition || !target) return;
    const covered = intersects(this.dockedRect(this.homeAnchor), target);
    const next = covered ? flipSide(this.homeAnchor) : this.homeAnchor;
    if (next !== this.anchor) {
      this.anchor = next;
      this.reposition();
    }
  }

  reposition(): void {
    if (!this.element.isConnected) return;
    if (this.userPosition) {
      const clamped = this.clampToViewport(this.userPosition);
      placeAt(this.element, clamped.x, clamped.y);
    }
    layoutPanels();
  }

  get rect(): Rect {
    return toRect(this.element.getBoundingClientRect());
  }

  destroy(): void {
    this.controller.abort();
    this.element.remove();
    mounted.delete(this);
    layoutPanels();
  }

  private toggleMinimised(): void {
    this.element.classList.toggle('is-minimised');
    this.reposition();
  }

  private dockedRect(anchor: PanelAnchor): Rect {
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const x = anchor.endsWith('right') ? window.innerWidth - width - EDGE_GAP : EDGE_GAP;
    const y = anchor.startsWith('top')
      ? EDGE_GAP
      : Math.max(EDGE_GAP, window.innerHeight - height - BOTTOM_RESERVE);
    return { x, y, width, height };
  }

  private clampToViewport(point: Point): Point {
    return {
      x: clamp(point.x, 0, Math.max(0, window.innerWidth - this.element.offsetWidth)),
      y: clamp(point.y, 0, Math.max(0, window.innerHeight - 40)),
    };
  }
}
