import type { Card } from "@tracecards/core";
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CardFace } from "./CardFace";
import { CardWords } from "./CardWords";
import { cardTitleProblem } from "./cardActions";
import { CoverInput } from "./CoverInput";
import { type CardFormRequest, useHost } from "./host";
import { PicturePicker } from "./PicturePicker";
import { useCoverDraft } from "./useCoverDraft";

interface CardFormProps {
  request: CardFormRequest;
  /** Called with whether the form holds changes that haven't been saved. */
  onDirtyChange: (dirty: boolean) => void;
  /** Called once the form has been saved, to close it. */
  onSaved: () => void;
}

/**
 * The card form, for a new card or for editing one, on one page: the title and description,
 * written as one text whose first line is the title, then the picture under them (the cover,
 * from Pixabay or the user's own image). On the right is the card as it will look, with its cover
 * set right there, the deck to save a new card to, and Save. Save or Cmd or
 * Ctrl+Enter anywhere saves. Only the title is required.
 */
export function CardForm({ request, onDirtyChange, onSaved }: CardFormProps) {
  const host = useHost();
  const { card, decks } = request;
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [deckName, setDeckName] = useState(request.deck.name);
  const cover = useCoverDraft(card);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // What Pixabay is searched for until the user types a search: the title once the user has moved
  // on from it to the description, rather than as it's typed, or an edited card's title.
  const [titleSearch, setTitleSearch] = useState(card?.title ?? "");
  const titleField = useRef<HTMLTextAreaElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const id = useId();

  const deck = decks.find((candidate) => candidate.name === deckName) ?? request.deck;
  const dirty =
    title !== (card?.title ?? "") || description !== (card?.description ?? "") || cover.changed;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // The title has the focus as the modal opens, with the cursor after it, which is what editing
  // usually changes.
  useLayoutEffect(() => {
    const field = titleField.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  const missing = title.trim() === "" ? "Add a title to save the card." : null;

  const preview: Card = {
    path: "",
    kind: "idea",
    bookmarks: [],
    ...card,
    title: title.trim(),
    description: description.trim() || undefined,
  };

  const submit = async () => {
    if (saving || cover.preparing || missing) return;
    const found = cardTitleProblem(title, deck, card);
    setProblem(found);
    if (found) {
      titleField.current?.focus();
      return;
    }
    setSaving(true);
    // A picked image is downloaded now.
    const coverEdit = await cover.edit();
    if (coverEdit === false) {
      setSaving(false);
      return;
    }
    const saved = await request.save({
      title: title.trim(),
      description: description.trim(),
      deck,
      cover: coverEdit,
    });
    setSaving(false);
    if (saved) onSaved();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.nativeEvent.isComposing) return;
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submit();
  };

  return (
    // An image pasted anywhere in the form becomes the cover.
    <div className="tracecards-card-form" onKeyDown={onKeyDown} onPaste={cover.onPaste}>
      <div className="tracecards-card-form-head">
        <h2>{card ? "Edit card" : "New card"}</h2>
      </div>
      <div className="tracecards-card-form-body">
        <div className="tracecards-card-form-pane">
          <div className="tracecards-card-form-content">
            <CardWords
              title={title}
              description={description}
              onTitle={(changed) => {
                setTitle(changed);
                setProblem(null);
              }}
              onDescription={setDescription}
              titleField={titleField}
              onTitleDone={setTitleSearch}
              next={searchField}
              problem={problem}
            />
            <PicturePicker
              titleSearch={titleSearch}
              picked={cover.pickedImage}
              searchField={searchField}
              onPickImage={cover.pickDownload}
            />
          </div>
        </div>
        <div className="tracecards-card-form-side">
          <CardFace
            card={preview}
            cover={
              <CoverInput
                url={cover.url}
                imageKey={cover.key}
                initialCrop={cover.initialCrop}
                busy={cover.preparing}
                onFile={cover.pick}
                onRemove={cover.remove}
                onCrop={cover.setCrop}
              />
            }
          />
          {!card && (
            <div className="tracecards-field">
              <label htmlFor={`${id}-deck`}>Save to:</label>
              <select
                id={`${id}-deck`}
                className="dropdown"
                value={deckName}
                onChange={(event) => {
                  setDeckName(event.target.value);
                  setProblem(null);
                }}
              >
                {decks.map((candidate) => (
                  <option key={candidate.name} value={candidate.name}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            className={saving ? "mod-cta is-saving" : "mod-cta"}
            disabled={missing !== null || saving || cover.preparing}
            aria-busy={saving}
            // Says why on hover, as Generate does: a disabled button doesn't get Obsidian's tooltips.
            title={missing ?? undefined}
            onClick={() => void submit()}
          >
            {card ? "Update card" : "Save card"}
            {/* While saving, which can take a moment when an image is downloaded first. */}
            {saving ? (
              <span className="tracecards-spinner" aria-hidden="true" />
            ) : (
              <span className="tracecards-shortcut">{host.modKey("Enter")}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
