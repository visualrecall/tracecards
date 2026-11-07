import type { Card, CoverCrop } from "@tracecards/core";
import { type ClipboardEvent, useEffect, useRef, useState } from "react";
import { type CoverImage, prepareCover } from "./coverImage";
import { type CoverEdit, downloadImage, useHost } from "./host";
import type { PixabayImage } from "./pixabay";

/**
 * The cover shown: the card's own, an image picked, a Pixabay image to download when the card is
 * saved, or none (once removed or not).
 */
type DraftCover =
  | { kind: "card"; url: string }
  | { kind: "picked"; image: CoverImage; url: string }
  | { kind: "download"; id: number; image: PixabayImage; url: string }
  | { kind: "none" }
  | { kind: "removed" };

/** A card's cover while it's changed, for `CoverInput` to show, and what saving it would write. */
export interface CoverDraft {
  /** The image to show, or null for an empty cover. */
  url: string | null;
  /**
   * Which image is shown. It stays the same as a preview gives way to a sharper one, so the
   * cropper keeps where the image has been moved to.
   */
  key: string | null;
  /** The crop the image starts with: undefined to show it whole. */
  initialCrop: CoverCrop | undefined;
  /** Whether a picked file is being prepared. */
  preparing: boolean;
  /** Whether saving would change the cover. */
  changed: boolean;
  /**
   * What saving changes, or undefined when nothing has changed. An image picked to download is
   * downloaded and prepared now: false when it can't be, after a notice.
   */
  edit: () => Promise<CoverEdit | undefined | false>;
  /** Takes a chosen, dropped or pasted image, once it's prepared. */
  pick: (file: Blob) => void;
  /**
   * Takes an image from Pixabay, shown at once from its thumbnail in the results, then from its
   * medium version once that has loaded. The large image is downloaded only when the card is
   * saved, so images looked at and passed over cost only their medium version.
   */
  pickDownload: (image: PixabayImage) => void;
  /** The Pixabay image that's the cover, while it is. */
  pickedImage: number | null;
  remove: () => void;
  /** Called with the new crop each time the user moves or zooms the image. */
  setCrop: (crop: CoverCrop) => void;
  /** Takes a pasted image. Text pastes as usual. */
  onPaste: (event: ClipboardEvent) => void;
}

/**
 * A card's cover as the card form or the opened card's face changes it: the card's own (none for
 * a new card), or an image picked instead, prepared as "Setting a cover" in the spec says, and
 * where it's been moved and zoomed to.
 */
export function useCoverDraft(card: Card | undefined): CoverDraft {
  const host = useHost();
  const [cover, setCover] = useState<DraftCover>(() => {
    const url = card ? host.coverUrl(card) : null;
    return url ? { kind: "card", url } : { kind: "none" };
  });
  // Set only once the user moves or zooms the image.
  const [crop, setCrop] = useState<CoverCrop | undefined>(undefined);
  const [preparing, setPreparing] = useState(false);

  // The picked image's object URL, released when it's replaced or the draft is dropped.
  useEffect(() => {
    if (cover.kind !== "picked") return;
    const { url } = cover;
    return () => URL.revokeObjectURL(url);
  }, [cover]);
  // Counts picks, so an image that takes longer to prepare doesn't replace a later one.
  const picks = useRef(0);

  const show = (next: DraftCover) => {
    setCover(next);
    setCrop(undefined);
  };

  /** Counts a pick shown at once, so a file still being prepared doesn't replace it. */
  const nextPick = () => {
    setPreparing(false);
    return ++picks.current;
  };

  const pickDownload = (picked: PixabayImage) => {
    if (cover.kind === "download" && cover.image.id === picked.id) return;
    const id = nextPick();
    show({ kind: "download", id, image: picked, url: picked.thumbnail });
    // Loaded here first, so the cropper swaps the image only once it can show it.
    const sharper = new Image();
    sharper.onload = () =>
      setCover((current) =>
        current.kind === "download" && current.id === id
          ? { ...current, url: picked.medium }
          : current,
      );
    sharper.src = picked.medium;
  };

  const pick = async (file: Blob) => {
    const current = ++picks.current;
    setPreparing(true);
    const image = await prepareCover(file);
    if (current !== picks.current) return;
    setPreparing(false);
    if (!image) {
      // A notice rather than a line beside the cover, which keeps the layout as it is.
      host.notify("Tracecards can’t read that image. Try a JPEG, PNG or WebP file.");
      return;
    }
    show({ kind: "picked", image, url: URL.createObjectURL(image.data) });
  };

  const onPaste = (event: ClipboardEvent) => {
    const file = Array.from(event.clipboardData.files).find((candidate) =>
      candidate.type.startsWith("image/"),
    );
    if (!file) return;
    event.preventDefault();
    void pick(file);
  };

  const edit = async (): Promise<CoverEdit | undefined | false> => {
    switch (cover.kind) {
      case "picked":
        return { image: cover.image, crop };
      case "download": {
        const file = await downloadImage(host, cover.image.large);
        const image = file && (await prepareCover(file));
        if (!image) {
          host.notify("Tracecards couldn’t download that image from Pixabay. Try saving again.");
          return false;
        }
        return { image, crop };
      }
      case "card":
        return crop && { crop };
      case "removed":
        return card?.cover === undefined ? undefined : null;
      case "none":
        return undefined;
    }
  };

  const url = "url" in cover ? cover.url : null;
  return {
    url,
    key: cover.kind === "download" ? `download-${cover.id}` : url,
    // Where the user moved it, for when the image is loaded again: a sharper preview.
    initialCrop: crop ?? (cover.kind === "card" ? card?.coverCrop : undefined),
    preparing,
    changed:
      cover.kind === "picked" ||
      cover.kind === "download" ||
      (cover.kind === "card" && crop !== undefined) ||
      (cover.kind === "removed" && card?.cover !== undefined),
    edit,
    pick: (file) => void pick(file),
    pickDownload,
    pickedImage: cover.kind === "download" ? cover.image.id : null,
    remove: () => {
      nextPick();
      show({ kind: "removed" });
    },
    setCrop,
    onPaste,
  };
}
