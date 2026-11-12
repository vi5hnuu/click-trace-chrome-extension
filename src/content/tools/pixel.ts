import { createIcon } from '../../shared/icons';
import { scrollPosition } from '../lib/dom';
import { type Point, toViewport } from '../lib/geometry';
import { formatNumber } from '../lib/units';
import { button, note, row, section, segmented, toggle } from '../overlay/components';
import { onDrag } from '../overlay/drag';
import { h } from '../overlay/h';
import { Panel } from '../overlay/panel';
import { BaseTool } from './tool';

interface DesignImage {
  readonly url: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

const NUDGE = 1;
const NUDGE_LARGE = 10;

const SCALES = [
  { value: '1', label: '1×' },
  { value: '0.5', label: '@2x' },
  { value: '0.333', label: '@3x' },
] as const;
type ScaleValue = (typeof SCALES)[number]['value'];

function isImageFile(file: File | null | undefined): file is File {
  return file?.type.startsWith('image/') === true;
}

/**
 * Overlay — PerfectPixel-style design QA. Drop, paste or choose a mockup, then compare
 * it with the live page using opacity or difference blending. The image is anchored in
 * document coordinates so it scrolls with the page.
 *
 * The image lives in its own top-layer element: the main overlay is an isolated stacking
 * context, so `mix-blend-mode: difference` could not reach the page from inside it.
 */
export class PixelTool extends BaseTool {
  readonly id = 'pixel';
  readonly hint = '';
  override readonly capturesPointer = false;

  private image: DesignImage | null = null;
  private position: Point = { x: 0, y: 0 };
  private opacity = 0.5;
  private scale: ScaleValue = '1';
  private difference = false;
  private locked = false;
  private blocked = false;

  private designHost: HTMLElement | null = null;
  private imageElement: HTMLImageElement | null = null;
  private panel: Panel | null = null;
  private positionInputs: { x: HTMLInputElement; y: HTMLInputElement } | null = null;
  private unregister: (() => void) | null = null;

  protected onActivate(signal: AbortSignal): void {
    this.createDesignHost(signal);
    this.panel = new Panel({
      title: 'Design overlay',
      icon: 'pixel',
      anchor: 'bottom-left',
      onClose: () => {
        this.ctx.deactivateTool(this.id);
      },
    }).mount(this.ctx.host.ui);

    window.addEventListener(
      'paste',
      (event) => {
        const file = [...(event.clipboardData?.files ?? [])].find(isImageFile);
        if (!file) return;
        event.preventDefault();
        void this.load(file);
      },
      { signal, capture: true },
    );
    window.addEventListener(
      'dragover',
      (event) => {
        if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
      },
      { signal, capture: true },
    );
    window.addEventListener(
      'drop',
      (event) => {
        const file = [...(event.dataTransfer?.files ?? [])].find(isImageFile);
        if (!file) return;
        event.preventDefault();
        event.stopPropagation();
        void this.load(file);
      },
      { signal, capture: true },
    );
    this.onViewportChange(signal, () => {
      this.renderImage();
    });

    this.renderPanel();
    this.renderImage();
  }

  protected override onDeactivate(): void {
    this.unregister?.();
    this.unregister = null;
    this.designHost?.remove();
    this.designHost = null;
    this.imageElement = null;
    this.panel?.destroy();
    this.panel = null;
    this.positionInputs = null;
  }

  override reset(): void {
    if (this.image) URL.revokeObjectURL(this.image.url);
    this.image = null;
    this.position = { x: 0, y: 0 };
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (!this.image || this.locked || event.metaKey || event.ctrlKey || event.altKey) return false;
    const step = event.shiftKey ? NUDGE_LARGE : NUDGE;
    const moves: Readonly<Record<string, Point>> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (!move) return false;
    this.moveTo({ x: this.position.x + move.x, y: this.position.y + move.y });
    return true;
  }

