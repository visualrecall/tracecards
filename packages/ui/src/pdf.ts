// A small PDF writer for sheets of cards to print at home: pages of JPEG pictures, lines and a
// little text in the fonts every PDF reader has. That's all a sheet needs, so no library.

/** A JPEG picture and its size in pixels. */
export interface PdfImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

export interface PdfPage {
  /** In points, 72 to the inch. */
  width: number;
  height: number;
  /** The page's drawing operators. Pictures are `/Im<n>`; fonts are `FONT` and `DINGBATS`. */
  content: string;
  /** The numbers `addImage` gave the pictures the content draws. */
  images: number[];
}

/** The content's names for Helvetica and Zapf Dingbats, which need no embedding. */
export const FONT = "F1";
export const DINGBATS = "F2";

const encoder = new TextEncoder();

/** The characters WinAnsi has that Latin-1 doesn't, such as curly quotes and dashes. */
const WIN_ANSI: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

/**
 * Text as a PDF string for Helvetica, in its WinAnsi encoding. Characters it doesn't have, such
 * as other scripts and emoji, become "?".
 */
export function literal(text: string): string {
  let out = "";
  for (const char of text) {
    const code = WIN_ANSI[char] ?? char.codePointAt(0) ?? 0x3f;
    if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else if (code >= 0x20 && code < 0x7f) out += char;
    else if ((code >= 0x80 && code <= 0x9f && char in WIN_ANSI) || (code >= 0xa0 && code <= 0xff))
      out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return `(${out})`;
}

/** Text as UTF-16 in hex, which the document's title can be in any script. */
function unicode(text: string): string {
  let hex = "FEFF";
  for (let index = 0; index < text.length; index++) {
    hex += text.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0");
  }
  return `<${hex}>`;
}

/** A number for the content: to two places, and never in exponent form. */
export function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export interface PdfOptions {
  title: string;
  /** Asks the print dialog to print both sides, flipping on the long edge. */
  duplex?: boolean;
}

export class PdfBuilder {
  private readonly images: PdfImage[] = [];
  private readonly pages: PdfPage[] = [];

  constructor(private readonly options: PdfOptions) {}

  /** Adds a picture, stored once however many pages draw it. Returns its number for pages. */
  addImage(image: PdfImage): number {
    this.images.push(image);
    return this.images.length - 1;
  }

  addPage(page: PdfPage): void {
    this.pages.push(page);
  }

  build(): Uint8Array {
    // Objects 1 to 5 are the catalog, the page tree, the two fonts and the document's info. The
    // pictures come next, then each page followed by its content.
    const firstImage = 6;
    const firstPage = firstImage + this.images.length;
    const count = firstPage + this.pages.length * 2;
    const offsets: number[] = [];
    const parts: Uint8Array[] = [];
    let length = 0;
    const push = (data: Uint8Array | string) => {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      parts.push(bytes);
      length += bytes.length;
    };
    const object = (id: number, body: string, stream?: Uint8Array) => {
      offsets[id] = length;
      push(`${id} 0 obj\n${body}`);
      if (stream) {
        push("\nstream\n");
        push(stream);
        push("\nendstream");
      }
      push("\nendobj\n");
    };

    // The second line's high bytes tell tools the file is binary.
    push("%PDF-1.7\n");
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    // Printing at the size the file gives, never fitted to the paper, keeps the cards their size.
    const preferences = `/PrintScaling /None${this.options.duplex ? " /Duplex /DuplexFlipLongEdge" : ""}`;
    object(1, `<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << ${preferences} >> >>`);
    const kids = this.pages.map((_, index) => `${firstPage + index * 2} 0 R`).join(" ");
    object(2, `<< /Type /Pages /Count ${this.pages.length} /Kids [${kids}] >>`);
    object(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>");
    object(5, `<< /Title ${unicode(this.options.title)} /Creator (Tracecards) >>`);
    this.images.forEach((image, index) => {
      object(
        firstImage + index,
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode " +
          `/Length ${image.jpeg.length} >>`,
        image.jpeg,
      );
    });
    this.pages.forEach((page, index) => {
      const id = firstPage + index * 2;
      const pictures = page.images.map((image) => `/Im${image} ${firstImage + image} 0 R`);
      object(
        id,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
          `/Resources << /Font << /${FONT} 3 0 R /${DINGBATS} 4 0 R >> ` +
          `/XObject << ${pictures.join(" ")} >> >> /Contents ${id + 1} 0 R >>`,
      );
      const content = encoder.encode(page.content);
      object(id + 1, `<< /Length ${content.length} >>`, content);
    });

    const xref = length;
    let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let id = 1; id < count; id++) {
      table += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    push(table);
    push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const out = new Uint8Array(length);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}
