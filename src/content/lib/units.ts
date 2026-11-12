import type { LengthUnit } from '../../shared/settings';

export interface UnitContext {
  /** Root font size in px, used for rem. */
  readonly rootFontSize: number;
  /** Reference length in px for percentages (usually the viewport size on the same axis). */
  readonly reference: number;
}

/** Formats a number with at most `digits` decimals and no trailing zeros. */
export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(digits);
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

export function convertLength(px: number, unit: LengthUnit, context: UnitContext): number {
  switch (unit) {
    case 'px':
      return px;
    case 'rem':
      return context.rootFontSize > 0 ? px / context.rootFontSize : px;
    case '%':
      return context.reference > 0 ? (px / context.reference) * 100 : 0;
  }
}

export function formatLength(px: number, unit: LengthUnit, context: UnitContext): string {
  const digits = unit === 'px' ? 1 : 3;
  return `${formatNumber(convertLength(px, unit, context), digits)}${unit}`;
}

export function formatSize(
  width: number,
  height: number,
  unit: LengthUnit,
  contexts: { readonly x: UnitContext; readonly y: UnitContext },
): string {
  return `${formatLength(width, unit, contexts.x)} × ${formatLength(height, unit, contexts.y)}`;
}
