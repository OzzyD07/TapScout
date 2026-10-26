// iOS page source in two steps. WDA's `visible` attribute is ~90% of the source's cost (probe run
// 137cb3ce, Ice Cubes: 6–7.7 s with it, 0.5–0.7 s without, same elements). It only matters where
// something covers part of the app; elsewhere the screen bounds check already drops what is off
// screen. So the source is read without it first, and again in full only when it is needed.

/** Attributes left out of the fast source; the observer reads none of them as present. */
export const FAST_SOURCE_EXCLUDED = "visible,accessible,index";

/**
 * Things that cover part of the app, so that only `visible` tells what can be reached. A dimming
 * overlay is no sign: iOS 26 keeps an "AdditionalDimmingOverlay" in every Ice Cubes screen.
 */
const COVERING =
  /<XCUIElementType(Keyboard|Alert|Sheet)\b|name="[^"]*(PopoverDismiss|PresentationHosting)[^"]*"|label="dismiss popup"/;
const NAMED = /\s(name|label|value)="[^"]+"/;

/**
 * Whether this source (read without `visible`) must be read again in full: a keyboard, alert,
 * sheet or popover, a screen presented over another (two navigation bars, SwiftUI's
 * PresentationHosting), or content in a second window.
 */
export function needsVisibility(fastXml: string): boolean {
  if (COVERING.test(fastXml)) return true;
  if ((fastXml.match(/<XCUIElementTypeNavigationBar\b/g) ?? []).length > 1) return true;
  // [0] is what precedes the first window; [1] is the app's own window.
  const windows = fastXml.split("<XCUIElementTypeWindow").slice(2);
  return windows.some((w) => NAMED.test(w.slice(w.indexOf(">") + 1)));
}
