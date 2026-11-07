/** A file in a multipart form. */
export interface FormFile {
  name: string;
  /** The file's name, as the server sees it. */
  filename: string;
  type: string;
  data: ArrayBuffer;
}

/** A multipart form's fields (text) and files, in the order they're sent. */
export interface Form {
  fields?: Record<string, string>;
  files?: FormFile[];
}

/** A request body: the bytes with the `Content-Type` to send. */
export interface Body {
  contentType: string;
  data: ArrayBuffer;
}

/**
 * Encodes a form as `multipart/form-data`. `requestUrl` in Obsidian takes only a string or bytes
 * for a body, so the form is made by hand, where `fetch` could take a `FormData`.
 */
export function multipart({ fields = {}, files = [] }: Form, boundary = makeBoundary()): Body {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${quote(name)}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  for (const file of files) {
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${quote(file.name)}"; ` +
          `filename="${quote(file.filename)}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      new Uint8Array(file.data),
      encoder.encode("\r\n"),
    );
  }
  parts.push(encoder.encode(`--${boundary}--\r\n`));

  const data = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  return { contentType: `multipart/form-data; boundary=${boundary}`, data: data.buffer };
}

/** A name or file name for a header's quoted string: quotes and line breaks can't be in one. */
function quote(text: string): string {
  return text.replace(/["\r\n]/g, "_");
}

function makeBoundary(): string {
  return `tracecards${Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
