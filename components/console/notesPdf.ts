export type NotePage = {
  name: string;
  code: string;
  body: string;
  kicker?: string;
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 54;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const HEADER_H = 52;
const FOOTER_Y = 48;
const BODY_TOP = 696;
const BODY_FLOOR = 72;

export type NoteLogo = {
  width: number;
  height: number;
  rgb: Uint8Array;
  alpha?: Uint8Array;
};

const BRAND = "0.886 0.294 0.196";
const INK = "0.110 0.141 0.188";
const INK_2 = "0.243 0.298 0.369";
const INK_3 = "0.416 0.467 0.533";
const WASH = "1 0.945 0.922";
const RULE = "0.961 0.812 0.769";

const HEADINGS = new Set([
  "Information for you",
  "Why you, specifically",
  "Why this study does not fit",
  "What still needs checking",
  "What the trial is trying to find out",
  "What it would involve",
  "What happens next",
]);

function pdfText(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const raw of words) {
      const chunks = raw.length > width ? raw.match(new RegExp(`.{1,${width}}`, "g")) ?? [raw] : [raw];
      for (const word of chunks) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > width && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function fillRect(x: number, y: number, w: number, h: number, color: string): string {
  return `${color} rg\n${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re\nf`;
}

function stroke(x1: number, y1: number, x2: number, y2: number, color: string, width = 1): string {
  return `${color} RG\n${width} w\n${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`;
}

function textAt(x: number, y: number, size: number, font: "F1" | "F2" | "F3", color: string, text: string): string {
  return `BT\n${color} rg\n/${font} ${size} Tf\n1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm\n(${pdfText(text)}) Tj\nET`;
}

type Drawn = { text: string; size: number; font: "F1" | "F2" | "F3"; color: string; gap: number };

function isHeading(line: string): boolean {
  return HEADINGS.has(line);
}

function isQuote(line: string): boolean {
  return /^(From your |From insurance |From what you )/.test(line);
}

function isField(line: string): boolean {
  return /^(Where|Travel|Visits|How long|Costs|Travel costs):/.test(line);
}

function isNct(line: string): boolean {
  return /^NCT\d{8}\b/.test(line);
}

function bodyLines(body: string): Drawn[] {
  const wrapped = wrap(body, 82);
  const out: Drawn[] = [];
  for (let i = 0; i < wrapped.length; i += 1) {
    const line = wrapped[i];
    const next = wrapped[i + 1] ?? "";
    if (!line) {
      out.push({ text: "", size: 11, font: "F1", color: INK, gap: 10 });
      continue;
    }
    if (isHeading(line)) {
      out.push({ text: "", size: 11, font: "F1", color: INK, gap: 10 });
      out.push({ text: line, size: 12, font: "F2", color: BRAND, gap: 18 });
      continue;
    }
    if (isNct(line)) {
      out.push({ text: line, size: 10, font: "F1", color: INK_3, gap: 18 });
      continue;
    }
    if (isNct(next) && !isHeading(line) && !isField(line)) {
      out.push({ text: line, size: 14, font: "F2", color: INK, gap: 16 });
      continue;
    }
    if (isField(line)) {
      out.push({ text: line, size: 11, font: "F2", color: INK, gap: 16 });
      continue;
    }
    if (isQuote(line)) {
      out.push({ text: line, size: 10, font: "F3", color: INK_2, gap: 15 });
      continue;
    }
    out.push({ text: line, size: 11, font: "F1", color: INK, gap: 16 });
  }
  return out;
}

function textWidth(text: string, size: number): number {
  return text.length * size * 0.5;
}

function hexOf(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return `${out}>`;
}

function chrome(note: NotePage, page: number, total: number, logo?: NoteLogo): string[] {
  const kicker = note.kicker ?? "Visit note";
  const pages = `${page} / ${total}`;
  const mark = logo
    ? (() => {
        const height = 22;
        const width = (logo.width / logo.height) * height;
        return [
          "q",
          `${width.toFixed(1)} 0 0 ${height.toFixed(1)} ${MARGIN_X} ${(PAGE_H - 16 - height).toFixed(1)} cm`,
          "/Im1 Do",
          "Q",
        ];
      })()
    : [textAt(MARGIN_X, PAGE_H - 32, 16, "F2", BRAND, "AMBER")];
  return [
    fillRect(0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, "1 1 1"),
    ...mark,
    textAt(PAGE_W - MARGIN_X - textWidth(kicker, 10), PAGE_H - 30, 10, "F1", INK_3, kicker),
    fillRect(0, PAGE_H - HEADER_H - 3, PAGE_W, 3, BRAND),
    stroke(MARGIN_X, FOOTER_Y, PAGE_W - MARGIN_X, FOOTER_Y, RULE),
    textAt(MARGIN_X, 34, 8, "F1", INK_3, `${note.name}  ·  ${note.code}`),
    textAt(PAGE_W - MARGIN_X - textWidth(pages, 8), 34, 8, "F1", INK_3, pages),
    textAt(MARGIN_X, 22, 8, "F1", INK_3, "This note does not sign anyone up."),
  ];
}

function titleBlock(note: NotePage): { ops: string[]; nextY: number } {
  return {
    ops: [
      fillRect(MARGIN_X - 8, BODY_TOP - 28, CONTENT_W + 16, 58, WASH),
      textAt(MARGIN_X, BODY_TOP, 20, "F2", INK, note.name.slice(0, 42)),
      textAt(MARGIN_X, BODY_TOP - 18, 10, "F1", INK_3, note.code),
      stroke(MARGIN_X, BODY_TOP - 30, PAGE_W - MARGIN_X, BODY_TOP - 30, BRAND, 1.5),
    ],
    nextY: BODY_TOP - 48,
  };
}

/** US Letter pages. A long note continues onto the next page. No printer, no email. */
export function notesPdf(notes: NotePage[], logo?: NoteLogo): Uint8Array {
  const pages: { note: NotePage; stream: string; page: number; of: number }[] = [];
  for (const note of notes) {
    const lines = bodyLines(note.body);
    const chunks: string[] = [];
    let pageOps: string[] = [];
    let y = BODY_TOP;
    const flush = () => {
      chunks.push(pageOps.join("\n"));
    };
    const begin = (first: boolean) => {
      pageOps = [];
      if (first) {
        const block = titleBlock(note);
        pageOps.push(...block.ops);
        y = block.nextY;
      } else {
        y = BODY_TOP;
      }
    };
    begin(true);
    for (const line of lines) {
      if (y - line.gap < BODY_FLOOR) {
        flush();
        begin(false);
      }
      if (line.text) {
        pageOps.push(textAt(MARGIN_X, y, line.size, line.font, line.color, line.text));
      }
      y -= line.gap;
    }
    flush();
    chunks.forEach((stream, index) => {
      pages.push({ note, stream, page: index + 1, of: chunks.length });
    });
  }

  const objects: string[] = [];
  const pageIds: number[] = [];
  const imageId = logo ? 6 : 0;
  const maskId = logo?.alpha ? 7 : 0;
  const pageStart = logo ? (maskId ? 8 : 7) : 6;
  const xObject = logo ? " /XObject << /Im1 6 0 R >>" : "";
  pages.forEach((page, index) => {
    const stamped = `${chrome(page.note, page.page, page.of, logo).join("\n")}\n${page.stream}`;
    const pageId = pageStart + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects[contentId] = `<< /Length ${stamped.length} >>\nstream\n${stamped}\nendstream`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xObject} >> >>`;
  });

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>";
  if (logo) {
    const rgb = hexOf(logo.rgb);
    const mask = logo.alpha ? hexOf(logo.alpha) : "";
    objects[imageId] =
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode${
        maskId ? ` /SMask ${maskId} 0 R` : ""
      } /Length ${rgb.length} >>\nstream\n${rgb}\nendstream`;
    if (maskId && logo.alpha) {
      objects[maskId] =
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${mask.length} >>\nstream\n${mask}\nendstream`;
    }
  }

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = body.length;
  let xref = `xref\n0 ${objects.length}\n`;
  xref += "0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id += 1) {
    const offset = objects[id] ? offsets[id] : 0;
    const flag = objects[id] ? "n" : "f";
    xref += `${String(offset).padStart(10, "0")} 00000 ${flag} \n`;
  }
  body += xref;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(body);
}

async function loadLogo(): Promise<NoteLogo | undefined> {
  if (typeof document === "undefined") return undefined;
  try {
    const image = new Image();
    image.src = "/amber-logo.png";
    await image.decode();
    const height = 48;
    const width = Math.max(1, Math.round((image.naturalWidth / image.naturalHeight) * height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const rgb = new Uint8Array(width * height * 3);
    const alpha = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
      rgb[p * 3] = pixels[i];
      rgb[p * 3 + 1] = pixels[i + 1];
      rgb[p * 3 + 2] = pixels[i + 2];
      alpha[p] = pixels[i + 3];
    }
    return { width, height, rgb, alpha };
  } catch {
    return undefined;
  }
}

export async function downloadNotes(notes: NotePage[], filename = "notes.pdf") {
  if (notes.length === 0 || typeof document === "undefined") return;
  const bytes = notesPdf(notes, await loadLogo());
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
