// Observer (docs/03 §3.1): turns an Appium page source into the planner's normalised element list.
// Refs are only valid inside one observation. Secret fields are masked here, before anything is
// sent to a model or shown live.

import type { Bounds, ElementRole, UiElement } from "@tapscout/shared";

export type Platform = "android" | "ios";

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Minimal XML reader for Appium page sources (elements and attributes only). */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: "#document", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  const tags =
    /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"'/]|"[^"]*"|'[^']*'|\/(?!>))*)(\/?)>/g;
  const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of xml.matchAll(tags)) {
    const [, closing, tag, rawAttrs, selfClosing] = match;
    if (!tag) continue;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (rawAttrs ?? "").matchAll(attrRe)) {
      if (a[1]) attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
    }
    const node: XmlNode = { tag, attrs, children: [] };
    stack[stack.length - 1]?.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

function* walk(node: XmlNode): Generator<XmlNode> {
  yield node;
  for (const child of node.children) yield* walk(child);
}

export interface SystemInterruption {
  kind: "anr" | "crash";
  title: string;
  /** Non-destructive button to dismiss it: "Wait" for an ANR, "Close app" for a crash dialog. */
  dismiss: { label: string; bounds: Bounds; stableId: string };
}

export interface NormalizedScreen {
  elements: UiElement[];
  /** Screen size in screenshot pixels, from the hierarchy root. */
  widthPx: number;
  heightPx: number;
  /** Package/bundle that owns most visible nodes (Android) or the AUT bundle id (iOS). */
  topPackage?: string;
  /** Short screen title guess: navigation title or the first heading-like text. */
  title?: string;
  keyboardVisible: boolean;
  dialogVisible: boolean;
  interruption: SystemInterruption | null;
  /** More candidate elements existed than were kept. */
  truncated: boolean;
  /** A masked (secret) field is on screen; screenshots of it must not go to the vision model. */
  secretsVisible: boolean;
}

export interface NormalizeOptions {
  /** Screenshot pixels per hierarchy unit: 1 on Android (px), the display scale on iOS (pt). */
  scale: number;
  maxElements?: number;
}

const SECRET_HINT = /pass(word|code)?|\bpin\b|otp|secret|token|cvv|cvc|card.?number|iban/i;
const INTERACTIVE: ReadonlySet<ElementRole> = new Set([
  "button",
  "text_field",
  "switch",
  "checkbox",
  "link",
  "tab",
  "cell",
]);

interface Candidate extends Omit<UiElement, "ref"> {
  order: number;
}

function androidRole(cls: string, clickable: boolean, checkable: boolean): ElementRole {
  const name = cls.slice(cls.lastIndexOf(".") + 1);
  if (/EditText|AutoCompleteTextView/.test(name)) return "text_field";
  if (/Switch|ToggleButton/.test(name)) return "switch";
  if (/CheckBox|RadioButton|CheckedTextView/.test(name)) return "checkbox";
  if (/Button/.test(name)) return "button";
  if (/WebView/.test(name)) return "web_view";
  if (/RecyclerView|ListView|GridView/.test(name)) return "list";
  if (/ScrollView|ViewPager/.test(name)) return "scroll_view";
  if (checkable) return "checkbox";
  if (clickable) return "button";
  if (/TextView/.test(name)) return "text";
  if (/Image/.test(name)) return "image";
  return "other";
}

function iosRole(type: string): ElementRole {
  const name = type.replace("XCUIElementType", "");
  const map: Record<string, ElementRole> = {
    Button: "button",
    StaticText: "text",
    TextField: "text_field",
    SecureTextField: "text_field",
    SearchField: "text_field",
    TextView: "text_field",
    Image: "image",
    Icon: "image",
    Switch: "switch",
    Toggle: "switch",
    Link: "link",
    Tab: "tab",
    Cell: "cell",
    Table: "list",
    CollectionView: "list",
    ScrollView: "scroll_view",
    Alert: "dialog",
    Sheet: "dialog",
    Keyboard: "keyboard",
    WebView: "web_view",
  };
  return map[name] ?? "other";
}

function parseAndroidBounds(value: string | undefined): Bounds | null {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(value ?? "");
  if (!m) return null;
  const [x1, y1, x2, y2] = m.slice(1).map(Number) as [number, number, number, number];
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
}

