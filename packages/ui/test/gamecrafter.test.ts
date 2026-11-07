import { describe, expect, it } from "vitest";
import {
  cartUrl,
  GameCrafter,
  GameCrafterError,
  parseResponse,
  sheetPricing,
  ssoUrl,
} from "../src/gamecrafter";
import type { HttpRequest, HttpResponse } from "../src/host";
import { multipart } from "../src/multipart";

const text = (data: ArrayBuffer) => new TextDecoder().decode(data);
const answer = (json: unknown, status = 200): HttpResponse => ({
  status,
  contentType: "application/json",
  body: new TextEncoder().encode(JSON.stringify(json)).buffer,
});

describe("multipart", () => {
  it("writes fields and files between boundaries", () => {
    const { contentType, data } = multipart(
      {
        fields: { session_id: "s1", name: 'a "b"' },
        files: [
          {
            name: "file",
            filename: "x.png",
            type: "image/png",
            data: new Uint8Array([1, 2, 3]).buffer,
          },
        ],
      },
      "BOUND",
    );
    expect(contentType).toBe("multipart/form-data; boundary=BOUND");
    const body = text(data);
    expect(body).toContain(
      '--BOUND\r\nContent-Disposition: form-data; name="session_id"\r\n\r\ns1\r\n',
    );
    expect(body).toContain('name="name"\r\n\r\na "b"\r\n');
    expect(body).toContain('name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n');
    expect(body.endsWith("\r\n--BOUND--\r\n")).toBe(true);
    // The file's bytes are in between, whole.
    expect(new Uint8Array(data).includes(3)).toBe(true);
  });

  it("keeps quotes and line breaks out of header names", () => {
    const body = text(
      multipart(
        { files: [{ name: 'f"', filename: "a\r\nb.png", type: "x/y", data: new ArrayBuffer(0) }] },
        "B",
      ).data,
    );
    expect(body).toContain('name="f_"; filename="a__b.png"');
  });
});

describe("ssoUrl", () => {
  it("asks for what printing needs and nothing more", () => {
    const url = new URL(ssoUrl("KEY", "obsidian://tracecards-sso"));
    expect(url.origin + url.pathname).toBe("https://www.thegamecrafter.com/sso");
    expect(url.searchParams.get("api_key_id")).toBe("KEY");
    expect(url.searchParams.get("postback_uri")).toBe("obsidian://tracecards-sso");
    const permissions = url.searchParams.getAll("permission");
    expect(permissions).toEqual(expect.arrayContaining(["edit_my_games", "edit_my_carts"]));
    expect(permissions.some((permission) => permission.includes("receipt"))).toBe(false);
  });
});

describe("cartUrl", () => {
  it("is the cart's page, where the items show before checkout", () => {
    expect(cartUrl("ABC")).toBe("https://www.thegamecrafter.com/cart/ABC");
  });
});

describe("parseResponse", () => {
  it("reads a result, and an error with its code", () => {
    expect(parseResponse(answer({ result: { id: "1" } })).result).toEqual({ id: "1" });
    expect(
      parseResponse(answer({ error: { code: 401, message: "You must log in to do that." } }, 401))
        .error,
    ).toEqual({
      code: 401,
      message: "You must log in to do that.",
    });
  });

  it("treats a page that isn't JSON as an error", () => {
    const response = {
      status: 502,
      contentType: "text/html",
      body: new TextEncoder().encode("<html>").buffer,
    };
    expect(parseResponse(response).error?.message).toContain("502");
  });
});

