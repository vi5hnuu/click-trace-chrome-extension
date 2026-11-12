import type { BackgroundRequest, CaptureResponse } from '../shared/messages';

/** Decodes a base64 `data:` URL into a Blob without fetch (which page CSP may block). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header = '', data = ''] = dataUrl.split(',', 2);
  const mime = /^data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function screenshotFileName(hostname: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const site = hostname.replace(/[^a-z0-9.-]/gi, '') || 'page';
  return `click-trace-${site}-${stamp}.png`;
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.documentElement.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/**
 * Captures the visible tab (including measurements and overlays, which stay visible while
 * the caller hides the toolbar and panels), downloads it and copies it to the clipboard.
 */
export async function captureScreenshot(): Promise<{ copied: boolean }> {
  // Two frames so the hidden toolbar/panels are actually off-screen before capturing.
  await nextFrame();
  await nextFrame();
  const response = await chrome.runtime.sendMessage<BackgroundRequest, CaptureResponse>({
    type: 'captureVisibleTab',
  });
  if (!response.ok) throw new Error(response.error);

  const blob = dataUrlToBlob(response.dataUrl);
  download(blob, screenshotFileName(location.hostname, new Date()));
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return { copied: true };
  } catch {
    return { copied: false };
  }
}
