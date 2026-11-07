import { useState } from "react";

/** Not editing, editing, or saving what the editor holds. */
type Mode = "shown" | "editing" | "saving";

export interface EditInPlace {
  /** Whether the editor shows: while editing, and while what it holds is saved. */
  open: boolean;
  /** Whether what the editor holds is being saved. */
  saving: boolean;
  start: () => void;
  /** Closes the editor without saving. */
  stop: () => void;
  /** Saves with `write`. If that fails, it says why, and the editor stays open to try again. */
  save: (write: () => Promise<boolean>) => Promise<void>;
}

/**
 * Editing part of an opened card in place, such as its title. The editor stays open while what it
 * holds is saved, and closes once the save is done, when the card shows it: the host's writes
 * resolve only then, so the old value doesn't show again in between.
 */
export function useEditInPlace(): EditInPlace {
  const [mode, setMode] = useState<Mode>("shown");
  return {
    open: mode !== "shown",
    saving: mode === "saving",
    start: () => setMode("editing"),
    stop: () => setMode("shown"),
    save: async (write) => {
      setMode("saving");
      setMode((await write()) ? "shown" : "editing");
    },
  };
}
