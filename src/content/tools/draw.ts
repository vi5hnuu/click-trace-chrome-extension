import { clamp, type Gap, type Rect } from '../lib/geometry';
import type { BoxModel } from '../lib/dom';
import { h, placeBox } from '../overlay/h';

const EDGE = 4;
/** Approximate width of a monospace label, used to keep centred labels fully on screen. */
const approxLabelWidth = (text: string) => text.length * 6.8 + 12;

export function box(rect: Rect, className: string): HTMLElement {
  const element = h('div', { class: `ct-box ${className}` });
  placeBox(element, rect);
  return element;
}

/**
 * DevTools-style box model: each ring is drawn as a border whose widths equal the
 * margin / border / padding sizes, so the layers never overlap or blend.
 */
export function boxModelNodes(model: BoxModel): HTMLElement[] {
  const ring = (outer: Rect, inner: Rect, className: string) => {
    const element = box(outer, className);
    element.style.borderWidth = [
      inner.y - outer.y,
      outer.x + outer.width - (inner.x + inner.width),
      outer.y + outer.height - (inner.y + inner.height),
      inner.x - outer.x,
    ]
      .map((n) => `${Math.max(0, n)}px`)
      .join(' ');
    return element;
  };
  return [
    ring(model.margin, model.border, 'ct-bm-margin'),
    ring(model.border, model.padding, 'ct-bm-border'),
    ring(model.padding, model.content, 'ct-bm-padding'),
    box(model.content, 'ct-bm-content'),
  ];
}

export function hLine(x1: number, x2: number, y: number, className = ''): HTMLElement {
  return box(
    { x: Math.min(x1, x2), y, width: Math.abs(x2 - x1), height: 1 },
    `ct-line ct-line--h ${className}`,
  );
}

export function vLine(y1: number, y2: number, x: number, className = ''): HTMLElement {
  return box(
    { x, y: Math.min(y1, y2), width: 1, height: Math.abs(y2 - y1) },
    `ct-line ct-line--v ${className}`,
  );
}

/** A pill label centred on (x, y), kept inside the viewport. */
export function label(text: string, x: number, y: number, className = ''): HTMLElement {
  const element = h('div', { class: `ct-label ${className}`, text });
  const half = approxLabelWidth(text) / 2;
  element.style.left = `${clamp(x, half + EDGE, window.innerWidth - half - EDGE)}px`;
  element.style.top = `${clamp(y, 12, window.innerHeight - 12)}px`;
  return element;
}

/** Element tag + size label anchored above (or below, near the top edge) a rectangle. */
export function rectLabel(rect: Rect, name: string, size: string): HTMLElement {
  const element = h('div', { class: 'ct-label ct-label--anchor-start' }, [
    document.createTextNode(`${name} `),
    h('span', { class: 'ct-label__muted', text: size }),
  ]);
  const above = rect.y > 26;
  element.style.left = `${clamp(rect.x, 4, window.innerWidth - 160)}px`;
  element.style.top = `${above ? rect.y : rect.y + rect.height + 26}px`;
  return element;
}

/** Draws distance lines with a centred value label for each gap. */
export function gapNodes(
  gaps: readonly Gap[],
  format: (gap: Gap) => string,
  danger = true,
): HTMLElement[] {
  const tone = danger ? 'ct-line--danger' : '';
  const labelTone = danger ? 'ct-label--danger' : '';
  return gaps.flatMap((gap) => {
    const middle = (gap.from + gap.to) / 2;
    return gap.axis === 'x'
      ? [hLine(gap.from, gap.to, gap.at, tone), label(format(gap), middle, gap.at, labelTone)]
      : [vLine(gap.from, gap.to, gap.at, tone), label(format(gap), gap.at, middle, labelTone)];
  });
}
