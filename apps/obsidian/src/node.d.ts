// The one Node.js function the plugin uses, on the desktop only, to save the PDF where the user
// chose outside the vault. Obsidian's desktop app loads plugins as CommonJS, with Node's
// `require`. Node's own types aren't included, so nothing else of Node's slips in.
declare function require(id: "node:fs/promises"): {
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
};
