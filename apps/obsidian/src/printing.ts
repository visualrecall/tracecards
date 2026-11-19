import type { Card, CoverCrop } from "@tracecards/core";
import type { CustomBack, FaceTheme, Printing, SavedFile, SaveTarget } from "@tracecards/ui";
import { type App, FileSystemAdapter, normalizePath, Platform } from "obsidian";
import type { VaultActions } from "./actions";
import type TracecardsPlugin from "./main";
import { readSecret } from "./settings";

/** The secret that holds the signed-in session, on this device. */
const SESSION_SECRET = "tracecards-gc-session";

/** The `obsidian://` link Game Crafter's sign-in sends the user back to, which the plugin handles. */
export const SIGN_IN_ACTION = "tracecards-sso";

/** How long to wait for Game Crafter to send the user back to Obsidian. */
const SIGN_IN_WAIT_MS = 5 * 60 * 1000;

const BACKS_FOLDER = "backs";
const IMAGE_TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg" };

/**
 * The part of Electron that Obsidian on the desktop puts on the window, which its own code uses
 * the same way, to open a file and to show it in its folder.
 */
interface ElectronWindow {
  electron?: {
    remote?: {
      shell?: {
        openPath: (path: string) => Promise<string>;
        showItemInFolder: (path: string) => void;
      };
    };
  };
}

/** The browser's save dialog, which the desktop app has and TypeScript's DOM types don't yet. */
interface SavePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}

/**
 * Asks where to save a PDF with the system's save dialog, through the browser's file picker, so
 * the plugin writes only the one file the user names and nothing else outside the vault. The
 * picker gives the file to write but not where it is, so the PDF can't be opened or shown in its
 * folder afterwards. Resolves to the file, "canceled", or null where the dialog isn't there or
 * can't open.
 */
async function pickPdfFile(name: string): Promise<FileSystemFileHandle | "canceled" | null> {
  const picker = window as SavePickerWindow;
  if (!Platform.isDesktopApp || !picker.showSaveFilePicker) return null;
  try {
    return await picker.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "canceled" : null;
  }
}

/** The bytes on their own, as the file APIs take them. */
function arrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/** What the system calls its files app, for "Show in …". */
const FILES_APP = Platform.isMacOS ? "Finder" : Platform.isWin ? "File Explorer" : "folder";

/**
 * What printing keeps on the device: Game Crafter's private key and session, in Obsidian's
 * secret storage (which never syncs), and the user's own card backs, as images in the plugin's
 * folder.
 */
export class ObsidianPrinting implements Printing {
  private waiting: ((ssoId: string | null) => void) | null = null;

  constructor(
    private readonly app: App,
    private readonly plugin: TracecardsPlugin,
    private readonly actions: VaultActions,
  ) {}

  readonly keys = (): { keyId: string; privateKey: string } | null => {
    const { gameCrafterPublicKey, gameCrafterPrivateKey } = this.plugin.settings;
    const privateKey = readSecret(this.app, gameCrafterPrivateKey);
    return gameCrafterPublicKey && privateKey ? { keyId: gameCrafterPublicKey, privateKey } : null;
  };

  readonly session = (): string | null => readSecret(this.app, SESSION_SECRET);

  readonly setSession = (session: string | null): void => {
    this.app.secretStorage.setSecret(SESSION_SECRET, session ?? "");
  };

  readonly signIn = (url: string): Promise<string | null> =>
    new Promise((resolve) => {
      // A new sign-in replaces one still waiting.
      this.waiting?.(null);
      const timer = window.setTimeout(() => finish(null), SIGN_IN_WAIT_MS);
      const finish = (ssoId: string | null) => {
        window.clearTimeout(timer);
        if (this.waiting === finish) this.waiting = null;
        resolve(ssoId);
      };
      this.waiting = finish;
      this.openUrl(url);
    });

  readonly signInPostback = `obsidian://${SIGN_IN_ACTION}`;

  /** Game Crafter sends the user here, to `obsidian://tracecards-sso?sso_id=…`. */
  receiveSignIn(ssoId: string | undefined): void {
    this.waiting?.(ssoId?.trim() || null);
  }

  readonly openUrl = (url: string): void => {
    window.open(url);
  };

  readonly coverBitmap = async (card: Card): Promise<ImageBitmap | null> => {
    const file = this.actions.coverFile(card);
    if (!file) return null;
    try {
      const data = await this.app.vault.readBinary(file);
      return await createImageBitmap(new Blob([data]), { imageOrientation: "from-image" });
    } catch {
      return null;
    }
  };

  readonly faceTheme = (): FaceTheme => this.plugin.settings.printFaces;

