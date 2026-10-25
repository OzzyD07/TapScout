import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { evidenceImage } from "../src/evidence-image.js";

describe("evidenceImage", () => {
  it("stores a screenshot as a smaller JPEG at two-thirds of its width", async () => {
    const png = await sharp({
      create: { width: 1080, height: 2400, channels: 3, background: { r: 240, g: 240, b: 245 } },
    })
      .png()
      .toBuffer();
    const out = await evidenceImage(png);
    expect(out.ext).toBe("jpg");
    expect((await sharp(out.data).metadata()).width).toBe(720);
  });

  it("keeps an image it cannot read as it came", async () => {
    const odd = Buffer.from("not an image");
    expect(await evidenceImage(odd)).toEqual({ data: odd, ext: "png" });
  });
});
