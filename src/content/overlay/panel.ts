import { createIcon, type IconName } from '../../shared/icons';
import { clamp, intersects, type Point, type Rect, toRect } from '../lib/geometry';
import { iconButton } from './components';
import { onDrag } from './drag';
import { h, placeAt } from './h';

export interface PanelOptions {
  readonly title: string;
  readonly icon: IconName;
  readonly onClose?: () => void;
  /** Initial docking side. */
  readonly side?: 'left' | 'right';
}

const EDGE_GAP = 12;

/** Floating, draggable information card used by every tool. */
export class Panel {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  private readonly toolActions = h('span', { class: 'ct-panel__actions' });
  private readonly titleElement: HTMLElement;
  private readonly controller = new AbortController();
  /** Position chosen by the user via dragging; overrides automatic docking. */
  private userPosition: Point | null = null;
  private side: 'left' | 'right';

  constructor(options: PanelOptions) {
    this.side = options.side ?? 'right';
    this.titleElement = h('span', { class: 'ct-panel__title', text: options.title });
    const header = h('header', { class: 'ct-panel__header' }, [
      h('span', { class: 'ct-panel__icon' }, [createIcon(options.icon, 14)]),
      this.titleElement,
      this.toolActions,
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
          this.userPosition = this.clampToViewport({ x: start.x + delta.x, y: start.y + delta.y });
          placeAt(this.element, this.userPosition.x, this.userPosition.y);
        },
      },
      this.controller.signal,
    );
  }

  mount(parent: HTMLElement): this {
    parent.append(this.element);
    this.reposition();
    return this;
  }

  setTitle(title: string): void {
    this.titleElement.textContent = title;
  }

  /** Replaces the tool-specific header buttons (the close button is kept). */
  setActions(...actions: readonly Node[]): void {
    this.toolActions.replaceChildren(...actions);
  }

  setContent(...children: readonly (Node | null)[]): void {
    this.body.replaceChildren(...children.filter((child): child is Node => child !== null));
    this.reposition();
  }

  /** Keeps the panel docked on the side of the viewport that does not cover `target`. */
  avoid(target: Rect | null): void {
    if (this.userPosition || !target) return;
    const width = this.element.offsetWidth;
    const rightDock: Rect = {
      x: window.innerWidth - width - EDGE_GAP,
      y: EDGE_GAP,
      width,
      height: this.element.offsetHeight,
    };
    const next =
      intersects(rightDock, target) && target.x > window.innerWidth / 2 ? 'left' : 'right';
    if (next !== this.side) {
      this.side = next;
      this.reposition();
    }
  }

  reposition(): void {
    if (!this.element.isConnected) return;
    const position = this.userPosition
      ? this.clampToViewport(this.userPosition)
      : {
          x:
            this.side === 'right'
              ? window.innerWidth - this.element.offsetWidth - EDGE_GAP
              : EDGE_GAP,
          y: EDGE_GAP,
        };
    placeAt(this.element, position.x, position.y);
  }

  get rect(): Rect {
    return toRect(this.element.getBoundingClientRect());
  }

  destroy(): void {
    this.controller.abort();
    this.element.remove();
  }

  private clampToViewport(point: Point): Point {
    return {
      x: clamp(point.x, 0, Math.max(0, window.innerWidth - this.element.offsetWidth)),
      y: clamp(point.y, 0, Math.max(0, window.innerHeight - 40)),
    };
  }
}
