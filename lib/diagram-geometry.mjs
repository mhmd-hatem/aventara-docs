/** Coordinates share the diagram's local SVG space, regardless of its aspect ratio. */
export function architecturePaths(center, cards) {
  const hub = {
    x: center.x + center.width / 2,
    y: center.y + center.height / 2,
  };
  const anchors = cards.map((card) => ({
    x: card.x + card.width / 2,
    y: card.y + card.height / 2 < hub.y ? card.y + card.height : card.y,
  }));
  const point = (p) => `${p.x} ${p.y}`;
  return {
    branches: anchors.map((anchor) => `M${point(anchor)} L${point(hub)}`),
    journeys: anchors
      .slice(1)
      .map(
        (anchor, i) => `M${point(anchors[i])} L${point(hub)} L${point(anchor)}`,
      ),
  };
}
