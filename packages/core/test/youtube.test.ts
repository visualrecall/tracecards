import { describe, expect, it } from "vitest";
import { videoId } from "../src";

describe("videoId", () => {
  it.each([
    ["https://youtu.be/abcdefghijk", "abcdefghijk"],
    ["https://youtu.be/abcdefghijk?t=95", "abcdefghijk"],
    ["https://www.youtube.com/watch?v=abc-ef_hijk", "abc-ef_hijk"],
    ["https://youtube.com/watch?v=abcdefghijk&t=1m35s", "abcdefghijk"],
    ["https://m.youtube.com/watch?feature=share&v=abcdefghijk", "abcdefghijk"],
    ["https://music.youtube.com/watch?v=abcdefghijk", "abcdefghijk"],
    ["https://www.youtube.com/shorts/abcdefghijk", "abcdefghijk"],
    ["https://www.youtube.com/embed/abcdefghijk?start=10", "abcdefghijk"],
    ["https://www.youtube.com/live/abcdefghijk", "abcdefghijk"],
    ["https://www.youtube-nocookie.com/embed/abcdefghijk", "abcdefghijk"],
    ["http://youtu.be/abcdefghijk", "abcdefghijk"],
    ["  https://youtu.be/abcdefghijk  ", "abcdefghijk"],
  ])("finds the id in %s", (url, id) => {
    expect(videoId(url)).toBe(id);
  });

  it.each([
    "https://youtu.be/short",
    "https://youtu.be/abcdefghijkl",
    "https://www.youtube.com/watch?list=abcdefghijk",
    "https://www.youtube.com/@channel",
    "https://notyoutube.com/watch?v=abcdefghijk",
    "https://youtube.com.example.com/watch?v=abcdefghijk",
    "https://vimeo.com/123456789",
    "youtu.be/abcdefghijk",
  ])("ignores %s", (url) => {
    expect(videoId(url)).toBeUndefined();
  });
});
