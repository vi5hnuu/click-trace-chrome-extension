import { createIcon } from '../../shared/icons';
import type { LengthUnit, Position } from '../../shared/settings';
import { TOOLS, type ToolId, type ToolMeta } from '../../shared/tools';
import { breakpointFor } from '../lib/breakpoints';
import { clamp } from '../lib/geometry';
import { iconButton, kbd } from './components';
import { onDrag } from './drag';
import { h, placeAt } from './h';

export interface ToolbarCallbacks {
  readonly onSelect: (tool: ToolId) => void;
  readonly onCapture: () => void;
  readonly onHelp: () => void;
  readonly onCycleUnit: () => void;
  readonly onCopyViewport: (text: string) => void;
  readonly onClose: () => void;
  readonly onMoved: (position: Position) => void;
}

export interface ToolbarState {
  readonly activeTool: ToolId | null;
  readonly layers: readonly ToolId[];
  readonly unit: LengthUnit;
  readonly hint: string;
}

/** Docks closer than this to the top show their tooltips below the buttons. */
const TOP_THRESHOLD = 64;

/** Floating, draggable dock: tool buttons, actions, context hint and a live viewport badge. */
export class Toolbar {
  readonly element: HTMLElement;
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();
  private readonly unitButton: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly viewport: HTMLButtonElement;
  private readonly controller = new AbortController();
  private position: Position | null;

  constructor(callbacks: ToolbarCallbacks, position: Position | null) {
    this.position = position;
    const grip = h('div', { class: 'ct-dock__grip', title: 'Drag to move' }, [
      createIcon('grip', 14),
    ]);

    const toolButton = (tool: ToolMeta) => {
      const btn = iconButton(
        tool.icon,
        `${tool.label} (${tool.key})`,
        () => {
          callbacks.onSelect(tool.id);
        },
        'ct-dock__btn',
      );
      btn.setAttribute('aria-pressed', 'false');
      this.buttons.set(tool.id, btn);
      return btn;
    };
    const exclusive = TOOLS.filter((tool) => tool.kind === 'exclusive').map(toolButton);
    const layers = TOOLS.filter((tool) => tool.kind === 'layer').map(toolButton);

    this.unitButton = h('button', {
      class: 'ct-dock__unit',
      attrs: {
        type: 'button',
        'data-tip': 'Units (U)',
        'aria-label': 'Change measurement unit',
      },
      on: { click: callbacks.onCycleUnit },
    });

    this.viewport = h('button', {
      class: 'ct-dock__viewport',
      title: 'Viewport size and Tailwind breakpoint · click to copy',
      attrs: { type: 'button' },
      on: {
        click: () => {
          callbacks.onCopyViewport(`${window.innerWidth}×${window.innerHeight}`);
        },
      },
    });

    this.hint = h('div', { class: 'ct-dock__hint' });
    this.element = h(
      'div',
      { class: 'ct-dock', attrs: { role: 'toolbar', 'aria-label': 'Click Trace' } },
      [
        h('div', { class: 'ct-dock__row' }, [
          grip,
          ...exclusive,
          h('span', { class: 'ct-dock__sep' }),
          ...layers,
          h('span', { class: 'ct-dock__sep' }),
          iconButton('camera', 'Screenshot (K)', callbacks.onCapture, 'ct-dock__btn'),
          iconButton('help', 'Shortcuts (?)', callbacks.onHelp, 'ct-dock__btn'),
          this.unitButton,
          iconButton('close', 'Close (Esc)', callbacks.onClose, 'ct-dock__btn ct-dock__btn--close'),
        ]),
        h('div', { class: 'ct-dock__footer' }, [this.hint, this.viewport]),
      ],
    );

    let start: Position = { x: 0, y: 0 };
    onDrag(
      grip,
      {
        start: () => {
          const rect = this.element.getBoundingClientRect();
          start = { x: rect.left, y: rect.top };
          return true;
        },
        move: (delta) => {
          this.position = { x: start.x + delta.x, y: start.y + delta.y };
          this.reposition();
        },
        end: () => {
          if (this.position) callbacks.onMoved(this.position);
        },
      },
      this.controller.signal,
    );
    window.addEventListener(
      'resize',
      () => {
        this.renderViewport();
        this.reposition();
      },
      { signal: this.controller.signal, passive: true },
    );
  }

  mount(parent: HTMLElement): void {
    parent.append(this.element);
    this.renderViewport();
    this.reposition();
  }

  update(state: ToolbarState): void {
    for (const [id, btn] of this.buttons) {
      const pressed = id === state.activeTool || state.layers.includes(id);
      btn.classList.toggle('is-active', pressed);
      btn.setAttribute('aria-pressed', String(pressed));
    }
    this.unitButton.textContent = state.unit;
    this.renderHint(state.hint);
    this.reposition();
  }

  /** Hides the dock (e.g. while taking a screenshot) without tearing it down. */
  setHidden(hidden: boolean): void {
    this.element.hidden = hidden;
  }

  destroy(): void {
    this.controller.abort();
    this.element.remove();
  }

  private renderViewport(): void {
    const width = window.innerWidth;
    this.viewport.replaceChildren(
      createIcon('monitor', 12),
      document.createTextNode(` ${width} × ${window.innerHeight} `),
      h('span', { class: 'ct-dock__bp', text: breakpointFor(width) }),
    );
  }

  /** Renders hint text where `[Key]` tokens become <kbd> chips. */
  private renderHint(text: string): void {
    const parts = text.split(/(\[[^\]]+\])/g).filter(Boolean);
    this.hint.replaceChildren(
      ...parts.map((part) =>
        part.startsWith('[') ? kbd(part.slice(1, -1)) : document.createTextNode(part),
      ),
    );
  }

  private reposition(): void {
    if (!this.element.isConnected) return;
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const fallback = { x: (window.innerWidth - width) / 2, y: window.innerHeight - height - 20 };
    const { x, y } = this.position ?? fallback;
    const top = clamp(y, 4, Math.max(4, window.innerHeight - height - 4));
    placeAt(this.element, clamp(x, 4, Math.max(4, window.innerWidth - width - 4)), top);
    this.element.classList.toggle('is-top', top < TOP_THRESHOLD);
  }
}
