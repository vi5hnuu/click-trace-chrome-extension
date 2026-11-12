/** Minimal CSS.escape fallback for identifiers (jsdom and very old engines lack CSS.escape). */
export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value
    .replace(/[^\w-]/g, (ch) => `\\${ch}`)
    .replace(/^(-?)(\d)/, (_m, dash: string, digit: string) => `${dash}\\3${digit} `);
}

/** Class names that look generated (CSS-in-JS hashes, utility state) make poor selectors. */
const UNSTABLE_CLASS =
  /^(css|sc|jsx|svelte|emotion|chakra|mui)-|[0-9a-f]{5,}|^_|__[a-z0-9]{5,}$|:/i;

export function stableClasses(element: Element, limit = 2): string[] {
  return [...element.classList].filter((name) => !UNSTABLE_CLASS.test(name)).slice(0, limit);
}

/** Human readable label such as `button#save.btn.primary`. */
export function elementLabel(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = [...element.classList]
    .slice(0, 2)
    .map((name) => `.${name}`)
    .join('');
  return `${tag}${id}${classes}`;
}

function isUnique(selector: string, root: ParentNode): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function segmentFor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const classes = stableClasses(element)
    .map((name) => `.${cssEscape(name)}`)
    .join('');
  const parent = element.parentElement;
  if (!parent) return `${tag}${classes}`;
  const sameTag = [...parent.children].filter((child) => child.tagName === element.tagName);
  if (sameTag.length === 1) return `${tag}${classes}`;
  const sameSegment = classes
    ? sameTag.filter((child) => child.matches(`${tag}${classes}`))
    : sameTag;
  if (sameSegment.length === 1) return `${tag}${classes}`;
  return `${tag}${classes}:nth-of-type(${sameTag.indexOf(element) + 1})`;
}

/**
 * Builds the shortest reasonably stable selector that matches only `element`,
 * preferring ids, then stable class names, then :nth-of-type.
 */
export function uniqueSelector(element: Element): string {
  const root = element.getRootNode() as ParentNode;
  if (element.id && isUnique(`#${cssEscape(element.id)}`, root)) return `#${cssEscape(element.id)}`;

  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    if (current !== element && current.id && isUnique(`#${cssEscape(current.id)}`, root)) {
      segments.unshift(`#${cssEscape(current.id)}`);
      break;
    }
    segments.unshift(segmentFor(current));
    const selector = segments.join(' > ');
    if (isUnique(selector, root)) return selector;
    current = current.parentElement;
  }
  return segments.join(' > ') || element.tagName.toLowerCase();
}
