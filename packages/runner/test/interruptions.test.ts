import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inAppInterruption } from "../src/interruptions.js";
import { normalizeHierarchy } from "../src/observer.js";

const fixture = (name: string) =>
  normalizeHierarchy(
    "android",
    readFileSync(join(import.meta.dirname, "fixtures", `${name}.xml`), "utf8"),
    { scale: 1 },
  );

describe("in-app interruptions (benchmark run 0b8ca5e6, Jerboa first launch)", () => {
  it("closes a what's-new dialog with Done instead of tapping its text links", () => {
    expect(inAppInterruption(fixture("android-jerboa-changelog"))).toMatchObject({
      kind: "dialog",
      label: "Done",
    });
  });

  it("answers an announcement with OK, never with buttons that open the browser", () => {
    const it = inAppInterruption(fixture("android-jerboa-announcement"));
    expect(it?.label).toBe("OK");
    // A button that did not clear the screen is not tapped again.
    expect(inAppInterruption(fixture("android-jerboa-announcement"), new Set(["OK"]))).toBeNull();
  });

  it("leaves forms and ordinary app screens to the planner", () => {
    expect(inAppInterruption(fixture("android-register"))).toBeNull();
    const screen = fixture("android-jerboa-changelog");
    const many = {
      ...screen,
      elements: [
        ...screen.elements,
        ...Array.from({ length: 6 }, (_, i) => ({
          ...(screen.elements.find((e) => e.role === "button") as (typeof screen.elements)[number]),
          ref: `el-${90 + i}`,
          label: `Tab ${i}`,
        })),
      ],
    };
    expect(inAppInterruption(many)).toBeNull();
  });
});
