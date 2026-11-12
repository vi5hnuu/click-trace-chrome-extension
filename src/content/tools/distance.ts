import { boxModel, parentOf, rafThrottle } from '../lib/dom';
import { distanceBetween, type Point, toRect } from '../lib/geometry';
import { elementLabel } from '../lib/selector';
import { h } from '../overlay/h';
import { box, gapNodes, rectLabel } from './draw';
import { BaseTool, pointFromEvent } from './tool';

/**
 * Spacing — hover an element to see its distance to the parent's inner edges,
 * or click one element and hover another to measure the gap between them.
 */
export class DistanceTool extends BaseTool {
  readonly id = 'distance';
  readonly hint = 'Hover: distance to parent · click to lock, then hover another · [Esc] unlock';

  private anchor: Element | null = null;
  private hovered: Element | null = null;
  private layer: HTMLElement | null = null;

  protected onActivate(signal: AbortSignal, root: HTMLElement): void {
    this.layer = h('div');
    root.append(this.layer);
    const hover = rafThrottle((point: Point) => {
      this.hovered = this.elementAt(point);
      this.render();
    });
    this.stage.addEventListener(
      'pointermove',
      (e) => {
        hover(pointFromEvent(e));
      },
      { signal },
    );
    this.stage.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        const element = this.elementAt(pointFromEvent(e));
        this.anchor = element === this.anchor ? null : element;
        this.render();
      },
      { signal },
    );
    this.onViewportChange(
      signal,
      rafThrottle(() => {
        this.render();
      }),
    );
    this.render();
  }

  protected override onDeactivate(): void {
    this.hovered = null;
    this.layer = null;
  }

  override reset(): void {
    this.anchor = null;
  }

  override refresh(): void {
    this.render();
  }

  override handleEscape(): boolean {
    if (!this.anchor) return false;
    this.anchor = null;
    this.render();
    return true;
  }

  private render(): void {
    if (!this.layer) return;
    const nodes: HTMLElement[] = [];
    const anchor = this.anchor?.isConnected ? this.anchor : null;
    const hovered = this.hovered?.isConnected ? this.hovered : null;
    const format = (gap: { length: number; axis: 'x' | 'y' }) => this.length(gap.length, gap.axis);

    if (anchor) {
      const a = toRect(anchor.getBoundingClientRect());
      nodes.push(box(a, 'ct-outline ct-outline--fill'));
      if (hovered && hovered !== anchor) {
        const b = toRect(hovered.getBoundingClientRect());
        nodes.push(
          box(b, 'ct-outline ct-outline--danger ct-outline--dashed'),
          ...gapNodes(distanceBetween(a, b), format),
        );
      } else {
        nodes.push(rectLabel(a, elementLabel(anchor), this.size(a.width, a.height)));
      }
    } else if (hovered) {
      const rect = toRect(hovered.getBoundingClientRect());
      const parent = parentOf(hovered);
      nodes.push(
        box(rect, 'ct-outline'),
        rectLabel(rect, elementLabel(hovered), this.size(rect.width, rect.height)),
      );
      if (parent && parent !== document.documentElement) {
        const inner = boxModel(parent).padding;
        nodes.push(
          box(inner, 'ct-outline ct-outline--danger ct-outline--dashed'),
          ...gapNodes(distanceBetween(inner, rect), format),
        );
      }
    }
    this.layer.replaceChildren(...nodes);
  }
}
