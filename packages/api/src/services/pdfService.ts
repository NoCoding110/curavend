/**
 * pdfService — hybrid PDF generation.
 *
 * `renderHtmlToPdf` uses Cloudflare's Browser Rendering API (via `@cloudflare/puppeteer`)
 * for rich HTML/CSS rendering. Falls back to a simple programmatic placeholder
 * if Browser is unavailable (development / no `BROWSER` binding configured).
 *
 * `renderProgrammaticPdf` builds PDFs entirely with `pdf-lib` — used for
 * shipping labels, return labels, sticker sheets, where exact layout matters.
 */

import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import puppeteer from '@cloudflare/puppeteer';
// @ts-ignore — bwip-js ships its own types but Workers doesn't always pick them up
import bwipjs from 'bwip-js';

export interface PdfTextBlock {
  type: 'text';
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
  color?: [number, number, number];
}

export interface PdfBarcodeBlock {
  type: 'barcode';
  value: string;
  format?: 'code128' | 'qrcode' | 'datamatrix' | 'pdf417';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfImageBlock {
  type: 'image';
  base64Data: string;
  mime: 'image/png' | 'image/jpeg';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfLineBlock {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
}

export type PdfBlock = PdfTextBlock | PdfBarcodeBlock | PdfImageBlock | PdfLineBlock;

export interface PdfPageLayout {
  width: number;
  height: number;
  blocks: PdfBlock[];
}

export interface PdfLayout {
  title?: string;
  author?: string;
  pages: PdfPageLayout[];
}

/**
 * Render an HTML string to a PDF byte array using Browser Rendering.
 * Throws if BROWSER binding isn't available.
 */
export async function renderHtmlToPdf(
  browser: Fetcher | undefined,
  html: string,
  opts: {
    format?: 'Letter' | 'A4' | 'Legal';
    landscape?: boolean;
    margin?: { top?: string; right?: string; bottom?: string; left?: string };
  } = {},
): Promise<Uint8Array> {
  if (!browser) {
    throw new Error('Browser Rendering binding is not available');
  }
  // @cloudflare/puppeteer expects the binding's `fetch` interface
  const session = await puppeteer.launch(browser as any);
  try {
    const page = await session.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: opts.format ?? 'Letter',
      landscape: opts.landscape ?? false,
      printBackground: true,
      margin: {
        top: opts.margin?.top ?? '0.5in',
        right: opts.margin?.right ?? '0.5in',
        bottom: opts.margin?.bottom ?? '0.5in',
        left: opts.margin?.left ?? '0.5in',
      },
    });
    return new Uint8Array(buffer);
  } finally {
    await session.close();
  }
}

/**
 * Try Browser Rendering; on any failure fall back to a programmatic PDF
 * containing the title + a "render failed" notice.
 */
export async function renderHtmlToPdfWithFallback(
  browser: Fetcher | undefined,
  html: string,
  fallbackTitle: string,
  opts?: Parameters<typeof renderHtmlToPdf>[2],
): Promise<{ bytes: Uint8Array; usedFallback: boolean }> {
  try {
    const bytes = await renderHtmlToPdf(browser, html, opts);
    return { bytes, usedFallback: false };
  } catch (err) {
    console.warn('[pdfService] Browser Rendering failed, using fallback:', err);
    const bytes = await renderProgrammaticPdf({
      title: fallbackTitle,
      pages: [
        {
          width: 612,
          height: 792,
          blocks: [
            { type: 'text', text: fallbackTitle, x: 72, y: 720, size: 24, bold: true },
            {
              type: 'text',
              text: 'HTML rendering unavailable. This is a fallback layout.',
              x: 72,
              y: 690,
              size: 12,
            },
            {
              type: 'text',
              text: stripHtml(html).slice(0, 1500),
              x: 72,
              y: 660,
              size: 10,
            },
          ],
        },
      ],
    });
    return { bytes, usedFallback: true };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a PDF entirely with pdf-lib from a structured layout.
 */
export async function renderProgrammaticPdf(layout: PdfLayout): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (layout.title) doc.setTitle(layout.title);
  if (layout.author) doc.setAuthor(layout.author);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const pageLayout of layout.pages) {
    const page = doc.addPage([pageLayout.width, pageLayout.height]);
    for (const block of pageLayout.blocks) {
      await drawBlock(doc, page, block, regular, bold);
    }
  }
  return await doc.save({ useObjectStreams: true });
}

