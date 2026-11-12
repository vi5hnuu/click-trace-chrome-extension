import { DEFAULT_GRID, type GridSettings } from '../../shared/settings';
import { rafThrottle } from '../lib/dom';
import { button, section } from '../overlay/components';
import { h } from '../overlay/h';
import { Panel } from '../overlay/panel';
import { BaseTool } from './tool';

interface GridPreset {
  readonly label: string;
  readonly grid: GridSettings;
}

const PRESETS: readonly GridPreset[] = [
  { label: '12 col', grid: { columns: 12, gutter: 24, maxWidth: 1200, margin: 24, baseline: 0 } },
  { label: '8 col', grid: { columns: 8, gutter: 24, maxWidth: 0, margin: 32, baseline: 0 } },
  { label: '4 col', grid: { columns: 4, gutter: 16, maxWidth: 0, margin: 16, baseline: 0 } },
  { label: '8pt baseline', grid: { ...DEFAULT_GRID, baseline: 8 } },
];

const FIELDS: readonly { key: keyof GridSettings; label: string; min: number; max: number }[] = [
  { key: 'columns', label: 'Columns', min: 1, max: 24 },
  { key: 'gutter', label: 'Gutter (px)', min: 0, max: 200 },
  { key: 'maxWidth', label: 'Max width (0 = full)', min: 0, max: 4000 },
  { key: 'margin', label: 'Side margin (px)', min: 0, max: 400 },
  { key: 'baseline', label: 'Baseline (0 = off)', min: 0, max: 200 },
];

/**
 * Grid — a passive column and baseline grid overlay for checking alignment. It does not
 * capture the pointer, so it can stay on while using the page or any other tool.
 */
export class GridTool extends BaseTool {
  readonly id = 'grid';
  readonly hint = '';
  override readonly capturesPointer = false;

  private columns: HTMLElement | null = null;
  private baseline: HTMLElement | null = null;
  private panel: Panel | null = null;

  protected onActivate(signal: AbortSignal, root: HTMLElement): void {
    this.columns = h('div', { class: 'ct-grid' });
    this.baseline = h('div', { class: 'ct-baseline' });
    root.append(this.baseline, this.columns);
    this.panel = new Panel({
      title: 'Layout grid',
      icon: 'grid',
      side: 'left',
      onClose: () => {
        this.ctx.deactivateTool(this.id);
      },
    }).mount(this.ctx.host.ui);
    this.renderPanel();
    this.onViewportChange(
      signal,
      rafThrottle(() => {
        this.render();
      }),
    );
    this.render();
  }

  protected override onDeactivate(): void {
    this.panel?.destroy();
    this.panel = null;
    this.columns = null;
    this.baseline = null;
  }

  override refresh(): void {
    this.render();
  }

  private get grid(): GridSettings {
    return this.ctx.settings().grid;
  }

  private update(patch: Partial<GridSettings>): void {
    this.ctx.updateSettings({ grid: { ...this.grid, ...patch } });
  }

  private render(): void {
    const { columns, gutter, maxWidth, margin, baseline } = this.grid;
    if (this.columns) {
      const available = Math.max(0, window.innerWidth - margin * 2);
      const width = maxWidth > 0 ? Math.min(maxWidth, available) : available;
      this.columns.style.left = `${(window.innerWidth - width) / 2}px`;
      this.columns.style.width = `${width}px`;
      this.columns.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
      this.columns.style.columnGap = `${gutter}px`;
      if (this.columns.childElementCount !== columns) {
        this.columns.replaceChildren(
          ...Array.from({ length: columns }, () => h('div', { class: 'ct-grid__col' })),
        );
      }
    }
    if (this.baseline) {
      this.baseline.hidden = baseline <= 0;
      if (baseline > 0) {
        this.baseline.style.backgroundImage = `repeating-linear-gradient(to bottom, color-mix(in srgb, var(--ct-accent) 35%, transparent) 0 1px, transparent 1px ${baseline}px)`;
        this.baseline.style.backgroundPosition = `0 ${-(window.scrollY % baseline)}px`;
      }
    }
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const inputs = FIELDS.map(({ key, label, min, max }) => {
      const input = h('input', {
        class: 'ct-input',
        attrs: {
          type: 'number',
          min: String(min),
          max: String(max),
          value: String(this.grid[key]),
        },
        on: {
          input: (event) => {
            const value = (event.target as HTMLInputElement).valueAsNumber;
            if (Number.isFinite(value)) this.update({ [key]: Math.min(max, Math.max(min, value)) });
          },
        },
      });
      return h('label', { class: 'ct-field' }, [document.createTextNode(label), input]);
    });

    this.panel.setContent(
      section('Presets', [
        h(
          'div',
          { class: 'ct-chips' },
          PRESETS.map((preset) =>
            button(preset.label, () => {
              this.ctx.updateSettings({ grid: preset.grid });
              this.renderPanel();
            }),
          ),
        ),
      ]),
      section('Settings', [h('div', { class: 'ct-fields' }, inputs)]),
    );
  }
}
