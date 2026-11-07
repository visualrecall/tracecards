import { type Card, type CoverCrop, fitCrop } from "@tracecards/core";
import { useState } from "react";
import { type Host, useHost } from "./host";

/** Covers are shown at 3:2, the shape the crop editor makes. See spec/vault-format.md. */
export const COVER_ASPECT = 3 / 2;

/** An image to show as a cover, with the part of it to show. */
export interface CoverSource {
  url: string;
  crop: CoverCrop | undefined;
}

/** What a card's cover shows: its own cover, or null for the placeholder. */
export function coverSource(host: Host, card: Card): CoverSource | null {
  const url = host.coverUrl(card);
  return url ? { url, crop: card.coverCrop } : null;
}

/**
 * Where an image goes in a 3:2 cover frame, as percentages of the frame, so the crop fills it.
 * `width` and `height` are the image's natural size, or 0 until it's known.
 */
export function coverPosition(
  crop: CoverCrop | undefined,
  width: number,
  height: number,
): { left: string; top: string; width: string; height: string } {
  const [x, y, w, h] = fitCrop(crop, width, height, COVER_ASPECT);
  return {
    left: `${(-x / w) * 100}%`,
    top: `${(-y / h) * 100}%`,
    width: `${100 / w}%`,
    height: `${100 / h}%`,
  };
}

/**
 * A card's cover in a 3:2 frame, cropped as the card says, as `coverSource` describes, or a
 * placeholder.
 */
export function Cover({ card }: { card: Card }) {
  const source = coverSource(useHost(), card);
  return (
    <div className="tracecards-cover">
      {source ? (
        <CoverImage key={source.url} {...source} title={card.title} />
      ) : (
        <Placeholder title={card.title} />
      )}
    </div>
  );
}

interface CoverImageProps extends CoverSource {
  title: string;
}

function CoverImage({ url, crop, title }: CoverImageProps) {
  // The image's natural size, known once it loads. Fitting the crop to the frame needs it.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  if (failed) return <Placeholder title={title} />;

  return (
    <img
      className={size ? "tracecards-cover-image is-loaded" : "tracecards-cover-image"}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={(event) =>
        setSize({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })
      }
      onError={() => setFailed(true)}
      // Until the size is known, the crop or the whole image as it is.
      style={coverPosition(crop, size?.width ?? 0, size?.height ?? 0)}
    />
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="tracecards-cover-placeholder" aria-hidden="true">
      {placeholderLetter(title)}
    </div>
  );
}

/** What a cover without an image shows: the title's first letter. */
export function placeholderLetter(title: string): string {
  return Array.from(title)[0]?.toUpperCase() ?? "";
}
