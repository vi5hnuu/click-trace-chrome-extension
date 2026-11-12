import { contrastRatio, isLargeText, parseColor, toHex, wcagLevel } from '../lib/color';
import { primaryFontFamily, shorthand } from '../lib/css';
import {
  ancestry,
  boxModel,
  boxSides,
  effectiveBackground,
  hasOwnText,
  isInteractive,
  parentOf,
  rafThrottle,
  scrollPosition,
  type Sides,
} from '../lib/dom';
import { containsPoint, type Point, toDocument, toRect, toViewport } from '../lib/geometry';
import { elementLabel, uniqueSelector } from '../lib/selector';
import { formatNumber } from '../lib/units';
import {
  badge,
  button,
  copyButton,
  note,
  row,
  section,
  swatch,
  type BadgeTone,
} from '../overlay/components';
import { h } from '../overlay/h';
import { Panel } from '../overlay/panel';
import { box, boxModelNodes, hLine, label, rectLabel, vLine } from './draw';
import { BaseTool, pointFromEvent } from './tool';

interface PinState {
  element: Element;
  /** Ancestry of the originally clicked element, innermost first. */
  chain: Element[];
  /** Click position in document coordinates, so it follows the page while scrolling. */
  click: Point | null;
}

const MIN_TARGET = 24; // WCAG 2.2 SC 2.5.8 (AA)
const COMFORT_TARGET = 44; // WCAG 2.5.5 (AAA) / platform guidelines

const px = (n: number) => `${formatNumber(n)}px`;
const sidesText = (s: Sides) => shorthand(px(s.top), px(s.right), px(s.bottom), px(s.left));

/**
 * Inspect — the evolution of the original Click Trace: hover to see the box model,
 * click to pin an element, read its click coordinates relative to it or any ancestor,
 * walk the DOM, and get quick layout / typography / accessibility facts.
 */
export class InspectTool extends BaseTool {
  readonly id = 'inspect';
  readonly hint = 'Click to pin · [↑] [↓] [←] [→] walk the DOM · [Esc] unpin';

  private hovered: Element | null = null;
  private previewed: Element | null = null;
  private pinned: PinState | null = null;
  private panel: Panel | null = null;
  private hoverLayer: HTMLElement | null = null;
  private pinLayer: HTMLElement | null = null;

