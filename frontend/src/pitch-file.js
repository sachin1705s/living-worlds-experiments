const TEXT_BYTES = 200_000;
const PDF_BYTES = 12 * 1024 * 1024;

export function isPdf(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function readPitchFile(file) {
  if (isPdf(file)) {
    if (file.size > PDF_BYTES) throw new Error("Use a PDF under 12 MB.");
    const text = await pdfText(file);
    if (!text) throw new Error("That PDF has no selectable text. Paste the pitch instead.");
    return text;
  }
  if (file.size > TEXT_BYTES) throw new Error("Use a text file under 200 KB.");
  return file.text();
}

async function pdfText(file) {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const assets = import.meta.env.DEV ? "/node_modules/pdfjs-dist/" : `${import.meta.env.BASE_URL}pdfjs/`;
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      standardFontDataUrl: `${assets}standard_fonts/`,
      cMapUrl: `${assets}cmaps/`,
      cMapPacked: true,
    }).promise;
  } catch (error) {
    if (error?.name === "PasswordException") throw new Error("That PDF is password-protected. Paste the pitch instead.");
    throw new Error("Could not read that PDF. Paste the pitch instead.");
  }
  const pages = [];
  const count = Math.min(doc.numPages, 12);
  for (let number = 1; number <= count; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || "").join(" "));
  }
  return pages.join("\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
