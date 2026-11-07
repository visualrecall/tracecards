import {
  ATTACHMENTS,
  addBookmark,
  type Card,
  coverFileName,
  DECK_FILE,
  type Deck,
  ensureId,
  type Frontmatter,
  newCardFile,
  newFile,
  removeBookmark,
  setPad,
  setCover,
  setCoverCrop,
  setDescription,
  setRank,
  ulid,
} from "@tracecards/core";
import type { CardEdit, CardUpdate, CoverImage, DeckUpdate, NewCard } from "@tracecards/ui";
import type { App, TFile, TFolder } from "obsidian";
import type { VaultStore } from "./store";

/** Deck fields that Tracecards writes. See "Decks" in spec/vault-format.md. */
type DeckFields = Omit<DeckUpdate, "deck">;

/** Card fields that Tracecards writes. See "Cards" in spec/vault-format.md. */
type CardFields = Omit<CardUpdate, "card">;

/**
 * Every change Tracecards makes to the vault. Writes go through Obsidian's file manager where it
 * has a method, so renames update links and deletions follow the user's trash setting.
 */
export class VaultActions {
  constructor(
    private readonly app: App,
    private readonly store: VaultStore,
  ) {}

  async createFolder(): Promise<void> {
    await this.app.vault.createFolder(this.store.folder);
  }

  async createDeck(name: string): Promise<void> {
    await this.app.vault.createFolder(this.store.vaultPath(name));
  }

  async renameDeck(deck: Deck, name: string): Promise<void> {
    await this.app.fileManager.renameFile(this.deckFolder(deck), this.store.vaultPath(name));
  }

  async trashDeck(deck: Deck): Promise<void> {
    await this.app.fileManager.trashFile(this.deckFolder(deck));
  }

  /**
   * Sets fields in the deck's `_deck.md`, keeping the others, or creates it with them. Fields left
   * undefined aren't written.
   */
  async updateDeck(deck: Deck, { icon, rank, pad }: DeckFields): Promise<void> {
    const change = (frontmatter: Frontmatter) => {
      if (icon !== undefined) frontmatter.icon = icon;
      if (rank !== undefined) setRank(frontmatter, rank);
      if (pad !== undefined) setPad(frontmatter, pad);
    };
    const path = `${this.deckFolder(deck).path}/${DECK_FILE}`;
    const file = this.app.vault.getFileByPath(path);
    if (!file) {
      const fields: Frontmatter = {};
      change(fields);
      await this.app.vault.create(path, newFile(fields));
      return;
    }
    await this.app.fileManager.processFrontMatter(file, change);
  }

  /** Sets fields in the card's frontmatter, keeping the others. Undefined ones aren't written. */
  async updateCard(card: Card, { rank }: CardFields): Promise<void> {
    await this.writeCard(card, this.cardFile(card), (frontmatter) => {
      if (rank !== undefined) setRank(frontmatter, rank);
    });
  }

  /**
   * Writes a new card file in the deck's folder, after its cover image when it has one, as
   * "Adding cards" and "Setting a cover" in the spec say. Resolves to its path, relative to the
   * Tracecards folder.
   */
  async createCard({ deck, title, description, rank, cover, bookmarks }: NewCard): Promise<string> {
    const path = `${this.deckFolder(deck).path}/${title}.md`;
    const image = cover && (await this.saveCoverImage(cover.image, title));
    const text = newCardFile({
      id: newId(),
      created: new Date(),
      description,
      cover: image?.name,
      coverCrop: cover?.crop,
      rank,
      bookmarks,
    });
    try {
      const file = await this.app.vault.create(path, text);
      return `${deck.name}/${file.name}`;
    } catch (error) {
      if (image) await this.app.fileManager.trashFile(image);
      throw error;
    }
  }

  /**
   * Writes the card's description, its cover and its bookmarks, then renames the card's file,
   * which updates links to it. The file stays in its folder. A new cover image is saved first, and
   * the one it replaces goes to the trash if nothing else uses it.
   */
  async editCard(card: Card, { title, description, cover, bookmarks }: CardEdit): Promise<void> {
    const file = this.cardFile(card);
    const newImage = cover && "image" in cover ? cover.image : null;
    const replaced = cover === null || newImage ? this.coverFile(card) : null;
    const image = newImage && (await this.saveCoverImage(newImage, title ?? card.title));
    if (description !== undefined || cover !== undefined || bookmarks) {
      try {
        await this.writeCard(card, file, (frontmatter) => {
          if (description !== undefined) setDescription(frontmatter, description);
          for (const url of bookmarks?.remove ?? []) removeBookmark(frontmatter, url);
          for (const bookmark of bookmarks?.add ?? []) addBookmark(frontmatter, bookmark);
          if (cover === null) setCover(frontmatter, null);
          else if (cover) {
            if (image) setCover(frontmatter, image.name);
            setCoverCrop(frontmatter, cover.crop);
          }
        });
      } catch (error) {
        if (image) await this.app.fileManager.trashFile(image);
        throw error;
      }
    }
    if (replaced && replaced !== image) await this.trashIfUnused(replaced, card, file);
    if (title !== undefined) {
      const folder = file.path.slice(0, -file.name.length);
      await this.app.fileManager.renameFile(file, `${folder}${title}.md`);
    }
  }

