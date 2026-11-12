import type { IconName } from './icons';

export const TOOL_IDS = [
  'inspect',
  'ruler',
  'distance',
  'styles',
  'color',
  'grid',
  'outline',
  'pixel',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/**
 * - `exclusive` tools own the pointer; only one can be active at a time.
 * - `layer` tools are passive overlays that can be combined with any exclusive tool.
 */
export type ToolKind = 'exclusive' | 'layer';

export interface ToolMeta {
  readonly id: ToolId;
  readonly kind: ToolKind;
  readonly label: string;
  /** Single-key shortcut used on the page while Click Trace is open. */
  readonly key: string;
  readonly description: string;
  /** Short card subtitle for the popup. */
  readonly summary: string;
  readonly icon: IconName;
}

export const TOOLS: readonly ToolMeta[] = [
  {
    id: 'inspect',
    kind: 'exclusive',
    label: 'Inspect',
    key: 'I',
    description: 'Box model, click coordinates, hierarchy and accessibility checks',
    summary: 'Box model & coordinates',
    icon: 'inspect',
  },
  {
    id: 'ruler',
    kind: 'exclusive',
    label: 'Ruler',
    key: 'R',
    description: 'Draw measurements and guides that snap to element edges',
    summary: 'Measure & add guides',
    icon: 'ruler',
  },
  {
    id: 'distance',
    kind: 'exclusive',
    label: 'Spacing',
    key: 'D',
    description: 'Distance between two elements, or to the parent edges',
    summary: 'Gaps between elements',
    icon: 'distance',
  },
  {
    id: 'styles',
    kind: 'exclusive',
    label: 'Styles',
    key: 'S',
    description: 'Read and copy the computed CSS of any element',
    summary: 'Copy computed CSS',
    icon: 'styles',
  },
  {
    id: 'color',
    kind: 'exclusive',
    label: 'Color',
    key: 'C',
    description: 'Pick any pixel and check contrast between colors',
    summary: 'Eyedropper & contrast',
    icon: 'color',
  },
  {
    id: 'grid',
    kind: 'layer',
    label: 'Grid',
    key: 'G',
    description: 'Column and baseline grid overlay for checking alignment',
    summary: 'Column & baseline grid',
    icon: 'grid',
  },
  {
    id: 'outline',
    kind: 'layer',
    label: 'Outline',
    key: 'O',
    description: 'Outline every element to debug layout and overflow',
    summary: 'Outline all elements',
    icon: 'outline',
  },
  {
    id: 'pixel',
    kind: 'layer',
    label: 'Overlay',
    key: 'P',
    description: 'Overlay a design mockup on the page for pixel-perfect QA',
    summary: 'Pixel-perfect mockup',
    icon: 'pixel',
  },
];

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value);
}

export function getToolMeta(id: ToolId): ToolMeta {
  const meta = TOOLS.find((tool) => tool.id === id);
  if (!meta) throw new Error(`Unknown tool: ${id}`);
  return meta;
}

export function findToolByKey(key: string): ToolMeta | undefined {
  const upper = key.toUpperCase();
  return TOOLS.find((tool) => tool.key === upper);
}

/** Page-level shortcuts that are not tools, shown in the shortcuts sheet. */
export const EXTRA_SHORTCUTS: readonly { readonly keys: string; readonly label: string }[] = [
  { keys: 'K', label: 'Capture screenshot' },
  { keys: 'U', label: 'Cycle units (px · rem · %)' },
  { keys: '?', label: 'Show shortcuts' },
  { keys: 'Esc', label: 'Clear selection · tool · close' },
  { keys: '⌘/Ctrl ⇧ Click', label: 'Inspect any element' },
];
