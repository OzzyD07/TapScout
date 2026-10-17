// Coverage frontier: controls seen on a screen but never tapped there. The agent uses it to reach
// untried parts of the app along observed paths without spending planner calls, and the planner
// sees it so it can head there itself (docs/06 §7: Settings and icon buttons were often missed).

import type { TestMode, UiElement } from "@tapscout/shared";
import { isBackControl } from "./functional.js";
import { actionKey, type StateGraph, type TargetIdentity } from "./state.js";

/** Never tapped without the planner: these can end the session's account or data. */
const DESTRUCTIVE = /\b(delete|remove|erase|reset|sign ?out|log ?out|deactivate|close account)\b/i;
/**
 * Things that reach real servers and real people: never tapped or planned for without the
 * planner, whose prompt forbids submitting them (Jerboa 51d7c926: the sweep tapped "Upvote 292"
 * and "Downvote 44"). Whole words only, so "Posts" and "Comments" tabs stay open to it.
 */
export const OUTWARD =
  /\b(report|block|send|publish|vote|upvote|downvote|buy|purchase|pay|donate|compose|reply|replies|boost|favou?rite|follow|comment|toot|post)\b/i;
/**
 * What one tap does to other people right away (vote, report, block, follow, send, buy). Opening a
 * post or reply composer is harmless: sending it is a further control, and "Post view" is a
 * setting (Jerboa).
 */
const ONE_TAP_OUTWARD =
  /\b(report|block|send|publish|vote|upvote|downvote|buy|purchase|pay|donate|boost|favou?rite|follow)\b/i;
/** Entry points where Store Readiness and Accessibility evidence usually lives. */
const ACCOUNT_HINT = /setting|account|profile|privacy|help|about|preference|gear|menu|more/i;

const nameOf = (e: Pick<UiElement, "label" | "text" | "stableId">) =>
  [e.label, e.text, e.stableId].filter(Boolean).join(" ");

/**
 * A language option written in its own language. Picking one changes every text of the app and
 * makes the rest of the session unreadable (benchmark run f86858fd switched Jitsi Meet to
 * Afrikaans and spent half its actions on a screen it could no longer find).
 */
export const LANGUAGE_OPTION =
  /^(english|deutsch|español|espanol|français|francais|italiano|português|portugues|nederlands|türkçe|turkce|polski|русский|українська|日本語|中文|简体中文|繁體中文|한국어|العربية|עברית|हिन्दी|svenska|norsk( bokmål| nynorsk)?|nynorsk|bokmål|dansk|suomi|čeština|slovenčina|magyar|română|ελληνικά|български|hrvatski|srpski|српски|slovenščina|català|euskara|galego|afrikaans|bahasa indonesia|bahasa melayu|tiếng việt|ไทย|فارسی|eesti|latviešu|lietuvių|esperanto|gaeilge|íslenska|shqip|беларуская|қазақ тілі|oʻzbekcha|azərbaycan|ქართული|հայերեն|বাংলা|தமிழ்|తెలుగు|kiswahili|filipino|[\p{L} ]*sámegiella|cymraeg|føroyskt|lëtzebuergesch|malti|occitan|brezhoneg|interlingua|toki pona)( \(.*\))?$/iu;

/**
 * The settings row that opens the language choice ("Language English", Jerboa's "Språk norsk
 * nynorsk"): run a306bbdb opened it and picked Norwegian, then Northern Sami, and spent the rest
 * of the session in settings it could no longer read. The word for "language" in common app
 * languages, as a whole word of the control's name.
 */
const LANGUAGE_SETTING =
  /(^|[\s,:/|·-])(language|languages|app language|sprache|idioma|langue|lingua|taal|språk|sprog|kieli|język|jazyk|nyelv|limbă|γλώσσα|язык|мова|dil|語言|语言|言語|언어|اللغة|שפה|भाषा|bahasa|ngôn ngữ|ภาษา|زبان)($|[\s,:/|·-])/iu;

const displayName = (e: Pick<UiElement, "label" | "text">) => (e.label ?? e.text ?? "").trim();

/** A screen that lists several languages: every option on it switches the app's language. */
export function isLanguagePicker(screen: Pick<UiElement, "label" | "text">[]): boolean {
  return screen.filter((e) => LANGUAGE_OPTION.test(displayName(e))).length >= 3;
}

/**
 * A control that changes the app's language or opens that choice. With the screen, any option of
 * a language list counts too, also languages the list above does not know.
 */
export function isLanguageOption(
  e: UiElement,
  screen?: Pick<UiElement, "label" | "text">[],
): boolean {
  const name = displayName(e);
  if (LANGUAGE_OPTION.test(name) || LANGUAGE_SETTING.test(name)) return true;
  return Boolean(screen && isLanguagePicker(screen) && !isBackControl(e));
}

/** A name the agent never heads for on its own: destructive, or about the app's language. */
export function unsafeName(name: string): boolean {
  const n = name.trim();
  return DESTRUCTIVE.test(n) || LANGUAGE_OPTION.test(n) || LANGUAGE_SETTING.test(n);
}

/**
 * A control the agent may tap on its own: not destructive, not outward-facing, not a plain back
 * button and not an option that switches the app's language.
 */
export function safeToTry(e: UiElement, screen?: Pick<UiElement, "label" | "text">[]): boolean {
  const name = nameOf(e);
  return (
    !DESTRUCTIVE.test(name) &&
    !ONE_TAP_OUTWARD.test(name) &&
    !isBackControl(e) &&
    !isLanguageOption(e, screen)
  );
}

/**
 * List rows: table cells, and controls whose ids differ only by a trailing index or id
 * (`note-row-0`, `note-row-1`, `item_3f2a91c4`). Null for a control that stands alone.
 */
