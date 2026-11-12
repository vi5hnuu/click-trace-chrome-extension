export interface StyleEntry {
  readonly property: string;
  readonly value: string;
}

export interface StyleGroup {
  readonly title: string;
  readonly entries: readonly StyleEntry[];
}

interface StyleSource {
  getPropertyValue(property: string): string;
}

const GROUPS: readonly { title: string; properties: readonly string[] }[] = [
  {
    title: 'Layout',
    properties: [
      'display',
      'position',
      'top',
      'right',
      'bottom',
      'left',
      'z-index',
      'flex-direction',
      'flex-wrap',
      'justify-content',
      'align-items',
      'align-content',
      'gap',
      'row-gap',
      'column-gap',
      'grid-template-columns',
      'grid-template-rows',
      'flex',
      'align-self',
      'order',
      'overflow',
    ],
  },
  {
    title: 'Box',
    properties: [
      'width',
      'height',
      'min-width',
      'max-width',
      'min-height',
      'max-height',
      'box-sizing',
      'margin',
      'padding',
      'border',
      'border-radius',
      'outline',
    ],
  },
  {
    title: 'Typography',
    properties: [
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'text-align',
      'text-transform',
      'text-decoration',
      'white-space',
      'color',
    ],
  },
  {
    title: 'Visual',
    properties: [
      'background-color',
      'background-image',
      'opacity',
      'box-shadow',
      'filter',
      'backdrop-filter',
      'transform',
      'transition',
      'cursor',
    ],
  },
];

/** Values that are browser defaults for most elements and add noise when listed. */
const DEFAULT_VALUES = new Set([
  '',
  'none',
  'normal',
  'auto',
  '0px',
  '0',
  '1',
  '0s',
  'static',
  'visible',
  'rgba(0, 0, 0, 0)',
  'nowrap',
  'row',
  'stretch',
  'start',
  'flex-start',
  'content-box',
  'medium none rgb(0, 0, 0)',
  '0px none rgb(0, 0, 0)',
  'all',
  'all 0s ease 0s',
  '0 1 auto',
]);

/** Always shown because they are the first thing developers look for. */
const ALWAYS_SHOWN = new Set([
  'display',
  'width',
  'height',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'color',
]);

export function isDefaultValue(property: string, value: string): boolean {
  return !ALWAYS_SHOWN.has(property) && DEFAULT_VALUES.has(value.trim());
}

/** Collects the developer-relevant computed styles, grouped and optionally without defaults. */
export function readStyleGroups(style: StyleSource, includeDefaults = false): StyleGroup[] {
  return GROUPS.map(({ title, properties }) => ({
    title,
    entries: properties
      .map((property) => ({ property, value: style.getPropertyValue(property).trim() }))
      .filter(
        ({ property, value }) =>
          value !== '' && (includeDefaults || !isDefaultValue(property, value)),
      ),
  })).filter((group) => group.entries.length > 0);
}

export function toCssText(selector: string, entries: Iterable<StyleEntry>): string {
  const body = [...entries].map(({ property, value }) => `  ${property}: ${value};`).join('\n');
  return `${selector} {\n${body}\n}`;
}

/** First family of a font-family list, without quotes. */
export function primaryFontFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? '';
  return first.trim().replace(/^["']|["']$/g, '');
}

/** Collapses four side values into CSS shorthand (`8px`, `8px 16px`, …). */
export function shorthand(
  top: string,
  rightSide: string,
  bottomSide: string,
  left: string,
): string {
  if (top === rightSide && top === bottomSide && top === left) return top;
  if (top === bottomSide && rightSide === left) return `${top} ${rightSide}`;
  if (rightSide === left) return `${top} ${rightSide} ${bottomSide}`;
  return `${top} ${rightSide} ${bottomSide} ${left}`;
}
