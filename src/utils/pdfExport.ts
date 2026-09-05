// src/utils/pdfExport.ts
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Captures the given DOM element (expected to be the hidden ReportPrintView)
 * and exports it as a multi-page A4 PDF, preserving full Markdown rendering
 * (bold, code blocks, tables, etc.) as it appears in the app.
 *
 * Returns a promise so the caller can show success/error feedback.
 */
export const exportElementAsPdf = async (element: HTMLElement): Promise<void> => {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgProps = pdf.getImageProperties(imgData);
  const scaledHeight = (imgProps.height * pdfWidth) / imgProps.width;

  let heightLeft = scaledHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
  heightLeft -= pdfHeight;

  while (heightLeft > 0) {
    position = heightLeft - scaledHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
    heightLeft -= pdfHeight;
  }

  const filename = `promptdeck-report-${Date.now()}.pdf`;
  pdf.save(filename);
};