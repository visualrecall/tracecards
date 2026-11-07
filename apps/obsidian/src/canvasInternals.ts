import type { App, Component, Plugin, TFile, View } from "obsidian";

// Obsidian's Canvas has no plugin API, so Tracecards uses a few of its internals, typed here by
// hand and checked before use: when an Obsidian update changes them, Canvas works as it did
// without Tracecards.

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

/** The parts of a canvas tab's canvas that Tracecards uses. */
export interface Canvas {
  /** The toolbar under the canvas, with the buttons that add cards, notes and media. */
  cardMenuEl: HTMLElement;
  /** The middle of what the canvas shows, in canvas coordinates. */
  posCenter(): CanvasPoint;
  deselectAll(): void;
  /**
   * Follows a drag that starts on a toolbar button with an outline of a node of this size, and
   * calls `onDrop` with where it was let go, if it was dragged.
   */
  dragTempNode(event: PointerEvent, size: CanvasSize, onDrop: (pos: CanvasPoint) => void): void;
  /** Adds a node showing the file, at `pos`, or centred on it with `position: "center"`. */
  createFileNode(options: {
    pos: CanvasPoint;
    size: CanvasSize;
    position?: "center";
    file: TFile;
  }): unknown;
}

const CANVAS_METHODS = ["posCenter", "deselectAll", "dragTempNode", "createFileNode"] as const;

/** The view's canvas, when it's a canvas tab and its canvas has what Tracecards uses. */
export function canvasIn(view: View): Canvas | null {
  const { canvas } = view as View & { canvas?: unknown };
  if (typeof canvas !== "object" || canvas === null) return null;
  const parts = canvas as Record<string, unknown>;
  const { cardMenuEl } = parts;
  // The element may come from a pop-out window, where `instanceof HTMLElement` would fail.
  if (typeof cardMenuEl !== "object" || cardMenuEl === null || !("createDiv" in cardMenuEl)) {
    return null;
  }
  return CANVAS_METHODS.every((name) => typeof parts[name] === "function")
    ? (canvas as Canvas)
    : null;
}

/** The parts of a node on a canvas that Tracecards uses. */
interface CanvasNode {
  canvas: { overrideHistory(): void };
  /** Where the node's file is shown. */
  contentEl: HTMLElement;
  width: number;
  height: number;
  /** Width over height, which resizing keeps, or 0 for none. Canvas sets it for images. */
  aspectRatio: number;
  resize(size: CanvasSize): void;
}

function isCanvasNode(value: unknown): value is CanvasNode {
  if (typeof value !== "object" || value === null) return false;
  const { canvas, contentEl, width, height, aspectRatio, resize } = value as Record<
    string,
    unknown
  >;
  return (
    typeof canvas === "object" &&
    canvas !== null &&
    "overrideHistory" in canvas &&
    typeof canvas.overrideHistory === "function" &&
    typeof contentEl === "object" &&
    typeof width === "number" &&
    typeof height === "number" &&
    typeof aspectRatio === "number" &&
    typeof resize === "function"
  );
}

/**
 * Locks the canvas node that shows a file in `contentEl` to the shape of `size`, as Canvas does
 * for an image, so resizing keeps it. A node in another shape, such as a new one from Canvas's
 * own buttons, is given `size`, keeping its top left corner; the change joins the last step in
 * the canvas's undo history.
 */
export function lockShape(app: App, contentEl: HTMLElement, size: CanvasSize): void {
  const ratio = size.width / size.height;
  for (const leaf of app.workspace.getLeavesOfType("canvas")) {
    const { canvas } = leaf.view as View & { canvas?: { nodes?: unknown } };
    if (!(canvas?.nodes instanceof Map)) continue;
    for (const node of (canvas.nodes as Map<string, unknown>).values()) {
      // The cheap check first: every card node on a canvas does this as it loads.
      if ((node as { contentEl?: unknown } | null)?.contentEl !== contentEl) continue;
      if (!isCanvasNode(node)) return;
      node.aspectRatio = ratio;
      // The embed loads while Canvas draws the node, and a resize made then isn't drawn: Canvas
      // forgets which nodes moved when it finishes drawing. Canvas resizes images after they load.
      queueMicrotask(() => {
        if (Math.abs(node.width / node.height - ratio) <= 0.001) return;
        node.resize(size);
        node.canvas.overrideHistory();
      });
      return;
    }
  }
}

/** What Obsidian passes the function that shows an embedded file. */
export interface EmbedContext {
  app: App;
  /** Where the file is shown. A canvas node's is its `canvas-node-content` element. */
  containerEl: HTMLElement;
  /** The path of the note or canvas the file is shown in. */
  sourcePath: string;
}

/** What shows an embedded file. Obsidian loads it, then calls `loadFile`. */
export interface Embed extends Component {
  loadFile(): void | Promise<void>;
}

type EmbedCreator = (context: EmbedContext, file: TFile, subpath?: string) => Embed | null;

/**
 * Shows files with this extension with `create` wherever it returns an embed, and as before
 * everywhere else, until the plugin unloads. Whatever showed them before, Obsidian or another
 * plugin, is called for the rest, so plugins that do the same keep working.
 */
export function overrideEmbed(
  plugin: Plugin,
  extension: string,
  create: (context: EmbedContext, file: TFile) => Embed | null,
): void {
  const { embedRegistry } = plugin.app as App & { embedRegistry?: unknown };
  const creators =
    typeof embedRegistry === "object" &&
    embedRegistry !== null &&
    "embedByExtension" in embedRegistry
      ? (embedRegistry.embedByExtension as Record<string, EmbedCreator | undefined>)
      : undefined;
  const previous = creators?.[extension];
  if (!creators || typeof previous !== "function") return;

  let active = true;
  const override: EmbedCreator = (context, file, subpath) =>
    (active ? create(context, file) : null) ?? previous(context, file, subpath);
  creators[extension] = override;
  plugin.register(() => {
    active = false;
    // If another plugin has wrapped this one since, it stays in place and only passes through.
    if (creators[extension] === override) creators[extension] = previous;
  });
}
