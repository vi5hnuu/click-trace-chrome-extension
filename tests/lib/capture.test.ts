import { describe, expect, it } from 'vitest';
import { dataUrlToBlob, screenshotFileName } from '../../src/content/capture';

describe('dataUrlToBlob', () => {
  it('decodes base64 data URLs with their mime type', async () => {
    const blob = dataUrlToBlob(`data:image/png;base64,${btoa('hello')}`);
    expect(blob.type).toBe('image/png');
    expect(await blob.text()).toBe('hello');
  });
});

describe('screenshotFileName', () => {
  it('builds a safe, sortable file name', () => {
    expect(screenshotFileName('www.example.com', new Date(2026, 0, 2, 3, 4, 5))).toBe(
      'click-trace-www.example.com-20260102-030405.png',
    );
    expect(screenshotFileName('', new Date(2026, 0, 2, 3, 4, 5))).toBe(
      'click-trace-page-20260102-030405.png',
    );
  });
});
