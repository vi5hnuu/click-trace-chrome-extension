import type { Rect } from '../lib/geometry';

type Child = Node | string | null | undefined | false;

type EventHandlers = {
  [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
};

export interface ElementProps {
  readonly class?: string;
  readonly text?: string;
  readonly title?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: EventHandlers;
}

/**
 * Tiny hyperscript helper. Text is always assigned via textContent, so page-derived
 * strings (class names, ids, values) can never be interpreted as HTML.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.title) element.title = props.title;
  for (const [name, value] of Object.entries(props.attrs ?? {})) element.setAttribute(name, value);
  for (const [type, handler] of Object.entries(props.on ?? {})) {
    element.addEventListener(type, handler as EventListener);
  }
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

/** Positions a fixed-position overlay element over a viewport rectangle. */
export function placeBox(element: HTMLElement, rect: Rect): void {
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

export function placeAt(element: HTMLElement, x: number, y: number): void {
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
}
