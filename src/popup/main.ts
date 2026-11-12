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
import { TOOLS } from '../shared/tools';

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

function hydrateIcons(): void {
  for (const slot of document.querySelectorAll<HTMLElement>('[data-icon]')) {
    slot.replaceChildren(createIcon(slot.dataset.icon as IconName, 14));
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
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'radio';
      button.textContent = label(value);
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
    hydrateIcons();
    applyTheme(this.settings);

    const scriptable = this.tab?.id !== undefined && isScriptableUrl(this.tab.url);
    byId('restricted').hidden = scriptable;
    if (scriptable && this.tab.id !== undefined) this.state = await queryTabState(this.tab.id);

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

  private renderTools(enabled: boolean): void {
    const isActive = (id: string) =>
      id === 'grid' ? this.state?.gridVisible === true : this.state?.activeTool === id;

    byId('tools').replaceChildren(
      ...TOOLS.map((tool) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `tool${isActive(tool.id) ? ' is-active' : ''}`;
        button.disabled = !enabled;
        button.title = tool.description;

        const icon = document.createElement('span');
        icon.className = 'tool__icon';
        icon.append(createIcon(tool.icon, 18));
        const label = document.createElement('span');
        label.className = 'tool__label';
        label.textContent = tool.label;
        const description = document.createElement('span');
        description.className = 'tool__desc';
        description.textContent = tool.summary;
        const key = document.createElement('kbd');
        key.textContent = tool.key;

        button.append(icon, label, description, key);
        button.addEventListener('click', () => {
          void this.send({ type: 'open', tool: tool.id });
        });
        return button;
      }),
    );
    byId('close-overlay').hidden = !this.state?.open;
  }

  private renderSettings(): void {
    const update = (patch: Partial<Settings>) => {
      this.settings = { ...this.settings, ...patch };
      applyTheme(this.settings);
      this.renderSettings();
      void saveSettings(patch);
    };

    renderSegmented(byId('units'), LENGTH_UNITS, this.settings.unit, (unit) => {
      update({ unit });
    });
    renderSegmented(
      byId('theme'),
      THEMES,
      this.settings.theme,
      (theme) => {
        update({ theme });
      },
      (theme) => theme.charAt(0).toUpperCase() + theme.slice(1),
    );

    byId('accent').replaceChildren(
      ...ACCENT_PRESETS.map((accent) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'radio';
        button.style.setProperty('--swatch', accent);
        button.setAttribute('aria-label', accent);
        button.setAttribute('aria-checked', String(accent === this.settings.accent));
        button.addEventListener('click', () => {
          update({ accent });
        });
        return button;
      }),
    );

    const snapping = byId('snapping');
    if (!(snapping instanceof HTMLInputElement)) return;
    snapping.checked = this.settings.snapping;
    snapping.onchange = () => {
      update({ snapping: snapping.checked });
    };
  }

  private async renderShortcuts(): Promise<void> {
    const commands = await chrome.commands.getAll();
    byId('shortcuts').replaceChildren(
      ...commands
        .filter((command) => command.name && COMMAND_LABELS[command.name])
        .map((command) => {
          const item = document.createElement('li');
          const name = document.createElement('span');
          name.textContent = COMMAND_LABELS[command.name ?? ''] ?? command.description ?? '';
          const shortcut = command.shortcut ?? '';
          const keys = document.createElement(shortcut ? 'kbd' : 'span');
          keys.textContent = shortcut || 'Not set';
          if (!shortcut) keys.className = 'unset';
          item.append(name, keys);
          return item;
        }),
    );
  }
}

const [settings, tab] = await Promise.all([loadSettings(), getActiveTab()]);
await new Popup(settings, tab).init();
