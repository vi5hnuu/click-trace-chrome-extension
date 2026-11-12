import { beforeEach, describe, expect, it } from 'vitest';
import {
  cssEscape,
  elementLabel,
  stableClasses,
  uniqueSelector,
} from '../../src/content/lib/selector';

beforeEach(() => {
  document.body.innerHTML = `
    <main id="app">
      <ul class="list">
        <li class="item">One</li>
        <li class="item active">Two</li>
        <li class="item css-1a2b3c">Three</li>
      </ul>
      <button class="btn primary">Save</button>
    </main>`;
});

const query = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
};

describe('elementLabel', () => {
  it('includes tag, id and the first classes', () => {
    expect(elementLabel(query('#app'))).toBe('main#app');
    expect(elementLabel(query('button'))).toBe('button.btn.primary');
  });
});

describe('stableClasses', () => {
  it('drops generated class names', () => {
    expect(stableClasses(query('.css-1a2b3c'))).toEqual(['item']);
  });
});

describe('uniqueSelector', () => {
  it('produces a selector that matches exactly the element', () => {
    for (const element of document.querySelectorAll('li, button, ul')) {
      const selector = uniqueSelector(element);
      expect(document.querySelectorAll(selector)).toHaveLength(1);
      expect(document.querySelector(selector)).toBe(element);
    }
  });

  it('prefers ids', () => {
    expect(uniqueSelector(query('#app'))).toBe('#app');
  });
});

describe('cssEscape', () => {
  it('escapes leading digits', () => {
    expect(document.querySelectorAll(`#${cssEscape('1abc')}`)).toHaveLength(0);
  });
});
