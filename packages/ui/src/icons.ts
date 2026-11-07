/**
 * Every icon Tracecards shows, by what it stands for, so each can be changed here and nowhere
 * else. The names are Lucide's, the icon set Obsidian uses.
 */
export const ICONS = {
  /**
   * Tracecards itself: the ribbon button, the Tracecards tab and "Open in Tracecards". Not a
   * Lucide icon but the Tracecards mark, which the Obsidian plugin adds under this name.
   */
  tracecards: "tracecards",
  /** The Decks panel in the sidebar. */
  decksPanel: "library",
  /** A deck that hasn't chosen an icon. */
  deck: "layers",

  /** The tab header's buttons that switch to the grid view and to the pad view. */
  gridView: "layout-grid",
  padView: "layout-dashboard",
  /** On phones, the tab header's buttons that switch to the lists and to one card at a time. */
  listView: "layout-list",
  cardView: "gallery-horizontal",
  /** On phones, the deck button's sign that it opens the sheet of decks. */
  deckSheet: "chevrons-up-down",
  /** On phones, the previous and next card, and going back from a deck's cards to the decks. */
  previous: "chevron-left",
  next: "chevron-right",
  leaveDeck: "arrow-left",
  settings: "settings",
  search: "search",
  /** New card, new deck and new bookmark. */
  add: "plus",

  edit: "pencil",
  delete: "trash-2",
  /** "Move to" another deck. */
  move: "folder-input",
  /** "Detach from pad" and "Attach to pad" on a deck. */
  detach: "unlink",
  attach: "link-2",
  /** "Change icon…" on a deck. */
  changeIcon: "shapes",
  /** "Print…" on a deck. */
  print: "printer",
  /** The print dialog's tips for printing the PDF: at actual size, on both sides, and cutting. */
  actualSize: "ruler",
  bothSides: "files",
  cut: "scissors",
  /** What happens after ordering: the cart, paying on Game Crafter, and the cards sent. */
  cart: "shopping-cart",
  pay: "credit-card",
  delivery: "truck",
  /**
   * The print dialog's warnings: to look through the cards on Game Crafter before paying, and
   * that printed colours look different from the screen.
   */
  warning: "alert-triangle",
  /** The button that opens a bookmark's menu. */
  more: "more-horizontal",

  /** The card's tabs. */
  note: "sticky-note",
  bookmarks: "bookmark",
  /** Back to the card the card modal showed before following a link. */
  back: "undo-2",

  link: "link",
  video: "video",
  copyLink: "copy",
  star: "star",
  unstar: "star-off",

  addCover: "image-plus",
  /** A cover dragged over the card form. */
  dropCover: "upload",
  removeCover: "x",

  /** The Pixabay image that's the cover. */
  picked: "check",
} as const;
