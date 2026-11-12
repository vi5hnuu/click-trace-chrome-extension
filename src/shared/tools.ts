import type { IconName } from './icons';

export const TOOL_IDS = ['inspect', 'ruler', 'distance', 'styles', 'color', 'grid'] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export interface ToolMeta {
  readonly id: ToolId;
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
    label: 'Inspect',
    key: 'I',
    description: 'Box model, click coordinates, hierarchy and accessibility checks',
    summary: 'Box model & coordinates',
    icon: 'inspect',
  },
  {
    id: 'ruler',
    label: 'Ruler',
    key: 'R',
    description: 'Draw measurements and guides that snap to element edges',
    summary: 'Measure & add guides',
    icon: 'ruler',
  },
  {
    id: 'distance',
    label: 'Spacing',
    key: 'D',
    description: 'Distance between two elements, or to the parent edges',
    summary: 'Gaps between elements',
    icon: 'distance',
  },
  {
    id: 'styles',
    label: 'Styles',
    key: 'S',
    description: 'Read and copy the computed CSS of any element',
    summary: 'Copy computed CSS',
    icon: 'styles',
  },
  {
    id: 'color',
    label: 'Color',
    key: 'C',
    description: 'Pick any pixel and check contrast between colors',
    summary: 'Eyedropper & contrast',
    icon: 'color',
  },
  {
    id: 'grid',
    label: 'Grid',
    key: 'G',
    description: 'Column and baseline grid overlay for checking alignment',
    summary: 'Column & baseline grid',
    icon: 'grid',
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
