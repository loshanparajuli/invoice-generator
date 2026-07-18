// Thin wrapper around html2pdf.js. Always dynamically imported (never at
// module top-level) because the package references `self`/`window` at load
// time and would throw during Next's server-side render pass otherwise —
// these helpers must only ever be called from browser event handlers.

function pdfOptions(pageEl, filename) {
  return {
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 1 },
    html2canvas: { scale: 3, useCORS: true, backgroundColor: "#f2f0ec" },
    jsPDF: { unit: "px", format: [pageEl.offsetWidth, pageEl.offsetHeight], orientation: "portrait" },
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
