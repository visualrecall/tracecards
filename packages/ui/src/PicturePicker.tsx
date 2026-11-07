import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { gridColumns, rowMoveTarget } from "./cardRows";
import { gridMove } from "./gridNavigation";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import {
  IMAGE_KINDS,
  type ImageKind,
  PIXABAY_KEY_PAGE,
  type PixabayImage,
  searchPixabay,
} from "./pixabay";

/** How long typing pauses before Pixabay is searched, which keeps to its limit on requests. */
const TYPING_PAUSE_MS = 400;

interface PicturePickerProps {
  /** What Pixabay is searched for until the user types a search: the card's title, once written. */
  titleSearch: string;
  /** The Pixabay image the cover is, while it is one. */
  picked: number | null;
  /** Pixabay's search field, while it's shown. */
  searchField: RefObject<HTMLInputElement | null>;
  onPickImage: (image: PixabayImage) => void;
}

/**
 * The card form's picture, under the title and description: Pixabay's free images, searched for
 * the card's title or what's typed. Generate, for pictures made by AI, comes later, as a second
 * source beside Pixabay. An image of the user's own is chosen, dropped or pasted on the card.
 */
export function PicturePicker(props: PicturePickerProps) {
  return (
    <div className="tracecards-picture">
      <div className="tracecards-picture-head">
        <h3>Pick a picture</h3>
        <div className="tracecards-segments" role="group" aria-label="Where the picture comes from">
          <button type="button" aria-pressed="true">
            Pixabay
          </button>
          {/* Greyed out, and its hover text says why. */}
          <button type="button" disabled title="Coming later: pictures made for the card by AI">
            Generate
          </button>
        </div>
      </div>
      <PixabayResults {...props} />
    </div>
  );
}

/** What a search found so far. `search` says which search it was. */
interface Results {
  search: string;
  images: PixabayImage[];
  total: number;
  /** How many pages have been fetched. */
  pages: number;
  loading: boolean;
  problem: string | null;
}

const NO_RESULTS: Results = {
  search: "",
  images: [],
  total: 0,
  pages: 0,
  loading: false,
  problem: null,
};

/**
 * Pixabay's images for what's typed, page by page as the list is scrolled, or how to add a key
 * when there's none.
 */