  readonly setFaceTheme = (theme: FaceTheme): void => {
    this.plugin.settings.printFaces = theme;
    void this.plugin.saveData(this.plugin.settings);
  };

  readonly chosenBack = (): string => this.plugin.settings.printBack;

  readonly setChosenBack = (id: string): void => {
    this.plugin.settings.printBack = id;
    void this.plugin.saveData(this.plugin.settings);
  };

  readonly backCrop = (): CoverCrop | undefined => this.plugin.settings.printBackCrop;

  readonly setBackCrop = (crop: CoverCrop | undefined): void => {
    this.plugin.settings.printBackCrop = crop;
    void this.plugin.saveData(this.plugin.settings);
  };

  readonly backUrl = (id: string): string | null => {
    const file = this.backFile(id);
    return file ? this.app.vault.adapter.getResourcePath(file) : null;
  };

  readonly customBacks = async (): Promise<CustomBack[]> => {
    const folder = this.backsFolder();
    if (!(await this.app.vault.adapter.exists(folder))) return [];
    const { files } = await this.app.vault.adapter.list(folder);
    return files.flatMap((path) => {
      const id = path.slice(folder.length + 1);
      const match = /^\d+-(.*)\.(webp|jpg)$/.exec(id);
      return match ? [{ id: `custom:${id}`, name: match[1] ?? id }] : [];
    });
  };

  readonly readBack = async (id: string): Promise<ImageBitmap | null> => {
    const file = this.backFile(id);
    if (!file) return null;
    try {
      const data = await this.app.vault.adapter.readBinary(file);
      const type = IMAGE_TYPES[file.split(".").pop() ?? ""];
      return await createImageBitmap(new Blob([data], { type }));
    } catch {
      return null;
    }
  };

  /** Where a custom back's image is, or null when the id isn't one. */
  private backFile(id: string): string | null {
    const file = id.replace(/^custom:/, "");
    const extension = file.split(".").pop() ?? "";
    if (!id.startsWith("custom:") || !(extension in IMAGE_TYPES)) return null;
    return `${this.backsFolder()}/${file}`;
  }

  readonly addBack = async (name: string, image: Blob): Promise<CustomBack | null> => {
    const folder = this.backsFolder();
    const extension = image.type === "image/jpeg" ? "jpg" : "webp";
    const clean =
      name
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .trim()
        .slice(0, 40) || "Back";
    const file = `${Date.now()}-${clean}.${extension}`;
    try {
      if (!(await this.app.vault.adapter.exists(folder)))
        await this.app.vault.adapter.mkdir(folder);
      await this.app.vault.adapter.writeBinary(`${folder}/${file}`, await image.arrayBuffer());
      return { id: `custom:${file}`, name: clean };
    } catch {
      return null;
    }
  };

  readonly removeBack = async (id: string): Promise<void> => {
    const file = this.backFile(id);
    if (file) await this.app.vault.adapter.remove(file).catch(() => undefined);
  };

  readonly savePdf = async (name: string): Promise<SaveTarget | null> => {
    const picked = await pickPdfFile(name);
    if (picked === "canceled") return null;
    if (picked) {
      return {
        write: async (data) => {
          const stream = await picked.createWritable();
          await stream.write(arrayBuffer(data));
          await stream.close();
          return { where: picked.name };
        },
      };
    }
    // Where there's no save dialog, as on phones, the PDF goes in the vault, where attachments go.
    return {
      write: async (data) => {
        const path = await this.app.fileManager.getAvailablePathForAttachment(name);
        const file = await this.app.vault.createBinary(path, arrayBuffer(data));
        const { adapter } = this.app.vault;
        return adapter instanceof FileSystemAdapter
          ? { where: `${path}, in your vault`, ...this.systemFile(adapter.getFullPath(path)) }
          : {
              where: `${path}, in your vault`,
              // In a new tab behind the dialog, there when the dialog is done.
              open: () => void this.app.workspace.getLeaf(true).openFile(file),
            };
      },
    };
  };

  /** Opening a saved file in the system's app for it, and showing it in its folder. */
  private systemFile(path: string): Pick<SavedFile, "open" | "reveal"> {
    const shell = (window as ElectronWindow).electron?.remote?.shell;
    if (!shell) return {};
    return {
      open: () => void shell.openPath(path),
      reveal: { label: `Show in ${FILES_APP}`, run: () => shell.showItemInFolder(path) },
    };
  }

  /** The folder in the plugin's own folder where custom backs are kept. */
  private backsFolder(): string {
    const dir =
      this.plugin.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
    return normalizePath(`${dir}/${BACKS_FOLDER}`);
  }
}
