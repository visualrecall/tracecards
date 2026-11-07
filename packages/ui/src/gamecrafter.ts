import { type HttpRequest, type HttpResponse, isRecord, responseJson } from "./host";
import { type Body, multipart } from "./multipart";

// Printing a deck through The Game Crafter, with the user's own account. See
// https://www.thegamecrafter.com/developer/. The README discloses this network use.

const API = "https://www.thegamecrafter.com/api";

/** Where a user makes an API key: Game Crafter asks for a "developer" preference first. */
export const GAMECRAFTER_KEY_PAGE = "https://help.thegamecrafter.com/article/150-developer-api";

/** Game Crafter's own terms and privacy policy, which ordering from them is under. */
export const GAMECRAFTER_TERMS = "https://help.thegamecrafter.com/article/156-terms";
export const GAMECRAFTER_PRIVACY = "https://help.thegamecrafter.com/article/153-privacy-policy";

/** What the plugin may do in the user's account: no more than printing needs. */
const PERMISSIONS = [
  "view_my_account",
  "view_my_games",
  "edit_my_games",
  "view_my_files",
  "edit_my_files",
  "view_my_carts",
  "edit_my_carts",
];

/** The size of a bridge-size card (2.25 × 3.5 in) with its bleed, in pixels, at 300 per inch. */
export const PRINT_SIZE = { width: 750, height: 1125 } as const;

/** Game Crafter prints 18 bridge-size cards to a sheet, as it does poker-size ones, and charges by the sheet. */
export const CARDS_PER_SHEET = 18;

/**
 * What Game Crafter charges for a bridge deck, in dollars, without coating: the first sheet, then
 * each further sheet. A cart of one sheet came to $4.23 on 2026-11-07, which is the first sheet and
 * its coating. A further sheet is the deck's listed price, $0.10 over a poker deck's as the first
 * sheet is; it hasn't been seen in a cart. Prices can change, so the dialog says "about" and the
 * cart has the exact price.
 */
const FIRST_SHEET_PRICE = 3.98;
const EXTRA_SHEET_PRICE = 3.09;

/**
 * The cards are printed with UV coating, which protects them from dirt, scratches and moisture.
 * Game Crafter charges $0.25 for it per sheet, according to its help article. It's a setting of
 * the game (`enable_uv_coating`), which is off unless it's asked for, and applies to every card.
 */
const UV_COATING_PRICE = 0.25;

/** What carts and games made here are called, so later prints can find them. */
const CART_NAME = "Tracecards";
const GAME_DESCRIPTION = "Printed from Tracecards";

/** The most cards `bulk-cards` takes at once. */
const CARDS_PER_CALL = 100;

/** How many files go up at once. */
const UPLOADS_AT_ONCE = 4;

/**
 * How old a game of ours in no cart must be before it's taken for a leftover, in milliseconds. A
 * day, so the game a print is making as the cleanup runs is never one, whatever the time zone of
 * Game Crafter's dates, which don't give one.
 */
const LEFTOVER_AGE = 24 * 60 * 60 * 1000;

/** Sends a request: `Host.send`. */
export type Send = (request: HttpRequest) => Promise<HttpResponse>;

/** What Game Crafter refused. `signedOut` means the session is gone and the user must sign in. */
export class GameCrafterError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "GameCrafterError";
  }

  get signedOut(): boolean {
    return this.code === 401;
  }
}

/** A card to print: its name, and its face as a PNG at `PRINT_SIZE`. */
export interface PrintCard {
  name: string;
  face: ArrayBuffer;
}

export interface PrintJob {
  gameName: string;
  cards: PrintCard[];
  /** The back, a PNG at `PRINT_SIZE`, the same on every card. */
  back: ArrayBuffer;
}

/** What `buildGame` made in the account, kept so it can be removed again. */
export interface BuiltGame {
  gameId: string;
  folderId: string;
  deckId: string;
  skuId: string;
}

export interface Progress {
  /** What's being done, such as "Uploading cards". */
  step: string;
  done: number;
  total: number;
}

/** What printing a deck of some size costs: sheets of 18, paid for whole. */
export interface SheetPricing {
  sheets: number;
  /** Cards the sheets hold: all of them are paid for. */
  slots: number;
  /** Places on the last sheet no card fills, which more cards could fill at no extra cost. */
  unused: number;
  /** About what the cards cost, before shipping. */
  estimate: number;
}

export function sheetPricing(cards: number): SheetPricing {
  const sheets = Math.max(1, Math.ceil(cards / CARDS_PER_SHEET));
  const slots = sheets * CARDS_PER_SHEET;
  return {
    sheets,
    slots,
    unused: slots - cards,
    estimate:
      Math.round(
        (FIRST_SHEET_PRICE + EXTRA_SHEET_PRICE * (sheets - 1) + UV_COATING_PRICE * sheets) * 100,
      ) / 100,
  };
}