  protected onActivate(signal: AbortSignal, root: HTMLElement): void {
    this.pinLayer = h('div');
    this.hoverLayer = h('div');
    root.append(this.pinLayer, this.hoverLayer);

    const hover = rafThrottle((point: Point) => {
      this.hovered = this.elementAt(point);
      this.renderHover();
    });
    this.stage.addEventListener(
      'pointermove',
      (e) => {
        hover(pointFromEvent(e));
      },
      { signal },
    );
    this.stage.addEventListener(
      'pointerleave',
      () => {
        this.hovered = null;
        this.renderHover();
      },
      { signal },
    );
    this.stage.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button === 0) this.pinAt(pointFromEvent(e));
      },
      { signal },
    );
    this.onViewportChange(
      signal,
      rafThrottle(() => {
        this.render();
      }),
    );

    if (this.pinned) this.showPanel();
    this.render();
  }

  protected override onDeactivate(): void {
    this.panel?.destroy();
    this.panel = null;
    this.hovered = null;
    this.previewed = null;
  }

  override reset(): void {
    this.pinned = null;
  }

  /** Pins the element under a viewport point (also used by Ctrl/Cmd+Shift+Click). */
  pinAt(point: Point): void {
    const element = this.elementAt(point);
    if (!element) return;
    this.pinned = { element, chain: ancestry(element), click: toDocument(point, scrollPosition()) };
    this.showPanel();
    this.render();
  }

  override handleEscape(): boolean {
    if (!this.pinned) return false;
    this.unpin();
    return true;
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (!this.pinned || event.metaKey || event.ctrlKey || event.altKey) return false;
    const current = this.pinned.element;
    const next =
      event.key === 'ArrowUp'
        ? parentOf(current)
        : event.key === 'ArrowDown'
          ? current.firstElementChild
          : event.key === 'ArrowLeft'
            ? current.previousElementSibling
            : event.key === 'ArrowRight'
              ? current.nextElementSibling
              : undefined;
    if (next === undefined) return false;
    if (next) {
      const inChain = this.pinned.chain.includes(next);
      this.pinned = {
        ...this.pinned,
        element: next,
        chain: inChain ? this.pinned.chain : ancestry(next),
      };
      this.showPanel();
      this.render();
    }
    return true;
  }

  override refresh(): void {
    if (this.pinned) this.showPanel();
    this.render();
  }

  private unpin(): void {
    this.pinned = null;
    this.panel?.destroy();
    this.panel = null;
    this.render();
  }

  private select(element: Element): void {
    if (!this.pinned) return;
    this.pinned = { ...this.pinned, element };
    this.previewed = null;
    this.showPanel();
    this.render();
  }

  private render(): void {
    this.renderPinned();
    this.renderHover();
  }

  private renderHover(): void {
    if (!this.hoverLayer) return;
    const target = this.previewed ?? this.hovered;
    if (!target || target === this.pinned?.element || !target.isConnected) {
      this.hoverLayer.replaceChildren();
      return;
    }
    const model = boxModel(target);
    const nodes = this.previewed
      ? [box(model.border, 'ct-outline ct-outline--dashed')]
      : [...boxModelNodes(model), box(model.border, 'ct-outline')];
    this.hoverLayer.replaceChildren(
      ...nodes,
      rectLabel(
        model.border,
        elementLabel(target),
        this.size(model.border.width, model.border.height),
      ),
    );
    if (this.previewed && this.pinned?.click) {
      this.hoverLayer.append(...this.clickNodes(this.previewed));
    }
  }

  private renderPinned(): void {
    if (!this.pinLayer) return;
    const pinned = this.pinned;
    if (!pinned) {
      this.pinLayer.replaceChildren();
      return;
    }
    if (!pinned.element.isConnected) {
      // The page re-rendered and removed the element (common in SPAs).
      this.unpin();
      this.ctx.toast('The pinned element was removed from the page');
      return;
    }
    const model = boxModel(pinned.element);
    this.pinLayer.replaceChildren(
      ...boxModelNodes(model),
      box(model.border, 'ct-outline'),
      ...(this.previewed ? [] : this.clickNodes(pinned.element)),
    );
    this.panel?.avoid(model.border);
  }

  /** Crosshair lines through the click point, clipped to `element`, with relative coordinates. */
  private clickNodes(element: Element): HTMLElement[] {
    if (!this.pinned?.click) return [];
    const point = toViewport(this.pinned.click, scrollPosition());
    const rect = toRect(element.getBoundingClientRect());
    if (!containsPoint(rect, point)) return [];
    const rx = point.x - rect.x;
    const ry = point.y - rect.y;
    return [
      vLine(rect.y, rect.y + rect.height, point.x, 'ct-line--dashed'),
      hLine(rect.x, rect.x + rect.width, point.y, 'ct-line--dashed'),
      box({ x: point.x, y: point.y, width: 0, height: 0 }, 'ct-dot'),
      label(
        `${this.length(rx, 'x')}, ${this.length(ry, 'y')}`,
        point.x,
        point.y + 18,
        'ct-label--dark',
      ),
    ];
  }

  private showPanel(): void {
    if (!this.pinned || !this.root) return;
    this.panel ??= new Panel({
      title: '',
      icon: 'inspect',
      onClose: () => {
        this.unpin();
      },
    }).mount(this.ctx.host.ui);
    const element = this.pinned.element;
    const selector = uniqueSelector(element);
    this.panel.setTitle(elementLabel(element));
    this.panel.setActions(copyButton(selector, 'selector', this.ctx.copy));
    this.panel.setContent(
      this.elementSection(element, selector),
      this.clickSection(element),
      this.boxSection(element),
      this.layoutSection(element),
      this.typographySection(element),
      this.accessibilitySection(element),
      this.hierarchySection(),
      this.actionsRow(element, selector),
    );
  }

  private elementSection(element: Element, selector: string): HTMLElement {
    const rect = element.getBoundingClientRect();
    const scroll = scrollPosition();
    const copy = this.ctx.copy;
    return section('Element', [
      row('Size', this.size(rect.width, rect.height), { copy }),
      row('Viewport', `${px(rect.x)}, ${px(rect.y)}`, { copy }),
      row('Page', `${px(rect.x + scroll.x)}, ${px(rect.y + scroll.y)}`, { copy }),
      row('Selector', selector, { copy }),
    ]);
  }

  private clickSection(element: Element): HTMLElement | null {
    const click = this.pinned?.click;
    if (!click) return null;
    const point = toViewport(click, scrollPosition());
    const rect = element.getBoundingClientRect();
    const copy = this.ctx.copy;
    const inside = containsPoint(toRect(rect), point);
    return section('Click point', [
      inside
        ? row('In element', `${px(point.x - rect.x)}, ${px(point.y - rect.y)}`, { copy })
        : note('The click point is outside this element.'),
      row('Viewport', `${px(point.x)}, ${px(point.y)}`, { copy }),
      row('Page', `${px(click.x)}, ${px(click.y)}`, { copy }),
    ]);
  }

  private boxSection(element: Element): HTMLElement {
    const { margin, border, padding } = boxSides(element);
    const rect = element.getBoundingClientRect();
    const content = {
      width: rect.width - border.left - border.right - padding.left - padding.right,
      height: rect.height - border.top - border.bottom - padding.top - padding.bottom,
    };
    const layer = (name: string, sides: Sides, inner: HTMLElement) =>
      h('div', { class: `ct-bmd__layer ct-bmd__layer--${name}` }, [
        h('span', { class: 'ct-bmd__name', text: name }),
        h('span', { class: 'ct-bmd__top', text: formatNumber(sides.top) }),
        h('span', { class: 'ct-bmd__left', text: formatNumber(sides.left) }),
        inner,
        h('span', { class: 'ct-bmd__right', text: formatNumber(sides.right) }),
        h('span', { class: 'ct-bmd__bottom', text: formatNumber(sides.bottom) }),
      ]);
    const diagram = layer(
      'margin',
      margin,
      layer(
        'border',
        border,
        layer(
          'padding',
          padding,
          h('div', {
            class: 'ct-bmd__content',
            text: `${formatNumber(Math.max(0, content.width))} × ${formatNumber(Math.max(0, content.height))}`,
          }),
        ),
      ),
    );
    return section('Box model', [
      h('div', { class: 'ct-bmd' }, [diagram]),
      row('Margin', sidesText(margin), { copy: this.ctx.copy }),
      row('Padding', sidesText(padding), { copy: this.ctx.copy }),
    ]);
  }

  private layoutSection(element: Element): HTMLElement {
    const style = getComputedStyle(element);
    const copy = this.ctx.copy;
    const rows = [
      row('Display', style.display, { copy }),
      row('Position', style.position, { copy }),
    ];
    if (style.display.includes('flex')) {
      rows.push(
        row('Direction', style.flexDirection, { copy }),
        row('Justify', style.justifyContent, { copy }),
        row('Align', style.alignItems, { copy }),
      );
    }
    if (style.display.includes('grid')) {
      rows.push(
        row('Columns', style.gridTemplateColumns, { copy }),
        row('Rows', style.gridTemplateRows, { copy }),
      );
    }
    if (
      /flex|grid/.test(style.display) &&
      (style.rowGap !== 'normal' || style.columnGap !== 'normal')
    ) {
      rows.push(
        row(
          'Gap',
          style.rowGap === style.columnGap ? style.rowGap : `${style.rowGap} ${style.columnGap}`,
          { copy },
        ),
      );
    }
    return section('Layout', rows);
  }

  private typographySection(element: Element): HTMLElement | null {
    if (!hasOwnText(element)) return null;
    const style = getComputedStyle(element);
    const copy = this.ctx.copy;
    const color = parseColor(style.color);
    return section('Typography', [
      row('Font', primaryFontFamily(style.fontFamily), {
        copy,
        copyText: style.fontFamily,
        mono: false,
      }),
      row('Size / line', `${style.fontSize} / ${style.lineHeight}`, { copy }),
      row('Weight', style.fontWeight, { copy }),
      color ? row('Color', toHex(color), { copy, prefix: swatch(style.color) }) : null,
    ]);
  }

  private accessibilitySection(element: Element): HTMLElement {
    const children: (HTMLElement | null)[] = [];
    const style = getComputedStyle(element);

    if (hasOwnText(element)) {
      const fg = parseColor(style.color);
      if (fg) {
        const bg = effectiveBackground(element);
        const ratio = contrastRatio(fg, bg);
        const level = wcagLevel(
          ratio,
          isLargeText(parseFloat(style.fontSize), parseInt(style.fontWeight, 10)),
        );
        const tone: BadgeTone = level === 'Fail' ? 'bad' : level === 'AA Large' ? 'warn' : 'good';
        children.push(
          row('Contrast', `${formatNumber(ratio)}:1`, {
            prefix: swatch(toHex(bg)),
            suffix: badge(level, tone),
          }),
        );
      }
    }

    if (isInteractive(element)) {
      const rect = element.getBoundingClientRect();
      const smallest = Math.min(rect.width, rect.height);
      const tone: BadgeTone =
        smallest < MIN_TARGET ? 'bad' : smallest < COMFORT_TARGET ? 'warn' : 'good';
      const verdict = tone === 'bad' ? 'Too small' : tone === 'warn' ? 'AA' : 'AAA';
      children.push(
        row('Touch target', this.size(rect.width, rect.height), { suffix: badge(verdict, tone) }),
      );
      if (tone === 'bad') {
        children.push(
          note(
            `Interactive targets should be at least ${MIN_TARGET}×${MIN_TARGET}px (WCAG 2.5.8).`,
            'bad',
          ),
        );
      }
    }

    const name = accessibleName(element);
    children.push(row('Name', name || '—', { mono: false }));
    const role = element.getAttribute('role');
    if (role) children.push(row('Role', role));
    if (element instanceof HTMLImageElement && !element.hasAttribute('alt')) {
      children.push(note('Image is missing an alt attribute.', 'bad'));
    }
    return section('Accessibility', children);
  }

  private hierarchySection(): HTMLElement | null {
    const pinned = this.pinned;
    if (!pinned) return null;
    const crumbs = [...pinned.chain].reverse().map((ancestor) =>
      h('button', {
        class: `ct-crumb${ancestor === pinned.element ? ' is-active' : ''}`,
        text: elementLabel(ancestor),
        title: 'Click to select · hover to preview coordinates',
        attrs: { type: 'button' },
        on: {
          click: () => {
            this.select(ancestor);
          },
          pointerenter: () => {
            this.previewed = ancestor === pinned.element ? null : ancestor;
            this.render();
          },
          pointerleave: () => {
            this.previewed = null;
            this.render();
          },
        },
      }),
    );
    return section('Hierarchy', [h('div', { class: 'ct-crumbs' }, crumbs)]);
  }

  private actionsRow(element: Element, selector: string): HTMLElement {
    return h('div', { class: 'ct-actions' }, [
      button(
        'Copy selector',
        () => {
          this.ctx.copy(selector, 'selector');
        },
        'primary',
      ),
      button('Copy JSON', () => {
        this.ctx.copy(this.toJson(element, selector), 'JSON');
      }),
    ]);
  }

  private toJson(element: Element, selector: string): string {
    const rect = element.getBoundingClientRect();
    const click = this.pinned?.click ? toViewport(this.pinned.click, scrollPosition()) : null;
    const round = (n: number) => Number(formatNumber(n));
    return JSON.stringify(
      {
        element: element.tagName.toLowerCase(),
        selector,
        rect: {
          x: round(rect.x),
          y: round(rect.y),
          width: round(rect.width),
          height: round(rect.height),
        },
        ...(click && {
          click: {
            x: round(click.x - rect.x),
            y: round(click.y - rect.y),
            clientX: round(click.x),
            clientY: round(click.y),
          },
        }),
      },
      null,
      2,
    );
  }
}

function accessibleName(element: Element): string {
  const labelledBy = (element.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent.trim() ?? '')
    .join(' ')
    .trim();
  const candidates = [
    element.getAttribute('aria-label'),
    labelledBy,
    element.getAttribute('alt'),
    element.getAttribute('title'),
    // innerText keeps word breaks between elements; skip it for huge subtrees (e.g. <body>).
    element instanceof HTMLElement && element.childElementCount < 50
      ? element.innerText.slice(0, 400)
      : element.textContent.slice(0, 400),
  ];
  const name = candidates.map((value) => value?.trim() ?? '').find((value) => value !== '') ?? '';
  return name.replace(/\s+/g, ' ').slice(0, 80);
}
