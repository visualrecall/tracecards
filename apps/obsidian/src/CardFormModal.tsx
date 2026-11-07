import { CardForm, type CardFormRequest, DISCARD_CHANGES, HostContext } from "@tracecards/ui";
import { type App, Modal } from "obsidian";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { ObsidianHost } from "./host";
import { confirmModal } from "./modals";

/**
 * The card form in a modal that nearly fills the window, for a new card or editing one. The form
 * has its own title. Closing it with unsaved changes, by Esc, the close button or a click
 * outside, asks first.
 */
export class CardFormModal extends Modal {
  private root: Root | null = null;
  private dirty = false;
  private confirming = false;

  constructor(
    app: App,
    private readonly host: ObsidianHost,
    private readonly form: CardFormRequest,
    private readonly onClosed: () => void,
  ) {
    super(app);
    // Once open, Obsidian focuses a modal's first field, while the form focuses the title itself,
    // with the cursor after its text. Obsidian's types leave this out.
    (this as { hasInitialInputFocus?: boolean }).hasInitialInputFocus = false;
  }

  override onOpen(): void {
    this.containerEl.addClass("tracecards-card-form-modal");
    const root = (this.root = createRoot(this.contentEl));
    // Rendered synchronously, so the title field can take the focus straight away.
    flushSync(() =>
      root.render(
        <StrictMode>
          <HostContext value={this.host}>
            <CardForm
              request={this.form}
              onDirtyChange={(dirty) => {
                this.dirty = dirty;
              }}
              onSaved={() => {
                this.dirty = false;
                this.close();
              }}
            />
          </HostContext>
        </StrictMode>,
      ),
    );
  }

  override close(): void {
    if (!this.dirty) {
      super.close();
      return;
    }
    if (this.confirming) return;
    this.confirming = true;
    void confirmModal(this.app, DISCARD_CHANGES).then((discard) => {
      this.confirming = false;
      if (!discard) return;
      this.dirty = false;
      super.close();
    });
  }

  override onClose(): void {
    this.root?.unmount();
    this.onClosed();
  }
}
