import type { Deck } from "@tracecards/core";
import { type Confirmation, type FieldsPrompt, ICONS } from "@tracecards/ui";
import {
  type App,
  ConfirmationModal,
  getIconIds,
  Setting,
  setIcon,
  SuggestModal,
  type TextComponent,
} from "obsidian";

/**
 * Asks for one or more lines of text, each in a labelled field (or an unlabelled one for a single
 * line). The dialog stays open while `validate` finds a problem.
 */
export class PromptModal extends ConfirmationModal {
  private readonly fields: { setting: Setting; text: TextComponent }[] = [];
  private result: string[] | null = null;

  constructor(
    app: App,
    prompt: FieldsPrompt,
    private readonly resolve: (values: string[] | null) => void,
  ) {
    super(app);
    this.setTitle(prompt.title);
    this.addClass("tracecards-prompt");

    for (const field of prompt.fields) {
      const setting = new Setting(this.contentEl);
      if (field.label) setting.setName(field.label).setClass("tracecards-prompt-field");
      let text: TextComponent | undefined;
      setting.addText((component) => {
        text = component.setValue(field.value ?? "").setPlaceholder(field.placeholder ?? "");
        component.onChange(() => setting.setErrorMessage(null));
      });
      if (!text) throw new Error("Setting.addText didn't create a field.");
      this.fields.push({ setting, text });
    }

    this.addButton((button) => {
      button
        .setButtonText(prompt.cta)
        .setCta()
        .onClick(() => {
          const values = this.fields.map(({ text }) => text.getValue());
          const problem = prompt.validate(values);
          for (const [index, { setting }] of this.fields.entries()) {
            setting.setErrorMessage(index === problem?.field ? problem.message : null);
          }
          if (problem) return true; // keeps the dialog open
          this.result = values;
          return false;
        });
      // Like a form: Enter in a field accepts.
      for (const { text } of this.fields) {
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" || event.isComposing) return;
          event.preventDefault();
          button.buttonEl.click();
        });
      }
    });
    this.addCancelButton();
  }

  override onOpen(): void {
    const first = this.fields[0]?.text.inputEl;
    first?.focus();
    first?.select();
  }

  override onClose(): void {
    super.onClose();
    this.resolve(this.result);
  }
}

/** Asks the user to confirm. Resolves to true only when the confirm button was pressed. */
export function confirmModal(app: App, confirmation: Confirmation): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    const modal = new ConfirmationModal(app)
      .setTitle(confirmation.title)
      .setContent(confirmation.message)
      .setCloseCallback(() => resolve(confirmed));
    modal.addButton((button) => {
      button
        .setButtonText(confirmation.cta)
        .setCta()
        .onClick(() => {
          confirmed = true;
        });
      // Enter shouldn't delete something by accident, so only safe actions get the focus.
      if (confirmation.destructive) button.setDestructive();
      else button.setInitialFocus();
    });
    modal.addCancelButton();
    modal.open();
  });
}

const LUCIDE_PREFIX = "lucide-";

/**
 * Lets the user search Lucide's icons, shown with their names. Icons that Obsidian or other
 * plugins add are left out, since the phone apps only have Lucide's.
 */
export class IconSuggestModal extends SuggestModal<string> {
  private readonly icons = getIconIds()
    .filter((id) => id.startsWith(LUCIDE_PREFIX))
    .map((id) => id.slice(LUCIDE_PREFIX.length));
  private chosen: string | null = null;

  constructor(
    app: App,
    private readonly resolve: (icon: string | null) => void,
  ) {
    super(app);
    this.setPlaceholder("Search icons");
    this.limit = 200;
  }

  override getSuggestions(query: string): string[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.icons.filter((icon) => words.every((word) => icon.includes(word)));
  }

  override renderSuggestion(icon: string, element: HTMLElement): void {
    element.addClass("tracecards-icon-suggestion");
    setIcon(element.createSpan(), icon);
    element.createSpan({ text: icon });
  }

  override onChooseSuggestion(icon: string): void {
    this.chosen = icon;
  }

  override onClose(): void {
    super.onClose();
    // Obsidian calls onChooseSuggestion after closing, so wait for it.
    window.setTimeout(() => this.resolve(this.chosen), 0);
  }
}

/**
 * Lets the user search decks that aren't on the deck pad, to attach one, or choose to create a
 * new deck, which is always the last suggestion.
 */
export class DeckSuggestModal extends SuggestModal<Deck | "new"> {
  private chosen: Deck | "new" | null = null;

  constructor(
    app: App,
    private readonly decks: readonly Deck[],
    private readonly resolve: (choice: Deck | "new" | null) => void,
  ) {
    super(app);
    this.setPlaceholder("Search decks to attach, or create a new one");
  }

  override getSuggestions(query: string): (Deck | "new")[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = this.decks.filter((deck) =>
      words.every((word) => deck.name.toLowerCase().includes(word)),
    );
    // As in the card search: first until something is typed, then after the matches, so Enter
    // picks the best one.
    return words.length === 0 ? ["new", ...matching] : [...matching, "new"];
  }

  override renderSuggestion(choice: Deck | "new", element: HTMLElement): void {
    element.addClass("tracecards-icon-suggestion");
    if (choice === "new") {
      setIcon(element.createSpan(), ICONS.add);
      element.createSpan({ text: "New deck…" });
      return;
    }
    setIcon(element.createSpan(), choice.icon ?? ICONS.deck);
    element.createSpan({ text: choice.name });
  }

  override onChooseSuggestion(choice: Deck | "new"): void {
    this.chosen = choice;
  }

  override onClose(): void {
    super.onClose();
    // Obsidian calls onChooseSuggestion after closing, so wait for it.
    window.setTimeout(() => this.resolve(this.chosen), 0);
  }
}
