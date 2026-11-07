import { findCard } from "@tracecards/core";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { Bookmarks } from "./Bookmarks";
import { EditableFace } from "./EditableFace";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import type { Store, VaultSnapshot } from "./store";
import { useShownTitle } from "./titleCase";

type Tab = "note" | "bookmarks";

/** The tab Cmd or Ctrl with each key shows. */
const TAB_KEYS: Readonly<Record<string, Tab>> = { "[": "note", "]": "bookmarks" };

interface CardScreenProps {
  store: Store<VaultSnapshot>;
  /** Path of the card, or null when its note is no longer in the Tracecards folder. */
  path: Store<string | null>;
  /** The note editor, provided by the app. It stays mounted while another tab is shown. */
  note: HTMLElement;
  /** Goes back to the card shown before, after following a link. Without it, there's no Back. */
  onBack?: () => void;
  /** Puts the focus in the note editor, as Cmd or Ctrl+[ shows the Note tab. */
  focusNote?: () => void;
  /**
   * Laid out for a phone: the whole screen, under a bar with the card's title and a back arrow,
   * which goes back as `onBack` does, or closes the card with `onClose`. No card face.
   */
  phone?: boolean;
  onClose?: () => void;
}

/**
 * One card, as the card modal shows it: tabs for the note and the bookmarks on the left, the
 * card face on the right, and Back at the bottom left after following a link. The face's cover,
 * title and description are edited in place. On phones, the card's title and a back arrow are at
 * the top instead, as a note app shows a note.
 */
export function CardScreen({
  store,
  path,
  note,
  onBack,
  focusNote,
  phone = false,
  onClose,
}: CardScreenProps) {
  const { vault } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const cardPath = useSyncExternalStore(path.subscribe, path.getSnapshot);
  const card = vault && cardPath !== null ? findCard(vault.decks, cardPath) : undefined;
  const title = useShownTitle(card?.title ?? "");
  const [tab, setTab] = useState<Tab>("note");
  const id = useId();

  const attachNote = useCallback(
    (element: HTMLDivElement | null) => {
      element?.append(note);
    },
    [note],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "note" ? "bookmarks" : "note";
    setTab(next);
    event.currentTarget.ownerDocument.getElementById(`${id}-${next}`)?.focus();
  };

  // Taken before the note's editor, which uses the same keys to indent, so they work from anywhere
  // in the card. Bookmarks focuses its field as it shows.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const next = TAB_KEYS[event.key];
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    flushSync(() => setTab(next));
    if (next === "note") focusNote?.();
  };

  const tabButton = (value: Tab, icon: string, label: ReactNode) => (
    <button
      id={`${id}-${value}`}
      type="button"
      role="tab"
      className="tracecards-tab"
      aria-selected={tab === value}
      aria-controls={`${id}-${value}-panel`}
      tabIndex={tab === value ? 0 : -1}
      onClick={() => setTab(value)}
    >
      <Icon name={icon} />
      {label}
    </button>
  );

  return (
    <div
      className={phone ? "tracecards-card-screen is-phone" : "tracecards-card-screen"}
      onKeyDownCapture={onKeyDownCapture}
    >
      {phone && (
        <div className="tracecards-card-screen-bar">
          <button
            type="button"
            className="tracecards-card-screen-leave"
            aria-label={onBack ? "Back to the card before" : "Close"}
            onClick={onBack ?? onClose}
          >
            <Icon name={ICONS.leaveDeck} />
          </button>
          <span className="tracecards-card-screen-title">{title}</span>
        </div>
      )}
      <div className="tracecards-card-screen-main">
        <div className="tracecards-tabs" role="tablist" onKeyDown={onKeyDown}>
          {tabButton("note", ICONS.note, "Note")}
          {tabButton(
            "bookmarks",
            ICONS.bookmarks,
            <>
              Bookmarks
              {card && card.bookmarks.length > 0 && (
                <span className="tracecards-tab-count">{card.bookmarks.length}</span>
              )}
            </>,
          )}
        </div>
        <div
          ref={attachNote}
          id={`${id}-note-panel`}
          className="tracecards-note"
          role="tabpanel"
          aria-labelledby={`${id}-note`}
          hidden={tab !== "note"}
        />
        {tab === "bookmarks" && (
          <div
            id={`${id}-bookmarks-panel`}
            className="tracecards-tab-panel"
            role="tabpanel"
            aria-labelledby={`${id}-bookmarks`}
          >
            {card && <Bookmarks card={card} phone={phone} />}
          </div>
        )}
        {onBack && !phone && (
          <button
            type="button"
            className="tracecards-back"
            aria-label="Back (Esc)"
            onClick={onBack}
          >
            <Icon name={ICONS.back} />
            Back
            <kbd>esc</kbd>
          </button>
        )}
      </div>
      {card && !phone && (
        <div className="tracecards-card-screen-face">
          <EditableFace card={card} decks={vault?.decks ?? []} />
        </div>
      )}
    </div>
  );
}
