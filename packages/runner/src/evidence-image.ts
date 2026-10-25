// Screenshots as stored evidence: two-thirds of the device width as JPEG. A full-size PNG averaged
// 337 KB, this ~36 KB, with text still sharp for the report and the vision model (measured on
// FieldNotes d3788cb0, 25 Oct). Supabase Free holds 1 GB in all, so stored size decides how many
// runs fit. The agent itself keeps working with the original PNG.

import sharp from "sharp";

const SCALE = 2 / 3;
const QUALITY = 78;

export async function evidenceImage(png: Buffer): Promise<{ data: Buffer; ext: "jpg" | "png" }> {
  try {
    const image = sharp(png);
    const { width } = await image.metadata();
    if (!width) return { data: png, ext: "png" };
    const data = await image
      .resize({ width: Math.round(width * SCALE) })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    return { data, ext: "jpg" };
  } catch {
    // An image sharp cannot read is kept as it came.
    return { data: png, ext: "png" };
  }
}