describe("GameCrafter", () => {
  /** Answers each call from `replies`, by "METHOD /path", and records them. */
  function fake(replies: Record<string, unknown>) {
    const calls: HttpRequest[] = [];
    const send = (request: HttpRequest) => {
      calls.push(request);
      const path = new URL(request.url).pathname.replace("/api", "");
      const key = `${request.method ?? "GET"} ${path}`;
      return Promise.resolve(answer(key in replies ? replies[key] : { result: {} }));
    };
    return { send, calls };
  }

  it("trades an sso_id for a session, sending the private key and not a session", async () => {
    const { send, calls } = fake({ "POST /session/sso/SSO": { result: { id: "SESSION" } } });
    const gc = new GameCrafter(send, "KEY", null);
    expect(await gc.signIn("SSO", "PRIVATE")).toBe("SESSION");
    const body = text(calls[0]?.body?.data as ArrayBuffer);
    expect(body).toContain("PRIVATE");
    expect(body).not.toContain("session_id");
  });

  it("says when the session is gone, and when it's still good", async () => {
    const gone = fake({
      "GET /session/S": { error: { code: 401, message: "You must log in to do that." } },
    });
    expect(await new GameCrafter(gone.send, "K", "S").signedIn()).toBe(false);
    const good = fake({ "GET /session/S": { result: { id: "S" } } });
    expect(await new GameCrafter(good.send, "K", "S").signedIn()).toBe(true);
    expect(await new GameCrafter(good.send, "K", null).signedIn()).toBe(false);
  });

  it("throws an error that knows it's a sign-out", async () => {
    const { send } = fake({
      "GET /session/S": { error: { code: 401, message: "no" } },
      "GET /user/U": { error: { code: 401, message: "no" } },
    });
    const gc = new GameCrafter(send, "K", "S");
    await expect(
      gc.buildGame({ gameName: "g", cards: [], back: new ArrayBuffer(0) }, () => undefined),
    ).rejects.toMatchObject({ signedOut: true });
  });

  it("builds a game, uploads each card, and removes it all if a step fails", async () => {
    const replies = {
      "GET /session/S": { result: { user_id: "U" } },
      "GET /user/U": { result: { root_folder_id: "ROOT", default_designer_id: "D" } },
      "POST /game": { result: { id: "G" } },
      "POST /folder": { result: { id: "F" } },
      "POST /file": { result: { id: "FILE" } },
      "POST /deck": { result: { id: "DECK" } },
      "POST /deck/DECK/bulk-cards": { error: { code: 500, message: "bad cards" } },
    };
    const { send, calls } = fake(replies);
    const gc = new GameCrafter(send, "K", "S");
    const progress: number[] = [];
    await expect(
      gc.buildGame(
        {
          gameName: "Deck",
          cards: [
            { name: "a", face: new ArrayBuffer(1) },
            { name: "b", face: new ArrayBuffer(1) },
          ],
          back: new ArrayBuffer(1),
        },
        (p) => progress.push(p.done),
      ),
    ).rejects.toBeInstanceOf(GameCrafterError);
    expect(progress.at(-1)).toBe(3);
    const deletes = calls
      .filter((call) => call.method === "DELETE")
      .map((call) => new URL(call.url).pathname.replace("/api", ""));
    expect(deletes[0]).toBe("/deck/DECK");
    // The folder takes its files with it, so they aren't deleted one by one.
    expect(deletes).toEqual(["/deck/DECK", "/folder/F", "/game/G"]);
  });
});

describe("buildGame's UV coating", () => {
  const replies = (game: Record<string, unknown>) => ({
    "GET /session/S": { result: { user_id: "U" } },
    "GET /user/U": { result: { root_folder_id: "ROOT", default_designer_id: "D" } },
    "POST /game": { result: { id: "G" } },
    "POST /folder": { result: { id: "F" } },
    "POST /file": { result: { id: "FILE" } },
    "POST /deck": { result: { id: "DECK" } },
    "GET /game/G": { result: { sku_id: "SKU", ...game } },
  });
  const job = {
    gameName: "Deck",
    cards: [{ name: "a", face: new ArrayBuffer(1) }],
    back: new ArrayBuffer(1),
  };

  function fake(answers: Record<string, unknown>) {
    const requests: { key: string; body: string }[] = [];
    const send = (request: HttpRequest) => {
      const path = new URL(request.url).pathname.replace("/api", "");
      const key = `${request.method ?? "GET"} ${path}`;
      requests.push({ key, body: request.body ? text(request.body.data) : "" });
      return Promise.resolve(answer(key in answers ? answers[key] : { result: {} }));
    };
    return { send, requests };
  }

  it("asks for the coating when it makes the game", async () => {
    const { send, requests } = fake(replies({ enable_uv_coating: 1 }));
    await new GameCrafter(send, "K", "S").buildGame(job, () => undefined);
    const made = requests.find((request) => request.key === "POST /game");
    expect(made?.body).toMatch(/name="enable_uv_coating"\r\n\r\n1\r\n/);
  });

  it("accepts a game that says the coating is on, as a string or a number", async () => {
    for (const on of [1, "1"]) {
      const { send } = fake(replies({ enable_uv_coating: on }));
      await expect(
        new GameCrafter(send, "K", "S").buildGame(job, () => undefined),
      ).resolves.toMatchObject({ skuId: "SKU" });
    }
  });

  it("refuses a game that says the coating is off, and removes what it made", async () => {
    const { send, requests } = fake(replies({ enable_uv_coating: "0" }));
    await expect(new GameCrafter(send, "K", "S").buildGame(job, () => undefined)).rejects.toThrow(
      /UV coating/,
    );
    expect(requests.map((request) => request.key)).toContain("DELETE /game/G");
  });

  it("goes on when the game doesn't say, since it can't be told", async () => {
    const { send } = fake(replies({}));
    await expect(
      new GameCrafter(send, "K", "S").buildGame(job, () => undefined),
    ).resolves.toMatchObject({ skuId: "SKU" });
  });
});

