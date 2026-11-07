import {
  Accessibility,
  type DropAnimationFunction,
  Feedback,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { SortableDroppable } from "@dnd-kit/dom/sortable";
import type { DragDropProvider } from "@dnd-kit/react";
import type { ComponentProps } from "react";

// Drag and drop settings shared by the deck pad and the card grid.

type ProviderProps = ComponentProps<typeof DragDropProvider>;

/**
 * Dragging starts once a mouse moves a few pixels, so clicks still select or open, and after a
 * long press on touch screens, so swipes still scroll. The keyboard reorders with Alt and the
 * arrow keys, so dnd-kit's own keyboard dragging (Space, then arrows) is left out.
 */
export const SENSORS: ProviderProps["sensors"] = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
];

/**
 * Slides a dropped item from where it was let go into its place. dnd-kit's own drop animation
 * holds up the next drag until it ends, about a quarter of a second, so this one lets the drop
 * finish first and animates the item in its place afterwards.
 */
const slideIntoPlace: DropAnimationFunction = ({ element, feedbackElement }) => {
  const { left, top } = feedbackElement.getBoundingClientRect();
  // By the next frame, dnd-kit has put the item back among the others, unless the screen has
  // drawn the list afresh, as after a card is dropped on a deck.
  slideFrom(element, { x: left, y: top });
};

/**
 * Slides `element` into its place from `from`, the top left corner of where it was let go, from
 * the next frame. Screens that draw a list afresh after a drag, which dnd-kit's own drop then
 * skips, use it for the item that was dragged.
 */
export function slideFrom(element: Element, from: { x: number; y: number }): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.requestAnimationFrame(() => {
    if (!element.isConnected) return;
    const to = element.getBoundingClientRect();
    const x = from.x - to.left;
    const y = from.y - to.top;
    if (x === 0 && y === 0) return;
    element.animate(
      [
        { transform: `translate(${x}px, ${y}px)`, zIndex: 1 },
        { transform: "none", zIndex: 1 },
      ],
      { duration: 200, easing: "ease" },
    );
  });
}

/** How the other items slide aside while one is dragged: dnd-kit's 250ms, made about 30% slower. */
export const SORT_TRANSITION = { duration: 325, easing: "cubic-bezier(0.25, 1, 0.5, 1)" };

export const PLUGINS: ProviderProps["plugins"] = (defaults) => [
  ...defaults,
  Feedback.configure({ dropAnimation: slideIntoPlace }),
  Accessibility.configure({
    screenReaderInstructions: {
      draggable: "Drag to reorder, or hold Alt (Option on a Mac) and press an arrow key.",
    },
  }),
];

export type DragStartHandler = ProviderProps["onDragStart"];
export type DragMoveHandler = ProviderProps["onDragMove"];
export type DragOverHandler = ProviderProps["onDragOver"];
export type DragEndHandler = ProviderProps["onDragEnd"];

type DragManager = Parameters<NonNullable<DragMoveHandler>>[1];

/**
 * Puts a sortable list's items back in their places while one of them is still dragged, as
 * dnd-kit does when a drag is cancelled. For a drag that has left the list for somewhere else,
 * such as the deck pad or a deck list: the items it passed on the way out made way for it, and
 * would otherwise stay moved until it's let go.
 */
export function unsort(manager: DragManager): void {
  const sortables = [...manager.registry.droppables].flatMap((droppable) =>
    droppable instanceof SortableDroppable ? [droppable.sortable] : [],
  );
  const { source } = manager.dragOperation;
  const dragged = sortables.find((sortable) => sortable.id === source?.id);
  if (!dragged || dragged.index === dragged.initialIndex) return;
  // The item now where the dragged one started: it goes beside that one, as dnd-kit puts it.
  const byIndex = [...sortables].sort((a, b) => a.index - b.index);
  const byInitialIndex = [...sortables].sort((a, b) => a.initialIndex - b.initialIndex);
  const there = byIndex[byInitialIndex.indexOf(dragged)];
  if (!there?.element || !dragged.element) return;
  there.element.insertAdjacentElement(
    dragged.index < there.index ? "afterend" : "beforebegin",
    dragged.element,
  );
  for (const sortable of sortables) sortable.index = sortable.initialIndex;
}
