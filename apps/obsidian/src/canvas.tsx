import { findCard } from "@tracecards/core";
import { CARD_SIZE, CardFace, HostContext, ICONS, useHost } from "@tracecards/ui";
import { Component, setIcon, setTooltip, type TFile } from "obsidian";
import { StrictMode, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  type Canvas,
  type CanvasPoint,
  canvasIn,
  type Embed,
  lockShape,
  overrideEmbed,
} from "./canvasInternals";
import type TracecardsPlugin from "./main";
import type { VaultStore } from "./store";

/** On the Tracecards button in each canvas's toolbar. */
const BUTTON_CLASS = "tracecards-canvas-button";

/**
 * Brings Tracecards into Obsidian's Canvas. Each canvas's toolbar gets a button that adds a card,
 * chosen in card search, where the button is clicked or dropped. Cards on a canvas, which are
 * ordinary file nodes, show their face rather than their note, and double-clicking one opens it.
 * Both rely on Canvas internals, since Obsidian has no plugin API for Canvas.
 */
export function registerCanvas(plugin: TracecardsPlugin): void {
  const { workspace } = plugin.app;
  const addButtons = () => {
    for (const leaf of workspace.getLeavesOfType("canvas")) {
      const canvas = canvasIn(leaf.view);
      if (canvas) addButton(plugin, canvas);
    }
  };
  workspace.onLayoutReady(addButtons);
  plugin.registerEvent(workspace.on("layout-change", addButtons));
  plugin.registerEvent(workspace.on("active-leaf-change", addButtons));
  plugin.register(() => {
    for (const leaf of workspace.getLeavesOfType("canvas")) {
      canvasIn(leaf.view)?.cardMenuEl.querySelector(`.${BUTTON_CLASS}`)?.remove();
    }
  });

  overrideEmbed(plugin, "md", ({ containerEl }, file) =>
    containerEl.hasClass("canvas-node-content") && plugin.store.isCard(file.path)
      ? new CanvasCardEmbed(plugin, containerEl, file)
      : null,
  );
}

/**
 * Adds the Tracecards button to the canvas's toolbar, after Obsidian's own, working as they do:
 * click it to add a card in the middle, or drag it to where the card should go.
 */
function addButton(plugin: TracecardsPlugin, canvas: Canvas): void {
  const menu = canvas.cardMenuEl;
  if (menu.querySelector(`.${BUTTON_CLASS}`)) return;
  const button = menu.createDiv({
    cls: ["canvas-card-menu-button", "mod-draggable", BUTTON_CLASS],
  });
  setIcon(button, ICONS.tracecards);
  setTooltip(button, "Drag to add card from Tracecards", { placement: "top" });
  const add = (pos: CanvasPoint, centred: boolean) =>
    plugin.pickCard((file) =>
      canvas.createFileNode({
        pos,
        size: CARD_SIZE,
        position: centred ? "center" : undefined,
        file,
      }),
    );
  button.addEventListener("click", () => add(canvas.posCenter(), true));
  button.addEventListener("pointerdown", (event) =>
    canvas.dragTempNode(event, CARD_SIZE, (pos) => {
      canvas.deselectAll();
      add(pos, false);
    }),
  );
}

/** Shows a card in a canvas node: its face, where Obsidian would show its note. */
class CanvasCardEmbed extends Component implements Embed {
  private root: Root | null = null;

  constructor(
    private readonly plugin: TracecardsPlugin,
    private readonly containerEl: HTMLElement,
    private readonly file: TFile,
  ) {
    super();
  }

  loadFile(): void {
    if (this.root) return;
    const { host, store } = this.plugin;
    // Nodes made elsewhere, such as by Obsidian's "Add note from vault", are square at first.
    lockShape(this.plugin.app, this.containerEl, CARD_SIZE);
    this.root = createRoot(this.containerEl.createDiv("tracecards-canvas-card"));
    this.root.render(
      <StrictMode>
        <HostContext value={host}>
          <CanvasCard store={store} file={this.file} />
        </HostContext>
      </StrictMode>,
    );
  }

  override onunload(): void {
    this.root?.unmount();
    this.root = null;
  }
}

/** The card's face, kept up to date, or its file's name while it isn't found among the cards. */
function CanvasCard({ store, file }: { store: VaultStore; file: TFile }) {
  const host = useHost();
  const { vault } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Read on each change, since renaming a file keeps the same `TFile`.
  const path = store.relativePath(file.path);
  const card = vault && path !== null ? findCard(vault.decks, path) : undefined;
  if (!card) return <p className="tracecards-canvas-card-missing">{file.basename}</p>;
  return (
    <div onDoubleClick={(event) => host.openCard(card, event.nativeEvent)}>
      <CardFace card={card} />
    </div>
  );
}