/**
 * The link that signs the user in to Game Crafter, which sends them back to `postback`, a link
 * the app handles, with an `sso_id`.
 */
export function ssoUrl(keyId: string, postback: string): string {
  const url = new URL("https://www.thegamecrafter.com/sso");
  url.searchParams.set("api_key_id", keyId);
  for (const permission of PERMISSIONS) url.searchParams.append("permission", permission);
  url.searchParams.set("postback_uri", postback);
  return url.href;
}

/**
 * The cart's page on Game Crafter, where the user sees what's in it, adds their address, picks
 * shipping and pays. Tracecards never pays.
 */
export function cartUrl(cartId: string): string {
  return `https://www.thegamecrafter.com/cart/${encodeURIComponent(cartId)}`;
}

type Params = Record<string, string | number>;

/** The calls to Game Crafter's API that printing a deck needs, as the signed-in user. */
export class GameCrafter {
  constructor(
    private readonly send: Send,
    private readonly keyId: string,
    private session: string | null,
  ) {}

  /** Trades the `sso_id` the sign-in returned for a session, which it keeps and returns. */
  async signIn(ssoId: string, privateKey: string): Promise<string> {
    const { id } = await this.call<{ id: string }>(
      "POST",
      `/session/sso/${encodeURIComponent(ssoId)}`,
      { private_key: privateKey },
      false,
    );
    this.session = id;
    return id;
  }

  /** Whether the session works still. Anything but being signed out counts as working. */
  async signedIn(): Promise<boolean> {
    if (!this.session) return false;
    try {
      await this.call("GET", `/session/${encodeURIComponent(this.session)}`);
      return true;
    } catch (error) {
      if (error instanceof GameCrafterError && error.signedOut) return false;
      throw error;
    }
  }

