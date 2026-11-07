import { describe, expect, it } from "vitest";
import type { Host, HttpRequest, HttpResponse } from "../src/host";
import { parsePixabay, pixabayUrl, searchPixabay } from "../src/pixabay";

const HIT = {
  id: 195893,
  webformatURL: "https://pixabay.com/get/35bbf209e13e39d2_640.jpg",
  largeImageURL: "https://pixabay.com/get/ed6a99fd0a76647_1280.jpg",
  user: "Josch13",
  tags: "blossom, bloom, flower",
};

describe("pixabayUrl", () => {
  it("asks for a page of safe results of one kind", () => {
    const url = new URL(pixabayUrl("k3y", { query: " yellow flowers ", kind: "photo", page: 2 }));
    expect(url.origin + url.pathname).toBe("https://pixabay.com/api/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: "k3y",
      q: "yellow flowers",
      image_type: "photo",
      safesearch: "true",
      per_page: "40",
      page: "2",
    });
  });

  it("cuts the search to Pixabay's 100 characters", () => {
    const url = new URL(pixabayUrl("k", { query: "a".repeat(150), kind: "all", page: 1 }));
    expect(url.searchParams.get("q")).toHaveLength(100);
  });
});

describe("parsePixabay", () => {
  it("reads the hits, with 340 px thumbnails, and how many there are", () => {
    expect(parsePixabay({ total: 4692, totalHits: 500, hits: [HIT] })).toEqual({
      total: 500,
      images: [
        {
          id: 195893,
          thumbnail: "https://pixabay.com/get/35bbf209e13e39d2_340.jpg",
          medium: "https://pixabay.com/get/35bbf209e13e39d2_640.jpg",
          large: "https://pixabay.com/get/ed6a99fd0a76647_1280.jpg",
          tags: "blossom, bloom, flower",
        },
      ],
    });
  });

  it("skips hits it can't use, and isn't fooled by an error", () => {
    const page = parsePixabay({ totalHits: 3, hits: [HIT, { id: 2 }, null, "x"] });
    expect(page?.images.map((image) => image.id)).toEqual([195893]);
    expect(parsePixabay("[ERROR 400] Invalid or missing API key")).toBeNull();
    expect(parsePixabay({ hits: "none" })).toBeNull();
  });
});

describe("searchPixabay", () => {
  const answer = (status: number, body: unknown): HttpResponse => ({
    status,
    contentType: "application/json",
    body: new TextEncoder().encode(JSON.stringify(body)).buffer,
  });
  const hostAnswering = (reply: () => Promise<HttpResponse>) => {
    const requests: string[] = [];
    const host = {
      send: ({ url }: HttpRequest) => {
        requests.push(url);
        return reply();
      },
    } as unknown as Host;
    return { host, requests };
  };

  it("keeps results, so the same search isn't asked for twice", async () => {
    const { host, requests } = hostAnswering(() =>
      Promise.resolve(answer(200, { totalHits: 1, hits: [HIT] })),
    );
    const search = { query: "kept", kind: "all" as const, page: 1 };
    const first = await searchPixabay(host, "k", search);
    const second = await searchPixabay(host, "k", search);
    expect(first.ok && first.page.images).toHaveLength(1);
    expect(second).toEqual(first);
    expect(requests).toHaveLength(1);
  });

  it("says what went wrong", async () => {
    const problem = async (reply: () => Promise<HttpResponse>, query: string) => {
      const result = await searchPixabay(hostAnswering(reply).host, "k", {
        query,
        kind: "all",
        page: 1,
      });
      return result.ok ? null : result.problem;
    };
    expect(await problem(() => Promise.resolve(answer(400, "bad key")), "a")).toMatch(/API key/);
    expect(await problem(() => Promise.resolve(answer(429, "")), "b")).toMatch(/a minute/);
    expect(await problem(() => Promise.reject(new Error("offline")), "c")).toMatch(/connection/);
    expect(await problem(() => Promise.resolve(answer(500, "")), "d")).toMatch(/later/);
  });
});