describe("buildGame's uploads", () => {
  const job = (cards: number) => ({
    gameName: "Deck",
    cards: Array.from({ length: cards }, (_, index) => ({
      name: String(index),
      face: new ArrayBuffer(1),
    })),
    back: new ArrayBuffer(1),
  });

  /** Fails the `failAt`th upload, counting the back as the first, and records every call. */
  function fake(failAt = Infinity) {
    const calls: string[] = [];
    let uploads = 0;
    const send = (request: HttpRequest) => {
      const path = new URL(request.url).pathname.replace("/api", "");
      const key = `${request.method ?? "GET"} ${path}`;
      calls.push(key);
      const reply: Record<string, unknown> = {
        "GET /session/S": { result: { user_id: "U" } },
        "GET /user/U": { result: { root_folder_id: "ROOT", default_designer_id: "D" } },
        "POST /game": { result: { id: "G" } },
        "POST /folder": { result: { id: "F" } },
      };
      if (key === "POST /file") {
        uploads++;
        return Promise.resolve(
          answer(
            uploads === failAt
              ? { error: { code: 500, message: "no" } }
              : { result: { id: "FILE" } },
          ),
        );
      }
      return Promise.resolve(answer(reply[key] ?? { result: {} }));
    };
    return { send, calls };
  }

  it("starts no more uploads after one fails, and cleans up once the others are done", async () => {
    const { send, calls } = fake(3);
    await expect(
      new GameCrafter(send, "K", "S").buildGame(job(20), () => undefined),
    ).rejects.toThrow("no");
    const uploads = calls.filter((call) => call === "POST /file").length;
    // The back, then four at a time: the one that failed and the three beside it at most.
    expect(uploads).toBeLessThanOrEqual(1 + 4 + 1);
    expect(calls.lastIndexOf("POST /file")).toBeLessThan(calls.indexOf("DELETE /folder/F"));
    expect(calls).toContain("DELETE /game/G");
  });

  it("stops uploading when it's cancelled, and removes what it made", async () => {
    const { send, calls } = fake();
    let uploads = 0;
    await expect(
      new GameCrafter(send, "K", "S").buildGame(
        job(20),
        () => uploads++,
        () => uploads >= 3,
      ),
    ).rejects.toThrow("Cancelled.");
    expect(calls.filter((call) => call === "POST /file").length).toBeLessThan(10);
    expect(calls).toContain("DELETE /folder/F");
    expect(calls).toContain("DELETE /game/G");
  });
});

describe("makeCart", () => {
  const built = { gameId: "G", folderId: "F", deckId: "D", skuId: "SKU" };

  it("makes a cart with the game in it and says what the cards cost", async () => {
    const calls: string[] = [];
    const send = (request: HttpRequest) => {
      calls.push(`${request.method ?? "GET"} ${new URL(request.url).pathname.replace("/api", "")}`);
      const path = new URL(request.url).pathname;
      if (request.method === "POST" && path.endsWith("/cart"))
        return Promise.resolve(answer({ result: { id: "C" } }));
      if (path.endsWith("/cart/C"))
        return Promise.resolve(answer({ result: { subtotal: "3.88" } }));
      return Promise.resolve(answer({ result: {} }));
    };
    const cart = await new GameCrafter(send, "K", "S").makeCart(built);
    expect(cart).toEqual({ cartId: "C", subtotal: 3.88 });
    expect(calls).toEqual(["POST /cart", "POST /cart/C/sku/SKU", "GET /cart/C"]);
  });

  it("removes the cart if adding the game fails", async () => {
    const calls: string[] = [];
    const send = (request: HttpRequest) => {
      const path = new URL(request.url).pathname.replace("/api", "");
      calls.push(`${request.method ?? "GET"} ${path}`);
      if (path === "/cart") return Promise.resolve(answer({ result: { id: "C" } }));
      if (path.includes("/sku/"))
        return Promise.resolve(answer({ error: { code: 500, message: "no" } }));
      return Promise.resolve(answer({ result: {} }));
    };
    await expect(new GameCrafter(send, "K", "S").makeCart(built)).rejects.toBeInstanceOf(
      GameCrafterError,
    );
    expect(calls).toContain("DELETE /cart/C");
  });
});

