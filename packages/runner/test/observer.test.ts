import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeHierarchy, parseXml, pngSize } from "../src/observer.js";

const fixture = (name: string) => readFileSync(`test/fixtures/${name}.xml`, "utf8");

describe("parseXml", () => {
  it("reads attributes, entities and self-closing tags", () => {
    const root = parseXml(
      `<?xml version="1.0"?><a x="1 &amp; 2" y='&#x41;'><b/><c t="&lt;ok&gt;"></c></a>`,
    );
    const a = root.children[0];
    expect(a?.attrs).toEqual({ x: "1 & 2", y: "A" });
    expect(a?.children.map((c) => c.tag)).toEqual(["b", "c"]);
    expect(a?.children[1]?.attrs.t).toBe("<ok>");
  });
});

describe("normalizeHierarchy", () => {
  it("normalises the Android registration form", () => {
    const s = normalizeHierarchy("android", fixture("android-register"), { scale: 1 });
    expect(s.topPackage).toBe("dev.tapscout.fieldnotes");
    expect(s.interruption).toBeNull();
    const name = s.elements.find((e) => e.stableId === "register-name");
    expect(name).toMatchObject({ role: "text_field", label: "Name", masked: false });
    expect(name?.bounds).toEqual({ x: 53, y: 636, width: 975, height: 126 });
    const cont = s.elements.find((e) => e.stableId === "register-continue");
    expect(cont).toMatchObject({ role: "button", label: "Continue" });
    // The caption text inside the button is not listed separately.
    expect(s.elements.filter((e) => (e.text ?? e.label) === "Continue")).toHaveLength(1);
    expect(s.elements.map((e) => e.ref)).toEqual(s.elements.map((_, i) => `el-${i + 1}`));
  });

  it("normalises the same iOS screen into the same vocabulary, in screenshot pixels", () => {
    const s = normalizeHierarchy("ios", fixture("ios-register"), { scale: 3 });
    expect(s.topPackage).toBe("dev.tapscout.fieldnotes");
    expect(s.title).toBe("Create profile");
    const name = s.elements.find((e) => e.stableId === "register-name");
    expect(name).toMatchObject({ role: "text_field", label: "Name" });
    expect(name?.bounds).toEqual({ x: 63, y: 735, width: 1080, height: 141 });
    expect(s.elements.some((e) => /scroll bar/i.test(e.label ?? ""))).toBe(false);
    expect(s.elements.find((e) => e.stableId === "BackButton")?.role).toBe("button");
  });

  it("detects the Android ANR dialog and offers Wait, not Close", () => {
    const s = normalizeHierarchy("android", fixture("android-anr"), { scale: 1 });
    expect(s.interruption).toMatchObject({
      kind: "anr",
      title: "Pixel Launcher isn't responding",
      dismiss: { label: "Wait", stableId: "android:id/aerr_wait" },
    });
    expect(s.topPackage).toBe("android");
  });

  it("masks secret fields and never forwards their value", () => {
    const xml = `<hierarchy width="1080" height="2400">
      <android.widget.EditText class="android.widget.EditText" package="p" text="••••" content-desc="Password" password="true" enabled="true" clickable="true" bounds="[0,100][500,200]" displayed="true"/>
      <android.widget.EditText class="android.widget.EditText" package="p" text="123456" resource-id="p:id/otp-code" enabled="true" clickable="true" bounds="[0,300][500,400]" displayed="true"/>
    </hierarchy>`;
    const s = normalizeHierarchy("android", xml, { scale: 1 });
    expect(s.secretsVisible).toBe(true);
    expect(s.elements.every((e) => e.masked && e.text === undefined)).toBe(true);
  });

  it("keeps interactive elements first when the screen has too many", () => {
    const rows = Array.from(
      { length: 30 },
      (_, i) =>
        `<android.widget.TextView class="android.widget.TextView" package="p" text="Row ${i}" bounds="[0,${i * 10}][100,${i * 10 + 9}]" displayed="true"/>`,
    ).join("");
    const xml = `<hierarchy width="1080" height="2400">${rows}<android.widget.Button class="android.widget.Button" package="p" text="Save" clickable="true" enabled="true" bounds="[0,2000][500,2100]" displayed="true"/></hierarchy>`;
    const s = normalizeHierarchy("android", xml, { scale: 1, maxElements: 10 });
    expect(s.truncated).toBe(true);
    expect(s.elements).toHaveLength(10);
    expect(s.elements.some((e) => e.text === "Save")).toBe(true);
  });
});

describe("iOS keyboard", () => {
  it("reports the keyboard but never lists its keys as elements", () => {
    const xml = `<AppiumAUT><XCUIElementTypeApplication type="XCUIElementTypeApplication" name="App" x="0" y="0" width="400" height="800" bundleId="b">
      <XCUIElementTypeTextField type="XCUIElementTypeTextField" name="title" label="Title" enabled="true" visible="true" x="20" y="100" width="360" height="40"/>
      <XCUIElementTypeButton type="XCUIElementTypeButton" name="register-continue" label="Continue" enabled="true" visible="true" x="20" y="740" width="360" height="44"/>
      <XCUIElementTypeKeyboard type="XCUIElementTypeKeyboard" enabled="true" visible="true" x="0" y="500" width="400" height="300">
        <XCUIElementTypeKey type="XCUIElementTypeKey" name="delete" label="delete" enabled="true" visible="true" x="340" y="700" width="50" height="40"/>
        <XCUIElementTypeButton type="XCUIElementTypeButton" name="more" label="numbers" enabled="true" visible="true" x="10" y="750" width="50" height="40"/>
      </XCUIElementTypeKeyboard>
    </XCUIElementTypeApplication></AppiumAUT>`;
    const s = normalizeHierarchy("ios", xml, { scale: 1 });
    expect(s.keyboardVisible).toBe(true);
    expect(s.elements.map((e) => e.label)).toEqual(["Title", "Continue"]);
    // The app's own button is pinned under the keyboard: listed, but not tappable.
    expect(s.elements.map((e) => e.visible)).toEqual([true, false]);
  });
});

describe("iOS controls under the keyboard (real hierarchy, run 4a2c863d)", () => {
  it("keeps a button XCUITest reports as not visible when it sits under the keyboard", () => {
    const s = normalizeHierarchy("ios", fixture("ios-register-keyboard"), { scale: 3 });
    expect(s.keyboardVisible).toBe(true);
    const cont = s.elements.find((e) => e.stableId === "register-continue");
    expect(cont).toMatchObject({ role: "button", label: "Continue", visible: false });
    expect(s.elements.find((e) => e.stableId === "register-name")?.visible).toBe(true);
    expect(Object.keys(cont ?? {})).not.toContain("osHidden");
  });
});

describe("pngSize", () => {
  it("reads IHDR dimensions", () => {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(b.buffer).setUint32(16, 1206);
    new DataView(b.buffer).setUint32(20, 2622);
    expect(pngSize(b)).toEqual({ width: 1206, height: 2622 });
    expect(pngSize(new Uint8Array(4))).toBeNull();
  });
});
