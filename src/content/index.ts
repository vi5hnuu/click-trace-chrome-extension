import { isContentRequest } from '../shared/messages';
import { loadSettings, onSettingsChanged } from '../shared/settings';
import { App } from './app';

/**
 * Content-script entry. It is injected on demand (activeTab + scripting) and may be
 * injected again into the same page, e.g. after the extension is updated, so any
 * previous instance is disposed first.
 */

interface Instance {
  dispose(): void;
}

declare global {
  var __clickTrace: Instance | undefined;
}

function start(): Instance {
  const controller = new AbortController();
  const ready: Promise<App> = loadSettings().then((settings) => new App(settings));

  // Registered synchronously so the very first message after injection is received.
  const onMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean => {
    if (!isContentRequest(message)) return false;
    void ready.then((app) => {
      sendResponse(app.handle(message));
    });
    return true;
  };
  chrome.runtime.onMessage.addListener(onMessage);

  let unsubscribe: (() => void) | null = null;
  void ready.then((app) => {
    if (controller.signal.aborted) return;
    unsubscribe = onSettingsChanged((settings) => {
      app.applySettings(settings);
    });
  });

  window.addEventListener(
    'click',
    (event) => {
      if (!event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void ready.then((app) => {
        app.inspectAt({ x: event.clientX, y: event.clientY });
      });
    },
    { capture: true, signal: controller.signal },
  );

  return {
    dispose() {
      controller.abort();
      unsubscribe?.();
      chrome.runtime.onMessage.removeListener(onMessage);
      void ready.then((app) => {
        app.close();
      });
    },
  };
}

try {
  globalThis.__clickTrace?.dispose();
} catch {
  // The previous instance belongs to an invalidated extension context; its DOM is cleaned below.
}
document.querySelectorAll('click-trace-overlay').forEach((node) => {
  node.remove();
});
globalThis.__clickTrace = start();
