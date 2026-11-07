// The one Node.js function the plugin uses, on the desktop only, to save the PDF where the user
// chose outside the vault. Node's own types aren't included, so nothing else of Node's slips in.
declare module "node:fs/promises" {
  export function writeFile(path: string, data: Uint8Array): Promise<void>;
}
