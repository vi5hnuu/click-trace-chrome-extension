import { describe, expect, it } from 'vitest';
import { convertLength, formatLength, formatNumber } from '../../src/content/lib/units';

const context = { rootFontSize: 16, reference: 1000 };

describe('formatNumber', () => {
  it('trims trailing zeros', () => {
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(12.3456)).toBe('12.35');
    expect(formatNumber(-0.001)).toBe('0');
  });
});

describe('lengths', () => {
  it('converts px to rem and %', () => {
    expect(convertLength(32, 'rem', context)).toBe(2);
    expect(convertLength(250, '%', context)).toBe(25);
    expect(convertLength(10, 'px', context)).toBe(10);
  });

  it('formats with the unit suffix', () => {
    expect(formatLength(24, 'rem', context)).toBe('1.5rem');
    expect(formatLength(100.25, 'px', context)).toBe('100.3px');
  });
});

describe('breakpointFor', async () => {
  const { breakpointFor } = await import('../../src/content/lib/breakpoints');
  it('maps widths to Tailwind breakpoints', () => {
    expect(breakpointFor(320)).toBe('xs');
    expect(breakpointFor(640)).toBe('sm');
    expect(breakpointFor(1023)).toBe('md');
    expect(breakpointFor(1280)).toBe('xl');
    expect(breakpointFor(2000)).toBe('2xl');
  });
});
