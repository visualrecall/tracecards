import type { CoverCrop } from "./model";

const WHOLE_IMAGE: CoverCrop = [0, 0, 1, 1];

/**
 * A crop read from a file or saved settings: four finite numbers, each part of the image, or
 * undefined for anything else.
 */
export function parseCrop(value: unknown): CoverCrop | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const [x, y, width, height] = value.map((item: unknown) =>
    typeof item === "number" && Number.isFinite(item) ? item : undefined,
  );
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  const fits = (start: number, size: number) => start >= 0 && size > 0 && start + size <= 1 + 1e-9;
  return fits(x, width) && fits(y, height) ? [x, y, width, height] : undefined;
}

/**
 * The part of an image to show in a frame of the given aspect ratio (width / height): the crop,
 * or the whole image when there is none, with its overflowing sides trimmed equally so it fills
 * the frame, like CSS `object-fit: cover`. Returns the crop unchanged when the image size is
 * unknown (zero or not finite).
 */
export function fitCrop(
  crop: CoverCrop | undefined,
  imageWidth: number,
  imageHeight: number,
  aspect: number,
): CoverCrop {
  const region = crop ?? WHOLE_IMAGE;
  const [x, y, width, height] = region;
  const regionAspect = (width * imageWidth) / (height * imageHeight);
  if (!Number.isFinite(regionAspect) || regionAspect <= 0) return region;

  if (regionAspect > aspect) {
    const fitted = (width * aspect) / regionAspect;
    return [x + (width - fitted) / 2, y, fitted, height];
  }
  const fitted = (height * regionAspect) / aspect;
  return [x, y + (height - fitted) / 2, width, fitted];
}
