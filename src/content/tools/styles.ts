import { parseColor, toHex } from '../lib/color';
import { readStyleGroups, toCssText } from '../lib/css';
import { rafThrottle } from '../lib/dom';
import { type Point, toRect } from '../lib/geometry';
import { elementLabel, uniqueSelector } from '../lib/selector';
import { button, copyButton, row, section, swatch } from '../overlay/components';
import { h } from '../overlay/h';
import { Panel } from '../overlay/panel';
import { box, rectLabel } from './draw';
import { BaseTool, pointFromEvent } from './tool';

/** Styles — read the developer-relevant computed CSS of any element and copy it. */
export class StylesTool extends BaseTool {
  readonly id = 'styles';
  readonly hint = 'Click an element to read its CSS · [Esc] clear selection';

  private selected: Element | null = null;
  private hovered: Element | null = null;
  private showDefaults = false;
  private layer: HTMLElement | null = null;
  private panel: Panel | null = null;

  protected onActivate(signal: AbortSignal, root: HTMLElement): void {
    this.layer = h('div');
    root.append(this.layer);
    const hover = rafThrottle((point: Point) => {
      this.hovered = this.elementAt(point);
      this.renderOverlay();
    });
    this.stage.addEventListener(
      'pointermove',
      (e) => {
        hover(pointFromEvent(e));
      },
      { signal },
    );
    this.stage.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        this.selected = this.elementAt(pointFromEvent(e));
        this.renderPanel();
        this.renderOverlay();
      },
      { signal },
    );
    this.onViewportChange(
      signal,
      rafThrottle(() => {
        this.renderOverlay();
      }),
    );
    if (this.selected) this.renderPanel();
    this.renderOverlay();
  }

  protected override onDeactivate(): void {
    this.panel?.destroy();
    this.panel = null;
    this.layer = null;
    this.hovered = null;
  }

  override reset(): void {
    this.selected = null;
  }

  override refresh(): void {
    this.renderOverlay();
  }

  override handleEscape(): boolean {
    if (!this.selected) return false;
    this.clear();
    return true;
  }

  private clear(): void {
    this.selected = null;
    this.panel?.destroy();
    this.panel = null;
    this.renderOverlay();
  }

  private renderOverlay(): void {
    if (!this.layer) return;
    const nodes: HTMLElement[] = [];
    if (this.selected?.isConnected) {
      const rect = toRect(this.selected.getBoundingClientRect());
      nodes.push(box(rect, 'ct-outline ct-outline--fill'));
      this.panel?.avoid(rect);
    }
    if (this.hovered && this.hovered !== this.selected) {
      const rect = toRect(this.hovered.getBoundingClientRect());
      nodes.push(
        box(rect, 'ct-outline ct-outline--dashed'),
        rectLabel(rect, elementLabel(this.hovered), this.size(rect.width, rect.height)),
      );
    }
    this.layer.replaceChildren(...nodes);
  }

  private renderPanel(): void {
    const element = this.selected;
    if (!element) return;
    this.panel ??= new Panel({
      title: '',
      icon: 'styles',
      onClose: () => {
        this.clear();
      },
    }).mount(this.ctx.host.ui);

    const selector = uniqueSelector(element);
    const groups = readStyleGroups(getComputedStyle(element), this.showDefaults);
    const allEntries = groups.flatMap((group) => group.entries);
    const cssText = toCssText(selector, allEntries);

    this.panel.setTitle(elementLabel(element));
    this.panel.setActions(copyButton(cssText, 'CSS', this.ctx.copy));

    const sections = groups.map((group) =>
      section(
        group.title,
        group.entries.map(({ property, value }) => {
          const color = property.includes('color') ? parseColor(value) : null;
          return row(property, value, {
            copy: this.ctx.copy,
            copyText: `${property}: ${value};`,
            ...(color && { prefix: swatch(value), copyText: `${property}: ${toHex(color)};` }),
          });
        }),
      ),
    );

    const toggle = h('label', { class: 'ct-check' }, [
      h('input', {
        attrs: { type: 'checkbox', ...(this.showDefaults && { checked: '' }) },
        on: {
          change: (event) => {
            this.showDefaults = (event.target as HTMLInputElement).checked;
            this.renderPanel();
          },
        },
      }),
      document.createTextNode('Show default values'),
    ]);

    this.panel.setContent(
      ...sections,
      toggle,
      h('div', { class: 'ct-actions' }, [
        button(
          'Copy as CSS',
          () => {
            this.ctx.copy(cssText, 'CSS');
          },
          'primary',
        ),
        button('Copy selector', () => {
          this.ctx.copy(selector, 'selector');
        }),
      ]),
    );
  }
}
