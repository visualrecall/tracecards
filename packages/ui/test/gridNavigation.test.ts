import { describe, expect, it } from "vitest";
import { gridMove, reorderMove } from "../src/gridNavigation";

/** A key press with the given key and modifiers. Tests run without a DOM, so it's a plain object. */
function press(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  const event = { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
  return { ...event, ...modifiers } as KeyboardEvent;
}

describe("gridMove and reorderMove", () => {
  it("read arrows as moving focus, and Alt with an arrow as moving the item", () => {
    expect(gridMove(press("ArrowLeft"))).toBe("left");
    expect(gridMove(press("j"))).toBe("down");
    expect(gridMove(press("ArrowLeft", { altKey: true }))).toBeNull();
    expect(reorderMove(press("ArrowLeft", { altKey: true }))).toBe("left");
    expect(reorderMove(press("ArrowLeft"))).toBeNull();
    expect(reorderMove(press("ArrowUp", { altKey: true, metaKey: true }))).toBeNull();
  });
});
