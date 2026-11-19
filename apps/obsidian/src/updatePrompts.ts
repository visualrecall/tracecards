import { isNewerVersion, type UpdateOffer } from "@tracecards/core";
import { type App, Modal, Notice } from "obsidian";
import RELEASES from "./releases.json";
import type { Updates } from "./updates";

/** A release's entry in releases.json, as far as what's new needs it. */
interface ReleaseEntry {
  version: string;
  notes?: readonly string[];
}

/**
 * Shows what `Updates` finds: a notice when a newer release is due to be offered, and what's new
 * the first time Tracecards is opened after an update.
 */
export class UpdatePrompts {
  private notice: Notice | null = null;

  constructor(
    private readonly app: App,
    private readonly updates: Updates,
  ) {}

  /** Starts showing offers as they come. Returns a function that stops it. */
  start(): () => void {
    const unsubscribe = this.updates.offer.subscribe(() => this.showOffer());
    this.showOffer();
    return () => {
      unsubscribe();
      this.notice?.hide();
    };
  }

  /**
   * Says what's new, if this device was just updated and hasn't been told yet. Releases without
   * notes, such as small fixes, say nothing.
   */
  showWhatsNew(): void {
    const updated = this.updates.updated.getSnapshot();
    if (!updated) return;
    // Seen as soon as it's shown, so another Tracecards tab opening doesn't show it again.
    this.updates.seenWhatsNew();
    const releases = (RELEASES as readonly ReleaseEntry[]).filter(
      ({ version, notes }) =>
        notes?.length &&
        isNewerVersion(version, updated.from) &&
        !isNewerVersion(version, updated.to),
    );
    if (releases.length > 0) new WhatsNewModal(this.app, this.updates, releases).open();
  }

  /**
   * Shows the offer, which stays until it's closed. However it's closed, the next notice waits a
   * week, or a day when the update is urgent.
   */
  private showOffer(): void {
    const offer = this.updates.offer.getSnapshot();
    if (!offer) return;
    this.updates.shown();
    this.notice?.hide();
    this.notice = new Notice(this.offerMessage(offer), 0);
  }

  private offerMessage({ version, headline }: UpdateOffer): DocumentFragment {
    const message = createFragment();
    message.createDiv({
      text: `Tracecards ${version} is available`,
      cls: "tracecards-update-title",
    });
    if (headline) message.createDiv({ text: headline, cls: "tracecards-update-detail" });
    message.createDiv({
      text: `You have ${this.updates.installed}.`,
      cls: "tracecards-update-detail",
    });
    const actions = message.createDiv({ cls: "tracecards-update-actions" });
    actions
      .createEl("button", { text: "Update", cls: "mod-cta" })
      .addEventListener("click", () => this.updates.openPluginPage());
    actions.createEl("button", { text: "Not now" });
    actions.createEl("a", {
      text: "What's new",
      href: this.updates.releaseNotesUrl(version),
      cls: "tracecards-update-notes",
    });
    return message;
  }
}

/** What's new in the releases since the device's last one, newest first. */
class WhatsNewModal extends Modal {
  constructor(
    app: App,
    private readonly updates: Updates,
    private readonly releases: readonly ReleaseEntry[],
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("tracecards-whats-new");
    this.setTitle("What's new in Tracecards");
    const { contentEl } = this;
    for (const { version, notes } of this.releases) {
      contentEl.createEl("h3", { text: version });
      const list = contentEl.createEl("ul");
      for (const note of notes ?? []) list.createEl("li", { text: note });
    }
    const footer = contentEl.createDiv({ cls: "tracecards-whats-new-footer" });
    footer.createEl("a", { text: "All release notes", href: this.updates.releaseNotesUrl() });
    footer
      .createEl("button", { text: "Done", cls: "mod-cta" })
      .addEventListener("click", () => this.close());
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
