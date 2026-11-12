import type { Settings } from '../../shared/settings';
import { h } from './h';
import overlayCss from './styles.css?inline';

const HOST_TAG = 'click-trace-overlay';

/**
 * Owns the single element Click Trace adds to the page.
 *
 * - All UI lives in a closed-off Shadow DOM, so page CSS (resets, `* {}` rules) cannot break it.
 * - The host is a manual popover, which puts it in the browser's top layer: it renders above
 *   every z-index stacking context, including modal <dialog>s and other popovers.
 * - While a modal dialog is open the rest of the document is inert, so the host is moved inside
 *   the top-most modal dialog to stay interactive, and moved back when the dialog closes.
 */
export class OverlayHost {
  readonly element: HTMLElement;
  readonly root: HTMLDivElement;
  /** Full-viewport surface that captures pointer input while a measuring tool is active. */
  readonly stage: HTMLDivElement;
  /** Non-interactive drawing layer for highlights, lines and labels. */
  readonly layer: HTMLDivElement;
  /** Interactive UI: toolbar, panels and toasts. */
  readonly ui: HTMLDivElement;

  private readonly observer = new MutationObserver(() => {
    this.raise();
  });
  private readonly darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly onSchemeChange = () => {
    this.applyTheme(this.themePreference);
  };
  private readonly onToggle = (event: Event) => {
    if (event.target !== this.element && (event as ToggleEvent).newState === 'open') this.raise();
  };
  private themePreference: Settings['theme'] = 'system';

  constructor() {
    this.element = document.createElement(HOST_TAG);
    this.element.setAttribute('popover', 'manual');
    const shadow = this.element.attachShadow({ mode: 'open' });

    this.stage = h('div', { class: 'ct-stage' });
    this.layer = h('div', { class: 'ct-layer' });
    this.ui = h('div', { class: 'ct-ui' });
    this.root = h('div', { class: 'ct-root' }, [this.stage, this.layer, this.ui]);
    shadow.append(h('style', { text: overlayCss }), this.root);
  }

  mount(): void {
    this.raise();
    this.observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    document.addEventListener('toggle', this.onToggle, { capture: true });
    this.darkScheme.addEventListener('change', this.onSchemeChange);
  }

  destroy(): void {
    this.observer.disconnect();
    document.removeEventListener('toggle', this.onToggle, { capture: true });
    this.darkScheme.removeEventListener('change', this.onSchemeChange);
    this.element.remove();
  }

  contains(node: Node | null): boolean {
    return node === this.element || (node !== null && this.element.contains(node));
  }

  applySettings(settings: Settings): void {
    this.root.style.setProperty('--ct-accent', settings.accent);
    this.applyTheme(settings.theme);
  }

  setCapture(capturing: boolean): void {
    this.stage.classList.toggle('is-capturing', capturing);
  }

  setCursor(cursor: string): void {
    this.stage.style.cursor = cursor;
  }

  private applyTheme(preference: Settings['theme']): void {
    this.themePreference = preference;
    const dark = preference === 'dark' || (preference === 'system' && this.darkScheme.matches);
    this.root.dataset.theme = dark ? 'dark' : 'light';
  }

  /** (Re)inserts the host into the top layer above anything the page has opened since. */
  private raise(): void {
    const modals = document.querySelectorAll('dialog:modal');
    const parent = modals[modals.length - 1] ?? document.documentElement;
    if (this.element.parentNode !== parent) parent.append(this.element);
    if (this.element.matches(':popover-open')) this.element.hidePopover();
    this.element.showPopover();
  }
}
