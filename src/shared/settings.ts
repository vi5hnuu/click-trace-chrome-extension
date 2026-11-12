export type ThemePreference = 'system' | 'light' | 'dark';
export type LengthUnit = 'px' | 'rem' | '%';

export const LENGTH_UNITS: readonly LengthUnit[] = ['px', 'rem', '%'];
export const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
export const ACCENT_PRESETS: readonly string[] = [
  '#6d5efc',
  '#2f80ed',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
];

export interface GridSettings {
  readonly columns: number;
  readonly gutter: number;
  /** Max content width in px; 0 means full width. */
  readonly maxWidth: number;
  /** Outer margin in px on each side. */
  readonly margin: number;
  /** Baseline row height in px; 0 disables the baseline grid. */
  readonly baseline: number;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface Settings {
  readonly theme: ThemePreference;
  readonly accent: string;
  readonly unit: LengthUnit;
  readonly snapping: boolean;
  readonly grid: GridSettings;
  readonly recentColors: readonly string[];
  readonly toolbarPosition: Position | null;
}

export const DEFAULT_GRID: GridSettings = {
  columns: 12,
  gutter: 24,
  maxWidth: 1200,
  margin: 16,
  baseline: 0,
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: ACCENT_PRESETS[0] ?? '#6d5efc',
  unit: 'px',
  snapping: true,
  grid: DEFAULT_GRID,
  recentColors: [],
  toolbarPosition: null,
};

export const MAX_RECENT_COLORS = 12;

const STORAGE_KEY = 'settings';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickNumber(raw: UnknownRecord, key: string, fallback: number, min: number, max: number) {
  const value = raw[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function mergeGrid(raw: unknown): GridSettings {
  if (!isRecord(raw)) return DEFAULT_GRID;
  return {
    columns: pickNumber(raw, 'columns', DEFAULT_GRID.columns, 1, 24),
    gutter: pickNumber(raw, 'gutter', DEFAULT_GRID.gutter, 0, 200),
    maxWidth: pickNumber(raw, 'maxWidth', DEFAULT_GRID.maxWidth, 0, 4000),
    margin: pickNumber(raw, 'margin', DEFAULT_GRID.margin, 0, 400),
    baseline: pickNumber(raw, 'baseline', DEFAULT_GRID.baseline, 0, 200),
  };
}

function mergePosition(raw: unknown): Position | null {
  if (!isRecord(raw)) return null;
  const { x, y } = raw;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
}

/** Validates untrusted stored data and fills in defaults for anything missing or malformed. */
export function mergeSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;
  const accent = typeof raw.accent === 'string' && HEX_COLOR.test(raw.accent) ? raw.accent : null;
  const recentColors = Array.isArray(raw.recentColors)
    ? raw.recentColors
        .filter((c): c is string => typeof c === 'string' && HEX_COLOR.test(c))
        .slice(0, MAX_RECENT_COLORS)
    : DEFAULT_SETTINGS.recentColors;

  return {
    theme: pickEnum(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
    accent: accent ?? DEFAULT_SETTINGS.accent,
    unit: pickEnum(raw.unit, LENGTH_UNITS, DEFAULT_SETTINGS.unit),
    snapping: typeof raw.snapping === 'boolean' ? raw.snapping : DEFAULT_SETTINGS.snapping,
    grid: mergeGrid(raw.grid),
    recentColors,
    toolbarPosition: mergePosition(raw.toolbarPosition),
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return mergeSettings(stored[STORAGE_KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = mergeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/** Subscribes to settings changes made anywhere in the extension. Returns an unsubscribe function. */
export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const change = changes[STORAGE_KEY];
    if (area === 'local' && change) listener(mergeSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => {
    chrome.storage.onChanged.removeListener(handler);
  };
}

export function nextUnit(unit: LengthUnit): LengthUnit {
  const index = LENGTH_UNITS.indexOf(unit);
  return LENGTH_UNITS[(index + 1) % LENGTH_UNITS.length] ?? 'px';
}
