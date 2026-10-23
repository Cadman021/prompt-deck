// src/utils/shareCard.ts
// Rasterise a DOM subtree to a PNG and hand it to the browser as a download.
// Kept separate from pdfExport so the card can ship without jsPDF, and lazy
// for the same reason: html2canvas is ~500KB and only matters on first share.

/**
 * Captures `element` to PNG and triggers a download.
 *
 * Rendered at 2x so the 540px card becomes a 1080px image — the size social
 * previews expect, and crisp on high-DPI screens.
 */
export async function exportElementAsPng(
  element: HTMLElement,
  filename = `promptdeck-${Date.now()}.png`
): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(element, {
    scale: 2,
    // The card paints its own dark ground; without this the transparent
    // margins around rounded content would composite as white.
    backgroundColor: '#020617',
    useCORS: true,
    logging: false,
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) throw new Error('Could not encode the share card as PNG.');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking immediately can cancel the download in some webviews; one tick
  // is enough for the click to be picked up.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
