import type { ParsedFrontmatter, VaultEntry } from "@tracecards/core";
import { type App, TFile, TFolder } from "obsidian";

const NO_FRONTMATTER: ParsedFrontmatter = { ok: true, data: {} };

/**
 * Lists everything in the Tracecards folder for `buildVault`, with paths relative to the
 * folder. Frontmatter comes from Obsidian's metadata cache, so no files are read. Returns null
 * when the folder doesn't exist.
 */
export function listFolder(app: App, folderPath: string): VaultEntry[] | null {
  const root = app.vault.getFolderByPath(folderPath);
  if (!root) return null;

  const entries: VaultEntry[] = [];
  const visit = (folder: TFolder) => {
    for (const child of folder.children) {
      const path = child.path.slice(root.path.length + 1);
      if (child instanceof TFolder) {
        entries.push({ type: "folder", path });
        visit(child);
      } else if (child instanceof TFile) {
        const frontmatter = child.extension === "md" ? frontmatterOf(app, child) : NO_FRONTMATTER;
        entries.push({ type: "file", path, frontmatter });
      }
    }
  };
  visit(root);
  return entries;
}

// Obsidian leaves `frontmatter` empty when the YAML is invalid, so such a card reads as having
// no fields. Writes to it fail, and Obsidian shows the error in the note.
function frontmatterOf(app: App, file: TFile): ParsedFrontmatter {
  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  return frontmatter ? { ok: true, data: frontmatter } : NO_FRONTMATTER;
}
