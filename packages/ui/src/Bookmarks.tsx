import {
  type Bookmark,
  bookmarkHost,
  bookmarkName,
  bookmarkUrl,
  type Card,
  videoId,
  videoThumbnail,
} from "@tracecards/core";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { bookmarkMenu, newBookmarkUrl, saveBookmark } from "./bookmarkActions";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";

/** How long a new bookmark stays highlighted once it's saved. The CSS animation matches it. */
const NEW_HIGHLIGHT_MS = 1200;

/** A site's icon, from Google. The README discloses this, with the other network use. */
function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host)}`;
}

/**
 * The card's bookmarks, in the card's Bookmarks tab: a field to add one, then the primary
 * bookmark and the others in the file's order. Videos are listed with the links, with their
 * thumbnails, since there's no player here. The field takes the focus as the tab shows, except
 * with `phone`, where that would bring up the keyboard before a link is wanted.
 */
export function Bookmarks({ card, phone = false }: { card: Card; phone?: boolean }) {
  const host = useHost();
  // URLs just added. Each is shown faded at the end of the list until the card has it, then
  // highlighted for a moment. The ref has them without waiting for a render, so
  // two quick pastes are checked against each other.
  const [added, setAddedState] = useState<string[]>([]);
  const addedNow = useRef<string[]>([]);
  const setAdded = useCallback((change: (urls: string[]) => string[]) => {
    addedNow.current = change(addedNow.current);
    setAddedState(addedNow.current);
  }, []);
  // Saves go one after another, so each reads the file the one before it wrote.
  const saves = useRef(Promise.resolve());

  const add = (input: string): boolean => {
    const url = newBookmarkUrl(host, card, input, addedNow.current);
    if (url === null) return false;
    setAdded((urls) => [...urls, url]);
    const save = saves.current.then(() => saveBookmark(host, card, url));
    saves.current = save.then(() => undefined);
    void save.then((saved) => {
      if (!saved) setAdded((urls) => urls.filter((other) => other !== url));
    });
    return true;
  };

  useEffect(() => {
    const shown = added.filter((url) => card.bookmarks.some((bookmark) => bookmark.url === url));
    if (shown.length === 0) return;
    const timer = window.setTimeout(
      () => setAdded((urls) => urls.filter((url) => !shown.includes(url))),
      NEW_HIGHLIGHT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [added, card.bookmarks, setAdded]);

  const bookmarks = [...card.bookmarks].sort((a, b) => Number(b.primary) - Number(a.primary));
  const saving = added.filter((url) => !card.bookmarks.some((bookmark) => bookmark.url === url));
  return (
    <>
      <AddBookmark onAdd={add} focus={!phone} />
      <ul className="tracecards-bookmarks">
        {bookmarks.map((bookmark, index) => (
          <BookmarkRow
            key={`${index}-${bookmark.url}`}
            card={card}
            bookmark={bookmark}
            state={added.includes(bookmark.url) ? "new" : undefined}
          />
        ))}
        {saving.map((url) => (
          <BookmarkRow
            key={`saving-${url}`}
            card={card}
            bookmark={{ url, primary: false, videoId: videoId(url) }}
            state="saving"
          />
        ))}
      </ul>
    </>
  );
}

/**
 * The "Add a new link" bar. Enter adds what's typed, and pasting a web address adds it
 * without putting it in the field. With `focus`, it has the focus while the tab is shown.
 */
function AddBookmark({ onAdd, focus }: { onAdd: (input: string) => boolean; focus: boolean }) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus) field.current?.focus();
  }, [focus]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (value.trim() !== "" && onAdd(value)) setValue("");
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (bookmarkUrl(text) === null) return;
    event.preventDefault();
    onAdd(text);
  };

  return (
    <label className="tracecards-add-bookmark">
      <Icon name={ICONS.add} />
      <input
        ref={field}
        type="text"
        value={value}
        placeholder="Add a new link…"
        aria-label="Add a link"
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
    </label>
  );
}

interface BookmarkRowProps {
  card: Card;
  bookmark: Bookmark;
  /** "saving" for one just added that the card doesn't have yet, "new" once it has. */
  state?: "saving" | "new" | undefined;
}

/**
 * A bookmark that opens in the browser, with its menu on right-click and on its
 * "…" button. One being saved has no menu yet, and comes into view.
 */
function BookmarkRow({ card, bookmark, state }: BookmarkRowProps) {
  const host = useHost();
  const openMenu = (event: MouseEvent<HTMLElement>, anchor?: HTMLElement) => {
    event.preventDefault();
    if (state === "saving") return;
    host.showMenu(bookmarkMenu(host, card, bookmark), event.nativeEvent, anchor);
  };
  return (
    <li
      ref={state === "saving" ? scrollIntoView : undefined}
      className={state ? `tracecards-bookmark is-${state}` : "tracecards-bookmark"}
      aria-busy={state === "saving"}
      onContextMenu={(event) => openMenu(event)}
    >
      <a
        className="tracecards-bookmark-link"
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        title={bookmark.url}
      >
        <BookmarkIcon bookmark={bookmark} />
        <span className="tracecards-bookmark-name">{bookmarkName(bookmark)}</span>
        {bookmark.primary && <span className="tracecards-primary-tag">Primary source</span>}
        <span className="tracecards-bookmark-host">{bookmarkHost(bookmark.url)}</span>
      </a>
      <button
        type="button"
        className="clickable-icon tracecards-bookmark-more"
        aria-label="Bookmark options"
        disabled={state === "saving"}
        onClick={(event) => openMenu(event, event.currentTarget)}
      >
        <Icon name={ICONS.more} />
      </button>
    </li>
  );
}

function scrollIntoView(element: HTMLElement | null): void {
  element?.scrollIntoView({ block: "nearest" });
}

/** A video's thumbnail, or a site's icon, with a plain icon when the image can't be loaded. */
function BookmarkIcon({ bookmark }: { bookmark: Bookmark }) {
  const [failed, setFailed] = useState(false);
  const { videoId } = bookmark;
  const src = videoId ? videoThumbnail(videoId) : faviconUrl(bookmarkHost(bookmark.url));
  return (
    <span className={videoId ? "tracecards-bookmark-icon is-video" : "tracecards-bookmark-icon"}>
      {failed ? (
        <Icon name={videoId ? ICONS.video : ICONS.link} />
      ) : (
        <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      )}
    </span>
  );
}
