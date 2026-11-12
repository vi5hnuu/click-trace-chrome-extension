import type { ContentRequest, ContentState } from '../shared/messages';
import { nextUnit, saveSettings, type Settings } from '../shared/settings';
import { findToolByKey, type ToolId } from '../shared/tools';
import { copyText, isEditableTarget } from './lib/dom';
import type { Point } from './lib/geometry';
import { OverlayHost } from './overlay/host';
import { Toast } from './overlay/toast';
import { Toolbar } from './overlay/toolbar';
import { ColorTool } from './tools/color';
import { DistanceTool } from './tools/distance';
import { GridTool } from './tools/grid';
import { InspectTool } from './tools/inspect';
import { RulerTool } from './tools/ruler';
import { StylesTool } from './tools/styles';
import type { BaseTool, ToolContext } from './tools/tool';

type ExclusiveToolId = Exclude<ToolId, 'grid'>;

const DEFAULT_HINT = 'Pick a tool · [I] [R] [D] [S] [C] [G] · [U] units · [Esc] close';

/**
 * Owns the overlay session on a page: one exclusive tool at a time (Inspect, Ruler, …)
 * plus the independent Grid overlay, the toolbar, keyboard shortcuts and settings.
 */
export class App {
  private settings: Settings;
  private host: OverlayHost | null = null;
  private toolbar: Toolbar | null = null;
  private toast: Toast | null = null;
  private session: AbortController | null = null;
  private activeTool: BaseTool | null = null;

  private readonly tools: Readonly<Record<ExclusiveToolId, BaseTool>>;
  private readonly grid: GridTool;
  private readonly context: ToolContext;

  constructor(settings: Settings) {
    this.settings = settings;
    this.context = {
      host: new OverlayHost(),
      settings: () => this.settings,
      updateSettings: (patch) => {
        this.updateSettings(patch);
      },
      copy: (text, label) => {
        void this.copy(text, label);
      },
      toast: (message) => {
        this.toast?.show(message);
      },
      deactivateTool: (id) => {
        if (id === 'grid') this.setGrid(false);
        else if (this.activeTool?.id === id) this.setActiveTool(null);
      },
    };
    this.tools = {
      inspect: new InspectTool(this.context),
      ruler: new RulerTool(this.context),
      distance: new DistanceTool(this.context),
      styles: new StylesTool(this.context),
      color: new ColorTool(this.context),
    };
    this.grid = new GridTool(this.context);
  }

  get isOpen(): boolean {
    return this.host !== null;
  }

  get state(): ContentState {
    return {
      open: this.isOpen,
      activeTool: this.activeTool?.id ?? null,
      gridVisible: this.grid.isActive,
    };
  }

  handle(request: ContentRequest): ContentState | boolean {
    switch (request.type) {
      case 'ping':
        return true;
      case 'getState':
        break;
      case 'open':
        this.selectTool(request.tool, { toggle: false });
        break;
      case 'toggle':
        if (this.isToolOn(request.tool)) {
          if (request.tool === 'grid') this.setGrid(false);
          else this.close();
        } else {
          this.selectTool(request.tool, { toggle: false });
        }
        break;
      case 'close':
        this.close();
        break;
    }
    return this.state;
  }

  /** Ctrl/Cmd + Shift + Click — the original Click Trace gesture — pins Inspect at a point. */
  inspectAt(point: Point): void {
    this.selectTool('inspect', { toggle: false });
    (this.tools.inspect as InspectTool).pinAt(point);
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    if (!this.host) return;
    this.host.applySettings(settings);
    this.activeTool?.refresh();
    if (this.grid.isActive) this.grid.refresh();
    this.updateToolbar();
  }

  close(): void {
    if (!this.host) return;
    this.activeTool?.deactivate();
    this.activeTool = null;
    this.grid.deactivate();
    for (const tool of Object.values(this.tools)) tool.reset();
    this.session?.abort();
    this.session = null;
    this.toolbar?.destroy();
    this.toast?.destroy();
    this.host.destroy();
    this.host = null;
    this.toolbar = null;
    this.toast = null;
  }

  private open(): OverlayHost {
    if (this.host) return this.host;
    const host = this.context.host;
    host.applySettings(this.settings);
    host.mount();
    this.host = host;
    this.session = new AbortController();

    this.toolbar = new Toolbar(
      {
        onSelect: (id) => {
          this.selectTool(id, { toggle: true });
        },
        onCycleUnit: () => {
          this.cycleUnit();
        },
        onClose: () => {
          this.close();
        },
        onMoved: (position) => {
          this.updateSettings({ toolbarPosition: position });
        },
      },
      this.settings.toolbarPosition,
    );
    this.toolbar.mount(host.ui);
    this.toast = new Toast();
    host.ui.append(this.toast.element);

    window.addEventListener(
      'keydown',
      (event) => {
        this.onKeyDown(event);
      },
      {
        capture: true,
        signal: this.session.signal,
      },
    );
    return host;
  }

  private isToolOn(id: ToolId): boolean {
    return id === 'grid' ? this.grid.isActive : this.activeTool?.id === id;
  }

  private selectTool(id: ToolId, { toggle }: { toggle: boolean }): void {
    this.open();
    if (id === 'grid') {
      this.setGrid(toggle ? !this.grid.isActive : true);
      return;
    }
    const tool = this.tools[id];
    this.setActiveTool(toggle && this.activeTool === tool ? null : tool);
  }

  private setActiveTool(tool: BaseTool | null): void {
    if (this.activeTool === tool) return;
    this.activeTool?.deactivate();
    this.activeTool = tool;
    const host = this.host;
    if (host) {
      host.setCapture(tool?.capturesPointer ?? false);
      tool?.activate();
    }
    this.updateToolbar();
  }

  private setGrid(visible: boolean): void {
    if (visible) this.grid.activate();
    else this.grid.deactivate();
    this.updateToolbar();
  }

  private updateToolbar(): void {
    this.toolbar?.update({
      activeTool: this.activeTool?.id ?? null,
      gridVisible: this.grid.isActive,
      unit: this.settings.unit,
      hint: this.activeTool?.hint ?? DEFAULT_HINT,
    });
  }

  private cycleUnit(): void {
    const unit = nextUnit(this.settings.unit);
    this.updateSettings({ unit });
    this.toast?.show(`Units: ${unit}`);
  }

  /** Applies settings immediately, then persists them (other views update via storage events). */
  private updateSettings(patch: Partial<Settings>): void {
    this.applySettings({ ...this.settings, ...patch });
    saveSettings(patch).catch((error: unknown) => {
      console.warn('[Click Trace] Could not save settings', error);
    });
  }

  private async copy(text: string, label: string): Promise<void> {
    const ok = await copyText(text);
    this.toast?.show(ok ? `Copied ${label}` : 'Copy failed');
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event)) {
      if (event.key === 'Escape') (event.composedPath()[0] as HTMLElement).blur();
      return;
    }
    if (this.handleKey(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  private handleKey(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') {
      if (this.activeTool?.handleEscape()) return true;
      if (this.activeTool) this.setActiveTool(null);
      else this.close();
      return true;
    }
    if (this.activeTool?.handleKey(event)) return true;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key.toLowerCase() === 'u') {
      this.cycleUnit();
      return true;
    }
    const tool = findToolByKey(event.key);
    if (!tool) return false;
    this.selectTool(tool.id, { toggle: true });
    return true;
  }
}
