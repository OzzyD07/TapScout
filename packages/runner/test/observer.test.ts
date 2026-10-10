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
