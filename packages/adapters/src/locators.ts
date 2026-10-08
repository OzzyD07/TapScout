export type DevicePlatform = "android" | "ios";

/** What we know about a target before resolving it on the current screen. */
export interface TargetHint {
  /** React Native `testID` / Android resource-id / iOS accessibility identifier. */
  testId?: string;
  /** Visible or accessibility label. */
  label?: string;
}

export interface LocatorCandidate {
  /** Strategy name, recorded so the pilot can measure which strategies actually work. */
  strategy: "stable_id" | "accessibility_label" | "text";
  selector: string;
}

function quote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Selector candidates in priority order (docs/03 §5.1): stable id first, then semantic label,
 * then visible text. Coordinates are never produced here.
 */
export function locatorCandidates(platform: DevicePlatform, hint: TargetHint): LocatorCandidate[] {
  const out: LocatorCandidate[] = [];
  if (platform === "android") {
    if (hint.testId) {
      // React Native maps testID to resource-id, with or without the package prefix.
      const id = quote(`(.*:id/)?${regexEscape(hint.testId)}`);
      out.push({
        strategy: "stable_id",
        selector: `android=new UiSelector().resourceIdMatches("${id}")`,
      });
    }
    if (hint.label) {
      out.push({ strategy: "accessibility_label", selector: `~${hint.label}` });
      out.push({
        strategy: "text",
        selector: `android=new UiSelector().text("${quote(hint.label)}")`,
      });
    }
  } else {
    if (hint.testId) out.push({ strategy: "stable_id", selector: `~${hint.testId}` });
    if (hint.label) {
      out.push({ strategy: "accessibility_label", selector: `~${hint.label}` });
      out.push({
        strategy: "text",
        selector: `-ios predicate string:label == "${quote(hint.label)}" OR value == "${quote(hint.label)}"`,
      });
    }
  }
  return out;
}
