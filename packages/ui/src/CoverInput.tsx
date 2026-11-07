import type { CoverCrop } from "@tracecards/core";
import { type ChangeEvent, type DragEvent, type ReactNode, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { areaFromCrop, cropFromArea } from "./coverImage";
import { COVER_ASPECT } from "./Cover";
import { Icon } from "./Icon";
import { ICONS } from "./icons";

interface CoverInputProps {
  /** The image to show, or null for an empty cover that takes one. */
  url: string | null;
  /**
   * Which image it is, when that outlasts its url, as when a preview gives way to the image
   * itself: the cropper starts again only for another image. The url, otherwise.
   */
  imageKey?: string | null;
  /** The crop the image starts with: the card's own, or undefined to show it whole. */
  initialCrop: CoverCrop | undefined;
  /** Whether a file is being prepared, which the empty cover says. */
  busy: boolean;
  /** Called with a chosen or dropped file. */
  onFile: (file: File) => void;
  /** Removes the image, with a button in the corner. Without it, there's no button. */
  onRemove?: () => void;
  /** Called with the new crop each time the user moves or zooms the image. */
  onCrop: (crop: CoverCrop) => void;
  /** The frame's shape, width over height: a card's 3:2 cover unless said otherwise. */
  aspect?: number;
  /** What the image is, for screen readers: "Cover" unless said otherwise. */
  label?: string;
  /** What the empty frame says, where pasting isn't taken. */
  emptyText?: string;
}

/**
 * An image in a frame, cropped by moving and zooming it: the cover in the card form's preview,
 * and anything else shown in a frame, such as a card's printed back. Empty, it takes a
 * click to choose an image. With an image, it's moved by dragging or the arrow keys and zoomed by
 * scrolling or pinching, and a button removes it. An image dropped on it takes the place of any
 * other.
 */
export function CoverInput({
  url,
  imageKey,
  initialCrop,
  busy,
  onFile,
  onRemove,
  onCrop,
  aspect = COVER_ASPECT,
  label = "Cover",
  emptyText = "Drop, paste or choose an image",
}: CoverInputProps) {
  const { dragging, dropTarget } = useFileDrop(onFile);

  return (
    <div
      className={url && dragging ? "tracecards-cover is-dragover" : "tracecards-cover"}
      style={aspect === COVER_ASPECT ? undefined : { aspectRatio: String(aspect) }}
      {...dropTarget}
    >
      {url ? (
        <>
          <CoverCropper
            key={imageKey ?? url}
            url={url}
            initialCrop={initialCrop}
            onCrop={onCrop}
            aspect={aspect}
            label={label}
          />
          {onRemove && (
            <button
              type="button"
              className="tracecards-cover-remove"
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={onRemove}
            >
              <Icon name={ICONS.removeCover} />
            </button>
          )}
        </>
      ) : (
        <ChooseImage
          className={dragging ? "tracecards-cover-drop is-dragover" : "tracecards-cover-drop"}
          disabled={busy}
          onFile={onFile}
        >
          <Icon name={dragging ? ICONS.dropCover : ICONS.addCover} />
          {busy ? "Preparing image…" : emptyText}
        </ChooseImage>
      )}
    </div>
  );
}

/**
 * Takes files dropped on an element: spread `dropTarget` on it. `dragging` is whether files are
 * being dragged over it.
 */
function useFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  const dropTarget = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    // Stopped here so Obsidian doesn't also take the file into the vault.
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) onFile(file);
    },
  };
  return { dragging, dropTarget };
}

interface ChooseImageProps {
  className?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  children: ReactNode;
}

/** A button that opens the file picker for an image. */
export function ChooseImage({ className, disabled, onFile, children }: ChooseImageProps) {
  const input = useRef<HTMLInputElement>(null);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again still counts as a change.
    event.target.value = "";
    if (file) onFile(file);
  };

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {children}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={onChange} />
    </>
  );
}

interface CoverCropperProps {
  url: string;
  initialCrop: CoverCrop | undefined;
  onCrop: (crop: CoverCrop) => void;
  aspect: number;
  label: string;
}

function CoverCropper({ url, initialCrop, onCrop, aspect, label }: CoverCropperProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // The cropper also reports crops when it loads and when it restores `initialCrop`. Only the
  // user's moves count, so an untouched cover keeps its crop exactly as it was.
  const touched = useRef(false);
  const touch = () => {
    touched.current = true;
    return true;
  };

  return (
    <Cropper
      image={url}
      crop={position}
      zoom={zoom}
      aspect={aspect}
      objectFit="cover"
      showGrid={false}
      initialCroppedAreaPercentages={initialCrop && areaFromCrop(initialCrop)}
      keyboardStep={4}
      // Its styles are in styles.css, which also reaches Obsidian's pop-out windows.
      disableAutomaticStylesInjection
      onCropChange={setPosition}
      onZoomChange={setZoom}
      onInteractionStart={touch}
      // A wheel turn zooms before the cropper calls onInteractionStart.
      onWheelRequest={touch}
      onCropComplete={(area) => {
        if (touched.current) onCrop(cropFromArea(area));
      }}
      mediaProps={{ alt: "" }}
      cropperProps={{ "aria-label": `${label}: move it with the arrow keys` }}
    />
  );
}