  /**
   * Makes a game of the cards and puts it in the account's files, ready to go in a cart. Stops
   * before the next upload once `cancelled` says so. Whatever it made is removed when it fails.
   */
  async buildGame(
    job: PrintJob,
    onProgress: (progress: Progress) => void,
    cancelled: () => boolean = () => false,
  ): Promise<BuiltGame> {
    const built: BuiltGame = { gameId: "", folderId: "", deckId: "", skuId: "" };
    try {
      const me = await this.call<{ user_id: string }>("GET", `/session/${this.id()}`);
      const user = await this.call<{ root_folder_id: string; default_designer_id: string }>(
        "GET",
        `/user/${encodeURIComponent(me.user_id)}`,
      );
      const game = await this.call<{ id: string }>("POST", "/game", {
        name: job.gameName,
        designer_id: user.default_designer_id,
        description: GAME_DESCRIPTION,
        public: 0,
        enable_uv_coating: 1,
      });
      built.gameId = game.id;
      const folder = await this.call<{ id: string }>("POST", "/folder", {
        name: job.gameName,
        parent_id: user.root_folder_id,
      });
      built.folderId = folder.id;

      const total = job.cards.length + 1;
      let done = 0;
      const upload = async (name: string, image: ArrayBuffer): Promise<string> => {
        if (cancelled()) throw new GameCrafterError("Cancelled.", null);
        const file = await this.uploadFile(folder.id, name, image);
        onProgress({ step: "Uploading cards", done: ++done, total });
        return file;
      };
      onProgress({ step: "Uploading cards", done, total });
      const backId = await upload("back", job.back);
      const faceIds = await inBatches(job.cards, UPLOADS_AT_ONCE, (card, index) =>
        upload(`${index + 1} ${card.name}`, card.face),
      );

      const deck = await this.call<{ id: string }>("POST", "/deck", {
        game_id: game.id,
        name: job.gameName,
        identity: "BridgeDeck",
        quantity: 1,
        back_id: backId,
        has_proofed_back: 1,
      });
      built.deckId = deck.id;
      for (let start = 0; start < job.cards.length; start += CARDS_PER_CALL) {
        const cards = job.cards.slice(start, start + CARDS_PER_CALL).map((card, offset) => ({
          name: card.name,
          face_id: faceIds[start + offset],
          quantity: 1,
          has_proofed_face: 1,
        }));
        await this.call("POST", `/deck/${deck.id}/bulk-cards`, { cards: JSON.stringify(cards) });
      }
      const made = await this.call<{
        sku_id?: string;
        sku?: { id: string };
        enable_uv_coating?: unknown;
      }>("GET", `/game/${game.id}`, { _include_relationships: 1 });
      // Cards are never ordered without the coating the dialog promises. A game that doesn't say
      // is let through, since it can't be told.
      if (made.enable_uv_coating !== undefined && Number(made.enable_uv_coating) !== 1)
        throw new GameCrafterError("Game Crafter didn't turn on UV coating for the cards.", null);
      const skuId = made.sku_id ?? made.sku?.id;
      if (!skuId)
        throw new GameCrafterError("Game Crafter didn't say how to order the game.", null);
      built.skuId = skuId;
      return built;
    } catch (error) {
      await this.discard(built).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Puts the game in a new cart in the user's account. Resolves to the cart's id and what the
   * cards cost, before shipping, which the user chooses on Game Crafter's page with their address.
   */
  async makeCart(built: BuiltGame): Promise<{ cartId: string; subtotal: number }> {
    const cart = await this.call<{ id: string }>("POST", "/cart", {
      api_key_id: this.keyId,
      name: CART_NAME,
    });
    try {
      await this.call("POST", `/cart/${cart.id}/sku/${built.skuId}`, { quantity: 1 });
      const made = await this.call<Record<string, unknown>>("GET", `/cart/${cart.id}`);
      return { cartId: cart.id, subtotal: money(made.subtotal) };
    } catch (error) {
      await this.removeCart(cart.id);
      throw error;
    }
  }

  /**
   * Deletes the unpaid carts Tracecards made before, with the games made for them, so that
   * repeated tries don't pile up where the user can't see them: Game Crafter's site shows one cart
   * at a time. Only carts made with this key, called "Tracecards" and not ordered are touched,
   * and only games made for those carts. `keep` is a cart to leave. Also deletes games of ours
   * that never got a cart, such as from a print cut off by a lost connection. Resolves to how many
   * carts were removed.
   */
  async clearEarlier(keep?: string): Promise<number> {
    const me = await this.call<{ user_id: string }>("GET", `/session/${this.id()}`);
    const carts = await this.listAll<Record<string, unknown>>(`/user/${me.user_id}/carts`);
    const earlier = carts.filter(
      (cart) =>
        cart.id !== keep &&
        cart.name === CART_NAME &&
        cart.api_key_id === this.keyId &&
        !cart.payment_status &&
        !cart.order_number &&
        !cart.in_production &&
        !cart.shipped,
    );
    const ours = (await this.listAll<OurGame>(`/user/${me.user_id}/games`)).filter(
      (game) => game.description === GAME_DESCRIPTION,
    );
    const removed = new Set<string>();
    // Each cart's games go before the cart. A game is found through the cart that holds it, so a
    // cart deleted first would leave its game unfindable if this stopped partway.
    for (const cart of earlier) {
      const skus = await this.cartSkus(String(cart.id));
      for (const game of ours) {
        if (!game.sku_id || !skus.has(game.sku_id)) continue;
        await this.removeGame(game.id, game.name).catch(() => undefined);
        removed.add(game.id);
      }
      await this.removeCart(String(cart.id));
    }

    // Games of ours left in no cart. Any cart at all keeps a game, since one that was ordered must
    // stay, and so does a game too new to be sure it isn't the one a print is making now.
    const now = Date.now();
    const leftovers = ours.filter(
      (game) => !removed.has(game.id) && now - created(game.date_created) > LEFTOVER_AGE,
    );
    if (leftovers.length > 0) {
      const inCarts = new Set<string>();
      for (const cart of carts) {
        if (earlier.includes(cart)) continue;
        for (const sku of await this.cartSkus(String(cart.id))) inCarts.add(sku);
      }
      for (const game of leftovers) {
        if (game.sku_id && inCarts.has(game.sku_id)) continue;
        await this.removeGame(game.id, game.name).catch(() => undefined);
      }
    }
    return earlier.length;
  }

  /** The SKUs of what's in a cart. */
  private async cartSkus(cartId: string): Promise<Set<string>> {
    const items = await this.listAll<{ sku_id?: string }>(`/cart/${cartId}/items`);
    return new Set(items.flatMap((item) => (item.sku_id ? [item.sku_id] : [])));
  }

  /**
   * Deletes a game with its decks and the folder its images are in. The folder is found from one
   * of the images, and is deleted only if it's named for the game, as the one made for it is.
   */
  private async removeGame(gameId: string, name: string): Promise<void> {
    const decks = await this.listAll<{ id: string; back_id?: string | null }>(
      `/game/${gameId}/decks`,
    );
    let image: string | null | undefined;
    for (const deck of decks) {
      image ??= deck.back_id;
      if (image) break;
    }
    const folder = image
      ? await this.call<{ folder_id?: string }>("GET", `/file/${image}`).catch(() => null)
      : null;
    for (const deck of decks) await this.call("DELETE", `/deck/${deck.id}`);
    if (folder?.folder_id) {
      const found = await this.call<{ name?: string }>("GET", `/folder/${folder.folder_id}`);
      if (found.name === name) await this.removeFolder(folder.folder_id);
    }
    await this.call("DELETE", `/game/${gameId}`);
  }

  /**
   * Deletes a folder with what's in it. Game Crafter deletes the files in a folder with it, once
   * no card uses them, but won't delete a folder that has folders, and adds one of its own for
   * the deck when the cart is opened.
   */
  private async removeFolder(folderId: string): Promise<void> {
    for (const folder of await this.listAll<{ id: string }>(`/folder/${folderId}/folders`)) {
      await this.removeFolder(folder.id);
    }
    await this.call("DELETE", `/folder/${folderId}`);
  }

  /** Every item of a list, which Game Crafter gives a page at a time. */
  private async listAll<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page++) {
      const result = await this.call<{
        items?: T[];
        paging?: { total_pages?: number };
      }>("GET", path, { _items_per_page: 100, _page_number: page });
      all.push(...(result.items ?? []));
      if (page >= (result.paging?.total_pages ?? 1)) return all;
    }
  }