describe("sheetPricing", () => {
  it("charges a whole sheet for up to 18 cards, and says how many more fit", () => {
    // The price of a real cart of one sheet, with the coating.
    expect(sheetPricing(12)).toEqual({ sheets: 1, slots: 18, unused: 6, estimate: 4.23 });
    expect(sheetPricing(18)).toEqual({ sheets: 1, slots: 18, unused: 0, estimate: 4.23 });
  });

  it("goes up by a sheet from the 19th card", () => {
    expect(sheetPricing(19)).toMatchObject({ sheets: 2, unused: 17, estimate: 7.57 });
    expect(sheetPricing(54)).toMatchObject({ sheets: 3, unused: 0, estimate: 10.91 });
    expect(sheetPricing(55)).toMatchObject({ sheets: 4, estimate: 14.25 });
    expect(sheetPricing(100)).toMatchObject({ sheets: 6, estimate: 20.93 });
    expect(sheetPricing(250)).toMatchObject({ sheets: 14, estimate: 47.65 });
  });

  it("treats an empty deck as one sheet, so nothing divides by zero", () => {
    expect(sheetPricing(0)).toMatchObject({ sheets: 1, unused: 18 });
  });
});

describe("clearEarlier", () => {
  const KEY = "KEY";
  const carts = [
    { id: "old", name: "Tracecards", api_key_id: KEY, payment_status: null },
    { id: "keep", name: "Tracecards", api_key_id: KEY, payment_status: null },
    { id: "paid", name: "Tracecards", api_key_id: KEY, payment_status: "paid" },
    { id: "other-key", name: "Tracecards", api_key_id: "OTHER", payment_status: null },
    { id: "other-app", name: "Another app #1", api_key_id: KEY, payment_status: null },
  ];

  function fake(folderName = "Old (Tracecards)") {
    const calls: string[] = [];
    const send = (request: HttpRequest) => {
      const path = new URL(request.url).pathname.replace("/api", "");
      calls.push(`${request.method ?? "GET"} ${path}`);
      const page = (items: unknown[]) => answer({ result: { items, paging: { total_pages: 1 } } });
      if (path === "/session/S") return Promise.resolve(answer({ result: { user_id: "U" } }));
      if (path === "/user/U/carts") return Promise.resolve(page(carts));
      if (path === "/cart/old/items") return Promise.resolve(page([{ sku_id: "SKU-OLD" }]));
      if (path === "/user/U/games") {
        return Promise.resolve(
          page([
            {
              id: "g-old",
              name: "Old (Tracecards)",
              description: "Printed from Tracecards",
              sku_id: "SKU-OLD",
            },
            {
              id: "g-paid",
              name: "Paid (Tracecards)",
              description: "Printed from Tracecards",
              sku_id: "SKU-PAID",
            },
            { id: "g-mine", name: "Mine", description: "My own game", sku_id: "SKU-OLD" },
          ]),
        );
      }
      if (path === "/game/g-old/decks")
        return Promise.resolve(page([{ id: "d1", back_id: "f-back" }]));
      if (path === "/file/f-back" && request.method !== "DELETE") {
        return Promise.resolve(answer({ result: { folder_id: "folder" } }));
      }
      if (path === "/folder/folder" && request.method !== "DELETE") {
        return Promise.resolve(answer({ result: { name: folderName } }));
      }
      if (path === "/folder/folder/files")
        return Promise.resolve(page([{ id: "f-back" }, { id: "f1" }]));
      if (path === "/folder/folder/folders") return Promise.resolve(page([{ id: "sub" }]));
      if (path === "/folder/sub/files" || path === "/folder/sub/folders")
        return Promise.resolve(page([]));
      return Promise.resolve(answer({ result: {} }));
    };
    return { send, calls };
  }

  it("removes only our unpaid carts, and the games made for them", async () => {
    const { send, calls } = fake();
    expect(await new GameCrafter(send, KEY, "S").clearEarlier("keep")).toBe(1);
    const deletes = calls.filter((call) => call.startsWith("DELETE"));
    expect(deletes).toContain("DELETE /cart/old");
    for (const left of ["keep", "paid", "other-key", "other-app"]) {
      expect(deletes).not.toContain(`DELETE /cart/${left}`);
    }
    expect(deletes).toContain("DELETE /game/g-old");
    expect(deletes).not.toContain("DELETE /game/g-paid");
    expect(deletes).not.toContain("DELETE /game/g-mine");
  });

  it("removes the game's deck first, then its folders from the inside out, then the game", async () => {
    const { send, calls } = fake();
    await new GameCrafter(send, KEY, "S").clearEarlier("keep");
    const deletes = calls.filter((call) => call.startsWith("DELETE"));
    const at = (call: string) => deletes.indexOf(call);
    expect(at("DELETE /deck/d1")).toBeLessThan(at("DELETE /folder/sub"));
    expect(at("DELETE /folder/sub")).toBeLessThan(at("DELETE /folder/folder"));
    expect(at("DELETE /folder/folder")).toBeLessThan(at("DELETE /game/g-old"));
    // Deleting the folder deletes its files, so none is deleted on its own.
    expect(deletes.some((call) => call.startsWith("DELETE /file/"))).toBe(false);
  });

  it("removes a cart's game before the cart, so an interrupted run can still find the game", async () => {
    const { send, calls } = fake();
    await new GameCrafter(send, KEY, "S").clearEarlier("keep");
    const deletes = calls.filter((call) => call.startsWith("DELETE"));
    expect(deletes.indexOf("DELETE /game/g-old")).toBeLessThan(deletes.indexOf("DELETE /cart/old"));
  });

  it("leaves a folder that isn't named for the game", async () => {
    const { send, calls } = fake("Someone's own folder");
    await new GameCrafter(send, KEY, "S").clearEarlier("keep");
    const deletes = calls.filter((call) => call.startsWith("DELETE"));
    expect(deletes).not.toContain("DELETE /folder/folder");
    expect(deletes).toContain("DELETE /game/g-old");
  });

  it("removes games of ours that never got a cart, once they're a day old", async () => {
    const calls: string[] = [];
    const recent = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace("T", " ");
    const send = (request: HttpRequest) => {
      const path = new URL(request.url).pathname.replace("/api", "");
      calls.push(`${request.method ?? "GET"} ${path}`);
      const page = (items: unknown[]) => answer({ result: { items, paging: { total_pages: 1 } } });
      const ours = (id: string, sku: string, date: string) => ({
        id,
        name: `${id} (Tracecards)`,
        description: "Printed from Tracecards",
        sku_id: sku,
        date_created: date,
      });
      if (path === "/session/S") return Promise.resolve(answer({ result: { user_id: "U" } }));
      if (path === "/user/U/carts") return Promise.resolve(page([carts[2]]));
      if (path === "/cart/paid/items") return Promise.resolve(page([{ sku_id: "SKU-PAID" }]));
      if (path === "/user/U/games") {
        return Promise.resolve(
          page([
            ours("g-orphan", "SKU-ORPHAN", "2026-01-01 10:00:00"),
            ours("g-ordered", "SKU-PAID", "2026-01-01 10:00:00"),
            ours("g-new", "SKU-NEW", recent),
            {
              id: "g-mine",
              name: "Mine",
              description: "My own game",
              date_created: "2020-01-01 00:00:00",
            },
          ]),
        );
      }
      return Promise.resolve(answer({ result: path.endsWith("/decks") ? { items: [] } : {} }));
    };
    expect(await new GameCrafter(send, KEY, "S").clearEarlier()).toBe(0);
    const deletes = calls.filter((call) => call.startsWith("DELETE"));
    expect(deletes).toEqual(["DELETE /game/g-orphan"]);
  });

  it("does nothing, and touches no games, when there's nothing earlier", async () => {
    const { send, calls } = fake();
    expect(await new GameCrafter(send, "NOBODY", "S").clearEarlier()).toBe(0);
    expect(calls.some((call) => call.startsWith("DELETE"))).toBe(false);
  });
});