  private createDesignHost(signal: AbortSignal): void {
    const host = document.createElement('click-trace-design');
    host.setAttribute('popover', 'manual');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial !important; position: fixed !important; inset: 0 !important;
        margin: 0 !important; border: 0 !important; padding: 0 !important; background: none !important;
        overflow: hidden !important; pointer-events: none !important; display: block !important; }
      img { position: fixed; max-width: none; user-select: none; -webkit-user-drag: none;
        pointer-events: auto; cursor: move; touch-action: none; }
      img.is-locked { pointer-events: none; cursor: default; }
    `;
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.addEventListener(
      'error',
      () => {
        this.blocked = true;
        this.renderPanel();
      },
      { signal },
    );
    image.addEventListener(
      'load',
      () => {
        this.blocked = false;
      },
      { signal },
    );

    let start: Point = this.position;
    onDrag(
      image,
      {
        start: () => {
          start = this.position;
          return !this.locked;
        },
        move: (delta) => {
          this.moveTo({ x: start.x + delta.x, y: start.y + delta.y });
        },
      },
      signal,
    );

    shadow.append(style, image);
    document.documentElement.append(host);
    host.showPopover();
    this.unregister = this.ctx.host.registerAuxiliary(host);
    // Keep the toolbar and panels above the mockup.
    this.ctx.host.raise();
    this.designHost = host;
    this.imageElement = image;
  }

  private async load(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    try {
      const bitmap = await createImageBitmap(file);
      if (this.image) URL.revokeObjectURL(this.image.url);
      this.image = {
        url,
        name: file.name || 'Pasted image',
        width: bitmap.width,
        height: bitmap.height,
      };
      bitmap.close();
      // Retina exports are usually 2× the CSS size; guess the scale from the width.
      this.scale = this.image.width > window.innerWidth * 1.5 ? '0.5' : '1';
      this.position = { x: 0, y: 0 };
      this.blocked = false;
      this.ctx.toast('Design loaded');
    } catch {
      URL.revokeObjectURL(url);
      this.ctx.toast('Could not read that image');
    }
    this.renderPanel();
    this.renderImage();
  }

  private moveTo(position: Point): void {
    this.position = { x: Math.round(position.x), y: Math.round(position.y) };
    this.renderImage();
    if (this.positionInputs) {
      this.positionInputs.x.value = String(this.position.x);
      this.positionInputs.y.value = String(this.position.y);
    }
  }

  private renderImage(): void {
    const host = this.designHost;
    const image = this.imageElement;
    if (!host || !image) return;
    host.hidden = !this.image;
    if (!this.image) {
      image.removeAttribute('src');
      return;
    }
    if (image.getAttribute('src') !== this.image.url) image.src = this.image.url;
    const scale = Number(this.scale);
    const viewport = toViewport(this.position, scrollPosition());
    image.style.left = `${viewport.x}px`;
    image.style.top = `${viewport.y}px`;
    image.style.width = `${this.image.width * scale}px`;
    image.style.opacity = String(this.opacity);
    image.classList.toggle('is-locked', this.locked);
    host.style.mixBlendMode = this.difference ? 'difference' : 'normal';
  }

  private chooseFile(): void {
    const input = h('input', { attrs: { type: 'file', accept: 'image/*' } });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (isImageFile(file)) void this.load(file);
    });
    input.click();
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const image = this.image;
    if (!image) {
      this.positionInputs = null;
      this.panel.setContent(
        h(
          'button',
          {
            class: 'ct-dropzone',
            attrs: { type: 'button' },
            on: {
              click: () => {
                this.chooseFile();
              },
            },
          },
          [
            createIcon('upload', 20),
            h('strong', { text: 'Add a design mockup' }),
            h('span', {
              text: 'Drop an image on the page, paste it (⌘/Ctrl V) or click to choose',
            }),
          ],
        ),
      );
      return;
    }

    const opacity = h('input', {
      class: 'ct-range',
      attrs: {
        type: 'range',
        min: '0',
        max: '1',
        step: '0.05',
        value: String(this.opacity),
        'aria-label': 'Opacity',
      },
      on: {
        input: (event) => {
          this.opacity = (event.target as HTMLInputElement).valueAsNumber;
          opacityValue.textContent = `${Math.round(this.opacity * 100)}%`;
          this.renderImage();
        },
      },
    });
    const opacityValue = h('span', {
      class: 'ct-mono',
      text: `${Math.round(this.opacity * 100)}%`,
    });

    const coordinate = (axis: 'x' | 'y') =>
      h('input', {
        class: 'ct-input',
        attrs: { type: 'number', step: '1', value: String(this.position[axis]) },
        on: {
          input: (event) => {
            const value = (event.target as HTMLInputElement).valueAsNumber;
            if (Number.isFinite(value)) this.moveTo({ ...this.position, [axis]: value });
          },
        },
      });
    this.positionInputs = { x: coordinate('x'), y: coordinate('y') };

    const scaled = Number(this.scale);
    this.panel.setContent(
      this.blocked ? note('This site’s security policy blocks the overlay image.', 'warn') : null,
      section('Image', [
        row('File', image.name, { mono: false }),
        row(
          'Size',
          `${formatNumber(image.width * scaled)} × ${formatNumber(image.height * scaled)}px`,
        ),
      ]),
      section('Display', [
        h('div', { class: 'ct-row' }, [
          h('span', { class: 'ct-row__key', text: 'Opacity' }),
          opacity,
          opacityValue,
        ]),
        h('div', { class: 'ct-row' }, [
          h('span', { class: 'ct-row__key', text: 'Scale' }),
          segmented(SCALES, this.scale, (value) => {
            this.scale = value;
            this.renderPanel();
            this.renderImage();
          }),
        ]),
        toggle('Difference blend', this.difference, (checked) => {
          this.difference = checked;
          this.renderImage();
        }),
        toggle('Lock (click through)', this.locked, (checked) => {
          this.locked = checked;
          this.renderImage();
        }),
      ]),
      section('Position', [
        h('div', { class: 'ct-fields' }, [
          h('label', { class: 'ct-field' }, [document.createTextNode('X'), this.positionInputs.x]),
          h('label', { class: 'ct-field' }, [document.createTextNode('Y'), this.positionInputs.y]),
        ]),
      ]),
      h('div', { class: 'ct-actions' }, [
        button('Replace', () => {
          this.chooseFile();
        }),
        button('Reset position', () => {
          this.moveTo({ x: 0, y: 0 });
        }),
        button('Remove', () => {
          this.reset();
          this.renderPanel();
          this.renderImage();
        }),
      ]),
      note('Drag the image or use the arrow keys to align it (Shift = 10px).'),
    );
  }
}
