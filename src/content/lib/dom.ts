import { blend, parseColor, type Rgba } from './color';
import { inset, type Point, type Rect, toRect } from './geometry';
import type { UnitContext } from './units';

export interface BoxModel {
  readonly margin: Rect;
  readonly border: Rect;
  readonly padding: Rect;
  readonly content: Rect;
}

export interface Sides {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const px = (value: string) => parseFloat(value) || 0;

function sides(style: CSSStyleDeclaration, prefix: string, suffix = ''): Sides {
  return {
    top: px(style.getPropertyValue(`${prefix}-top${suffix}`)),
    right: px(style.getPropertyValue(`${prefix}-right${suffix}`)),
    bottom: px(style.getPropertyValue(`${prefix}-bottom${suffix}`)),
    left: px(style.getPropertyValue(`${prefix}-left${suffix}`)),
  };
}

const negate = (s: Sides): Sides => ({
  top: -Math.max(0, s.top),
  right: -Math.max(0, s.right),
  bottom: -Math.max(0, s.bottom),
  left: -Math.max(0, s.left),
});

/** Viewport-space margin / border / padding / content boxes of an element. */
export function boxModel(element: Element): BoxModel {
  const style = getComputedStyle(element);
  const border = toRect(element.getBoundingClientRect());
  const padding = inset(border, sides(style, 'border', '-width'));
  return {
    margin: inset(border, negate(sides(style, 'margin'))),
    border,
    padding,
    content: inset(padding, sides(style, 'padding')),
  };
}

export function boxSides(element: Element): { margin: Sides; border: Sides; padding: Sides } {
  const style = getComputedStyle(element);
  return {
    margin: sides(style, 'margin'),
    border: sides(style, 'border', '-width'),
    padding: sides(style, 'padding'),
  };
}

export function scrollPosition(): Point {
  return { x: window.scrollX, y: window.scrollY };
}

export function unitContexts(): { x: UnitContext; y: UnitContext } {
  const rootFontSize = px(getComputedStyle(document.documentElement).fontSize) || 16;
  return {
    x: { rootFontSize, reference: window.innerWidth },
    y: { rootFontSize, reference: window.innerHeight },
  };
}

/**
 * The page element under a viewport point, ignoring our own overlay and descending
 * into open shadow roots so web components can be inspected.
 */
export function pageElementAt(point: Point, overlayHost: Element): Element | null {
  const isPageElement = (el: Element) => el !== overlayHost && !overlayHost.contains(el);
  let found = document.elementsFromPoint(point.x, point.y).find(isPageElement) ?? null;
  while (found?.shadowRoot) {
    const inner = found.shadowRoot.elementsFromPoint(point.x, point.y).find(isPageElement);
    if (!inner || inner === found) break;
    found = inner;
  }
  return found;
}

/** Every page element stacked under a point (top-most first), excluding the overlay. */
export function pageElementsAt(point: Point, overlayHost: Element): Element[] {
  return document
    .elementsFromPoint(point.x, point.y)
    .filter((el) => el !== overlayHost && !overlayHost.contains(el));
}

/** Parent element, crossing shadow-root boundaries. */
export function parentOf(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** The element and all of its ancestors, innermost first. */
export function ancestry(element: Element): Element[] {
  const chain: Element[] = [];
  for (let current: Element | null = element; current; current = parentOf(current)) {
    chain.push(current);
  }
  return chain;
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** Approximates the colour behind an element by compositing ancestor backgrounds over white. */
export function effectiveBackground(element: Element): Rgba {
  const layers: Rgba[] = [];
  for (let current: Element | null = element; current; current = parentOf(current)) {
    const color = parseColor(getComputedStyle(current).backgroundColor);
    if (color && color.a > 0) {
      layers.push(color);
      if (color.a >= 1) break;
    }
  }
  return layers.reduceRight<Rgba>((base, layer) => blend(layer, base), WHITE);
}

export function hasOwnText(element: Element): boolean {
  return [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
  );
}

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function isInteractive(element: Element): boolean {
  return element.matches(INTERACTIVE_SELECTOR);
}

/** Copies text, falling back to a hidden textarea when the async Clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.append(textarea);
    textarea.select();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- last-resort fallback
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  }
}

/** Coalesces calls to once per animation frame, always using the latest arguments. */
export function rafThrottle<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let frame = 0;
  let latest: A;
  return (...args: A) => {
    latest = args;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fn(...latest);
    });
  };
}

export function isEditableTarget(event: Event): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
