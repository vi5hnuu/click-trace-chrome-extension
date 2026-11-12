import { describe, expect, it } from 'vitest';
import {
  blend,
  contrastRatio,
  isLargeText,
  parseColor,
  toHex,
  toHslString,
  toOklchString,
  toRgbString,
  wcagLevel,
} from '../../src/content/lib/color';

const black = { r: 0, g: 0, b: 0, a: 1 };
const white = { r: 255, g: 255, b: 255, a: 1 };

describe('parseColor', () => {
  it.each([
    ['#fff', white],
    ['#000000', black],
    ['#ff000080', { r: 255, g: 0, b: 0, a: 128 / 255 }],
    ['rgb(0, 0, 0)', black],
    ['rgba(255, 255, 255, 0.5)', { ...white, a: 0.5 }],
    ['rgb(255 255 255 / 50%)', { ...white, a: 0.5 }],
    ['color(srgb 1 1 1)', white],
    ['transparent', { r: 0, g: 0, b: 0, a: 0 }],
  ])('parses %s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it('rejects unsupported input', () => {
    expect(parseColor('#ggg')).toBeNull();
    expect(parseColor('lab(50% 0 0)')).toBeNull();
  });
});

describe('formatting', () => {
  const red = { r: 255, g: 0, b: 0, a: 1 };
  it('formats hex, rgb and hsl', () => {
    expect(toHex(red)).toBe('#ff0000');
    expect(toHex({ ...red, a: 0.5 })).toBe('#ff000080');
    expect(toRgbString(red)).toBe('rgb(255 0 0)');
    expect(toRgbString({ ...red, a: 0.5 })).toBe('rgb(255 0 0 / 0.5)');
    expect(toHslString(red)).toBe('hsl(0 100% 50%)');
    expect(toHslString({ r: 0, g: 0, b: 255, a: 1 })).toBe('hsl(240 100% 50%)');
  });

  it('converts to OKLCH', () => {
    expect(toOklchString(white)).toBe('oklch(100.0% 0.000 0)');
    expect(toOklchString(red)).toBe('oklch(62.8% 0.258 29.2)');
  });
});

describe('contrast', () => {
  it('computes the WCAG contrast ratio', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    expect(contrastRatio({ r: 118, g: 118, b: 118, a: 1 }, white)).toBeCloseTo(4.54, 2);
  });

  it('blends translucent foregrounds before measuring', () => {
    expect(blend({ ...black, a: 0.5 }, white)).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(contrastRatio({ ...black, a: 0 }, white)).toBeCloseTo(1, 5);
  });

  it('grades WCAG levels', () => {
    expect(wcagLevel(7.1)).toBe('AAA');
    expect(wcagLevel(4.6)).toBe('AA');
    expect(wcagLevel(3.2)).toBe('AA Large');
    expect(wcagLevel(3.2, true)).toBe('AA');
    expect(wcagLevel(2)).toBe('Fail');
  });

  it('detects large text', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(19, 700)).toBe(true);
    expect(isLargeText(19, 400)).toBe(false);
  });
});
