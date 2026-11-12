import { BaseTool } from './tool';

/** Colour per element family, so nesting and layout structure are easy to read at a glance. */
const FAMILIES: readonly { readonly selector: string; readonly hue: number }[] = [
  { selector: 'div', hue: 220 },
  { selector: 'section, article, main, aside, header, footer, nav', hue: 270 },
  { selector: 'p, h1, h2, h3, h4, h5, h6, blockquote, pre, code', hue: 150 },
  { selector: 'span, strong, em, b, i, small, label', hue: 180 },
  { selector: 'a, button, input, select, textarea, summary', hue: 0 },
  { selector: 'img, svg, video, canvas, picture, iframe', hue: 35 },
  { selector: 'ul, ol, li, dl, dt, dd, table, tr, td, th', hue: 320 },
  { selector: 'form, fieldset', hue: 60 },
];

const STYLE_ID = 'click-trace-outline-style';

function buildCss(): string {
  const base = `*:not(click-trace-overlay):not(click-trace-design) { outline: 1px solid hsl(0 0% 55% / 0.55) !important; outline-offset: -1px !important; }`;
  const families = FAMILIES.map(
    ({ selector, hue }) =>
      `:is(${selector}) { outline-color: hsl(${hue} 85% 50% / 0.75) !important; }`,
  );
  return [base, ...families].join('\n');
}

/**
 * Outline — draws a 1px outline around every element (in the spirit of the popular
 * "Pesticide" bookmarklet) to reveal structure, overflow and unexpected wrappers.
 * This is the only tool that styles the page itself; the style is removed on deactivate.
 */
export class OutlineTool extends BaseTool {
  readonly id = 'outline';
  readonly hint = '';
  override readonly capturesPointer = false;

  private style: HTMLStyleElement | null = null;

  protected onActivate(): void {
    document.getElementById(STYLE_ID)?.remove();
    this.style = document.createElement('style');
    this.style.id = STYLE_ID;
    this.style.textContent = buildCss();
    (document.querySelector('head') ?? document.documentElement).append(this.style);
  }

  protected override onDeactivate(): void {
    this.style?.remove();
    this.style = null;
  }
}
