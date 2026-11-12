import { MAX_RECENT_COLORS } from '../../shared/settings';
import {
  contrastRatio,
  parseColor,
  type Rgba,
  toHex,
  toHslString,
  toOklchString,
  toRgbString,
  wcagLevel,
} from '../lib/color';
import { formatNumber } from '../lib/units';
import { badge, button, note, row, section, swatch, type BadgeTone } from '../overlay/components';
import { h } from '../overlay/h';
import { Panel } from '../overlay/panel';
import { BaseTool } from './tool';

/** Minimal typing for the EyeDropper API (Chromium 95+), not yet in TypeScript's DOM lib. */
interface EyeDropperApi {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
}
type EyeDropperConstructor = new () => EyeDropperApi;

function getEyeDropper(): EyeDropperConstructor | null {
  const candidate = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  return candidate ?? null;
}

const levelTone = (level: string): BadgeTone =>
  level === 'Fail' ? 'bad' : level === 'AA Large' ? 'warn' : 'good';

/** Color — sample any pixel on screen, copy it in every format and check contrast. */
export class ColorTool extends BaseTool {
  readonly id = 'color';
  readonly hint = 'Pick any pixel on screen · [Enter] pick again';
  override readonly capturesPointer = false;

  private current: Rgba | null = null;
  private previous: Rgba | null = null;
  private panel: Panel | null = null;
  private picking: AbortController | null = null;

  protected onActivate(): void {
    this.panel = new Panel({
      title: 'Color picker',
      icon: 'color',
      onClose: () => {
        this.ctx.deactivateTool(this.id);
      },
    }).mount(this.ctx.host.ui);
    this.render();
    // Opening the eyedropper needs a user gesture: this works when activated from the
    // toolbar or a keyboard shortcut; otherwise the user presses the Pick button.
    void this.pick();
  }

  protected override onDeactivate(): void {
    this.picking?.abort();
    this.panel?.destroy();
    this.panel = null;
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.key !== 'Enter') return false;
    void this.pick();
    return true;
  }

  override refresh(): void {
    this.render();
  }

  private async pick(): Promise<void> {
    const EyeDropper = getEyeDropper();
    if (!EyeDropper || this.picking) return;
    this.picking = new AbortController();
    this.ctx.host.root.classList.add('is-picking');
    try {
      const { sRGBHex } = await new EyeDropper().open({ signal: this.picking.signal });
      const color = parseColor(sRGBHex);
      if (color) this.choose(color, true);
    } catch {
      // Cancelled with Esc, or no user gesture available — nothing to do.
    } finally {
      this.picking = null;
      this.ctx.host.root.classList.remove('is-picking');
    }
  }

  private choose(color: Rgba, remember: boolean): void {
    if (this.current && toHex(this.current) !== toHex(color)) this.previous = this.current;
    this.current = color;
    if (remember) {
      const hex = toHex(color);
      const recent = [hex, ...this.ctx.settings().recentColors.filter((c) => c !== hex)].slice(
        0,
        MAX_RECENT_COLORS,
      );
      this.ctx.updateSettings({ recentColors: recent });
    }
    this.render();
  }

  private render(): void {
    if (!this.panel) return;
    const supported = getEyeDropper() !== null;
    const pickButton = button(
      'Pick color',
      () => {
        void this.pick();
      },
      'primary',
    );
    pickButton.disabled = !supported;

    this.panel.setContent(
      supported ? null : note('Your browser does not support the EyeDropper API.', 'warn'),
      this.current
        ? this.formatsSection(this.current)
        : h('div', { class: 'ct-empty', text: 'Pick a color to see its values.' }),
      this.current && this.previous ? this.contrastSection(this.current, this.previous) : null,
      this.recentSection(),
      h('div', { class: 'ct-actions' }, [pickButton]),
    );
  }

  private formatsSection(color: Rgba): HTMLElement {
    const hex = toHex(color);
    const preview = h('div', { class: 'ct-color-preview' });
    preview.style.setProperty('--swatch', hex);
    const copy = this.ctx.copy;
    return section('Formats', [
      preview,
      row('HEX', hex, { copy }),
      row('RGB', toRgbString(color), { copy }),
      row('HSL', toHslString(color), { copy }),
      row('OKLCH', toOklchString(color), { copy }),
    ]);
  }

  private contrastSection(foreground: Rgba, background: Rgba): HTMLElement {
    const ratio = contrastRatio(foreground, background);
    const normal = wcagLevel(ratio);
    const large = wcagLevel(ratio, true);
    return section('Contrast with previous', [
      row('Ratio', `${formatNumber(ratio)}:1`, { prefix: swatch(toHex(background)) }),
      row('Normal text', normal, { mono: false, suffix: badge(normal, levelTone(normal)) }),
      row('Large text', large, { mono: false, suffix: badge(large, levelTone(large)) }),
    ]);
  }

  private recentSection(): HTMLElement | null {
    const recent = this.ctx.settings().recentColors;
    if (recent.length === 0) return null;
    return section('Recent', [
      h(
        'div',
        { class: 'ct-palette' },
        recent.map((hex) => {
          const item = h('button', {
            class: 'ct-palette__item',
            title: hex,
            attrs: { type: 'button', 'aria-label': `Use ${hex}` },
            on: {
              click: () => {
                const color = parseColor(hex);
                if (color) this.choose(color, false);
              },
            },
          });
          item.style.setProperty('--swatch', hex);
          return item;
        }),
      ),
    ]);
  }
}