function clip(text: string | undefined, max = 200): string | undefined {
  const t = text?.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function onScreen(b: Bounds, width: number, height: number): boolean {
  return (
    b.width > 1 &&
    b.height > 1 &&
    b.x < width &&
    b.y < height &&
    b.x + b.width > 0 &&
    b.y + b.height > 0
  );
}

function androidCandidates(root: XmlNode) {
  const hierarchy = root.children.find((n) => n.tag === "hierarchy") ?? root;
  const widthPx = Number(hierarchy.attrs.width) || 0;
  const heightPx = Number(hierarchy.attrs.height) || 0;
  const packages = new Map<string, number>();
  const candidates: Candidate[] = [];
  let interruption: SystemInterruption | null = null;
  let title: string | undefined;
  let heading: string | undefined;
  let alertTitle = "";
  let order = 0;

  for (const node of walk(hierarchy)) {
    const a = node.attrs;
    if (!a.class) continue;
    if (a.package) packages.set(a.package, (packages.get(a.package) ?? 0) + 1);
    const bounds = parseAndroidBounds(a.bounds);
    const id = a["resource-id"] ?? "";
    if (id === "android:id/alertTitle") alertTitle = a.text ?? "";
    if (bounds && (id === "android:id/aerr_wait" || id === "android:id/aerr_close")) {
      const kind = id === "android:id/aerr_wait" ? "anr" : "crash";
      // Prefer "Wait" when both buttons exist: it never kills a process.
      if (!interruption || kind === "anr") {
        interruption = { kind, title: "", dismiss: { label: a.text || id, bounds, stableId: id } };
      }
    }
    if (!bounds || a.displayed === "false") continue;
    const clickable = a.clickable === "true";
    const checkable = a.checkable === "true";
    const role = androidRole(a.class, clickable, checkable);
    const text = clip(a.text);
    const label = clip(a["content-desc"]) ?? clip(a.hint);
    const stableId = id ? id.replace(/^[\w.]+:id\//, "") : undefined;
    const password = a.password === "true";
    // The app bar title (a plain text in the top band) names the screen like iOS's navigation
    // bar does; in-page headings often contain user data ("Hi, Alex").
    if (!title && text && !clickable && role === "text" && heightPx > 0) {
      if (bounds.y + bounds.height <= heightPx * 0.13) title = text;
    }
    if (!heading && a.heading === "true" && text) heading = text;
    candidates.push({
      order: order++,
      role,
      platformClass: a.class,
      label,
      text,
      stableId: stableId || undefined,
      bounds,
      visible: true,
      enabled: a.enabled !== "false",
      focused: a.focused === "true",
      clickable,
      checked: checkable ? a.checked === "true" : undefined,
      masked: password,
    });
  }
  if (interruption) interruption.title = alertTitle;
  title ??= heading;
  const topPackage = [...packages.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  return {
    candidates,
    widthPx,
    heightPx,
    topPackage,
    title,
    interruption,
    keyboardVisible: false,
    dialogVisible: interruption !== null,
  };
}

function iosCandidates(root: XmlNode, scale: number) {
  const app = [...walk(root)].find((n) => n.tag === "XCUIElementTypeApplication");
  const widthPx = Math.round(Number(app?.attrs.width ?? 0) * scale);
  const heightPx = Math.round(Number(app?.attrs.height ?? 0) * scale);
  const candidates: Candidate[] = [];
  let keyboardVisible = false;
  let dialogVisible = false;
  let title: string | undefined;
  let order = 0;

  const insideKeyboard = new Set<XmlNode>();
  /** Top edge (screenshot px) of the software keyboard; app UI below it cannot be tapped. */
  let keyboardTop: number | null = null;
  for (const node of app ? walk(app) : []) {
    if ((node.attrs.type ?? node.tag) === "XCUIElementTypeKeyboard") {
      const y = Number(node.attrs.y) * scale;
      if (node.attrs.visible !== "false" && Number.isFinite(y) && y > 0) {
        keyboardTop = keyboardTop === null ? y : Math.min(keyboardTop, y);
      }
      for (const child of walk(node)) if (child !== node) insideKeyboard.add(child);
    }
  }
  for (const node of app ? walk(app) : []) {
    const a = node.attrs;
    const type = a.type ?? node.tag;
    if (!type.startsWith("XCUIElementType") || type === "XCUIElementTypeApplication") continue;
    const role = iosRole(type);
    if (role === "keyboard") keyboardVisible = true;
    // Keys of the software keyboard are not app UI (they would read as new texts).
    if (insideKeyboard.has(node)) continue;
    if (role === "dialog") dialogVisible = true;
    if (type === "XCUIElementTypeNavigationBar" && a.name) title ??= clip(a.name);
    if (a.visible === "false") continue;
    const bounds: Bounds = {
      x: Math.round(Number(a.x) * scale),
      y: Math.round(Number(a.y) * scale),
      width: Math.round(Number(a.width) * scale),
      height: Math.round(Number(a.height) * scale),
    };
    if (!Number.isFinite(bounds.x + bounds.y + bounds.width + bounds.height)) continue;
    const label = clip(a.label);
    const value = clip(a.value);
    const name = a.name;
    // React Native puts testID into `name`; when it only repeats the label it is not an id.
    const stableId = name && name !== a.label && name !== a.value ? name : undefined;
    const secure = type === "XCUIElementTypeSecureTextField";
    if (!title && /Header/.test(a.traits ?? "") && label) title = label;
    candidates.push({
      order: order++,
      role,
      platformClass: type,
      label,
      text: role === "text" ? (value ?? label) : value,
      stableId,
      bounds,
      visible: true,
      enabled: a.enabled !== "false",
      focused: a.focused === "true",
      clickable: INTERACTIVE.has(role),
      checked: role === "switch" ? value === "1" : undefined,
      masked: secure,
    });
  }
  // Everything whose centre lies in the keyboard band (app controls it covers, and the keyboard's
  // own accessory buttons such as Emoji or Dictate) is marked as not visible.
  if (keyboardTop !== null) {
    for (const c of candidates) {
      if (c.bounds.y + c.bounds.height / 2 >= keyboardTop) c.visible = false;
    }
  }
  return {
    candidates,
    widthPx,
    heightPx,
    topPackage: app?.attrs.bundleId,
    title,
    interruption: null,
    keyboardVisible,
    dialogVisible,
  };
}

function isUseful(c: Candidate): boolean {
  if (INTERACTIVE.has(c.role) || c.role === "dialog" || c.role === "web_view") return true;
  // Unnamed containers add tokens, not information; scrolling does not need a target.
  if (c.role === "scroll_view" || c.role === "list") return Boolean(c.stableId);
  // iOS exposes scroll indicators as elements.
  if (/scroll bar/i.test(c.label ?? "")) return false;
  return Boolean(c.label || c.text);
}

function inside(inner: Bounds, outer: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** A text node that only repeats the caption of the control around it. */
function isCaptionOf(c: Candidate, controls: Candidate[]): boolean {
  if (c.role !== "text" && c.role !== "other") return false;
  const caption = c.text ?? c.label;
  return controls.some(
    (k) =>
      k !== c &&
      inside(c.bounds, k.bounds) &&
      caption !== undefined &&
      (k.label === caption || k.text === caption),
  );
}

/** Normalises a page source into planner elements. Pure; never touches the device. */
export function normalizeHierarchy(
  platform: Platform,
  xml: string,
  options: NormalizeOptions,
): NormalizedScreen {
  const root = parseXml(xml);
  const raw = platform === "android" ? androidCandidates(root) : iosCandidates(root, options.scale);
  const width = raw.widthPx || Number.MAX_SAFE_INTEGER;
  const height = raw.heightPx || Number.MAX_SAFE_INTEGER;

  // Keep useful, on-screen nodes; drop exact duplicates (RN nests a text inside a same-label text).
  const seen = new Set<string>();
  const kept: Candidate[] = [];
  for (const c of raw.candidates) {
    if (!onScreen(c.bounds, width, height) || !isUseful(c)) continue;
    const key = `${c.label ?? ""}|${c.text ?? ""}|${c.bounds.x},${c.bounds.y},${c.bounds.width},${c.bounds.height}`;
    const interactiveKey = `${key}|${INTERACTIVE.has(c.role)}`;
    if (seen.has(key) && !INTERACTIVE.has(c.role)) continue;
    if (seen.has(interactiveKey)) continue;
    seen.add(key);
    seen.add(interactiveKey);
    // Named non-interactive views are text for the planner.
    kept.push(c.role === "other" && !c.clickable ? { ...c, role: "text" } : c);
  }
  const controls = kept.filter((c) => INTERACTIVE.has(c.role));
  for (let i = kept.length - 1; i >= 0; i--) {
    const c = kept[i];
    if (c && isCaptionOf(c, controls)) kept.splice(i, 1);
  }

  // Interactive elements first when the screen is too big; document order otherwise.
  const max = options.maxElements ?? 60;
  let chosen = kept;
  if (kept.length > max) {
    const interactive = kept.filter((c) => INTERACTIVE.has(c.role));
    const rest = kept.filter((c) => !INTERACTIVE.has(c.role));
    chosen = [...interactive, ...rest].slice(0, max).sort((x, y) => x.order - y.order);
  }

  let secretsVisible = false;
  const elements: UiElement[] = chosen.map((c, i) => {
    const { order: _order, ...rest } = c;
    const masked =
      c.masked ||
      (c.role === "text_field" && SECRET_HINT.test(`${c.stableId ?? ""} ${c.label ?? ""}`));
    if (masked) secretsVisible = true;
    return {
      ...rest,
      ref: `el-${i + 1}`,
      // A secret field's value is never forwarded; its label/id stay so it can be recognised.
      text: masked ? undefined : rest.text,
      masked,
    };
  });

  return {
    elements,
    widthPx: raw.widthPx,
    heightPx: raw.heightPx,
    topPackage: raw.topPackage,
    title: raw.title ?? elements.find((e) => e.role === "text" && e.text)?.text,
    keyboardVisible: raw.keyboardVisible,
    dialogVisible: raw.dialogVisible,
    interruption: raw.interruption,
    truncated: kept.length > chosen.length,
    secretsVisible,
  };
}

/** Width and height of a PNG from its IHDR chunk, or null when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
