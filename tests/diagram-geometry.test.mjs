import test from "node:test";
import assert from "node:assert/strict";
import { architecturePaths } from "../lib/diagram-geometry.mjs";

for (const [width, height, cardHeight] of [
  [320, 310, 75],
  [440, 300, 61],
  [900, 360, 82],
  [1670, 1100, 102],
]) {
  test(`flow reaches every card at ${width}×${height}`, () => {
    const center = {
      x: width / 2 - 40,
      y: height / 2 - 44,
      width: 80,
      height: 88,
    };
    const cards = [0, 1, 2, 3].map((i) => ({
      x: i % 2 ? width * 0.58 : width * 0.03,
      y: i < 2 ? height * 0.08 : height * 0.92 - cardHeight,
      width: width * 0.39,
      height: cardHeight,
    }));
    const { branches, journeys } = architecturePaths(center, cards);
    const anchors = cards.map((c, i) => [
      c.x + c.width / 2,
      i < 2 ? c.y + c.height : c.y,
    ]);
    const coords = (path) => path.match(/-?[\d.]+/g).map(Number);
    branches.forEach((path, i) =>
      assert.deepEqual(coords(path), [...anchors[i], width / 2, height / 2]),
    );
    journeys.forEach((path, i) =>
      assert.deepEqual(coords(path), [
        ...anchors[i],
        width / 2,
        height / 2,
        ...anchors[i + 1],
      ]),
    );
    assert.equal(journeys.length, 3);
    assert.deepEqual(coords(journeys[0]).slice(0, 2), anchors[0]);
    assert.deepEqual(coords(journeys.at(-1)).slice(-2), anchors[3]);
  });
}
