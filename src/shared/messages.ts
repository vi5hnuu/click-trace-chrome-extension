import type { ToolId } from './tools';

/** Messages sent from the popup / service worker to the content script. */
export type ContentRequest =
  | { readonly type: 'ping' }
  | { readonly type: 'getState' }
  | { readonly type: 'open'; readonly tool: ToolId }
  | { readonly type: 'toggle'; readonly tool: ToolId }
  | { readonly type: 'close' };

/** Messages sent from the content script to the service worker. */
export interface BackgroundRequest {
  readonly type: 'captureVisibleTab';
}

export type CaptureResponse =
  { readonly ok: true; readonly dataUrl: string } | { readonly ok: false; readonly error: string };

export interface ContentState {
  readonly open: boolean;
  readonly activeTool: ToolId | null;
  /** Layer tools (grid, outline, overlay) currently shown. */
  readonly layers: readonly ToolId[];
}

const CONTENT_TYPES: ReadonlySet<unknown> = new Set([
  'ping',
  'getState',
  'open',
  'toggle',
  'close',
]);

export function isContentRequest(value: unknown): value is ContentRequest {
  return (
    typeof value === 'object' && value !== null && 'type' in value && CONTENT_TYPES.has(value.type)
  );
}

export function isBackgroundRequest(value: unknown): value is BackgroundRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'captureVisibleTab'
  );
}
