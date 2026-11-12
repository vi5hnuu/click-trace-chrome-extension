export interface Rgba {
  /** 0–255 */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1 */
  readonly a: number;
}

export type WcagLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail';

const clampByte = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
const clampUnit = (n: number) => Math.min(1, Math.max(0, n));

function parseChannel(token: string, scale: number): number {
  return token.endsWith('%') ? (parseFloat(token) / 100) * scale : parseFloat(token);
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  return clampUnit(token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token));
}

function parseHex(hex: string): Rgba | null {
  const digits = hex.slice(1);
  if (!/^[0-9a-f]+$/i.test(digits) || ![3, 4, 6, 8].includes(digits.length)) return null;
  const full = digits.length <= 4 ? digits.replace(/./g, '$&$&') : digits;
  const channel = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16);
  return {
    r: channel(0),
    g: channel(1),
    b: channel(2),
    a: full.length === 8 ? channel(3) / 255 : 1,
  };
}

/** Splits the arguments of `rgb(…)`, accepting both legacy comma and modern space/slash syntax. */
function splitArgs(body: string): string[] {
  return body.replace(/[,/]/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/**
 * Parses the colour formats returned by getComputedStyle and the EyeDropper:
 * hex, rgb()/rgba() and color(srgb …). Returns null for anything else.
 */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (value.startsWith('#')) return parseHex(value);

  const rgb = /^rgba?\((.+)\)$/.exec(value);
  if (rgb?.[1]) {
    const [r, g, b, a] = splitArgs(rgb[1]);
    if (r === undefined || g === undefined || b === undefined) return null;
    return {
      r: clampByte(parseChannel(r, 255)),
      g: clampByte(parseChannel(g, 255)),
      b: clampByte(parseChannel(b, 255)),
      a: parseAlpha(a),
    };
  }

  const srgb = /^color\(srgb\s+(.+)\)$/.exec(value);
  if (srgb?.[1]) {
    const [r, g, b, a] = splitArgs(srgb[1]);
    if (r === undefined || g === undefined || b === undefined) return null;
    return {
      r: clampByte(parseChannel(r, 1) * 255),
      g: clampByte(parseChannel(g, 1) * 255),
      b: clampByte(parseChannel(b, 1) * 255),
      a: parseAlpha(a),
    };
  }
  return null;
}

const hexByte = (n: number) => clampByte(n).toString(16).padStart(2, '0');

export function toHex({ r, g, b, a }: Rgba): string {
  const alpha = a < 1 ? hexByte(a * 255) : '';
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}${alpha}`;
}

const formatAlpha = (a: number) => String(Math.round(a * 100) / 100);

export function toRgbString({ r, g, b, a }: Rgba): string {
  return a < 1 ? `rgb(${r} ${g} ${b} / ${formatAlpha(a)})` : `rgb(${r} ${g} ${b})`;
}

export function toHslString({ r, g, b, a }: Rgba): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const body = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return a < 1 ? `hsl(${body} / ${formatAlpha(a)})` : `hsl(${body})`;
}

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** sRGB → OKLCH using Björn Ottosson's OKLab matrices. */
export function toOklchString({ r, g, b, a }: Rgba): string {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.sqrt(A * A + B * B);
  let hue = (Math.atan2(B, A) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  const body = `${(L * 100).toFixed(1)}% ${chroma.toFixed(3)} ${chroma < 0.0005 ? 0 : hue.toFixed(1)}`;
  return a < 1 ? `oklch(${body} / ${formatAlpha(a)})` : `oklch(${body})`;
}

/** Composites a (possibly translucent) colour over an opaque background. */
export function blend(top: Rgba, base: Rgba): Rgba {
  const mix = (t: number, b: number) => clampByte(t * top.a + b * (1 - top.a));
  return { r: mix(top.r, base.r), g: mix(top.g, base.g), b: mix(top.b, base.b), a: 1 };
}

export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.x contrast ratio (1–21). A translucent foreground is blended over the background first. */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const fg = foreground.a < 1 ? blend(foreground, background) : foreground;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(background);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function wcagLevel(ratio: number, largeText = false): WcagLevel {
  if (ratio >= (largeText ? 4.5 : 7)) return 'AAA';
  if (ratio >= (largeText ? 3 : 4.5)) return 'AA';
  if (!largeText && ratio >= 3) return 'AA Large';
  return 'Fail';
}

/** WCAG "large text": ≥ 24px, or ≥ 18.66px (14pt) when bold. */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}
