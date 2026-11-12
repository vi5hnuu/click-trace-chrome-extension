import { createIcon, type IconName } from '../../shared/icons';
import { h } from './h';

export type CopyHandler = (text: string, label: string) => void;
export type BadgeTone = 'good' | 'warn' | 'bad' | 'neutral';

export function iconButton(
  icon: IconName,
  label: string,
  onClick: (event: MouseEvent) => void,
  className = 'ct-icon-btn',
): HTMLButtonElement {
  const button = h('button', {
    class: className,
    attrs: { type: 'button', 'aria-label': label, 'data-tip': label },
    on: { click: onClick },
  });
  button.append(createIcon(icon, 15));
  return button;
}

export function button(
  label: string,
  onClick: () => void,
  variant: 'primary' | 'ghost' = 'ghost',
): HTMLButtonElement {
  return h('button', {
    class: `ct-btn ct-btn--${variant}`,
    text: label,
    attrs: { type: 'button' },
    on: { click: onClick },
  });
}

export function copyButton(text: string, label: string, copy: CopyHandler): HTMLButtonElement {
  return iconButton('copy', `Copy ${label}`, () => {
    copy(text, label);
  });
}

export function section(title: string, children: readonly (Node | null)[]): HTMLElement {
  return h('section', { class: 'ct-section' }, [
    h('h3', { class: 'ct-section__title', text: title }),
    ...children,
  ]);
}

export function swatch(color: string): HTMLElement {
  const element = h('span', { class: 'ct-swatch' });
  element.style.setProperty('--swatch', color);
  return element;
}

export function badge(text: string, tone: BadgeTone): HTMLElement {
  return h('span', { class: `ct-badge ct-badge--${tone}`, text });
}

export interface RowOptions {
  readonly copy?: CopyHandler;
  readonly copyText?: string;
  readonly mono?: boolean;
  readonly prefix?: Node;
  readonly suffix?: Node;
}

/** Key/value row; values are monospace and copyable when a copy handler is given. */
export function row(key: string, value: string, options: RowOptions = {}): HTMLElement {
  const valueElement = h('span', {
    class: `ct-row__value${options.mono === false ? '' : ' ct-mono'}`,
    text: value,
    title: value,
  });
  return h('div', { class: 'ct-row' }, [
    h('span', { class: 'ct-row__key', text: key }),
    h('span', { class: 'ct-row__main' }, [options.prefix, valueElement, options.suffix]),
    options.copy ? copyButton(options.copyText ?? value, key, options.copy) : null,
  ]);
}

export function note(text: string, tone: BadgeTone = 'neutral'): HTMLElement {
  return h('p', { class: `ct-note ct-note--${tone}`, text });
}

export function kbd(key: string): HTMLElement {
  return h('kbd', { class: 'ct-kbd', text: key });
}

/** Single-choice pill group. */
export function segmented<T extends string>(
  options: readonly { readonly value: T; readonly label: string }[],
  selected: T,
  onChange: (value: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'ct-segmented', attrs: { role: 'radiogroup' } },
    options.map(({ value, label }) =>
      h('button', {
        text: label,
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(value === selected) },
        on: {
          click: () => {
            onChange(value);
          },
        },
      }),
    ),
  );
}

/** Labelled on/off switch. */
export function toggle(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const input = h('input', {
    class: 'ct-switch',
    attrs: { type: 'checkbox', role: 'switch', ...(checked && { checked: '' }) },
    on: {
      change: (event) => {
        onChange((event.target as HTMLInputElement).checked);
      },
    },
  });
  return h('label', { class: 'ct-toggle' }, [h('span', { text: label }), input]);
}
