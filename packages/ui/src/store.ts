import type { Vault } from "@tracecards/core";

/** An external store React subscribes to with `useSyncExternalStore`. */
export interface Store<T> {
  /** Must be a stable function. */
  subscribe: (listener: () => void) => () => void;
  /** Must be a stable function that returns the same object until the data changes. */
  getSnapshot: () => T;
}

export interface VaultSnapshot {
  /** The Tracecards folder, relative to the app's vault. */
  folder: string;
  /** Null when the folder doesn't exist. */
  vault: Vault | null;
}

/** A store that always holds null, for a value the app doesn't provide. */
export const NULL_STORE: Store<null> = {
  subscribe: () => () => undefined,
  getSnapshot: () => null,
};

/** A store holding a single value that changes when `set` is called with a different one. */
export class ValueStore<T> implements Store<T> {
  private readonly listeners = new Set<() => void>();

  constructor(private value: T) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): T => this.value;

  set(value: T): void {
    if (Object.is(value, this.value)) return;
    this.value = value;
    for (const listener of this.listeners) listener();
  }
}
