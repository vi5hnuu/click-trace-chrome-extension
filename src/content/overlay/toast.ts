import { h } from './h';

const VISIBLE_MS = 1600;

export class Toast {
  readonly element = h('div', {
    class: 'ct-toast',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  private timer = 0;

  show(message: string): void {
    this.element.textContent = message;
    this.element.classList.add('is-visible');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.element.classList.remove('is-visible');
    }, VISIBLE_MS);
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.element.remove();
  }
}
