import { type CoverCrop, migrate, type Migration, parseCrop, type Saved } from "@tracecards/core";
import {
  DEFAULT_TITLE_CASE,
  FACE_THEMES,
  type FaceTheme,
  GAMECRAFTER_KEY_PAGE,
  PIXABAY_KEY_PAGE,
  TITLE_CASES,
  type TitleCase,
} from "@tracecards/ui";
import { type App, normalizePath, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type TracecardsPlugin from "./main";

/** The most cards in a row in the grid view, and the range it can be set to. */
const GRID_COLUMNS = { min: 1, max: 12 };

/**
 * The version of the saved settings' shape, saved with them as `settingsVersion`. Settings saved
 * before there were versions are version 1. When a release changes what a saved setting means or
 * where it's kept, raise this and add the step that converts the older settings to `MIGRATIONS`.
 */
const SETTINGS_VERSION = 1;

/**
 * The steps that bring saved settings up to date, by the version each one produces. Settings from
 * any older release go through every step after their version, in order, so never change a step
 * once it's released. When a default changes, a step can keep the old value for people who have
 * settings saved, so their setup doesn't change under them.
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export interface Settings {
  /** The version of the settings' shape, `SETTINGS_VERSION` or a newer release's. */
  settingsVersion: number;
  /** The Tracecards folder, relative to the vault root. */
  folder: string;
  /** The most cards in a row in the grid view. A narrow tab fits fewer. */
  gridColumns: number;
  /**
   * How cards show their titles: in title case, or as typed. There's no setting for it on the
   * settings tab yet; it's here so one can be added without changing what's saved.
   */
  titleCase: TitleCase;
  /**
   * The name of the secret, in Obsidian's secret storage, that holds the Pixabay API key, or ""
   * for none. The key itself stays on the device; only its name is in the synced settings.
   */
  pixabayKey: string;
  /**
   * The user's Game Crafter public key. It isn't secret (it's in the sign-in link), so it's kept
   * in the settings and syncs, and a new device needs only the private key.
   */
  gameCrafterPublicKey: string;
  /** The name of the secret that holds the user's Game Crafter private key, or "" for none. */
  gameCrafterPrivateKey: string;
  /** Whether printed cards' fronts are dark or light, as last chosen in the print dialog. */
  printFaces: FaceTheme;
  /** The back to print on cards: a design's id, or "custom:" and a saved image's file name. */
  printBack: string;
  /** The part of a custom back to print, or undefined to fill the card with it. */
  printBackCrop: CoverCrop | undefined;
}

export const DEFAULT_SETTINGS: Settings = {
  settingsVersion: SETTINGS_VERSION,
  folder: "Tracecards",
  gridColumns: 5,
  titleCase: DEFAULT_TITLE_CASE,
  pixabayKey: "",
  gameCrafterPublicKey: "",
  gameCrafterPrivateKey: "",
  printFaces: "dark",
  printBack: "default",
  printBackCrop: undefined,
};

/**
 * Reads saved settings: brings them up to date, then falls back to the defaults for anything
 * missing or unusable. Fields it doesn't know, as saved by a newer release on another device, are
 * kept, so that saving here doesn't lose them.
 */
export function parseSettings(data: unknown): Settings {
  const { saved, version } = upToDate(
    typeof data === "object" && data !== null ? (data as Saved) : {},
  );
  const folder = typeof saved.folder === "string" ? normalizePath(saved.folder) : "";
  return {
    ...saved,
    settingsVersion: version,
    folder: isVaultRoot(folder) ? DEFAULT_SETTINGS.folder : folder,
    gridColumns: gridColumns(saved.gridColumns),
    titleCase: TITLE_CASES.find((each) => each === saved.titleCase) ?? DEFAULT_TITLE_CASE,
    pixabayKey: typeof saved.pixabayKey === "string" ? saved.pixabayKey : "",
    gameCrafterPublicKey:
      typeof saved.gameCrafterPublicKey === "string" ? saved.gameCrafterPublicKey.trim() : "",
    gameCrafterPrivateKey:
      typeof saved.gameCrafterPrivateKey === "string" ? saved.gameCrafterPrivateKey : "",
    printFaces:
      FACE_THEMES.find((theme) => theme === saved.printFaces) ?? DEFAULT_SETTINGS.printFaces,
    // A custom back, or else the default, which is the only design.
    printBack:
      typeof saved.printBack === "string" && saved.printBack.startsWith("custom:")
        ? saved.printBack
        : DEFAULT_SETTINGS.printBack,
    printBackCrop: parseCrop(saved.printBackCrop),
  };
}