  /** Removes a cart. Failures are ignored. */
  async removeCart(cartId: string): Promise<void> {
    await this.call("DELETE", `/cart/${cartId}`).catch(() => undefined);
  }

  /**
   * Deletes what `buildGame` made: the deck first, since Game Crafter won't delete a file a card
   * still uses, then the folder, which takes its files with it, then the game.
   */
  async discard(built: BuiltGame): Promise<void> {
    if (built.deckId) await this.call("DELETE", `/deck/${built.deckId}`);
    if (built.folderId) await this.removeFolder(built.folderId);
    if (built.gameId) await this.call("DELETE", `/game/${built.gameId}`);
  }

  private async uploadFile(folderId: string, name: string, image: ArrayBuffer): Promise<string> {
    const body = multipart({
      fields: { session_id: this.id(), folder_id: folderId, name },
      files: [{ name: "file", filename: `${name}.png`, type: "image/png", data: image }],
    });
    return (await this.request<{ id: string }>("POST", "/file", body)).id;
  }

  private id(): string {
    if (!this.session) throw new GameCrafterError("You're not signed in to Game Crafter.", 401);
    return this.session;
  }

  /** A call with form fields, or with `session` false, without the session. */
  private call<T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    params: Params = {},
    session = true,
  ): Promise<T> {
    const all: Params = session ? { session_id: this.id(), ...params } : params;
    if (method === "GET") {
      const query = new URLSearchParams(
        Object.entries(all).map(([key, value]) => [key, String(value)]),
      );
      return this.request<T>(method, `${path}?${query}`);
    }
    return this.request<T>(
      method,
      path,
      multipart({
        fields: Object.fromEntries(Object.entries(all).map(([key, value]) => [key, String(value)])),
      }),
    );
  }

  private async request<T>(method: HttpRequest["method"], path: string, body?: Body): Promise<T> {
    const response = await this.send({ url: API + path, method, ...(body && { body }) });
    const data = parseResponse(response);
    if (data.error) throw new GameCrafterError(data.error.message, data.error.code);
    return data.result as T;
  }
}

interface ApiResponse {
  result?: unknown;
  error?: { message: string; code: number | null };
}

/** Game Crafter's answer: `{result}`, or `{error: {code, message}}`. */
export function parseResponse(response: HttpResponse): ApiResponse {
  const data = responseJson(response);
  if (data === undefined) {
    return {
      error: { message: `Game Crafter answered with status ${response.status}.`, code: null },
    };
  }
  if (!isRecord(data)) return { error: { message: "No answer.", code: null } };
  const { result, error } = data;
  if (isRecord(error)) {
    const { message, code } = error;
    return {
      error: {
        message: typeof message === "string" ? message : "Game Crafter refused the request.",
        code: typeof code === "number" ? code : null,
      },
    };
  }
  return { result };
}

function money(value: unknown): number {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  return Number.isFinite(number) ? number : 0;
}

/** A game as Game Crafter lists a user's games, with what the cleanup needs. */
interface OurGame {
  id: string;
  name: string;
  description?: string;
  sku_id?: string;
  /** Such as "2026-11-03 17:58:29", in a time zone it doesn't give. */
  date_created?: string;
}

/** When a game was made, in milliseconds, taking its date as UTC; now when there's none. */
function created(date: string | undefined): number {
  const time = date ? Date.parse(`${date.replace(" ", "T")}Z`) : NaN;
  return Number.isFinite(time) ? time : Date.now();
}

/**
 * Runs `work` on the items, `size` at a time, and resolves to the results in order. After a
 * failure no more items are started, and once those already started have finished it rejects
 * with the first failure, so nothing is still running when the caller cleans up.
 */
async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const failures: unknown[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length && failures.length === 0) {
      const index = next++;
      try {
        results[index] = await work(items[index] as T, index);
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  if (failures.length > 0) throw failures[0];
  return results;
}
