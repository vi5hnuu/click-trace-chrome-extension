import type { ContentRequest, ContentState } from '../shared/messages';
import { nextUnit, saveSettings, type Settings, settingsEqual } from '../shared/settings';
import { EXTRA_SHORTCUTS, findToolByKey, getToolMeta, TOOLS, type ToolId } from '../shared/tools';
import { captureScreenshot } from './capture';
import { copyText, isEditableTarget } from './lib/dom';
import type { Point } from './lib/geometry';
import { kbd, section } from './overlay/components';
import { h } from './overlay/h';
import { OverlayHost } from './overlay/host';
import { Panel } from './overlay/panel';
import { Toast } from './overlay/toast';
import { Toolbar } from './overlay/toolbar';
import { ColorTool } from './tools/color';
import { DistanceTool } from './tools/distance';
import { GridTool } from './tools/grid';
import { InspectTool } from './tools/inspect';
import { OutlineTool } from './tools/outline';
import { PixelTool } from './tools/pixel';
import { RulerTool } from './tools/ruler';
import { StylesTool } from './tools/styles';
import type { BaseTool, ToolContext } from './tools/tool';

const DEFAULT_HINT = 'Pick a tool · [I] [R] [D] [S] [C] · [?] shortcuts · [Esc] close';

/**
 * Owns the overlay session on a page: one exclusive tool at a time (Inspect, Ruler, …),
 * any number of layer tools (Grid, Outline, Overlay), the toolbar, keyboard shortcuts,
 * screenshots and settings.
 */
export class App {
  private settings: Settings;
  private isOpen = false;
  private toolbar: Toolbar | null = null;
  private toast: Toast | null = null;
  private help: Panel | null = null;
  private session: AbortController | null = null;
  private activeTool: BaseTool | null = null;
  private capturing = false;

  private readonly host = new OverlayHost();
  private readonly tools: Readonly<Record<ToolId, BaseTool>>;
  private readonly context: ToolContext;

