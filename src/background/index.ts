import type { ContentRequest } from '../shared/messages';
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

chrome.commands.onCommand.addListener((command, tab) => {
  void handleCommand(command, tab);
});
