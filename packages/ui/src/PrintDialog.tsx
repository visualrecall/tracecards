import type { Deck } from "@tracecards/core";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type BuiltGame,
  cartUrl,
  GAMECRAFTER_PRIVACY,
  GAMECRAFTER_TERMS,
  GameCrafter,
  GameCrafterError,
  type SheetPricing,
  sheetPricing,
  ssoUrl,
} from "./gamecrafter";
import { type CustomBack, FACE_THEMES, type FaceTheme, type SavedFile, useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { prepareCover } from "./coverImage";
import { ChooseImage, CoverInput } from "./CoverInput";
import { FacesPreview, HomePrintArt, ProPrintArt, SheetPreview } from "./PrintArt";
import {
  BACK_DESIGNS,
  backJpeg,
  backPreview,
  FACE_COLOURS,
  faceJpeg,
  PLACEHOLDER,
  renderBack,
  renderFace,
  TRIM,
} from "./printRender";
import {
  buildSheets,
  CARDS_PER_PAGE,
  defaultPaper,
  type Paper,
  PAPERS,
  sheetCount,
} from "./printSheet";
import { shownTitle } from "./titleCase";
import { useFacePreviews } from "./useFacePreviews";

type Method = "pdf" | "gamecrafter";

type Stage =
  | { kind: "steps" }
  | { kind: "working"; step: string; done: number; total: number }
  | { kind: "saved"; file: SavedFile; backs: boolean }
  | { kind: "ordered"; cartId: string; subtotal: number };

/** The steps' names, which differ only in the last. */
const STEPS: Record<Method, readonly string[]> = {
  pdf: ["Choose", "Fronts", "Back", "Save PDF"],
  gamecrafter: ["Choose", "Fronts", "Back", "Order"],
};

/** How many cards the fronts step shows: the first few, fanned out. */
const SAMPLE = 3;

/** What each look is. */
const FACE_NOTES: Record<FaceTheme, { title: string; text: string }> = {
  dark: { title: "Dark", text: "Light words on a dark card." },
  light: { title: "Light", text: "Dark words on a white card. Uses less ink." },
};

const DESIGN = BACK_DESIGNS[0]?.id ?? "default";

/** What each paper size is, and where it's the usual one. */
const PAPER_NOTES: Record<Paper, string> = {
  letter: "8.5 × 11 in, usual in the US and Canada.",
  a4: "210 × 297 mm, usual almost everywhere else.",
};

const dollars = (amount: number) => `$${amount.toFixed(2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Prints a deck, in four steps: how (a PDF to print at home, or cards printed by Game Crafter), the
 * fronts' colours, the back, then saving the PDF or making the order. Game Crafter printing uses
 * the user's own account: Tracecards makes the game and a cart there and opens the cart, where the
 * user adds their address, chooses shipping and pays, so nothing is bought from here.
 */
export function PrintDialog({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const host = useHost();
  const { printing } = host;
  const keys = printing.keys();
  // The keys can't change while the dialog is open, so the client is made once.
  const [gc] = useState(() =>
    keys ? new GameCrafter(host.send, keys.keyId, printing.session()) : null,
  );
  // Not known until Game Crafter says the saved session still works; false when there's none.
  const [signedIn, setSignedIn] = useState<boolean | null>(
    keys && printing.session() ? null : false,
  );
  // Printing at home is chosen to start with: it's free and needs no account.
  const [method, setMethod] = useState<Method>("pdf");
  const [step, setStep] = useState(0);
  // Only the newest of the user's own backs is offered, beside the design.
  const [custom, setCustom] = useState<CustomBack | null>(null);
  // The back is the design, or the user's own image once they've added one.
  const [ownImage, setOwnImage] = useState(
    () => !BACK_DESIGNS.some((design) => design.id === printing.chosenBack()),
  );
  // Off to start with for the PDF: printing on both sides at home needs a printer that can, and
  // the backs to meet their fronts. Game Crafter always prints them.
  const [withBacks, setWithBacks] = useState(false);
  const [theme, setTheme] = useState(printing.faceTheme);
  const [paper, setPaper] = useState<Paper>(() => defaultPaper(navigator.language));
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "steps" });
  const [problem, setProblem] = useState<string | null>(null);
  // Set when the dialog closes, so work still going on stops and removes what it made.
  const closed = useRef(false);

  // The cards with their titles as cards show them, which is how they print.
  const titleCase = host.titleCase();
  const cards = useMemo(
    () => deck.cards.map((card) => ({ ...card, title: shownTitle(card.title, titleCase) })),
    [deck.cards, titleCase],
  );
  // The cards shown as they'll print: a few for the fronts, and a sheet's worth for the PDF's.
  const shown = useMemo(
    () => cards.slice(0, method === "pdf" ? CARDS_PER_PAGE : SAMPLE),
    [cards, method],
  );
  const previews = useFacePreviews(shown, theme);
  const back = ownImage && custom ? custom.id : DESIGN;
  // Asked for once per back: a host may make a new URL each time, as Obsidian does for files in
  // the plugin's folder, which would load the image again on every render.
  const customUrl = useMemo(() => custom && printing.backUrl(custom.id), [custom, printing]);
  // The part of the user's image to print, which only their image has.
  const [backCrop, setBackCrop] = useState(printing.backCrop());
  const [addingBack, setAddingBack] = useState(false);
  const crop = back === DESIGN ? undefined : backCrop;
  const pricing = sheetPricing(cards.length);

  useEffect(() => {
    closed.current = false;
    void printing.customBacks().then((backs) => {
      const latest = backs.at(-1) ?? null;
      setCustom(latest);
      if (!latest) setOwnImage(false);
    });
    return () => {
      closed.current = true;
    };
  }, [printing]);

  // Game Crafter is asked whether the saved session still works only once it's chosen.
  useEffect(() => {
    if (method !== "gamecrafter" || !gc || signedIn !== null) return;
    gc.signedIn().then(setSignedIn, (error: unknown) => {
      // Not signed out, but Game Crafter couldn't be asked, such as when offline.
      setSignedIn(false);
      setProblem(`Couldn't reach Game Crafter: ${message(error)}`);
    });
  }, [method, gc, signedIn]);

  // The design's picture, drawn as it will print. The user's own image is shown by its cropper.
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    void backPreview(DESIGN, printing.readBack).then((made) => {
      url = made;
      if (live) setDesignPreview(made);
      else URL.revokeObjectURL(made);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [printing]);

  const choose = (chosen: Method) => {
    setMethod(chosen);
    setProblem(null);
  };

  const addBack = async (file: File) => {
    setProblem(null);
    setAddingBack(true);
    // Kept whole, as a cover is, so it can be moved and zoomed on the card. GIFs and SVGs, which
    // covers keep as they are, can't be drawn for print the same way.
    const image = await prepareCover(file);
    const saved =
      image && (image.extension === "webp" || image.extension === "jpg")
        ? await printing.addBack(file.name.replace(/\.[^.]+$/, ""), image.data)
        : null;
    setAddingBack(false);
    if (!saved) {
      setProblem("Use a JPEG, PNG or WebP image for the card back.");
      return;
    }
    for (const old of await printing.customBacks()) {
      if (old.id !== saved.id) await printing.removeBack(old.id);
    }
    setCustom(saved);
    setBackCrop(undefined);
    setOwnImage(true);
  };

  const connect = async () => {
    if (!gc || !keys) return;
    setProblem(null);
    const ssoId = await printing.signIn(ssoUrl(keys.keyId, printing.signInPostback));
    if (!ssoId) {
      setProblem("Game Crafter didn't send you back. Try connecting again.");
      return;
    }
    try {
      printing.setSession(await gc.signIn(ssoId, keys.privateKey));
      setSignedIn(true);
    } catch (error) {
      setProblem(message(error));
    }
  };

  /** Draws every card's front, telling the user how far it's got. Null when the dialog closed. */
  const drawFaces = async <T,>(
    draw: (card: Deck["cards"][number], cover: ImageBitmap | null) => Promise<T>,
  ): Promise<T[] | null> => {
    const faces: T[] = [];
    for (const [index, card] of cards.entries()) {
      if (closed.current) return null;
      setStage({ kind: "working", step: "Drawing the cards", done: index, total: cards.length });
      const cover = await printing.coverBitmap(card);
      try {
        faces.push(await draw(card, cover));
      } finally {
        cover?.close();
      }
    }
    return faces;
  };

  const savePdf = async () => {
    setProblem(null);
    // The save dialog comes first, straight from the click, as the system needs.
    const target = await printing.savePdf(`${fileName(deck.name)}.pdf`);
    if (!target) return;
    try {
      const faces = await drawFaces((card, cover) => faceJpeg(card, cover, theme));
      if (!faces) return;
      setStage({ kind: "working", step: "Making the PDF", done: 0, total: 1 });
      const backImage = withBacks ? await backJpeg(back, printing.readBack, crop) : null;
      const pdf = buildSheets({
        deckName: deck.name,
        paper,
        faces,
        back: backImage,
        imageSize: TRIM,
      });
      const file = await target.write(pdf);
      // Opened straight away, ready to print.
      file.open?.();
      if (!closed.current) setStage({ kind: "saved", file, backs: withBacks });
    } catch (error) {
      if (closed.current) return;
      setProblem(message(error));
      setStage({ kind: "steps" });
    }
  };

  const order = async () => {
    if (!gc) return;
    setProblem(null);
    // Earlier unpaid carts of ours are cleared out meanwhile, so they don't pile up out of sight:
    // Game Crafter's site shows one cart at a time. It works from the carts there are now, so it
    // can't touch this print's, and a failure here is no reason to stop the print.
    void gc.clearEarlier().catch(() => undefined);
    let built: BuiltGame | null = null;
    try {
      const faces = await drawFaces(async (card, cover) => ({
        name: card.title,
        face: await renderFace(card, cover, theme),
      }));
      if (!faces) return;
      built = await gc.buildGame(
        {
          gameName: `${deck.name} (Tracecards)`,
          cards: faces,
          back: await renderBack(back, printing.readBack, crop),
        },
        (progress) => setStage({ kind: "working", ...progress }),
        () => closed.current,
      );
      if (closed.current) throw new GameCrafterError("Cancelled.", null);
      setStage({ kind: "working", step: "Making the cart", done: 0, total: 1 });
      const cart = await gc.makeCart(built);
      if (closed.current) {
        await gc.removeCart(cart.cartId);
        throw new GameCrafterError("Cancelled.", null);
      }
      printing.openUrl(cartUrl(cart.cartId));
      setStage({ kind: "ordered", cartId: cart.cartId, subtotal: cart.subtotal });
    } catch (error) {
      // What was made for a print that didn't finish is removed, so nothing is left in the account.
      if (built) void gc.discard(built).catch(() => undefined);
      if (closed.current) return;
      if (error instanceof GameCrafterError && error.signedOut) {
        printing.setSession(null);
        setSignedIn(false);
      }
      setProblem(message(error));
      setStage({ kind: "steps" });
    }
  };

  const names = STEPS[method];
  // Every stage is in the same frame, the steps above and the buttons below, so the dialog keeps
  // its size from the first step to the last, and while it works and once it's done.
  const frame = (content: ReactNode, footer: ReactNode) => (
    <div className="tracecards-print">
      <div className="tracecards-print-head">
        <h2>Print “{deck.name}”</h2>
        <div className="tracecards-steps" role="group" aria-label="Steps">
          {names.map((name, index) => (
            <Fragment key={name}>
              {index > 0 && <span className="tracecards-step-line" aria-hidden="true" />}
              <button
                type="button"
                aria-pressed={index === step}
                disabled={stage.kind !== "steps" || index > step}
                onClick={() => setStep(index)}
              >
                <span className="tracecards-step-number">{index + 1}</span>
                {name}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="tracecards-print-body">{content}</div>
      {problem && <p className="tracecards-print-problem">{problem}</p>}
      <div className="tracecards-print-footer">{footer}</div>
    </div>
  );

  if (stage.kind === "working") {
    return frame(
      <div className="tracecards-print-working">
        <p>
          {stage.step}… {stage.total > 1 && `${stage.done} of ${stage.total}`}
        </p>
        <progress value={stage.done} max={stage.total} />
        {/* While the cards upload, which takes a while, with nothing else to read. */}
        {method === "gamecrafter" && <CheckCards />}
      </div>,
      // Closing stops the work and removes what it made.
      <button onClick={onClose}>Cancel</button>,
    );
  }

  if (stage.kind === "saved") {
    return frame(
      <div className="tracecards-print-finished">
        <Done title="Your PDF is saved">
          <p>
            Saved as {stage.file.where}
            {stage.file.open ? ", and opened to print." : "."}
          </p>
        </Done>
        <PdfTips backs={stage.backs} />
      </div>,
      <>
        {stage.file.reveal ? (
          <button onClick={stage.file.reveal.run}>{stage.file.reveal.label}</button>
        ) : (
          <span />
        )}
        <button className="mod-cta" onClick={onClose}>
          Done
        </button>
      </>,
    );
  }

  if (stage.kind === "ordered") {
    return frame(
      <div className="tracecards-print-finished">
        <Done title="Your cart is ready">
          <p>It opened in your browser: {dollars(stage.subtotal)} before shipping.</p>
          <CheckCards />
        </Done>
      </div>,
      <>
        <button onClick={() => printing.openUrl(cartUrl(stage.cartId))}>Open the cart again</button>
        <button className="mod-cta" onClick={onClose}>
          Done
        </button>
      </>,
    );
  }

  const empty = cards.length === 0;
  const sheets = sheetCount(cards.length);

  let body: ReactNode;
  let primary: ReactNode = null;
  if (step === 0) {
    body = (
      <div className="tracecards-print-columns">
        <MethodArt method={method} />
        <div className="tracecards-print-options">
          <div className="tracecards-print-choices" role="group" aria-label="How to print">
            <p className="tracecards-print-lead">
              {empty
                ? "This deck has no cards to print yet."
                : `${plural(cards.length, "card")}, bridge size (2.25 × 3.5 in).`}
            </p>
            <Choice
              title="Print at home"
              text="A PDF to print and cut out."
              meta={<strong>Free</strong>}
              selected={method === "pdf"}
              onClick={() => choose("pdf")}
            />
            <Choice
              className="tracecards-print-gamecrafter"
              title="Order printed cards"
              text="Printed by The Game Crafter with UV coating, sent to you."
              meta={
                <>
                  <strong>
                    {empty
                      ? `From ${dollars(sheetPricing(1).estimate)}`
                      : `≈ ${dollars(pricing.estimate)}`}
                  </strong>
                  <small>+ shipping</small>
                </>
              }
              selected={method === "gamecrafter"}
              onClick={() => choose("gamecrafter")}
            />
          </div>
        </div>
      </div>
    );
    primary = (
      <button className="mod-cta" disabled={empty} onClick={() => setStep(1)}>
        Next
      </button>
    );
  } else if (step === 1) {
    body = (
      <div className="tracecards-print-columns">
        <div className="tracecards-print-side">
          <FacesPreview urls={previews.slice(0, SAMPLE)} theme={theme} />
          <small>
            {shown.length === 1
              ? "Your card"
              : `Your first ${Math.min(SAMPLE, shown.length)} cards`}
            , as they'll print
          </small>
        </div>
        <div className="tracecards-print-options">
          <div className="tracecards-print-choices" role="group" aria-label="Fronts">
            <p className="tracecards-print-lead">The colours of every card's front.</p>
            {FACE_THEMES.map((each) => (
              <Choice
                key={each}
                title={FACE_NOTES[each].title}
                text={FACE_NOTES[each].text}
                selected={theme === each}
                onClick={() => setTheme(each)}
              />
            ))}
          </div>
          {theme === "dark" && (
            <PrintColours theme={theme} placeholder={cards.some((card) => !card.cover)} />
          )}
        </div>
      </div>
    );
    primary = (
      <button
        className="mod-cta"
        onClick={() => {
          printing.setFaceTheme(theme);
          setStep(2);
        }}
      >
        Next
      </button>
    );
  } else if (step === 2) {
    const off = method === "pdf" && !withBacks;
    body = (
      <div className="tracecards-print-columns">
        <div className="tracecards-print-side" inert={off} aria-disabled={off}>
          {ownImage ? (
            <div className="tracecards-print-back-picture tracecards-print-back-crop">
              <CoverInput
                url={customUrl}
                imageKey={custom?.id}
                initialCrop={backCrop}
                busy={addingBack}
                onFile={(file) => void addBack(file)}
                onCrop={setBackCrop}
                aspect={TRIM.width / TRIM.height}
                label="Card back"
                emptyText="Drop or choose an image"
              />
            </div>
          ) : (
            <span className="tracecards-print-back-picture">
              {designPreview && <img src={designPreview} alt="The back of every card" />}
            </span>
          )}
        </div>
        <div className="tracecards-print-options">
          {method === "pdf" && (
            <Toggle
              label="Print the backs too"
              hint="For printing on both sides of the paper."
              on={withBacks}
              onChange={setWithBacks}
            />
          )}
          <div
            className="tracecards-print-choices"
            role="group"
            aria-label="Card back"
            inert={off}
            aria-disabled={off}
          >
            <p className="tracecards-print-lead">The same back goes on every card.</p>
            <Choice
              title="Default"
              text="Circuit board with the name."
              selected={!ownImage}
              onClick={() => setOwnImage(false)}
            />
            <Choice
              title="Your image"
              text={custom ? "Drag to move, pinch or scroll to zoom." : "Drop or choose a picture."}
              selected={ownImage}
              onClick={() => setOwnImage(true)}
            />
            {ownImage && custom && (
              <ChooseImage
                className="tracecards-print-change"
                onFile={(file) => void addBack(file)}
              >
                Use a different image…
              </ChooseImage>
            )}
          </div>
        </div>
      </div>
    );
    primary = (
      <button
        className="mod-cta"
        disabled={!off && ownImage && !custom}
        onClick={() => {
          if (!off) {
            printing.setChosenBack(back);
            printing.setBackCrop(backCrop);
          }
          setStep(3);
        }}
      >
        Next
      </button>
    );
  } else if (method === "pdf") {
    body = (
      <div className="tracecards-print-columns">
        <div className="tracecards-print-side">
          <div className="tracecards-print-sheet-frame">
            <SheetPreview paper={paper} cards={cards.length} faces={previews} theme={theme} />
          </div>
          <small>
            Sheet 1 of {sheets}
            {withBacks ? ", fronts" : ""}
          </small>
        </div>
        <div className="tracecards-print-options">
          <div className="tracecards-print-choices" role="group" aria-label="Paper">
            <p className="tracecards-print-lead">The paper you print on.</p>
            {(Object.keys(PAPERS) as Paper[]).map((size) => (
              <Choice
                key={size}
                title={PAPERS[size].name}
                text={PAPER_NOTES[size]}
                selected={paper === size}
                onClick={() => setPaper(size)}
              />
            ))}
          </div>
          <p className="tracecards-print-lead">
            {plural(sheets, "sheet")} for {plural(cards.length, "card")}
            {withBacks ? ", printed on both sides." : "."}
          </p>
          <PdfTips backs={withBacks} />
        </div>
      </div>
    );
    primary = (
      <button className="mod-cta" onClick={() => void savePdf()}>
        Save PDF…
      </button>
    );
  } else {
    // Signed in, or still checking the saved session.
    const ready = keys !== null && signedIn !== false;
    body = (
      <div className="tracecards-print-columns">
        <MethodArt method={method} />
        <div className="tracecards-print-options">
          <div className="tracecards-print-summary tracecards-print-gamecrafter">
            <div>
              <strong>≈ {dollars(pricing.estimate)}</strong>
              <span>
                {plural(cards.length, "card")} · {plural(pricing.sheets, "sheet")} · plus shipping
              </span>
              <SheetMeter cards={cards.length} pricing={pricing} />
            </div>
            {ready && (
              <span
                className={`tracecards-print-status${signedIn ? " is-connected" : ""}`}
                title={
                  signedIn
                    ? "Your Game Crafter account is ready for the cart"
                    : "Checking your Game Crafter account"
                }
              >
                {signedIn ? "Available" : "Checking…"}
              </span>
            )}
          </div>
          <Account
            keys={keys !== null}
            signedIn={signedIn}
            onConnect={() => void connect()}
            onSettings={() => {
              onClose();
              host.openSettings();
            }}
          />
          {/* What happens next, once the account is ready; until then, getting it ready is. */}
          {ready && (
            <ul className="tracecards-print-tips">
              <li>
                <Icon name={ICONS.cart} />
                Tracecards makes a cart in your Game Crafter account.
              </li>
              <li>
                <Icon name={ICONS.pay} />
                You add your address, choose shipping and pay there.
              </li>
              <li>
                <Icon name={ICONS.delivery} />
                They print the cards and send them to you.
              </li>
            </ul>
          )}
          {ready && <CheckCards />}
          <p className="tracecards-print-fineprint">
            The Game Crafter is a separate company, not affiliated with Tracecards.{" "}
            <ExternalLink url={GAMECRAFTER_TERMS}>Terms</ExternalLink> ·{" "}
            <ExternalLink url={GAMECRAFTER_PRIVACY}>Privacy</ExternalLink>
          </p>
        </div>
      </div>
    );
    primary = (
      <button className="mod-cta" disabled={!signedIn} onClick={() => void order()}>
        Make cart
      </button>
    );
  }

  return frame(
    body,
    <>
      {step === 0 ? (
        <button onClick={onClose}>Cancel</button>
      ) : (
        <button
          onClick={() => {
            setProblem(null);
            setStep(step - 1);
          }}
        >
          Back
        </button>
      )}
      {primary}
    </>,
  );
}

/** The picture of a way to print, for the left of the first and the last step. */
function MethodArt({ method }: { method: Method }) {
  return (
    <div
      className={
        method === "gamecrafter"
          ? "tracecards-print-side has-panel tracecards-print-gamecrafter"
          : "tracecards-print-side has-panel"
      }
    >
      <span className="tracecards-print-method-art">
        {method === "gamecrafter" ? <ProPrintArt /> : <HomePrintArt />}
      </span>
    </div>
  );
}

/** One of a few choices, as a row with a radio dot, a name and a line about it. */
function Choice({
  className,
  title,
  text,
  meta,
  selected,
  onClick,
}: {
  className?: string;
  title: string;
  text: string;
  /** What it costs, or the like, at the row's end. */
  meta?: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={className ? `tracecards-print-choice ${className}` : "tracecards-print-choice"}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="tracecards-print-choice-dot" aria-hidden="true" />
      <span className="tracecards-print-choice-label">
        <span className="tracecards-print-choice-title">{title}</span>
        <small>{text}</small>
      </span>
      {meta && <span className="tracecards-print-choice-meta">{meta}</span>}
    </button>
  );
}

/** A setting that's on or off, drawn as Obsidian draws its toggles. */
function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="tracecards-print-toggle">
      <div>
        <div>{label}</div>
        <small>{hint}</small>
      </div>
      <div className={`checkbox-container${on ? " is-enabled" : ""}`} onClick={() => onChange(!on)}>
        <input type="checkbox" aria-label={label} checked={on} onChange={() => undefined} />
      </div>
    </div>
  );
}

/**
 * What the user must do before ordering: add their key, or connect. Nothing once connected, which
 * the summary shows as a status.
 */
function Account({
  keys,
  signedIn,
  onConnect,
  onSettings,
}: {
  keys: boolean;
  signedIn: boolean | null;
  onConnect: () => void;
  onSettings: () => void;
}) {
  if (!keys) {
    return (
      <div className="tracecards-print-account">
        <div>
          <strong>Add your Game Crafter key</strong>
          <small>
            Ordering uses your own free Game Crafter account. Make a key there under Account → API
            Keys, then add it in Tracecards' settings.
          </small>
        </div>
        <button onClick={onSettings}>Open settings</button>
      </div>
    );
  }
  if (signedIn !== false) return null;
  return (
    <div className="tracecards-print-account">
      <div>
        <strong>Connect your Game Crafter account</strong>
        <small>Your browser opens once for you to approve.</small>
      </div>
      <button className="mod-cta" onClick={onConnect}>
        Connect
      </button>
    </div>
  );
}

/**
 * How full the sheets are, as a bar for each sheet of 18 cards, since Game Crafter charges for whole
 * sheets: the space left is what more cards would fill at no extra cost.
 */
function SheetMeter({ cards, pricing }: { cards: number; pricing: SheetPricing }) {
  const { sheets, slots, unused } = pricing;
  // Past a dozen sheets the bars get too thin to tell apart, so the sheets are one bar.
  const bars = sheets > 12 ? 1 : sheets;
  const perBar = slots / bars;
  return (
    <div className="tracecards-print-meter">
      <div
        className="tracecards-print-meter-bars"
        role="img"
        aria-label={`${cards} of ${slots} places on the sheets filled`}
      >
        {Array.from({ length: bars }, (_, index) => {
          const filled = Math.min(1, Math.max(0, (cards - index * perBar) / perBar));
          return (
            <span key={index}>
              <span style={{ width: `${filled * 100}%` }} />
            </span>
          );
        })}
      </div>
      {unused > 0 && <small>{plural(unused, "more card")} would fit at no extra cost</small>}
    </div>
  );
}

/** A link to a web page, opened in the browser. */
function ExternalLink({ url, children }: { url: string; children: ReactNode }) {
  const { printing } = useHost();
  return (
    <a
      href={url}
      className="external-link"
      onClick={(event) => {
        event.preventDefault();
        printing.openUrl(url);
      }}
    >
      {children}
    </a>
  );
}

function PdfTips({ backs }: { backs: boolean }) {
  return (
    <ul className="tracecards-print-tips">
      <li>
        <Icon name={ICONS.actualSize} />
        Print at actual size (100%), not fitted to the page.
      </li>
      {backs && (
        <li>
          <Icon name={ICONS.bothSides} />
          Print on both sides, flipping on the long edge.
        </li>
      )}
      <li>
        <Icon name={ICONS.cut} />
        Cut along the lines.
      </li>
    </ul>
  );
}

/**
 * The warning to look through the cards on Game Crafter before paying, on the order step and once
 * the cart is made. Game Crafter has designers approve every card before it prints them, and
 * Tracecards approves them as it makes the cart, so nothing else asks the user to look.
 */
function CheckCards() {
  return (
    <Warning>
      <p>
        <strong>Check your cards on Game Crafter before you pay.</strong> They&rsquo;re printed
        exactly as they are there, and Game Crafter won&rsquo;t ask you to approve them: Tracecards
        does that for you.
      </p>
    </Warning>
  );
}

/**
 * The colours a front prints in, by name and hex. They aren't the screen's: cards on screen
 * follow Obsidian's theme, and a card without a picture has a grey letter there but prints with a
 * purple cover. Paper shows colours differently from a screen too, dark ones most.
 */
function PrintColours({ theme, placeholder }: { theme: FaceTheme; placeholder: boolean }) {
  const colours = FACE_COLOURS[theme];
  const rows: { name: string; hexes: string[] }[] = [
    { name: "Card", hexes: [colours.paper] },
    { name: "Title", hexes: [colours.title] },
    { name: "Description", hexes: [colours.text] },
  ];
  if (placeholder)
    rows.push({
      name: "Cover of a card without a picture",
      hexes: [PLACEHOLDER.from, PLACEHOLDER.to],
    });
  return (
    <Warning>
      <p>
        <strong>Printed colours can look different from your screen.</strong> These are the ones
        that print:
      </p>
      <ul className="tracecards-print-colours">
        {rows.map(({ name, hexes }) => (
          <li key={name}>
            <span
              className="tracecards-print-swatch"
              style={{
                background:
                  hexes.length === 1 ? hexes[0] : `linear-gradient(135deg, ${hexes.join(", ")})`,
              }}
            />
            {name} <code>{hexes.map((hex) => hex.toUpperCase()).join(" → ")}</code>
          </li>
        ))}
      </ul>
    </Warning>
  );
}

/** Something to look out for, in an orange box. */
function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="tracecards-print-warning" role="note">
      <Icon name={ICONS.warning} />
      <div>{children}</div>
    </div>
  );
}

function Done({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="tracecards-print-done">
      <span className="tracecards-print-done-icon">
        <Icon name={ICONS.picked} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** The deck's name as a file name, without the characters systems don't allow in one. */
function fileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim() || "Cards";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
