import { createIcon, type IconName } from '../shared/icons';
import type { ContentRequest, ContentState } from '../shared/messages';
import {
  ACCENT_PRESETS,
  LENGTH_UNITS,
  loadSettings,
  saveSettings,
  type Settings,
  THEMES,
} from '../shared/settings';
import { isScriptableUrl, queryTabState, sendToTab } from '../shared/tab';
import { TOOLS, type ToolKind, type ToolMeta } from '../shared/tools';

const COMMAND_LABELS: Readonly<Record<string, string>> = {
  _execute_action: 'Open this popup',
  'toggle-inspect': 'Toggle Inspect',
  'toggle-ruler': 'Toggle Ruler',
  'close-overlay': 'Close on page',
};

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function hydrateIcons(): void {
  for (const slot of document.querySelectorAll<HTMLElement>('[data-icon]')) {
    slot.replaceChildren(createIcon(slot.dataset.icon as IconName, slot.closest('.cta') ? 18 : 14));
  }
}

function applyTheme(settings: Settings): void {
  document.documentElement.style.setProperty('--accent', settings.accent);
  if (settings.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
}

function renderSegmented<T extends string>(
  container: HTMLElement,
  options: readonly T[],
  selected: T,
  onChange: (value: T) => void,
  label: (value: T) => string = (value) => value,
): void {
  container.replaceChildren(
    ...options.map((value) => {
      const button = el('button', '', label(value));
      button.type = 'button';
      button.role = 'radio';
      button.setAttribute('aria-checked', String(value === selected));
      button.addEventListener('click', () => {
        onChange(value);
      });
      return button;
    }),
  );
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

class Popup {
  private settings: Settings;
  private readonly tab: chrome.tabs.Tab | undefined;
  private state: ContentState | null = null;

  constructor(settings: Settings, tab: chrome.tabs.Tab | undefined) {
    this.settings = settings;
    this.tab = tab;
  }

  async init(): Promise<void> {
    byId('version').textContent = `v${chrome.runtime.getManifest().version}`;
    byId('review').setAttribute(
      'href',
      `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`,
    );
    hydrateIcons();
    applyTheme(this.settings);

    const scriptable = this.tab?.id !== undefined && isScriptableUrl(this.tab.url);
    byId('restricted').hidden = scriptable;
    if (scriptable && this.tab.id !== undefined) this.state = await queryTabState(this.tab.id);

    const cta = byId('cta') as HTMLButtonElement;
    cta.disabled = !scriptable;
    cta.addEventListener('click', () => {
      void this.send({ type: 'open', tool: 'inspect' });
    });

    this.renderTools(scriptable);
    this.renderSettings();
    await this.renderShortcuts();

    byId('close-overlay').addEventListener('click', () => {
      void this.send({ type: 'close' });
    });
    byId('customize').addEventListener('click', () => {
      void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  private async send(request: ContentRequest): Promise<void> {
    if (this.tab?.id === undefined) return;
    try {
      await sendToTab(this.tab.id, request);
      window.close();
    } catch (error) {
      console.error('[Click Trace] Could not reach the page', error);
      byId('restricted').hidden = false;
    }
  }

  private isActive(tool: ToolMeta): boolean {
    return this.state?.activeTool === tool.id || this.state?.layers.includes(tool.id) === true;
  }

  private renderTools(enabled: boolean): void {
    const card = (tool: ToolMeta) => {
      const button = el('button', `tool${this.isActive(tool) ? ' is-active' : ''}`);
      button.type = 'button';
      button.disabled = !enabled;
      button.title = tool.description;
      const icon = el('span', 'tool__icon');
      icon.append(createIcon(tool.icon, 18));
      button.append(
        icon,
        el('span', 'tool__label', tool.label),
        el('span', 'tool__desc', tool.summary),
        el('kbd', '', tool.key),
      );
      button.addEventListener('click', () => {
        void this.send({ type: 'open', tool: tool.id });
      });
      return button;
    };
    // Inspect is the primary call to action, so it is not repeated in the grid.
    const group = (kind: ToolKind) =>
      TOOLS.filter((tool) => tool.kind === kind && tool.id !== 'inspect').map(card);

    byId('tools-exclusive').replaceChildren(...group('exclusive'));
    byId('tools-layer').replaceChildren(...group('layer'));
    byId('close-overlay').hidden = !this.state?.open;
  }

  private update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    applyTheme(this.settings);
    this.renderSettings();
    void saveSettings(this.settings);
  }

  private renderSettings(): void {
    renderSegmented(byId('units'), LENGTH_UNITS, this.settings.unit, (unit) => {
      this.update({ unit });
    });
    renderSegmented(
      byId('theme'),
      THEMES,
      this.settings.theme,
      (theme) => {
        this.update({ theme });
      },
      (theme) => theme.charAt(0).toUpperCase() + theme.slice(1),
    );

    byId('accent').replaceChildren(
      ...ACCENT_PRESETS.map((accent) => {
        const button = el('button', '');
        button.type = 'button';
        button.role = 'radio';
        button.style.setProperty('--swatch', accent);
        button.setAttribute('aria-label', accent);
        button.setAttribute('aria-checked', String(accent === this.settings.accent));
        button.addEventListener('click', () => {
          this.update({ accent });
        });
        return button;
      }),
    );

    const snapping = byId('snapping');
    if (!(snapping instanceof HTMLInputElement)) return;
    snapping.checked = this.settings.snapping;
    snapping.onchange = () => {
      this.update({ snapping: snapping.checked });
    };
  }

  private async renderShortcuts(): Promise<void> {
    const commands = await chrome.commands.getAll();
    const inspect = commands.find((command) => command.name === 'toggle-inspect')?.shortcut;
    if (inspect) byId('cta-shortcut').textContent = inspect;

    byId('shortcuts').replaceChildren(
      ...commands
        .filter((command) => command.name && COMMAND_LABELS[command.name])
        .map((command) => {
          const item = el('li', '');
          const shortcut = command.shortcut ?? '';
          const keys = el(
            shortcut ? 'kbd' : 'span',
            shortcut ? '' : 'unset',
            shortcut || 'Not set',
          );
          item.append(el('span', '', COMMAND_LABELS[command.name ?? ''] ?? ''), keys);
          return item;
        }),
    );
  }
}

const [settings, tab] = await Promise.all([loadSettings(), getActiveTab()]);
await new Popup(settings, tab).init();
