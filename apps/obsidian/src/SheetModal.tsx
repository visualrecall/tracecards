import { HostContext, type Sheet } from "@tracecards/ui";
import { type App, Modal, Platform } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ObsidianHost } from "./host";

/** How much of what's below the fold shows, so it's clear there's more: the whole of what comes
    next (the heading of the other decks) and this much room under it, or this much of it when
    nothing comes next. */
const PEEK = 34;
const PEEK_GAP = 10;
/** How far a touch moves before it drags the sheet rather than tapping. */
const SLOP = 8;
/** How far below its short height the sheet is let go to close. */
const CLOSE_BELOW = 70;

/**
 * A sheet from the screens, such as the one of decks on phones, in a modal: at the bottom of the
 * screen on phones, as Obsidian's confirmations are there. As a modal, it closes with Android's
 * back button, a tap outside or its close button.
 *
 * On phones a sheet with a fold (an element with the class `tracecards-sheet-fold`) opens only
 * down to it, so what's above the fold is by the thumb that opened the sheet, and is pulled up for
 * the rest, or down to close, as sheets on iPhones are.
 */
export class SheetModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly host: ObsidianHost,
    private readonly sheet: Sheet,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.containerEl.addClass("tracecards-sheet");
    this.setTitle(this.sheet.title);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <HostContext value={this.host}>{this.sheet.render(() => this.close())}</HostContext>
      </StrictMode>,
    );
    // Once React has drawn the sheet, so its heights are known.
    if (Platform.isPhone) this.modalEl.win.requestAnimationFrame(() => this.makePullable());
  }

  override onClose(): void {
    this.root?.unmount();
    this.root = null;
  }

  private makePullable(): void {
    const modal = this.modalEl;
    const fold = modal.querySelector(".tracecards-sheet-fold");
    if (!fold) return;
    const full = modal.offsetHeight;
    const bottomPadding = parseFloat(getComputedStyle(modal).paddingBottom) || 0;
    const next = fold.nextElementSibling;
    const peekEnd = next
      ? next.getBoundingClientRect().bottom + PEEK_GAP
      : fold.getBoundingClientRect().bottom + PEEK;
    const short = Math.round(peekEnd - modal.getBoundingClientRect().top + bottomPadding);
    // Too little below the fold to be worth pulling up for.
    if (full - short < PEEK * 2) return;

    modal.addClass("is-pullable");
    modal.prepend(createDiv({ cls: "tracecards-sheet-grabber" }));
    let height = short;
    const set = (to: number, animate: boolean) => {
      height = to;
      modal.toggleClass("is-settling", animate);
      modal.toggleClass("is-short", to <= short);
      modal.setCssProps({ "--tracecards-sheet-height": `${to}px` });
    };
    set(short, false);

    // A touch drags the sheet once it moves past SLOP: anywhere while it's short, and from its top
    // (above the content) once it's pulled up, so the content scrolls then.
    let start: { y: number; height: number; time: number } | null = null;
    let dragging = false;
    const onDown = (event: PointerEvent) => {
      const onTop = !this.contentEl.contains(event.target as Node);
      if (height > short && !onTop) return;
      start = { y: event.clientY, height, time: event.timeStamp };
      dragging = false;
    };
    const onMove = (event: PointerEvent) => {
      if (!start) return;
      const dy = event.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dy) < SLOP) return;
        dragging = true;
        modal.setPointerCapture(event.pointerId);
      }
      set(Math.min(full, Math.max(short - CLOSE_BELOW * 2, start.height - dy)), false);
    };
    const onUp = (event: PointerEvent) => {
      if (!start) return;
      const was = start;
      start = null;
      if (!dragging) return;
      // Settle where it's headed: a quick flick counts as much as where it's let go.
      const speed = (was.y - event.clientY) / Math.max(1, event.timeStamp - was.time);
      // Down from its short height, a flick closes it; from full height it settles short.
      if (height < short - CLOSE_BELOW || (speed < -0.8 && was.height <= short)) {
        this.close();
        return;
      }
      const headed = height + speed * 150;
      set(headed > (short + full) / 2 ? full : short, true);
    };
    // A drag isn't a tap: the click that ends it doesn't choose a deck.
    const onClick = (event: MouseEvent) => {
      if (!dragging) return;
      dragging = false;
      event.preventDefault();
      event.stopPropagation();
    };
    modal.addEventListener("pointerdown", onDown);
    modal.addEventListener("pointermove", onMove);
    modal.addEventListener("pointerup", onUp);
    modal.addEventListener("pointercancel", onUp);
    modal.addEventListener("click", onClick, true);
  }
}
