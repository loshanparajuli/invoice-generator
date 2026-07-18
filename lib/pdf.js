// Thin wrapper around html2pdf.js. Always dynamically imported (never at
// module top-level) because the package references `self`/`window` at load
// time and would throw during Next's server-side render pass otherwise —
// these helpers must only ever be called from browser event handlers.

function pdfOptions(pageEl, filename) {
  const width = Math.ceil(pageEl.offsetWidth);
  // html2pdf's internal clone-and-render pass can measure a few px taller than the
  // live DOM's offsetHeight (font/layout rounding differences), which — with no
  // buffer — was enough to trigger an unwanted second page. When that happened,
  // whatever element sat at that boundary (the footer, in one observed case) got
  // physically sliced in half across the two pages. A height buffer avoids ever
  // needing a second page in the first place; `pagebreak: avoid-all` is a second
  // line of defense so that if a page break is ever still needed (e.g. a much
  // longer document later on), it pushes whole elements onto the next page
  // instead of cutting through one.
  const height = Math.ceil(pageEl.offsetHeight) + 24;
  return {
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 1 },
    html2canvas: { scale: 3, useCORS: true, backgroundColor: "#f2f0ec" },
    jsPDF: { unit: "px", format: [width, height], orientation: "portrait" },
    pagebreak: { mode: ["avoid-all"] },
  };
}

export async function downloadPdf(pageEl, filename) {
  const { default: html2pdf } = await import("html2pdf.js");
  return html2pdf().set(pdfOptions(pageEl, filename)).from(pageEl).save();
}

// Renders to a base64 PDF string (no download) — used for emailing.
export async function renderPdfBase64(pageEl, filename) {
  const { default: html2pdf } = await import("html2pdf.js");
  const dataUri = await html2pdf().set(pdfOptions(pageEl, filename)).from(pageEl).outputPdf("datauristring");
  return dataUri.split(",").pop();
}
