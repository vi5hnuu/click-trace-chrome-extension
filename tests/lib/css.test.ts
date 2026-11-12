import { describe, expect, it } from 'vitest';
import {
  primaryFontFamily,
  readStyleGroups,
  shorthand,
  toCssText,
} from '../../src/content/lib/css';

const styles = (values: Record<string, string>) => ({
  getPropertyValue: (property: string) => values[property] ?? '',
});

describe('readStyleGroups', () => {
  it('drops default values unless requested', () => {
    const source = styles({
      display: 'block',
      position: 'static',
      gap: '8px',
      color: 'rgb(0, 0, 0)',
    });
    const groups = readStyleGroups(source);
    expect(groups.find((g) => g.title === 'Layout')?.entries).toEqual([
      { property: 'display', value: 'block' },
      { property: 'gap', value: '8px' },
    ]);
    const all = readStyleGroups(source, true);
    expect(all.find((g) => g.title === 'Layout')?.entries.map((e) => e.property)).toContain(
      'position',
    );
  });
});

describe('helpers', () => {
  it('formats CSS text', () => {
    expect(toCssText('.a', [{ property: 'color', value: 'red' }])).toBe('.a {\n  color: red;\n}');
  });

  it('extracts the primary font family', () => {
    expect(primaryFontFamily('"Inter Var", system-ui, sans-serif')).toBe('Inter Var');
  });

  it('collapses box shorthands', () => {
    expect(shorthand('8px', '8px', '8px', '8px')).toBe('8px');
    expect(shorthand('8px', '16px', '8px', '16px')).toBe('8px 16px');
    expect(shorthand('1px', '2px', '3px', '2px')).toBe('1px 2px 3px');
    expect(shorthand('1px', '2px', '3px', '4px')).toBe('1px 2px 3px 4px');
  });
});
