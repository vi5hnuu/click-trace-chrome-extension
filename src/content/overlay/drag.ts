import type { Point } from '../lib/geometry';

export interface DragCallbacks {
  /** Called on pointerdown; return false to cancel the drag. */
  readonly start?: (event: PointerEvent) => boolean | undefined;
  readonly move: (delta: Point, event: PointerEvent) => void;
  readonly end?: (event: PointerEvent) => void;
}

/** Pointer-capture based dragging. Listeners are removed when `signal` aborts. */
export function onDrag(handle: HTMLElement, callbacks: DragCallbacks, signal?: AbortSignal): void {
  handle.addEventListener(
    'pointerdown',
    (down) => {
      if (down.button !== 0 || callbacks.start?.(down) === false) return;
      down.preventDefault();
      down.stopPropagation();
      handle.setPointerCapture(down.pointerId);
      const origin = { x: down.clientX, y: down.clientY };
      const drag = new AbortController();

      handle.addEventListener(
        'pointermove',
        (move) => {
          callbacks.move({ x: move.clientX - origin.x, y: move.clientY - origin.y }, move);
        },
        { signal: drag.signal },
      );
      const finish = (up: PointerEvent) => {
        drag.abort();
        callbacks.end?.(up);
      };
      handle.addEventListener('pointerup', finish, { signal: drag.signal });
      handle.addEventListener('pointercancel', finish, { signal: drag.signal });
    },
    signal ? { signal } : {},
  );
}
