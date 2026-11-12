import type { Settings } from '../../shared/settings';
import type { ToolId } from '../../shared/tools';
import type { Point } from '../lib/geometry';
import { type UnitContext, formatLength } from '../lib/units';
import { pageElementAt, unitContexts } from '../lib/dom';
import { h } from '../overlay/h';
import type { OverlayHost } from '../overlay/host';

/** Services the App provides to every tool. */
export interface ToolContext {
  readonly host: OverlayHost;
  readonly settings: () => Settings;
  readonly updateSettings: (patch: Partial<Settings>) => void;
  readonly copy: (text: string, label: string) => void;
  readonly toast: (message: string) => void;
  /** Asks the App to turn a tool off (e.g. from a tool panel's close button). */
  readonly deactivateTool: (id: ToolId) => void;
}

/**
 * Base class for all tools. A tool is constructed once per page session and can be
 * activated / deactivated many times; all listeners registered through `signal`
 * are removed automatically on deactivation.
 */
export abstract class BaseTool {
  abstract readonly id: ToolId;
  /** Shown in the toolbar while the tool is active. `[Key]` renders as a key chip. */
  abstract readonly hint: string;
  /** Whether the tool needs the full-page pointer capture surface (blocks page clicks). */
  readonly capturesPointer: boolean = true;

  protected root: HTMLElement | null = null;
  private controller: AbortController | null = null;

  constructor(protected readonly ctx: ToolContext) {}

  get isActive(): boolean {
    return this.controller !== null;
  }

  activate(): void {
    if (this.controller) return;
    this.controller = new AbortController();
    this.root = h('div', { class: `ct-tool ct-tool--${this.id}` });
    this.ctx.host.layer.append(this.root);
    this.onActivate(this.controller.signal, this.root);
  }

  deactivate(): void {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    this.onDeactivate();
    this.root?.remove();
    this.root = null;
  }

  /** Handles a key while active. Return true when consumed. */
  handleKey(_event: KeyboardEvent): boolean {
    return false;
  }

  /** Escape first clears tool-level state (selection, pin). Return true when consumed. */
  handleEscape(): boolean {
    return false;
  }

  /** Called when settings (units, accent, …) change while active. */
  refresh(): void {
    /* optional */
  }

  /** Clears state kept between activations; called when the overlay closes. */
  reset(): void {
    /* optional */
  }

  protected abstract onActivate(signal: AbortSignal, root: HTMLElement): void;

  protected onDeactivate(): void {
    /* optional */
  }

  protected get stage(): HTMLElement {
    return this.ctx.host.stage;
  }

  protected elementAt(point: Point): Element | null {
    return pageElementAt(point, this.ctx.host.element);
  }

  /** Re-runs `render` (rAF-coalesced by the caller if needed) on scroll and resize. */
  protected onViewportChange(signal: AbortSignal, render: () => void): void {
    window.addEventListener('scroll', render, { signal, capture: true, passive: true });
    window.addEventListener('resize', render, { signal, passive: true });
  }

  protected length(px: number, axis: 'x' | 'y' = 'x'): string {
    const contexts = unitContexts();
    const context: UnitContext = axis === 'x' ? contexts.x : contexts.y;
    return formatLength(px, this.ctx.settings().unit, context);
  }

  protected size(width: number, height: number): string {
    return `${this.length(width, 'x')} × ${this.length(height, 'y')}`;
  }
}

export const pointFromEvent = (event: MouseEvent): Point => ({
  x: event.clientX,
  y: event.clientY,
});
