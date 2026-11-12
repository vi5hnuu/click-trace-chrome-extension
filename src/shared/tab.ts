import type { ContentRequest, ContentState } from './messages';

const CONTENT_SCRIPT = 'content.js';

const RESTRICTED_URL_PATTERNS: readonly RegExp[] = [
  /^(chrome|chrome-extension|chrome-search|chrome-untrusted|edge|brave|opera|vivaldi|about|devtools|view-source):/i,
  /^https:\/\/chromewebstore\.google\.com\//i,
  /^https:\/\/chrome\.google\.com\/webstore/i,
  /^https:\/\/microsoftedge\.microsoft\.com\/addons/i,
];

/** Browsers never allow extensions to script these pages. Unknown URLs are optimistically allowed. */
export function isScriptableUrl(url: string | undefined): boolean {
  if (!url) return true;
  return !RESTRICTED_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Sends a request to the content script, injecting it first if it is not running yet
 * (or if a stale copy from a previous extension version no longer responds).
 */
export async function sendToTab(tabId: number, request: ContentRequest): Promise<ContentState> {
  try {
    return await chrome.tabs.sendMessage<ContentRequest, ContentState>(tabId, request);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
    return await chrome.tabs.sendMessage<ContentRequest, ContentState>(tabId, request);
  }
}

/** Reads the overlay state without injecting anything. Returns null when the script is not loaded. */
export async function queryTabState(tabId: number): Promise<ContentState | null> {
  try {
    return await chrome.tabs.sendMessage<ContentRequest, ContentState>(tabId, { type: 'getState' });
  } catch {
    return null;
  }
}
