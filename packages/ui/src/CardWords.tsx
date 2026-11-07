import {
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import {
  MAX_DESCRIPTION,
  MAX_TITLE,
  oneLineTitle,
  pasteIntoTitle,
  splitTitle,
} from "./cardActions";

type Part = "title" | "description";

interface CardWordsProps {
  title: string;
  description: string;
  onTitle: (title: string) => void;
  onDescription: (description: string) => void;
  /** The title's field, which the form focuses. */
  titleField: RefObject<HTMLTextAreaElement | null>;
  /** Called with the title when the user moves on from it to the description. */
  onTitleDone?: (title: string) => void;
  /** Where Tab from the description goes while it's there, past the controls in between. */
  next?: RefObject<HTMLInputElement | null>;
  /** What's wrong with the title, shown under the text. */
  problem: string | null;
}

/**
 * The card's title and description, written as one text: the first line is the title, in larger
 * type, and the rest, under a line, is the description. Enter in the title starts the description,
 * taking what's after the cursor with it, and Backspace at the description's start comes back,
 * joining the two again when the title has room. A pasted text's first line goes in the title and
 * the rest in the description. Down in the title and Up at the description's top go between them.
 */
export function CardWords({
  title,
  description,
  onTitle,
  onDescription,
  titleField,
  onTitleDone,
  next,
  problem,
}: CardWordsProps) {
  const id = useId();
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  // Where the cursor goes once a change to the text has rendered.
  const caret = useRef<{ part: Part; at: number } | null>(null);

  const field = (part: Part) => (part === "title" ? titleField : descriptionField).current;

  const place = (part: Part, at: number) => {
    const target = field(part);
    if (!target) return;
    target.focus();
    target.setSelectionRange(at, at);
  };

  useLayoutEffect(() => {
    if (!caret.current) return;
    const { part, at } = caret.current;
    caret.current = null;
    place(part, at);
  });

  const onTitleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { key, metaKey, ctrlKey, altKey, shiftKey } = event;
    if (metaKey || ctrlKey || altKey || event.nativeEvent.isComposing) return;
    const { selectionStart: start, selectionEnd: end, value } = event.currentTarget;
    if (key === "Enter") {
      event.preventDefault();
      const split = splitTitle(value, start, end, description);
      if (!split) {
        place("description", 0);
        return;
      }
      onTitle(split.title);
      onDescription(split.description);
      caret.current = { part: "description", at: split.caret };
    } else if (key === "ArrowDown" && !shiftKey) {
      // Titles are short, so Down goes to the description from anywhere in one.
      event.preventDefault();
      place("description", 0);
    }
  };

  const onDescriptionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { key, metaKey, ctrlKey, altKey, shiftKey } = event;
    if (metaKey || ctrlKey || altKey || event.nativeEvent.isComposing) return;
    const { selectionStart: start, selectionEnd: end } = event.currentTarget;
    const atStart = start === 0 && end === 0;
    if (key === "Backspace" && atStart) {
      event.preventDefault();
      const [first = "", ...others] = description.split("\n");
      const joined = title + first;
      if (first !== "" && joined.length <= MAX_TITLE) {
        onTitle(joined);
        onDescription(others.join("\n"));
        caret.current = { part: "title", at: title.length };
      } else place("title", title.length);
    } else if (key === "ArrowUp" && !shiftKey) {
      // To the title from the description's start, or from its first line, where Up can't move
      // the cursor. On macOS, Up there moves it to the start first, so it takes a second Up.
      if (atStart) {
        event.preventDefault();
        place("title", title.length);
        return;
      }
      const target = event.currentTarget;
      window.requestAnimationFrame(() => {
        const still = target.ownerDocument.activeElement === target;
        if (still && target.selectionStart === start) place("title", title.length);
      });
    } else if (key === "Tab" && !shiftKey && next?.current) {
      event.preventDefault();
      next.current.focus();
      // As Tab selects a field's text, so what's typed replaces it.
      next.current.select();
    }
  };

  // Text with line breaks: the first line ends the title, and the rest starts the description.
  const onTitlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart: start, selectionEnd: end, value } = event.currentTarget;
    const pasted = event.clipboardData.getData("text/plain");
    const change = pasteIntoTitle(value, start, end, pasted, description);
    if (!change) return;
    event.preventDefault();
    onTitle(change.title);
    onDescription(change.description);
    caret.current = { part: "description", at: change.caret };
  };

  return (
    <div className="tracecards-card-words-field">
      <div className="tracecards-card-words">
        <label htmlFor={`${id}-title`} className="tracecards-visually-hidden">
          Title
        </label>
        <div className="tracecards-autosize tracecards-card-words-title" data-value={title}>
          <textarea
            ref={titleField}
            id={`${id}-title`}
            rows={1}
            placeholder="Title"
            value={title}
            maxLength={MAX_TITLE}
            aria-invalid={problem !== null}
            aria-describedby={problem === null ? undefined : `${id}-problem`}
            // A title is one line: line breaks that come in some other way, such as a drop,
            // become spaces.
            onChange={(event) => onTitle(oneLineTitle(event.target.value))}
            onKeyDown={onTitleKeyDown}
            onPaste={onTitlePaste}
            // However the user gets there: Enter, Down, Tab or a click. The field's value, since
            // Enter may have just changed the title.
            onBlur={(event) => {
              if (event.relatedTarget === descriptionField.current) {
                onTitleDone?.(event.currentTarget.value);
              }
            }}
          />
        </div>
        <label htmlFor={`${id}-description`} className="tracecards-visually-hidden">
          Description
        </label>
        <div
          className="tracecards-autosize tracecards-card-words-description"
          data-value={description}
        >
          <textarea
            ref={descriptionField}
            id={`${id}-description`}
            rows={3}
            placeholder="Description"
            value={description}
            maxLength={MAX_DESCRIPTION}
            onChange={(event) => onDescription(event.target.value)}
            onKeyDown={onDescriptionKeyDown}
          />
        </div>
      </div>
      {problem !== null && (
        <div id={`${id}-problem`} className="tracecards-field-problem">
          {problem}
        </div>
      )}
    </div>
  );
}