/**
 * Saved settings brought up to date. If a step fails on settings it didn't expect, they're read
 * as they are, so Tracecards still starts, and the steps run again next time.
 */
function upToDate(saved: Saved): { saved: Saved; version: number } {
  const version = Number.isInteger(saved.settingsVersion) ? (saved.settingsVersion as number) : 1;
  try {
    return migrate(saved, version, SETTINGS_VERSION, MIGRATIONS);
  } catch (error) {
    console.error("Tracecards couldn't bring its saved settings up to date", error);
    return { saved, version };
  }
}

/** A usable number of cards in a row: a whole number in range, or the default. */
function gridColumns(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.gridColumns;
  return Math.min(Math.max(Math.round(value), GRID_COLUMNS.min), GRID_COLUMNS.max);
}

/** The secret a setting names, from Obsidian's secret storage on this device, or null for none. */
export function readSecret(app: App, name: string): string | null {
  return (name && app.secretStorage.getSecret(name)?.trim()) || null;
}

/** Tracecards needs a folder of its own, so the vault root can't be used. */
function isVaultRoot(folder: string): boolean {
  const path = normalizePath(folder);
  return path === "" || path === "/";
}

/** What the Pixabay key is for, with a link to where one is made. */
function pixabayDescription(): DocumentFragment {
  const description = createFragment();
  description.append(
    "Lets the card form search Pixabay's free images for a cover. Keys are free with a Pixabay account. ",
  );
  description.createEl("a", { text: "Get a key", href: PIXABAY_KEY_PAGE });
  description.append(
    ". Choose a key you've saved in Obsidian, or add one under a name of your choice. It's kept on this device, in Obsidian's secret storage, and isn't synced.",
  );
  return description;
}

/** What the Game Crafter keys are for, and where to make them. */
function gameCrafterDescription(): DocumentFragment {
  const description = createFragment();
  description.append(
    "Lets you print a deck as real cards through The Game Crafter, in your own account. Create a free key in your Game Crafter account under Account → API Keys, then add its Public Key here and its Private Key below. ",
  );
  description.createEl("a", { text: "More about keys", href: GAMECRAFTER_KEY_PAGE });
  description.append(
    ". The private key is kept on this device, in Obsidian's secret storage, and isn't synced; its dialog asks for an ID, which is just a name you choose.",
  );
  return description;
}

export class SettingsTab extends PluginSettingTab {
  constructor(private readonly plugin: TracecardsPlugin) {
    super(plugin.app, plugin);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Folder",
        desc: "Where Tracecards keeps your cards. Each folder inside it is a deck.",
        control: {
          type: "folder",
          key: "folder",
          placeholder: DEFAULT_SETTINGS.folder,
          validate: (folder) => (isVaultRoot(folder) ? "Choose a folder inside your vault." : ""),
        },
      },
      {
        name: "Cards in a row",
        desc: "The most cards in a row in the grid view. A narrow tab fits fewer.",
        control: { type: "number", key: "gridColumns", step: 1, ...GRID_COLUMNS },
      },
      {
        name: "Pixabay API key",
        desc: pixabayDescription(),
        control: { type: "secret", key: "pixabayKey" },
      },
      {
        name: "Game Crafter public key",
        desc: gameCrafterDescription(),
        control: { type: "text", key: "gameCrafterPublicKey", placeholder: "Paste the Public Key" },
      },
      {
        name: "Game Crafter private key",
        desc: "The Private Key from the same entry under Account → API Keys.",
        control: { type: "secret", key: "gameCrafterPrivateKey" },
      },
    ];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const valid =
      key === "gridColumns"
        ? gridColumns(value)
        : key === "folder" && typeof value === "string"
          ? normalizePath(value)
          : value;
    await super.setControlValue(key, valid);
    this.plugin.applySettings();
  }
}
