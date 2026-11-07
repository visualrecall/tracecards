import { ICONS } from "@tracecards/ui";
import { addIcon } from "obsidian";

// The Tracecards mark, three stacked card outlines, drawn on a 64 grid and scaled to the
// 100 box Obsidian's icons use. The back two cards are open paths that stop where the card
// in front of them starts, so the icon needs no fill and works on any background. Unlike
// the logo, the cards sit further apart and aren't faded, so they stay apart at 16px.
const MARK = `<g transform="scale(1.5625)" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="butt" stroke-linejoin="round">
<path d="M27 12.75V11a4 4 0 0 1 4-4H49a4 4 0 0 1 4 4V37a4 4 0 0 1-4 4H47.25"/>
<path d="M19 20.75V19a4 4 0 0 1 4-4H41a4 4 0 0 1 4 4V45a4 4 0 0 1-4 4H39.25"/>
<rect x="11" y="23" width="26" height="34" rx="4"/>
</g>`;

/** Adds the Tracecards mark to Obsidian's icons, under the name `ICONS.tracecards`. */
export function registerIcon(): void {
  addIcon(ICONS.tracecards, MARK);
}
