// Screens without accessibility information (docs/07 C3): a Flutter app with semantics off or a
// game drawn on a canvas shows the device nothing to tap. The vision model then names the controls
// it sees on the screenshot and where they are; the agent taps them by position as "visual"
// elements. They are estimates: no check measures them, and a tap only counts by what it changed.

import type { UiElement } from "@tapscout/shared";
import { extractJson } from "./planner.js";

/** platformClass of an element located on the screenshot, not read from the hierarchy. */
export const VISUAL_CLASS = "vision";

/**
 * Measured on FieldNotes screenshots against their hierarchies (16 Oct): centre points land inside
 * the real bounds; asked for boxes, the model drops icons and boxes a field's caption instead.
 */
export const VISUAL_TAPS_PROMPT =
  'This is a screenshot of a mobile app whose controls cannot be read any other way. List the controls a user can tap: buttons, links, icons, tabs, menu entries, list rows and text fields. Do not list plain titles or paragraphs. For each control give the point at its centre, as x and y from 0 to 1000 relative to the image width and height, origin top-left. Reply with JSON only: {"screen":"<short name of this screen>","items":[{"label":"<its visible text, or a two-word description of an icon>","x":<0-1000>,"y":<0-1000>}]}';

const MAX_ITEMS = 20;
/** Status bar and system navigation bar, in thousandths of the screen height. */
const TOP_EDGE = 35;
const BOTTOM_EDGE = 985;
const FIELD = /\b(text ?field|input|search box|text box)\b/i;
/** Words the model adds to say what a control is; not part of its name. */
const KIND_SUFFIX = /\s+(button|icon|link|tab|text field|field|input)$/i;

export interface VisualScreen {
  /** The model's name for the screen, when the hierarchy gave none. */
  title?: string;
  elements: UiElement[];
}

/** Numbers of a coordinate the model wrote as numbers, a string or an array. */
function numbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (typeof value === "string") return (value.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (Array.isArray(value)) return value.flatMap(numbers);
  return [];
}

/**
 * Model answer → tappable elements in screenshot pixels, refs following the hierarchy's own.
 * Anything not on the screen, in the system bars or without a name is dropped.
 */
export function parseVisualElements(
  content: string,
  screen: { widthPx: number; heightPx: number },
  firstRef: number,
): VisualScreen {
  const json = extractJson(content) as { screen?: unknown; items?: unknown } | null;
  if (!json || !Array.isArray(json.items)) return { elements: [] };
  const elements: UiElement[] = [];
  const names = new Set<string>();
  for (const raw of json.items) {
    const item = raw as {
      label?: unknown;
      x?: unknown;
      y?: unknown;
      box?: unknown;
      point?: unknown;
    };
    const label =
      typeof item.label === "string" ? item.label.replace(KIND_SUFFIX, "").trim().slice(0, 80) : "";
    if (!label || names.has(label.toLowerCase())) continue;
    let [x, y] = [...numbers(item.x), ...numbers(item.y)];
    if (x === undefined || y === undefined) {
      const p = numbers(item.point ?? item.box);
      // A box's centre, or a single point.
      [x, y] =
        p.length >= 4 ? [((p[0] ?? 0) + (p[2] ?? 0)) / 2, ((p[1] ?? 0) + (p[3] ?? 0)) / 2] : p;
    }
    if (x === undefined || y === undefined) continue;
    if (x < 0 || x > 1000 || y < TOP_EDGE || y > BOTTOM_EDGE) continue;
    names.add(label.toLowerCase());
    // A small box around the point: enough to tap its centre, never measured as a size.
    const w = Math.round(screen.widthPx * 0.08);
    const h = Math.round(screen.heightPx * 0.03);
    const cx = Math.round((x / 1000) * screen.widthPx);
    const cy = Math.round((y / 1000) * screen.heightPx);
    elements.push({
      ref: `el-${firstRef + elements.length}`,
      role: FIELD.test(String(item.label)) ? "text_field" : "button",
      platformClass: VISUAL_CLASS,
      label,
      bounds: {
        x: Math.max(0, cx - Math.round(w / 2)),
        y: Math.max(0, cy - Math.round(h / 2)),
        width: w,
        height: h,
      },
      visible: true,
      enabled: true,
      focused: false,
      clickable: true,
      masked: false,
    });
    if (elements.length === MAX_ITEMS) break;
  }
  const title =
    typeof json.screen === "string" && json.screen.trim()
      ? json.screen.trim().slice(0, 60)
      : undefined;
  return { title, elements };
}

/** The next free `el-N` number after the hierarchy's elements. */
export function nextRef(elements: Pick<UiElement, "ref">[]): number {
  return Math.max(0, ...elements.map((e) => Number(e.ref.slice(3)) || 0)) + 1;
}

export const isVisual = (e: Pick<UiElement, "platformClass">) => e.platformClass === VISUAL_CLASS;
