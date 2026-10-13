// src/utils/pdfExport.ts
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import type { BenchmarkResult } from '../services/dbService';

/**
 * jsPDF's built-in fonts only cover Latin text. Anything outside that range
 * (Persian, Chinese, Russian, emoji…) would render as boxes, so such reports
 * keep using the image export below.
 */
export function needsImageFallback(prompt: string, results: BenchmarkResult[]): boolean {
  return /[^\u0000-\u024F]/.test(prompt + results.map((r) => r.output).join('\n'));
}

/** Strip Markdown down to readable plain text for the text-based PDF. Exported for unit tests. */
export function mdToText(md: string): string {
  return md
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^(\s*[-*+]|\s*\d+\.)\s+/gm, '• ')
    .replace(/^\|(.+)\|$/gm, (_row, cells: string) =>
      cells.split('|').map((c) => c.trim()).filter(Boolean).join(' | ')
    )
    .replace(/^[:|\- ]+$/gm, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function fmtCost(v: number | null | undefined): string {
  if (v == null) return 'N/A';
  return v < 0.01 ? `$${v.toFixed(5)}` : `$${v.toFixed(4)}`;
}

/**
 * Text-based PDF: selectable text, tiny file, real pagination. Latin-only
 * (see needsImageFallback); called synchronously, no DOM mount required.
 */
export function exportReportAsPdfText(prompt: string, results: BenchmarkResult[]): void {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;
  let y = 18;

  const ensure = (needed: number): void => {
    if (y + needed > pdf.internal.pageSize.getHeight() - 14) {
      pdf.addPage();
      y = 18;
    }
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(79, 70, 229);
  pdf.text('PromptDeck Benchmark Report', margin, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(150);
  pdf.text(new Date().toLocaleString(), margin, y);
  y += 8;

  pdf.setFontSize(11);
  pdf.setTextColor(40);
  pdf.text('Prompt', margin, y);
  y += 5;
  pdf.setFontSize(10);
  pdf.setTextColor(80);
  for (const line of pdf.splitTextToSize(mdToText(prompt) || '(empty)', maxWidth)) {
    ensure(6);
    pdf.text(line as string, margin, y);
    y += 5;
  }
  y += 4;

  const hasTokens = results.some((r) => r.promptTokens != null || r.completionTokens != null);
  const hasCost = results.some((r) => r.costUsd != null);
  const head = ['Metric', ...results.map((r) => r.model)];
  const body: string[][] = [
    ['TPS (tok/s)', ...results.map((r) => (r.tps ? `${r.tpsEstimated ? '~' : ''}${r.tps.toFixed(2)}` : 'N/A'))],
    ['TTFT (ms)', ...results.map((r) => (r.ttft ? String(r.ttft) : 'N/A'))],
  ];
  if (hasTokens) {
    body.push([
      'Tokens (in/out)',
      ...results.map((r) =>
        r.promptTokens != null || r.completionTokens != null
          ? `${r.promptTokens ?? '?'} / ${r.completionTokens ?? '?'}`
          : 'N/A'
      ),
    ]);
  }
  if (hasCost) {
    body.push(['Cost (USD)', ...results.map((r) => fmtCost(r.costUsd))]);
  }
  autoTable(pdf, {
    startY: y,
    head: [head],
    body,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [79, 70, 229] },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  results.forEach((r, i) => {
    ensure(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(79, 70, 229);
    pdf.text(`Model ${i + 1}: ${r.model}`, margin, y, { maxWidth });
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(30);
    for (const line of pdf.splitTextToSize(mdToText(r.output) || 'No output', maxWidth)) {
      ensure(6);
      pdf.text(line as string, margin, y);
      y += 5;
    }
    y += 6;
  });

  pdf.save(`promptdeck-report-${Date.now()}.pdf`);
}

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