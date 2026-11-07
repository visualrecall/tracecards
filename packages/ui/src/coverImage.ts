import type { CoverCrop } from "@tracecards/core";

/** New covers are saved no larger than this on either side. */
export const COVER_MAX_SIZE = 1600;

/** WebP quality for new covers. */
const QUALITY = 0.82;

/** Kept as they are: resizing would stop a GIF's animation and blur an SVG. */
const KEPT_AS_THEY_ARE: Readonly<Record<string, string>> = {
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** An image ready to be saved as a card's cover. */
export interface CoverImage {
  data: Blob;
  /** The file extension to save it with, without the dot. */
  extension: string;
}

/**
 * Prepares a picked, dropped or pasted file to be saved as a cover, as "Setting a cover" in
 * spec/vault-format.md says: no larger than 1600 px on either side, the photo's orientation
 * applied, its metadata dropped, as WebP, or as JPEG where WebP can't be written. Resolves to null
 * when the file isn't an image that can be read here.
 */
export async function prepareCover(file: Blob): Promise<CoverImage | null> {
  const kept = KEPT_AS_THEY_ARE[file.type];
  if (kept) return { data: file, extension: kept };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, COVER_MAX_SIZE);
    const webp = await encode(bitmap, width, height, "image/webp");
    if (webp?.type === "image/webp") return { data: webp, extension: "webp" };
    // Safari draws WebP but can't write it, and hands back a PNG instead.
    const jpeg = await encode(bitmap, width, height, "image/jpeg");
    return jpeg ? { data: jpeg, extension: "jpg" } : null;
  } finally {
    bitmap.close();
  }
}

/** The bitmap at the given size, encoded as `type`, or null when this platform can't. */
async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string,
): Promise<Blob | null> {
  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    if (type === "image/jpeg") {
      // JPEG has no transparency, which would turn black.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type, quality: QUALITY });
  } catch {
    // Older webviews, such as iOS before 16.4, have no OffscreenCanvas.
    return null;
  }
}

/** The size that fits `width` × `height` within `max` on both sides, never enlarging it. */
export function scaledSize(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A part of an image in percentages, as the cropper reports it. */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `cover-crop` for an area in percentages: fractions from 0 to 1, to four decimal places. */
export function cropFromArea({ x, y, width, height }: CropArea): CoverCrop {
  const fraction = (percent: number) =>
    Math.round(Math.min(Math.max(percent, 0), 100) * 100) / 10000;
  return [fraction(x), fraction(y), fraction(width), fraction(height)];
}

/** The area in percentages for a `cover-crop`, to start the cropper from. */
export function areaFromCrop([x, y, width, height]: CoverCrop): CropArea {
  return { x: x * 100, y: y * 100, width: width * 100, height: height * 100 };
}
