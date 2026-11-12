import { describe, expect, it } from 'vitest';
import {
  ALL_EDGES,
  collectEdges,
  distanceBetween,
  inset,
  moveEdges,
  rectFromPoints,
  snapRect,
  snapValue,
  toDocument,
  toViewport,
} from '../../src/content/lib/geometry';

describe('rectFromPoints', () => {
  it('normalises points dragged in any direction', () => {
    expect(rectFromPoints({ x: 50, y: 40 }, { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 30,
    });
  });
});

describe('document/viewport conversion', () => {
  it('round-trips through the scroll offset', () => {
    const rect = { x: 10, y: 20, width: 5, height: 5 };
    const scroll = { x: 0, y: 300 };
    expect(toDocument(rect, scroll)).toEqual({ x: 10, y: 320, width: 5, height: 5 });
    expect(toViewport(toDocument(rect, scroll), scroll)).toEqual(rect);
  });
});

describe('inset', () => {
  it('never produces negative sizes', () => {
    expect(
      inset({ x: 0, y: 0, width: 10, height: 10 }, { top: 8, right: 8, bottom: 8, left: 8 }),
    ).toEqual({
      x: 8,
      y: 8,
      width: 0,
      height: 0,
    });
  });
});

describe('snapValue', () => {
  it('snaps to the closest candidate within the threshold', () => {
    expect(snapValue(103, [90, 100, 105], 6)).toBe(105);
    expect(snapValue(103, [90], 6)).toBe(103);
  });
});

describe('collectEdges', () => {
  it('collects start, centre and end on each axis', () => {
    expect(collectEdges([{ x: 0, y: 10, width: 100, height: 20 }])).toEqual({
      xs: [0, 50, 100],
      ys: [10, 20, 30],
    });
  });
});

describe('moveEdges', () => {
  it('moves only the selected edges and normalises flips', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };
    expect(
      moveEdges(rect, { left: false, right: true, top: false, bottom: false }, 20, 99),
    ).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 50,
    });
    expect(
      moveEdges(rect, { left: false, right: true, top: false, bottom: false }, -150, 0),
    ).toEqual({
      x: -50,
      y: 0,
      width: 50,
      height: 50,
    });
  });
});

describe('snapRect', () => {
  it('translates a dragged rectangle without changing its size', () => {
    const snapped = snapRect(
      { x: 97, y: 0, width: 50, height: 50 },
      ALL_EDGES,
      { xs: [100], ys: [] },
      6,
    );
    expect(snapped).toEqual({ x: 100, y: 0, width: 50, height: 50 });
  });

  it('snaps only the edge being resized', () => {
    const edges = { left: false, right: true, top: false, bottom: false };
    expect(
      snapRect({ x: 0, y: 0, width: 98, height: 10 }, edges, { xs: [0, 100], ys: [] }, 6),
    ).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 10,
    });
  });
});

describe('distanceBetween', () => {
  it('measures the horizontal gap between side-by-side boxes', () => {
    const gaps = distanceBetween(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 130, y: 10, width: 50, height: 20 },
    );
    expect(gaps).toEqual([{ axis: 'x', from: 100, to: 130, at: 20, length: 30 }]);
  });

  it('measures the vertical gap between stacked boxes', () => {
    const gaps = distanceBetween(
      { x: 0, y: 100, width: 50, height: 50 },
      { x: 0, y: 0, width: 50, height: 60 },
    );
    expect(gaps).toEqual([{ axis: 'y', from: 60, to: 100, at: 25, length: 40 }]);
  });

  it('measures every side of a nested box', () => {
    const gaps = distanceBetween(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 10, y: 20, width: 50, height: 50 },
    );
    expect(gaps.map((g) => g.length)).toEqual([20, 30, 10, 40]);
  });

  it('measures both axes for diagonal boxes', () => {
    const gaps = distanceBetween(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 30, width: 10, height: 10 },
    );
    expect(gaps.map((g) => [g.axis, g.length])).toEqual([
      ['x', 10],
      ['y', 20],
    ]);
  });
});
