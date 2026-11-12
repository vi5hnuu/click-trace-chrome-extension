import type { ToolId } from './tools';

/** Messages sent from the popup / service worker to the content script. */
export type ContentRequest =
  | { readonly type: 'ping' }
  | { readonly type: 'getState' }
  | { readonly type: 'open'; readonly tool: ToolId }
  | { readonly type: 'toggle'; readonly tool: ToolId }
  | { readonly type: 'close' };

export interface ContentState {
  readonly open: boolean;
  readonly activeTool: ToolId | null;
  readonly gridVisible: boolean;
}

export function isContentRequest(value: unknown): value is ContentRequest {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const { type } = value;
  return (
    type === 'ping' ||
    type === 'getState' ||
    type === 'open' ||
    type === 'toggle' ||
    type === 'close'
  );
}