  constructor(settings: Settings) {
    this.settings = settings;
    this.context = {
      host: this.host,
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
        this.turnOff(id);
      },
    };
    this.tools = {
      inspect: new InspectTool(this.context),
      ruler: new RulerTool(this.context),
      distance: new DistanceTool(this.context),
      styles: new StylesTool(this.context),
      color: new ColorTool(this.context),
      grid: new GridTool(this.context),
      outline: new OutlineTool(this.context),
      pixel: new PixelTool(this.context),
    };
  }

  get state(): ContentState {
    return {
      open: this.isOpen,
      activeTool: this.activeTool?.id ?? null,
      layers: this.activeLayers(),
    };
  }

  handle(request: ContentRequest): ContentState | boolean {
    switch (request.type) {
      case 'ping':
        return true;
      case 'getState':
        break;
      case 'open':
        this.turnOn(request.tool);
        break;
      case 'toggle':
        if (!this.isOn(request.tool)) this.turnOn(request.tool);
        else if (getToolMeta(request.tool).kind === 'layer') this.turnOff(request.tool);
        else this.close();
        break;
      case 'close':
        this.close();
        break;
    }
    return this.state;
  }

  /** Ctrl/Cmd + Shift + Click — the original Click Trace gesture — pins Inspect at a point. */
  inspectAt(point: Point): void {
    this.turnOn('inspect');
    (this.tools.inspect as InspectTool).pinAt(point);
  }

  /** Whether a node is part of Click Trace's own UI. */
  owns(node: Node | null): boolean {
    return this.host.owns(node);
  }

  applySettings(settings: Settings): void {
    if (settingsEqual(settings, this.settings)) return;
    this.settings = settings;
    if (!this.isOpen) return;
    this.host.applySettings(settings);
    for (const tool of Object.values(this.tools)) if (tool.isActive) tool.refresh();
    this.updateToolbar();
  }

  close(): void {
    if (!this.isOpen) return;
    for (const tool of Object.values(this.tools)) {
      tool.deactivate();
      tool.reset();
    }
    this.activeTool = null;
    this.help?.destroy();
    this.help = null;
    this.session?.abort();
    this.session = null;
    this.toolbar?.destroy();
    this.toast?.destroy();
    this.host.destroy();
    this.toolbar = null;
    this.toast = null;
    this.isOpen = false;
  }

  // ---------- Session ----------

  private open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.host.applySettings(this.settings);
    this.host.mount();
    this.session = new AbortController();

    this.toolbar = new Toolbar(
      {
        onSelect: (id) => {
          this.toggleFromToolbar(id);
        },
        onCapture: () => {
          void this.capture();
        },
        onHelp: () => {
          this.toggleHelp();
        },
        onCycleUnit: () => {
          this.cycleUnit();
        },
        onCopyViewport: (text) => {
          void this.copy(text, 'viewport size');
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
    this.toolbar.mount(this.host.ui);
    this.toast = new Toast();
    this.host.ui.append(this.toast.element);

    window.addEventListener(
      'keydown',
      (event) => {
        this.onKeyDown(event);
      },
      { capture: true, signal: this.session.signal },
    );
    this.updateToolbar();
  }

  // ---------- Tools ----------

  private activeLayers(): ToolId[] {
    return TOOLS.filter((meta) => meta.kind === 'layer' && this.tools[meta.id].isActive).map(
      (meta) => meta.id,
    );
  }

  private isOn(id: ToolId): boolean {
    return this.isOpen && this.tools[id].isActive;
  }

  private turnOn(id: ToolId): void {
    this.open();
    const tool = this.tools[id];
    if (getToolMeta(id).kind === 'layer') {
      tool.activate();
      this.host.raise();
      this.updateToolbar();
    } else {
      this.setActiveTool(tool);
    }
  }

  private turnOff(id: ToolId): void {
    const tool = this.tools[id];
    if (getToolMeta(id).kind === 'layer') {
      tool.deactivate();
      this.updateToolbar();
    } else if (this.activeTool === tool) {
      this.setActiveTool(null);
    }
  }

  private toggleFromToolbar(id: ToolId): void {
    if (this.isOn(id)) this.turnOff(id);
    else this.turnOn(id);
  }

  private setActiveTool(tool: BaseTool | null): void {
    if (this.activeTool === tool) return;
    this.activeTool?.deactivate();
    this.activeTool = tool;
    this.host.setCapture(tool?.capturesPointer ?? false);
    tool?.activate();
    this.updateToolbar();
  }

  private updateToolbar(): void {
    this.toolbar?.update({
      activeTool: this.activeTool?.id ?? null,
      layers: this.activeLayers(),
      unit: this.settings.unit,
      hint: this.activeTool?.hint ?? DEFAULT_HINT,
    });
  }

  // ---------- Actions ----------

  private cycleUnit(): void {
    const unit = nextUnit(this.settings.unit);
    this.updateSettings({ unit });
    this.toast?.show(`Units: ${unit}`);
  }

  /** Applies settings immediately, then persists the full object. */
  private updateSettings(patch: Partial<Settings>): void {
    this.applySettings({ ...this.settings, ...patch });
    saveSettings(this.settings).catch((error: unknown) => {
      console.warn('[Click Trace] Could not save settings', error);
    });
  }

  private async copy(text: string, label: string): Promise<void> {
    const ok = await copyText(text);
    this.toast?.show(ok ? `Copied ${label}` : 'Copy failed');
  }

  private async capture(): Promise<void> {
    if (this.capturing || !this.isOpen) return;
    this.capturing = true;
    this.host.root.classList.add('is-shooting');
    try {
      const result = await captureScreenshot();
      this.host.root.classList.remove('is-shooting');
      this.toast?.show(result.copied ? 'Screenshot copied & downloaded' : 'Screenshot downloaded');
    } catch (error) {
      this.host.root.classList.remove('is-shooting');
      console.warn('[Click Trace] Screenshot failed', error);
      this.toast?.show('Screenshot unavailable — reopen Click Trace from the toolbar icon');
    } finally {
      this.capturing = false;
    }
  }

  private toggleHelp(): void {
    if (this.help) {
      this.help.destroy();
      this.help = null;
      return;
    }
    const line = (keys: string, label: string) =>
      h('div', { class: 'ct-row' }, [
        h('span', { class: 'ct-row__key ct-row__key--wide', text: label }),
        h('span', { class: 'ct-row__main ct-row__main--end' }, keys.split(' ').map(kbd)),
      ]);
    this.help = new Panel({
      title: 'Keyboard shortcuts',
      icon: 'help',
      anchor: 'top-left',
      onClose: () => {
        this.toggleHelp();
      },
    }).mount(this.host.ui);
    this.help.setContent(
      section(
        'Tools',
        TOOLS.filter((tool) => tool.kind === 'exclusive').map((tool) => line(tool.key, tool.label)),
      ),
      section(
        'Overlays',
        TOOLS.filter((tool) => tool.kind === 'layer').map((tool) => line(tool.key, tool.label)),
      ),
      section(
        'General',
        EXTRA_SHORTCUTS.map(({ keys, label }) => line(keys, label)),
      ),
    );
  }

  // ---------- Keyboard ----------

  private onKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event)) {
      const target = event.composedPath()[0];
      // Escape leaves our own inputs; page inputs are left alone.
      if (event.key === 'Escape' && target instanceof HTMLElement && this.host.owns(target)) {
        target.blur();
        event.stopPropagation();
      }
      return;
    }
    if (this.handleKey(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  private handleKey(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') {
      // Peel back one level at a time: shortcuts sheet → tool selection → tool → overlay.
      if (this.help) this.toggleHelp();
      else if (this.activeTool?.handleEscape()) return true;
      else if (this.activeTool) this.setActiveTool(null);
      else this.close();
      return true;
    }
    if (this.activeTool?.handleKey(event)) return true;
    for (const id of this.activeLayers()) {
      if (this.tools[id].handleKey(event)) return true;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return false;

    switch (event.key) {
      case '?':
        this.toggleHelp();
        return true;
      case 'u':
      case 'U':
        this.cycleUnit();
        return true;
      case 'k':
      case 'K':
        void this.capture();
        return true;
    }
    const tool = findToolByKey(event.key);
    if (!tool) return false;
    this.toggleFromToolbar(tool.id);
    return true;
  }
}
