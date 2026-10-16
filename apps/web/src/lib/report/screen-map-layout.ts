import type { ScreenMap } from "@tapscout/shared";

/** Node and grid sizes in CSS pixels; the map scrolls sideways inside its box on small screens. */
export const MAP_NODE = { width: 96, height: 192, label: 40 } as const;
const COL_GAP = 64;
const ROW_GAP = 20;
const PAD = 12;
/** Room on the left for a move between two screens of the first column. */
const PAD_X = 48;
/** Screens per column before a step's screens continue in the next column. */
const MAX_ROWS = 4;

export interface PlacedScreen {
  label: string;
  visits: number;
  screenshotArtifactId?: string;
  /** Moves from the first screen along observed edges; -1 when no observed move reaches it. */
  depth: number;
  x: number;
  y: number;
}

export interface PlacedEdge {
  from: string;
  to: string;
  type: "tap" | "back";
  via?: string;
  /** SVG path from the source to the target. */
  path: string;
  /** Drawn leftwards: back to a screen at the same or an earlier column. */
  backwards: boolean;
}

export interface MapLayout {
  width: number;
  height: number;
  screens: PlacedScreen[];
  edges: PlacedEdge[];
}

/**
 * Columns by distance from the first screen (breadth-first over the observed moves), screens in
 * the order they were first reached. Screens no observed move reaches go in a last column.
 */
export function layoutScreenMap(map: ScreenMap): MapLayout {
  const order = [...map.screens].sort((a, b) => a.firstStep - b.firstStep);
  const depth = new Map<string, number>();
  const root = order[0];
  if (root) {
    depth.set(root.label, 0);
    const queue = [root.label];
    while (queue.length > 0) {
      const at = queue.shift() as string;
      for (const e of map.edges) {
        if (e.from !== at || depth.has(e.to)) continue;
        depth.set(e.to, (depth.get(at) ?? 0) + 1);
        queue.push(e.to);
      }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  const groups: string[][] = [];
  for (let d = 0; d <= maxDepth + 1; d++) {
    const labels = order
      .filter((s) => (depth.get(s.label) ?? maxDepth + 1) === d)
      .map((s) => s.label);
    for (let i = 0; i < labels.length; i += MAX_ROWS) groups.push(labels.slice(i, i + MAX_ROWS));
  }
  const cellW = MAP_NODE.width + COL_GAP;
  const cellH = MAP_NODE.height + MAP_NODE.label + ROW_GAP;
  const placed = new Map<string, PlacedScreen>();
  groups.forEach((labels, col) => {
    labels.forEach((label, row) => {
      const s = order.find((x) => x.label === label);
      if (!s) return;
      placed.set(label, {
        label,
        visits: s.visits,
        screenshotArtifactId: s.screenshotArtifactId,
        depth: depth.get(label) ?? -1,
        x: PAD_X + col * cellW,
        y: PAD + row * cellH,
      });
    });
  });
  const rows = Math.max(1, ...groups.map((g) => g.length));
  const rowsBottom = PAD + rows * cellH - ROW_GAP;
  const col = (s: PlacedScreen) => Math.round((s.x - PAD_X) / cellW);
  const edges: PlacedEdge[] = [];
  let lanes = 0;
  for (const e of map.edges) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    // Going back from a screen that a drawn tap opened says nothing new.
    if (
      e.type === "back" &&
      map.edges.some((t) => t.type === "tap" && t.from === e.to && t.to === e.from)
    ) {
      continue;
    }
    const backwards = b.x <= a.x;
    if (Math.abs(col(b) - col(a)) > 1) {
      // A move across columns runs through the gaps and along its own lane under the screens,
      // never across another screen.
      const lane = rowsBottom + 14 + lanes * 10;
      lanes += 1;
      const ay = a.y + MAP_NODE.height / 2 + 14;
      const by = b.y + MAP_NODE.height / 2 + 14;
      const [x1, gapA, gapB, x2] = backwards
        ? [a.x, a.x - 20, b.x + MAP_NODE.width + 20, b.x + MAP_NODE.width]
        : [a.x + MAP_NODE.width, a.x + MAP_NODE.width + 20, b.x - 20, b.x];
      edges.push({
        from: e.from,
        to: e.to,
        type: e.type,
        via: e.via,
        backwards,
        path: `M ${x1} ${ay} H ${gapA} V ${lane} H ${gapB} V ${by} H ${x2}`,
      });
      continue;
    }
    // Forward moves leave a screen's right side; backward ones its left side, a little lower,
    // so a tap and the back that undoes it do not draw over each other.
    const ay = a.y + MAP_NODE.height / 2 + (backwards ? 14 : 0);
    const by = b.y + MAP_NODE.height / 2 + (backwards ? 14 : 0);
    const x1 = backwards ? a.x : a.x + MAP_NODE.width;
    const x2 = backwards ? (b.x === a.x ? b.x : b.x + MAP_NODE.width) : b.x;
    const bend = b.x === a.x ? -40 : (x2 - x1) / 2;
    edges.push({
      from: e.from,
      to: e.to,
      type: e.type,
      via: e.via,
      backwards,
      path: `M ${x1} ${ay} C ${x1 + bend} ${ay}, ${x2 - (b.x === a.x ? -bend : bend)} ${by}, ${x2} ${by}`,
    });
  }
  return {
    width: PAD_X + PAD + Math.max(1, groups.length) * cellW - COL_GAP,
    height: rowsBottom + PAD + (lanes > 0 ? 14 + lanes * 10 : 0),
    screens: [...placed.values()],
    edges,
  };
}
