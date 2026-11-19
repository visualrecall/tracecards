import { describe, expect, it } from "vitest";
import { chooseOffer, isOfferDue, parseUpdateFeed, REMIND_AFTER, type UpdateFeed } from "../src";

const feed = (version: string, releases: Record<string, unknown>[]): UpdateFeed =>
  parseUpdateFeed({ version, releases }) as UpdateFeed;

describe("parseUpdateFeed", () => {
  it("fills in the defaults and ignores what it doesn't know", () => {
    expect(
      parseUpdateFeed({
        version: "0.9.0",
        future: true,
        releases: [
          { version: "0.9.0", headline: "  Faster  ", rollout: 3 },
          { version: "nope" },
          7,
        ],
      }),
    ).toEqual({
      version: "0.9.0",
      releases: [{ version: "0.9.0", notify: true, urgent: false, headline: "Faster" }],
    });
  });

  it("refuses a feed without a version", () => {
    expect(parseUpdateFeed({ releases: [] })).toBeNull();
    expect(parseUpdateFeed("0.9.0")).toBeNull();
  });
});

describe("chooseOffer", () => {
  it("offers nothing when up to date", () => {
    expect(chooseOffer("0.9.0", feed("0.9.0", [{ version: "0.9.0" }]), "0.9.0")).toBeNull();
  });

  it("offers the latest release", () => {
    expect(
      chooseOffer("0.8.0", feed("0.9.0", [{ version: "0.9.0", headline: "Video" }]), ""),
    ).toEqual({ version: "0.9.0", urgent: false, headline: "Video" });
  });

  it("stays quiet when every newer release is quiet", () => {
    const quiet = feed("0.8.2", [
      { version: "0.8.2", notify: false },
      { version: "0.8.1", notify: false },
      { version: "0.8.0" },
    ]);
    expect(chooseOffer("0.8.0", quiet, "")).toBeNull();
    expect(chooseOffer("0.7.0", quiet, "")).toEqual({
      version: "0.8.2",
      urgent: false,
      headline: null,
    });
  });

  it("is urgent when a skipped release is, with that release's headline", () => {
    const releases = feed("0.9.0", [
      { version: "0.9.0", headline: "Video" },
      { version: "0.8.1", urgent: true, headline: "Fixes lost cards" },
    ]);
    expect(chooseOffer("0.8.0", releases, "")).toEqual({
      version: "0.9.0",
      urgent: true,
      headline: "Fixes lost cards",
    });
    expect(chooseOffer("0.8.1", releases, "")).toEqual({
      version: "0.9.0",
      urgent: false,
      headline: "Video",
    });
  });

  it("offers a release that isn't listed", () => {
    expect(chooseOffer("0.8.0", feed("0.9.0", []), "")).toEqual({
      version: "0.9.0",
      urgent: false,
      headline: null,
    });
  });

  it("offers a newer synced version without a feed, or when the feed is behind it", () => {
    const plain = { version: "0.9.0", urgent: false, headline: null };
    expect(chooseOffer("0.8.0", null, "0.9.0")).toEqual(plain);
    expect(chooseOffer("0.8.0", feed("0.8.5", []), "0.9.0")).toEqual(plain);
  });

  it("lets the feed decide about a synced version it knows", () => {
    const quiet = feed("0.8.1", [{ version: "0.8.1", notify: false }]);
    expect(chooseOffer("0.8.0", quiet, "0.8.1")).toBeNull();
  });
});

describe("isOfferDue", () => {
  const normal = { version: "0.9.0", urgent: false, headline: null };
  const urgent = { ...normal, urgent: true };
  const now = 1_000_000_000_000;

  it("shows the first notice straight away", () => {
    expect(isOfferDue(normal, null, now)).toBe(true);
  });

  it("waits a week after a notice, or a day when urgent", () => {
    const dayAgo = now - REMIND_AFTER.urgent;
    expect(isOfferDue(normal, dayAgo, now)).toBe(false);
    expect(isOfferDue(urgent, dayAgo, now)).toBe(true);
    expect(isOfferDue(urgent, dayAgo + 1, now)).toBe(false);
    expect(isOfferDue(normal, now - REMIND_AFTER.normal, now)).toBe(true);
  });
});
