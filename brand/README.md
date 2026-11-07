# Tracecards logo

The Tracecards mark is three stacked card outlines. Open `index.html` in a browser to see
every file at the sizes it's made for.

## Colours

| Name | Hex | Use |
| --- | --- | --- |
| Teal | `#3DF5D0` | The mark on dark backgrounds, the app icon |
| Ink | `#0B1B1D` | The app icon's background |
| Mid teal | `#0E9E88` | The favicon, which has to show on light and dark browser tabs |

## Files

- `mark-teal.svg`, `mark-white.svg`, `mark-black.svg`: the mark for large sizes, with thin
  lines and faded back cards.
- `mark-small-teal.svg`, `mark-small-white.svg`, `mark-small-black.svg`: the mark for 32px
  and under, with heavier lines and the cards further apart so they stay apart when small.
- `app-icon.svg`: the app icon with rounded corners, for showing it on a page.
- `app-icon-square.svg`: the app icon square and full bleed, for app stores and home
  screens, which round the corners themselves.
- `favicon.svg`: the browser tab icon, in mid teal and without a background.
- `wordmark-white.svg`, `wordmark-black.svg`, `wordmark-teal.svg`: the small mark beside
  TRACECARDS. The letters are outlines of Orbitron, which is under the SIL Open Font
  License, so the files don't need the font.
- `png/`: `app-icon-1024.png` and `app-icon-512.png` for the app stores,
  `app-icon-180.png` for iOS home screens, `app-icon-192.png` for Android,
  `app-icon-black-on-white-400.png` and `app-icon-white-on-black-400.png`, the app icon
  in black and white for places that don't take colour, and
  `favicon-32.png` and `favicon-16.png` for browsers that don't take SVG icons,
  `avatar-1080.png` and `avatar-400.png` for profile pictures (the mark stays inside the
  circle that X and Instagram crop to), `cover.png`, the 1200×630 image shown when a
  link to the site is shared, and `logo-black-on-white.png` and `logo-white-on-black.png`,
  the wordmark on a plain 2400×800 background for places that ask for a logo image.

The plugin keeps its own copy of the mark, drawn in the text colour around it, in
`apps/obsidian/src/icon.ts`.
