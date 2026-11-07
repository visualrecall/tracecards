// YouTube URL forms that count as videos. See "Bookmarks" in spec/vault-format.md.
// No lookbehind: some iOS versions don't support it.
const VIDEO_URL =
  /^https?:\/\/(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|(?:www\.)?youtube-nocookie\.com\/embed\/|youtu\.be\/)([\w-]{11})(?![\w-])/i;

/** The video id of a YouTube URL, or undefined for other URLs. */
export function videoId(url: string): string | undefined {
  return VIDEO_URL.exec(url.trim())?.[1];
}

/** YouTube's 320 × 180 thumbnail of a video, for lists. */
export function videoThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}