  /** The image file the card's cover links to, if it exists. */
  coverFile(card: Card): TFile | null {
    if (!card.cover) return null;
    return this.app.metadataCache.getFirstLinkpathDest(card.cover, this.store.vaultPath(card.path));
  }

  /**
   * Saves a cover image in the attachments folder, creating the folder if needed. It's named
   * after the card, and unlike any file anywhere in the vault, so that its bare name links to it.
   * A name is taken when a link of just that name already leads to a file, as Obsidian finds
   * links, or when the folder has a file of that name in any letter case, which macOS and Windows
   * take for the same file. Neither needs a list of the vault's files.
   */
  private async saveCoverImage(image: CoverImage, title: string): Promise<TFile> {
    const folder = this.store.vaultPath(ATTACHMENTS);
    const attachments =
      this.app.vault.getFolderByPath(folder) ?? (await this.app.vault.createFolder(folder));
    const name = coverFileName(title, image.extension, (candidate) => {
      const lower = candidate.toLowerCase();
      return (
        this.app.metadataCache.getFirstLinkpathDest(candidate, "") !== null ||
        attachments.children.some((child) => child.name.toLowerCase() === lower)
      );
    });
    return this.app.vault.createBinary(`${folder}/${name}`, await image.data.arrayBuffer());
  }

  /**
   * Moves an image that a card's cover no longer links to into the trash, if it's in the
   * attachments folder and nothing else uses it: no note or other card links to it, and neither
   * does the card's note or its other properties.
   */
  private async trashIfUnused(image: TFile, card: Card, file: TFile): Promise<void> {
    const { metadataCache } = this.app;
    if (!image.path.startsWith(`${this.store.vaultPath(ATTACHMENTS)}/`)) return;
    // The card's own entry still has the link just removed, so it's checked below instead.
    const linked = Object.entries(metadataCache.resolvedLinks).some(
      ([source, links]) => source !== file.path && links[image.path] !== undefined,
    );
    // Other cards' covers too, which doesn't rely on the cache counting links in properties.
    const cover = this.store.decks.some((deck) =>
      deck.cards.some((other) => other.path !== card.path && this.coverFile(other) === image),
    );
    const cache = metadataCache.getFileCache(file);
    const own = [
      ...(cache?.links ?? []),
      ...(cache?.embeds ?? []),
      ...(cache?.frontmatterLinks ?? []).filter(
        (link) => link.key !== "cover" && !link.key.startsWith("cover."),
      ),
    ].some((link) => metadataCache.getFirstLinkpathDest(link.link, file.path) === image);
    if (linked || cover || own) return;
    try {
      await this.app.fileManager.trashFile(image);
    } catch {
      // The card is saved either way, and an image left behind does no harm.
    }
  }

  /**
   * Moves the card's file into the deck's folder, which updates links to it, then sets its rank,
   * or removes it when `rank` is undefined. The frontmatter is written only if the rank changes.
   */
  async moveCard(card: Card, deck: Deck, rank: number | undefined): Promise<void> {
    const file = this.cardFile(card);
    await this.app.fileManager.renameFile(file, `${this.deckFolder(deck).path}/${file.name}`);
    if (rank === card.rank) return;
    await this.writeCard(card, file, (frontmatter) => setRank(frontmatter, rank));
  }

  async trashCard(card: Card): Promise<void> {
    await this.app.fileManager.trashFile(this.cardFile(card));
  }

  /** Changes the card's bookmarks with one of core's changes, such as `addBookmark`. */
  async changeBookmarks(card: Card, change: (frontmatter: Frontmatter) => void): Promise<void> {
    await this.writeCard(card, this.cardFile(card), change);
  }

  /**
   * Changes the card's frontmatter. Since the file is being written anyway, a card without an id
   * of its own gets one (see `ensureId`).
   */
  private async writeCard(
    card: Card,
    file: TFile,
    change: (frontmatter: Frontmatter) => void,
  ): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter: Frontmatter) => {
      change(frontmatter);
      ensureId(frontmatter, card, this.store.decks, newId);
    });
  }

  private cardFile(card: Card): TFile {
    const file = this.app.vault.getFileByPath(this.store.vaultPath(card.path));
    if (!file) throw new Error(`the card “${card.title}” no longer exists`);
    return file;
  }

  private deckFolder(deck: Deck): TFolder {
    const folder = this.app.vault.getFolderByPath(this.store.vaultPath(deck.name));
    if (!folder) throw new Error(`the folder “${deck.name}” no longer exists`);
    return folder;
  }
}

function newId(): string {
  return ulid(Date.now(), (count) => crypto.getRandomValues(new Uint8Array(count)));
}
