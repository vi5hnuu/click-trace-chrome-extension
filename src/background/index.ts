import type { CaptureResponse, ContentRequest } from '../shared/messages';
import { isBackgroundRequest } from '../shared/messages';
import { isScriptableUrl, sendToTab } from '../shared/tab';

const COMMANDS: Readonly<Record<string, ContentRequest>> = {
  'toggle-inspect': { type: 'toggle', tool: 'inspect' },
  'toggle-ruler': { type: 'toggle', tool: 'ruler' },
  'close-overlay': { type: 'close' },
};

async function handleCommand(command: string, tab: chrome.tabs.Tab | undefined): Promise<void> {
  const request = COMMANDS[command];
  if (!request || tab?.id === undefined || !isScriptableUrl(tab.url)) return;
  try {
    await sendToTab(tab.id, request);
  } catch (error) {
    console.warn(`[Click Trace] "${command}" failed on this page:`, error);
  }
}

/** Screenshots need the activeTab grant, which only the extension context can use. */
async function captureVisibleTab(windowId: number): Promise<CaptureResponse> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    return { ok: true, dataUrl };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  void handleCommand(command, tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const windowId = sender.tab?.windowId;
  if (!isBackgroundRequest(message) || windowId === undefined) return false;
  void captureVisibleTab(windowId).then(sendResponse);
  return true;
});