export function familyOf(e: Pick<UiElement, "role" | "stableId">): string | null {
  if (e.role === "cell") return "cell";
  if (!e.stableId) return null;
  const base = e.stableId.replace(/(?:[-_:.]?(?:\d+|[0-9a-f]{8,}))+$/i, "");
  return base && base !== e.stableId ? `id:${base}` : null;
}

/** Only an id or nothing: what a screen reader would also miss, and often a settings gear. */
export function iconOnly(e: Pick<UiElement, "label" | "text">): boolean {
  return !e.label?.trim() && !e.text?.trim();
}

const ROW_ROLES = new Set(["button", "link", "tab"]);

/**
 * A main navigation entry: a tab, or one of three or more controls side by side in the app bar
 * or the bottom band (bottom bar, app-bar icons). These lead to the app's main screens,
 * so exploration opens them before going deeper into content (docs/07 B7; benchmark runs
 * 23a8e69a, aa5045dc: Jerboa's and Habo's main screens were never opened).
 */
export function navigationEntry(
  e: UiElement,
  elements: UiElement[],
  screenHeight: number,
): boolean {
  if (e.role === "tab") return true;
  if (screenHeight <= 0 || !ROW_ROLES.has(e.role)) return false;
  // The app bar only: rows lower down are content (Jerboa run 52ad4070: a post's vote row).
  const top = e.bounds.y + e.bounds.height <= screenHeight * 0.15;
  const bottom = e.bounds.y >= screenHeight * 0.8;
  if (!top && !bottom) return false;
  const row = elements.filter(
    (o) =>
      ROW_ROLES.has(o.role) && o.bounds.y === e.bounds.y && o.bounds.height === e.bounds.height,
  );
  return row.length >= 3;
}

export interface FrontierControl {
  /** Stable key for "already toured": screen label + tap action key. */
  id: string;
  screenLabel: string;
  identity: TargetIdentity;
  role: string;
  /** Short prompt text, e.g. `"Profile": icon button id=profile-settings`. */
  description: string;
  hops: number;
  score: number;
}

export class ControlLedger {
  private readonly seen = new Map<string, Map<string, { element: UiElement; nav: boolean }>>();

  /** Remembers the tappable controls of a named screen (latest copy wins). */
  note(screenLabel: string, controls: UiElement[], screenHeight = 0) {
    const byKey = this.seen.get(screenLabel) ?? new Map();
    for (const e of controls) {
      if (!safeToTry(e, controls)) continue;
      byKey.set(actionKey("tap", e), {
        element: e,
        nav: navigationEntry(e, controls, screenHeight),
      });
    }
    this.seen.set(screenLabel, byKey);
  }

  /** Named screens and the names of their controls, in the order first seen (test plan input). */
  screens(): { label: string; controls: string[] }[] {
    return [...this.seen].map(([label, controls]) => ({
      label,
      controls: [
        ...new Set(
          [...controls.values()].flatMap(({ element: e }) => {
            const n = (e.label ?? e.text ?? "").trim();
            return n ? [n] : [];
          }),
        ),
      ],
    }));
  }

  /**
   * Untried controls on other screens that an observed path reaches, best first: main navigation
   * entries, account and settings entry points (strongly when Store Readiness or Accessibility is
   * selected), icon-only buttons, then the nearest.
   */
  frontier(
    graph: StateGraph,
    currentLabel: string,
    modes: TestMode[],
    /** Names the open goals of the test plan head for (B11-2); matching controls come first. */
    planTargets: string[] = [],
  ): FrontierControl[] {
    const storeOrA11y = modes.includes("store_readiness") || modes.includes("accessibility");
    const targets = planTargets.map((t) => t.toLowerCase().trim()).filter((t) => t.length >= 3);
    const out: FrontierControl[] = [];
    for (const [screenLabel, controls] of this.seen) {
      if (screenLabel === currentLabel) continue;
      const path = graph.pathBetween(currentLabel, screenLabel);
      if (!path) continue;
      const tried = new Set(
        graph
          .visited()
          .filter((s) => s.label === screenLabel)
          .flatMap((s) => [...s.tried.keys()]),
      );
      // One list row stands for the others (docs/03 §3.2): a row family is offered once, and not
      // at all after any of its rows was opened.
      const families = new Set(
        [...controls].flatMap(([k, c]) => (tried.has(k) ? [familyOf(c.element) ?? ""] : [])),
      );
      for (const [key, { element: e, nav }] of controls) {
        const family = familyOf(e);
        if (tried.has(key) || (family && families.has(family))) continue;
        if (family) families.add(family);
        const icon = iconOnly(e);
        const hint = ACCOUNT_HINT.test(nameOf(e));
        const name = `${e.label ?? ""} ${e.text ?? ""}`.toLowerCase();
        const planned = targets.some((t) => name.includes(t));
        const what = icon
          ? `icon ${e.role}${e.stableId ? ` id=${e.stableId}` : ""}`
          : `${e.role} ${JSON.stringify(e.label ?? e.text)}`;
        out.push({
          id: `${screenLabel}|${key}`,
          screenLabel,
          identity: { role: e.role, stableId: e.stableId, label: e.label, text: e.text },
          role: e.role,
          description: `${JSON.stringify(screenLabel)}: ${what}`,
          hops: path.length,
          score:
            (planned ? 6 : 0) +
            (nav ? 4 : 0) +
            (hint ? (storeOrA11y ? 3 : 1) : 0) +
            (icon ? 2 : 0) -
            path.length * 0.5,
        });
      }
    }
    return out.sort((a, b) => b.score - a.score || a.hops - b.hops);
  }
}
