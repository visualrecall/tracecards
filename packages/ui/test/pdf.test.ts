import { describe, expect, it } from "vitest";
import { literal, num, PdfBuilder } from "../src/pdf";

/** The file as text, one character per byte, so offsets in it are byte offsets. */
const text = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function sample(duplex = false) {
  const pdf = new PdfBuilder({ title: "Ideas — 日本", duplex });
  const image = pdf.addImage({ jpeg, width: 750, height: 1050 });
  pdf.addPage({ width: 612, height: 792, content: `q /Im${image} Do Q`, images: [image] });
  pdf.addPage({ width: 612, height: 792, content: "", images: [] });
  return text(pdf.build());
}

describe("literal", () => {
  it("escapes what ends or breaks a string", () => {
    expect(literal("a (b) \\ c")).toBe("(a \\(b\\) \\\\ c)");
  });

  it("writes Latin-1 and WinAnsi's own characters as codes, and others as ?", () => {
    expect(literal("é—’")).toBe("(\\351\\227\\222)");
    expect(literal("日😀")).toBe("(??)");
  });
});

describe("num", () => {
  it("rounds to two places, without exponents or negative zero", () => {
    expect(num(27.638)).toBe("27.64");
    expect(num(-0.001)).toBe("0");
    expect(num(1e-7)).toBe("0");
  });
});

describe("PdfBuilder", () => {
  it("writes a file whose cross-reference table points at every object", () => {
    const file = sample();
    expect(file.startsWith("%PDF-1.7\n")).toBe(true);
    expect(file.endsWith("%%EOF\n")).toBe(true);

    const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(file)?.[1]);
    expect(file.slice(start, start + 4)).toBe("xref");
    const offsets = [...file.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
      Number(match[1]),
    );
    expect(offsets.length).toBe(Number(/\/Size (\d+)/.exec(file)?.[1]) - 1);
    offsets.forEach((offset, index) => {
      expect(file.slice(offset).startsWith(`${index + 1} 0 obj\n`)).toBe(true);
    });
  });

  it("stores the picture once, with its length, and lists the pages", () => {
    const file = sample();
    expect(file).toContain("/Count 2");
    expect(file).toContain("/Width 750 /Height 1050");
    expect(file).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`);
    expect(file.match(/\/Subtype \/Image/g)?.length).toBe(1);
  });

  it("asks for printing at actual size, and on both sides when it's duplex", () => {
    expect(sample()).toContain("/ViewerPreferences << /PrintScaling /None >>");
    expect(sample(true)).toContain("/PrintScaling /None /Duplex /DuplexFlipLongEdge");
  });

  it("keeps the title in any script", () => {
    expect(sample()).toContain("/Title <FEFF0049006400650061007300202014002065E5672C>");
  });
});