function PixabayResults({ titleSearch, picked, onPickImage, searchField }: PicturePickerProps) {
  const host = useHost();
  // Read again when the user comes back from settings, where it's set.
  const [key, setKey] = useState(() => host.pixabayKey());
  const recheckKey = () => setKey(host.pixabayKey());
  // What the user typed, or null while the search is for the card's title.
  const [typed, setTyped] = useState<string | null>(null);
  const [kind, setKind] = useState<ImageKind>("all");
  const [results, setResults] = useState<Results>(NO_RESULTS);
  const query = (typed ?? titleSearch).trim();
  const search = `${kind}:${query}`;
  const sentinel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  // The image the keys are on, which Tab from the search goes to: the grid is one stop for Tab.
  const [focused, setFocused] = useState(0);

  // The first page, for each new search: the title's at once, what's typed once typing pauses.
  useEffect(() => {
    if (!key || query === "" || results.search === search) return;
    let current = true;
    const timer = window.setTimeout(
      () => {
        setResults((shown) => ({ ...shown, loading: true, problem: null }));
        void searchPixabay(host, key, { query, kind, page: 1 }).then((result) => {
          if (!current) return;
          setFocused(0);
          setResults(
            result.ok
              ? {
                  ...NO_RESULTS,
                  search,
                  images: result.page.images,
                  total: result.page.total,
                  pages: 1,
                }
              : { ...NO_RESULTS, search, problem: result.problem },
          );
        });
      },
      typed === null ? 0 : TYPING_PAUSE_MS,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [host, key, kind, query, results.search, search, typed]);

  const loadMore = useEffectEvent(() => {
    const { images, total, pages, loading, problem } = results;
    if (!key || loading || problem || results.search !== search || images.length >= total) return;
    setResults((shown) => ({ ...shown, loading: true }));
    void searchPixabay(host, key, { query, kind, page: pages + 1 }).then((result) => {
      setResults((shown) => {
        if (shown.search !== search) return shown;
        if (!result.ok) return { ...shown, loading: false, problem: result.problem };
        const known = new Set(shown.images.map((image) => image.id));
        const added = result.page.images.filter((image) => !known.has(image.id));
        return { ...shown, images: [...shown.images, ...added], pages: pages + 1, loading: false };
      });
    });
  });

  // The next page once the end of the list comes near. Watched again after each page, since a
  // page may not reach the end of a tall window.
  const hasImages = results.images.length > 0;
  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasImages, results.pages]);

  if (!key) {
    return (
      <div className="tracecards-picture-note" onFocus={recheckKey} onPointerEnter={recheckKey}>
        <Icon name={ICONS.search} />
        <div className="tracecards-picture-note-title">Search Pixabay’s free images</div>
        <div>
          Add your Pixabay API key in Tracecards’ settings. A key is free with a Pixabay account.
        </div>
        <div className="tracecards-picture-note-actions">
          <button type="button" onClick={host.openSettings}>
            Open settings
          </button>
          <a href={PIXABAY_KEY_PAGE} target="_blank" rel="noopener noreferrer">
            Get a key
          </a>
        </div>
      </div>
    );
  }

  const focusImage = (index: number) => {
    const tile = grid.current?.querySelectorAll<HTMLElement>(":scope > *")[index];
    if (!tile) return;
    tile.focus({ preventScroll: true });
    tile.scrollIntoView({ block: "nearest" });
  };

  // Tab or Down from the search goes to the images.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key: pressed, shiftKey, altKey, ctrlKey, metaKey } = event;
    if (!hasImages || shiftKey || altKey || ctrlKey || metaKey) return;
    if (pressed !== "Tab" && pressed !== "ArrowDown") return;
    event.preventDefault();
    focusImage(Math.min(focused, results.images.length - 1));
  };

  // The arrow keys or h j k l move between the images, Enter or Space picks one, and Up from the
  // first row goes back to the search.
  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = gridMove(event.nativeEvent);
    if (!move) return;
    event.preventDefault();
    const columns = gridColumns(event.currentTarget);
    if (move === "up" && focused < columns) {
      searchField.current?.focus();
      return;
    }
    focusImage(rowMoveTarget(focused, results.images.length, columns, move));
  };

  const current = results.search === search;
  const status =
    query === ""
      ? "Type what to search for."
      : !current || (results.loading && !hasImages)
        ? "Searching…"
        : results.problem && !hasImages
          ? results.problem
          : !hasImages
            ? `Pixabay has no images for “${query}”.`
            : typed === null
              ? "Searched for the card’s title."
              : "";

  return (
    <>
      <div className="tracecards-picture-search">
        <div className="search-input-container">
          <input
            ref={searchField}
            type="search"
            enterKeyHint="search"
            spellCheck={false}
            placeholder="Search Pixabay"
            aria-label="Search Pixabay"
            value={typed ?? titleSearch}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>
        <select
          className="dropdown"
          aria-label="Kind of image"
          value={kind}
          onChange={(event) => setKind(event.target.value as ImageKind)}
        >
          {Object.entries(IMAGE_KINDS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="tracecards-picture-meta">
        <span role="status">{status}</span>
        <span>
          Images from{" "}
          <a href="https://pixabay.com/" target="_blank" rel="noopener noreferrer">
            Pixabay
          </a>
          . The one you pick is saved in your vault.
        </span>
      </div>
      {hasImages && (
        <div ref={grid} className="tracecards-picture-grid" onKeyDown={onGridKeyDown}>
          {results.images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className="tracecards-picture-tile"
              tabIndex={index === Math.min(focused, results.images.length - 1) ? 0 : -1}
              onFocus={() => setFocused(index)}
              aria-pressed={picked === image.id}
              onClick={() => onPickImage(image)}
            >
              {/* The tags name the image here, not in an aria-label, which Obsidian shows on hover. */}
              <img src={image.thumbnail} alt={image.tags} loading="lazy" draggable={false} />
              {picked === image.id && (
                <span className="tracecards-picture-check">
                  <Icon name={ICONS.picked} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {hasImages && results.problem && (
        <div className="tracecards-picture-meta">{results.problem}</div>
      )}
      <div ref={sentinel} />
    </>
  );
}