async function drawBlock(
  doc: PDFDocument,
  page: PDFPage,
  block: PdfBlock,
  regular: any,
  bold: any,
): Promise<void> {
  if (block.type === 'text') {
    page.drawText(block.text, {
      x: block.x,
      y: block.y,
      size: block.size ?? 12,
      font: block.bold ? bold : regular,
      color: rgb(
        block.color?.[0] ?? 0,
        block.color?.[1] ?? 0,
        block.color?.[2] ?? 0,
      ),
    });
  } else if (block.type === 'line') {
    page.drawLine({
      start: { x: block.x1, y: block.y1 },
      end: { x: block.x2, y: block.y2 },
      thickness: block.width ?? 1,
      color: rgb(0, 0, 0),
    });
  } else if (block.type === 'image') {
    const data = Uint8Array.from(atob(block.base64Data), (c) => c.charCodeAt(0));
    const img =
      block.mime === 'image/png'
        ? await doc.embedPng(data)
        : await doc.embedJpg(data);
    page.drawImage(img, {
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
    });
  } else if (block.type === 'barcode') {
    const png = await generateBarcodePng(block.value, block.format ?? 'code128');
    if (png) {
      const img = await doc.embedPng(png);
      page.drawImage(img, {
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
      });
    } else {
      // Barcode image unavailable in this runtime — render value as monospace
      // text inside a bordered rect so the label still ships with the data.
      page.drawRectangle({
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
      page.drawText('|||| ' + block.value + ' ||||', {
        x: block.x + 6,
        y: block.y + block.height / 2 - 4,
        size: 10,
        font: regular,
      });
    }
  }
}

async function generateBarcodePng(value: string, format: string): Promise<Uint8Array | null> {
  // bwip-js's API surface differs across runtimes; Workers picks the browser
  // entry which exposes toRaw() not toBuffer(). Try both, fall back to null
  // (caller will skip the image block).
  try {
    const opts = {
      bcid: format,
      text: value,
      scale: 3,
      height: 12,
      includetext: format === 'code128',
      textxalign: 'center' as const,
    };
    // Try Node-style toBuffer first
    const anyBwip: any = bwipjs as any;
    if (typeof anyBwip.toBuffer === 'function') {
      return await new Promise<Uint8Array>((resolve, reject) => {
        anyBwip.toBuffer(opts, (err: Error | null, png: any) => {
          if (err) return reject(err);
          resolve(new Uint8Array(png));
        });
      });
    }
    // Try browser-style toRaw -> manual PNG encode is complex; instead use
    // toCanvas with a stubbed canvas-like to produce a PNG buffer if available
    if (typeof anyBwip.toRaw === 'function') {
      const raw = await anyBwip.toRaw(opts);
      // raw contains { width, height, pixels (Uint8Array RGBA) } — we'd need a
      // PNG encoder. For now, skip — caller falls back to text.
      if (raw?.width) {
        // Cannot encode to PNG without a heavy lib in Workers; signal skip.
        return null;
      }
    }
    return null;
  } catch (err) {
    console.warn('[pdfService] barcode generation skipped:', err);
    return null;
  }
}

/**
 * Merge multiple PDF byte arrays into a single PDF.
 */
export async function mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const pdfBytes of pdfs) {
    const src = await PDFDocument.load(pdfBytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return await out.save({ useObjectStreams: true });
}

/**
 * "Compress" a PDF by round-tripping through pdf-lib with object streams.
 * Real binary compression isn't available without a Wasm dep.
 */
export async function compressPdf(input: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input);
  return await doc.save({ useObjectStreams: true });
}

/**
 * Wrap a base64-encoded image into a single-page Letter-size PDF.
 */
export async function imageToPdf(
  base64Data: string,
  mime: 'image/png' | 'image/jpeg',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const data = Uint8Array.from(
    atob(base64Data.replace(/^data:[^;]+;base64,/, '')),
    (c) => c.charCodeAt(0),
  );
  const img = mime === 'image/png' ? await doc.embedPng(data) : await doc.embedJpg(data);
  const { width: iw, height: ih } = img.scale(1);
  const margin = 36;
  const maxW = 612 - 2 * margin;
  const maxH = 792 - 2 * margin;
  const scale = Math.min(maxW / iw, maxH / ih, 1);
  page.drawImage(img, {
    x: margin + (maxW - iw * scale) / 2,
    y: margin + (maxH - ih * scale) / 2,
    width: iw * scale,
    height: ih * scale,
  });
  return await doc.save({ useObjectStreams: true });
}
