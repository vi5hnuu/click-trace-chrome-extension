import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, nextUnit } from '../../src/shared/settings';

describe('mergeSettings', () => {
  it('returns defaults for missing data', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects malformed values and clamps numbers', () => {
    const merged = mergeSettings({
      theme: 'neon',
      accent: 'red',
      unit: 'rem',
      snapping: 'yes',
      grid: { columns: 99, gutter: -5 },
      recentColors: ['#ffffff', 'nope', 3],
      toolbarPosition: { x: 10 },
    });
    expect(merged.theme).toBe('system');
    expect(merged.accent).toBe(DEFAULT_SETTINGS.accent);
    expect(merged.unit).toBe('rem');
    expect(merged.snapping).toBe(true);
    expect(merged.grid.columns).toBe(24);
    expect(merged.grid.gutter).toBe(0);
    expect(merged.recentColors).toEqual(['#ffffff']);
    expect(merged.toolbarPosition).toBeNull();
  });
});

describe('nextUnit', () => {
  it('cycles through units', () => {
    expect(nextUnit('px')).toBe('rem');
    expect(nextUnit('rem')).toBe('%');
    expect(nextUnit('%')).toBe('px');
  });
});
