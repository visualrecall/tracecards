import { type Card, cardDeckName, type Deck } from "@tracecards/core";
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { CardFace } from "./CardFace";
import { cardTitleProblem, MAX_DESCRIPTION, MAX_TITLE, oneLineTitle } from "./cardActions";
import { Cover } from "./Cover";
import { ChooseImage, CoverInput } from "./CoverInput";
import { type CoverEdit, useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { useCoverDraft } from "./useCoverDraft";
import { useEditInPlace } from "./useEditInPlace";

/** The classes of the face's editors, each of which takes Esc to cancel. */
const EDITORS = ".tracecards-cover-editor, .tracecards-face-field";

/**
 * Whether this element, usually the focused one, is in one of an opened card's editors: its
 * cover, title or description. A modal around it leaves Esc to the editor then.
 */
export function isEditingFace(element: Element | null): boolean {
  return element?.closest(EDITORS) != null;
}

/**
 * An opened card's face, where a click on the cover, the title or the description edits that part
 * in place. Each saves on its own.
 */
export function EditableFace({ card, decks }: { card: Card; decks: readonly Deck[] }) {
  const host = useHost();
  const deck = decks.find((candidate) => candidate.name === cardDeckName(card.path));
  return (
    <CardFace
      card={card}
      cover={<EditableCover card={card} />}
      text={
        <>
          <EditableText
            card={card}
            value={card.title}
            className="tracecards-card-title"
            label="Title"
            maxLength={MAX_TITLE}
            problem={(title) => (deck ? cardTitleProblem(title, deck, card) : null)}
            write={(title) => host.editCard(card, { title })}
          />
          <EditableText
            card={card}
            value={card.description ?? ""}
            className="tracecards-card-description"
            label="Description"
            placeholder="Add a description"
            multiline
            maxLength={MAX_DESCRIPTION}
            write={(description) => host.editCard(card, { description })}
          />
        </>
      }
    />
  );
}

/**
 * The cover, which a click edits in place with the card form's cover input: move and zoom the
 * image, or choose, drop or paste another. Hovering says so. Done, Enter or a click anywhere else
 * saves; Cancel or Esc leaves the cover as it was.
 */
function EditableCover({ card }: { card: Card }) {
  const host = useHost();
  const edit = useEditInPlace();
  // Whether the cover's button takes the focus when it's back, after leaving with the keyboard or
  // the editor's buttons. After a click elsewhere, the focus stays where it went.
  const refocus = useRef(false);

  const focusButton = useCallback((button: HTMLButtonElement | null) => {
    if (!button || !refocus.current) return;
    refocus.current = false;
    button.focus({ preventScroll: true });
  }, []);

  if (edit.open) {
    return (
      <CoverEditor
        card={card}
        saving={edit.saving}
        onSave={(cover, focus) => {
          refocus.current = focus;
          if (cover === undefined) edit.stop();
          else void edit.save(() => host.editCard(card, { cover }));
        }}
        onCancel={() => {
          refocus.current = true;
          edit.stop();
        }}
      />
    );
  }

  const own = host.coverUrl(card) !== null;
  return (
    <div className="tracecards-cover-editable">
      <Cover card={card} />
      <button
        ref={focusButton}
        type="button"
        className="tracecards-cover-edit"
        onClick={edit.start}
      >
        <span className="tracecards-cover-hint">
          <Icon name={own ? ICONS.edit : ICONS.addCover} />
          {own ? "Edit cover" : "Add cover"}
        </span>
      </button>
    </div>
  );
}

interface CoverEditorProps {
  card: Card;
  /** Whether the changes are being saved, or have been, which ends editing. */
  saving: boolean;
  /** Called with what to save, if anything, and whether the cover takes the focus after. */
  onSave: (edit: CoverEdit | undefined, focus: boolean) => void;
  onCancel: () => void;
}

function CoverEditor({ card, saving, onSave, onCancel }: CoverEditorProps) {
  const cover = useCoverDraft(card);
  const root = useRef<HTMLDivElement>(null);

  const done = (focus: boolean) => {
    if (saving || cover.preparing) return;
    // Only the card form downloads images, so here the edit is ready at once.
    void cover.edit().then((edit) => {
      if (edit !== false) onSave(edit, focus);
    });
  };

  const onPointerDown = useEffectEvent((event: PointerEvent) => {
    if (!root.current?.contains(event.target as Node | null)) done(false);
  });

  // Focused, so Esc, Enter and pasting reach the editor, and a click anywhere else saves.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    const listener = (event: PointerEvent) => onPointerDown(event);
    element.ownerDocument.addEventListener("pointerdown", listener, true);
    return () => element.ownerDocument.removeEventListener("pointerdown", listener, true);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (saving) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && !(event.target as Element).closest("button")) {
      event.preventDefault();
      done(true);
    }
  };

  return (
    <div
      ref={root}
      className={saving ? "tracecards-cover-editor is-saving" : "tracecards-cover-editor"}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPaste={cover.onPaste}
    >
      <CoverInput
        url={cover.url}
        initialCrop={cover.initialCrop}
        busy={cover.preparing}
        onFile={cover.pick}
        onCrop={cover.setCrop}
      />
      {!saving && (
        <div className="tracecards-cover-actions">
          {cover.url && (
            <ChooseImage className="tracecards-cover-replace" onFile={cover.pick}>
              Replace…
            </ChooseImage>
          )}
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="mod-cta"
            disabled={cover.preparing}
            onClick={() => done(true)}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

interface EditableTextProps {
  card: Card;
  /** The card's text: its title or description. */
  value: string;
  /** The face's class for this text, which its field has too, so editing it moves nothing. */
  className: string;
  label: string;
  /** Shown on hover while there's no text. */
  placeholder?: string;
  /** Whether Enter adds a line, so Cmd or Ctrl+Enter saves. Otherwise Enter saves. */
  multiline?: boolean;
  maxLength?: number;
  /** Why the trimmed text can't be saved, or null when it can. */
  problem?: (text: string) => string | null;
  /** Writes the trimmed text, resolving to whether it worked. */
  write: (text: string) => Promise<boolean>;
}

/**
 * The title or the description, which a click turns into a field in its place, with the caret
 * where the click was. Hovering highlights it. Enter (Cmd or Ctrl+Enter where Enter adds a line)
 * or clicking away saves; Esc leaves it as it was.
 */
function EditableText({ card, value, placeholder, write, ...field }: EditableTextProps) {
  const edit = useEditInPlace();
  const [caret, setCaret] = useState(0);

  if (edit.open) {
    return (
      <TextField
        {...field}
        initial={value}
        caret={caret}
        saving={edit.saving}
        onSave={(text) => {
          if (text === value) edit.stop();
          else void edit.save(() => write(text));
        }}
        onCancel={edit.stop}
      />
    );
  }

  const start = (at: number) => {
    setCaret(at);
    edit.start();
  };

  return (
    <div
      className={`${field.className} tracecards-face-text`}
      tabIndex={0}
      aria-label={value ? undefined : field.label}
      onClick={(event) => start(value ? (clickedOffset(event) ?? value.length) : 0)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        start(value.length);
      }}
    >
      {value || <span className="tracecards-face-placeholder">{placeholder}</span>}
    </div>
  );
}

/** Where in the clicked element's text the click landed, or null when that can't be told. */
function clickedOffset({
  currentTarget,
  clientX,
  clientY,
}: MouseEvent<HTMLElement>): number | null {
  const { ownerDocument } = currentTarget;
  if (typeof ownerDocument.caretPositionFromPoint === "function") {
    const position = ownerDocument.caretPositionFromPoint(clientX, clientY);
    return position && currentTarget.contains(position.offsetNode) ? position.offset : null;
  }
  const webkit: CaretRangeDocument = ownerDocument;
  const range = webkit.caretRangeFromPoint(clientX, clientY);
  return range && currentTarget.contains(range.startContainer) ? range.startOffset : null;
}

/**
 * WebKit's way to find where a point is in the text. The standard caretPositionFromPoint is
 * recent, so older Android WebViews and iPads only have this, which is deprecated in its favour.
 */
interface CaretRangeDocument {
  caretRangeFromPoint(x: number, y: number): Range | null;
}

interface TextFieldProps extends Omit<
  EditableTextProps,
  "card" | "value" | "placeholder" | "write"
> {
  initial: string;
  caret: number;
  /** Whether the text is being saved, or has been, which ends editing. */
  saving: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}

function TextField({
  initial,
  caret,
  className,
  label,
  multiline = false,
  maxLength,
  problem,
  saving,
  onSave,
  onCancel,
}: TextFieldProps) {
  const [text, setText] = useState(initial);
  const [shownProblem, setShownProblem] = useState<string | null>(null);
  // Set once the field is left with Esc, so the blur as it goes doesn't save.
  const cancelled = useRef(false);
  const id = useId();

  // Focused once, with the caret where the click was.
  const focus = useCallback(
    (field: HTMLTextAreaElement | null) => {
      field?.focus({ preventScroll: true });
      field?.setSelectionRange(caret, caret);
    },
    [caret],
  );

  const save = () => {
    if (saving || cancelled.current) return;
    const trimmed = text.trim();
    const found = problem?.(trimmed) ?? null;
    setShownProblem(found);
    if (found === null) onSave(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (saving || event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      onCancel();
    } else if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  };

  return (
    <>
      {/* The title's field grows with its text; the description's fills the card's space. */}
      <div
        className={`${className} tracecards-face-field${multiline ? "" : " tracecards-autosize"}`}
        data-value={text}
      >
        <textarea
          ref={focus}
          value={text}
          rows={1}
          readOnly={saving}
          maxLength={maxLength}
          aria-label={label}
          aria-invalid={shownProblem !== null}
          aria-describedby={shownProblem === null ? undefined : `${id}-problem`}
          onChange={(event) => {
            // A title is one line, so pasted line breaks become spaces.
            const value = event.target.value;
            setText(multiline ? value : oneLineTitle(value));
            setShownProblem(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={save}
        />
      </div>
      {shownProblem !== null && (
        <div id={`${id}-problem`} className="tracecards-field-problem">
          {shownProblem}
        </div>
      )}
    </>
  );
}
